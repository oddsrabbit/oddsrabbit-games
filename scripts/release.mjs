// Builds everything that goes on apps.oddsrabbit.com into release/, the one
// folder the deploy uploads (.github/workflows/deploy.yml).
//
// The root build makes the SDK, the host, the playground and the games kept in
// it, and every folder it writes to dist/ goes up. A game with its own build
// is a top-level folder whose package.json has a `build` script; it builds
// after the root, since it reads the root's dist/ and src/, and must write
// dist/<folder>/. Both are found, not listed, so a new game of either kind
// ships without touching this file. Every build gets the same BUILD_ID, written to
// release/version.json with the commit, so a deploy can be checked against
// what is live.
//
// release/ is an ALLOWLIST of dist/: the npm-only files (.cjs, .esm.js, .d.ts)
// stay out, and so do the copies of sdk-v1.js each game's dist/ holds for its
// local harness.
//
//   node scripts/release.mjs [--install] [--skip-tests]
//
// --install runs npm ci (npm install where there's no lockfile) in the root
// and each game first: what CI wants on a fresh checkout.

import { execSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'release');
const install = process.argv.includes('--install');
const skipTests = process.argv.includes('--skip-tests');

/** Top-level folders that are never a game. */
const NOT_GAMES = new Set(['node_modules', 'dist', 'release', 'src', 'docs', 'scripts']);

/** What of the root dist/ goes up, besides its folders (each a game or page). */
const ROOT_FILES = ['sdk-v1.js', 'sdk-v1.js.map', 'leaderboard-v1.js', 'leaderboard-v1.js.map', 'leaderboard-v1.css'];
/** Root dist/ folders that are type declarations, not pages. */
const ROOT_SKIP = new Set(['sdk', 'ui', 'schemas']);
/** Within a folder: declarations for npm, never served. */
const isNpmOnly = (name) => /\.d\.ts(\.map)?$/.test(name);
/**
 * Pages whose source maps go up: the SDK's, which is public anyway. A game's
 * map would publish its private source, so the root build makes none for its
 * games and this drops any a game's own build makes.
 */
const MAPS_KEPT = new Set(['host', 'playground']);

const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const env = { ...process.env, BUILD_ID };

const exists = (p) => stat(p).then(() => true, () => false);
function run(cmd, cwd) {
  console.log(`\n$ ${cmd}  (${cwd === root ? '.' : cwd.slice(root.length + 1)})`);
  execSync(cmd, { cwd, env, stdio: 'inherit' });
}
async function scripts(dir) {
  return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).scripts ?? {};
}

async function buildPackage(dir) {
  if (install) run((await exists(join(dir, 'package-lock.json'))) ? 'npm ci' : 'npm install', dir);
  const s = await scripts(dir);
  if (!skipTests) {
    if (s.test) run('npm test', dir);
    if (s['type-check']) run('npm run type-check', dir);
  }
  run('npm run build', dir);
}

function git(args) {
  try { return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; }
}

/** Games with their own build, by folder name. Each writes dist/<name>/, uploaded to /<name>/. */
async function ownBuildGames() {
  const games = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || NOT_GAMES.has(entry.name)) continue;
    const pkg = join(root, entry.name, 'package.json');
    if ((await exists(pkg)) && (await scripts(join(root, entry.name))).build) games.push(entry.name);
  }
  return games.sort();
}

const GAMES = await ownBuildGames();
const commit = git('rev-parse HEAD');
const dirty = git('status --porcelain') !== '';
if (dirty) console.warn('\n⚠ The working tree has uncommitted changes: this release is not a build of any commit.');

await buildPackage(root);
for (const game of GAMES) await buildPackage(join(root, game));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT);
const copyFolder = (from, to, page) => cp(from, to, {
  recursive: true,
  filter: (src) => !isNpmOnly(src) && (MAPS_KEPT.has(page) || !src.endsWith('.map')),
});

for (const name of ROOT_FILES) await cp(join(root, 'dist', name), join(OUT, name));
const pages = [];
for (const entry of await readdir(join(root, 'dist'), { withFileTypes: true })) {
  if (!entry.isDirectory() || ROOT_SKIP.has(entry.name)) continue;
  await copyFolder(join(root, 'dist', entry.name), join(OUT, entry.name), entry.name);
  pages.push(entry.name);
}
for (const game of GAMES) {
  const from = join(root, game, 'dist', game);
  if (!(await exists(join(from, 'index.html')))) throw new Error(`${game}: no dist/${game}/index.html after its build`);
  if (pages.includes(game)) throw new Error(`${game}: built both at the root and on its own`);
  await copyFolder(from, join(OUT, game), game);
  pages.push(game);
}

pages.sort();
const version = { buildId: BUILD_ID, commit, dirty, builtAt: new Date().toISOString(), pages };
await writeFile(join(OUT, 'version.json'), `${JSON.stringify(version, null, 2)}\n`);
console.log(`\nrelease/ ready: build ${BUILD_ID}${commit ? ` from ${commit.slice(0, 8)}` : ''}${dirty ? ' (dirty)' : ''}`);
console.log(`  ${pages.join(', ')}`);
