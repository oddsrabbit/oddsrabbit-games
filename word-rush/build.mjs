// Build for Word Rush. Produces dist/word-rush/, uploaded to
// apps.oddsrabbit.com/word-rush/ next to the SDK's own dist.
//
// The game loads the shared SDK and leaderboard stylesheet from the host
// (`../sdk-v1.js`, `../leaderboard-v1.css`), so neither is bundled. Both are
// read from the repo root so their cache-bust stamps are the
// same content hashes the root build stamps into its own games, and copied into
// dist/ so dev/harness.html runs locally. Those copies are for local use only;
// don't upload them from here. Run `npm run build` at the repo root first.

import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const watch = process.argv.includes('--watch');
const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const SDK_DIST = process.env.SDK_DIST || '../dist';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/word-rush', { recursive: true });

const hash = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 12);
};

const sdk = await readFile(`${SDK_DIST}/sdk-v1.js`).catch(() => null);
if (!sdk) console.warn(`${SDK_DIST}/sdk-v1.js not found; run npm run build at the repo root first. Using BUILD_ID for the SDK stamp.`);
const SDK_VERSION = sdk ? hash(sdk) : BUILD_ID;
if (sdk) await writeFile('dist/sdk-v1.js', sdk);

// Same hash the root build computes for `__UI_VERSION__`: the leaderboard JS and CSS
// together (see its build.config.mjs).
const uiJs = await readFile(`${SDK_DIST}/leaderboard-v1.js`).catch(() => null);
const uiCss = await readFile(`${SDK_DIST}/leaderboard-v1.css`).catch(() => null);
const UI_VERSION = uiJs && uiCss ? hash(uiJs, uiCss) : BUILD_ID;
if (uiCss) await writeFile('dist/leaderboard-v1.css', uiCss);

const buildOpts = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/word-rush/main.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  // Maps for local work only: dist/word-rush/ is uploaded as-is, and this repo is private.
  sourcemap: watch,
  minify: true,
  logLevel: 'info',
};

async function copyAssets() {
  const html = await readFile('index.html', 'utf8');
  await Promise.all([
    writeFile(
      'dist/word-rush/index.html',
      html
        .replaceAll('__BUILD_ID__', BUILD_ID)
        .replaceAll('__SDK_VERSION__', SDK_VERSION)
        .replaceAll('__UI_VERSION__', UI_VERSION)
    ),
    copyFile('styles.css', 'dist/word-rush/styles.css'),
    copyFile('icon/icon-512.png', 'dist/word-rush/icon-512.png').catch(() =>
      console.warn('icon/icon-512.png missing; render it from icon/icon.svg.')
    ),
  ]);
}

if (watch) {
  const ctx = await esbuild.context(buildOpts);
  await ctx.watch();
  await copyAssets();
  console.log('Watching for changes (Ctrl+C to stop)...');
} else {
  await esbuild.build(buildOpts);
  await copyAssets();
  console.log('Build complete.');
}
