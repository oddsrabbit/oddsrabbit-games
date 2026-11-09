// Build for Rabbit Sudoku. Produces dist/rabbit-sudoku/, uploaded to
// apps.oddsrabbit.com/rabbit-sudoku/ next to the SDK's own dist.
//
// The game loads the shared SDK from the host (`../sdk-v1.js`), so it isn't
// bundled. It's read from the repo root so its cache-bust stamp is the same
// content hash the root build stamps into its own games, and copied into
// dist/ so dev/harness.html runs locally; that copy is for local use only.
// Run `npm run build` at the repo root first.

import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const watch = process.argv.includes('--watch');
const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const SDK_DIST = process.env.SDK_DIST || '../dist';
const OUT = 'dist/rabbit-sudoku';

await rm('dist', { recursive: true, force: true });
await mkdir(`${OUT}/fonts`, { recursive: true });

const sdk = await readFile(`${SDK_DIST}/sdk-v1.js`).catch(() => null);
if (!sdk) console.warn(`${SDK_DIST}/sdk-v1.js not found; run npm run build at the repo root first. Using BUILD_ID for the SDK stamp.`);
const SDK_VERSION = sdk ? createHash('sha256').update(sdk).digest('hex').slice(0, 12) : BUILD_ID;
if (sdk) await writeFile('dist/sdk-v1.js', sdk);

const buildOpts = {
  entryPoints: ['src/main.ts'],
  outfile: `${OUT}/main.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  // Maps for local work only: dist/ is uploaded as-is, and this repo is private.
  sourcemap: watch,
  minify: true,
  logLevel: 'info',
};

async function copyAssets() {
  const html = await readFile('index.html', 'utf8');
  await Promise.all([
    writeFile(`${OUT}/index.html`, html.replaceAll('__BUILD_ID__', BUILD_ID).replaceAll('__SDK_VERSION__', SDK_VERSION)),
    copyFile('styles.css', `${OUT}/styles.css`),
    // The platform manifest points at <slug>/icon-512.png (as Word Battle's
    // build notes), so the icon ships with the bundle.
    copyFile('icon/icon-512.png', `${OUT}/icon-512.png`),
    // Bricolage Grotesque 800 (OFL 1.1), Word Battle's copy: this game is in
    // its family. The licence travels with the font.
    copyFile('../word-battle/fonts/bricolage-grotesque-800-latin.woff2', `${OUT}/fonts/bricolage-grotesque-800-latin.woff2`),
    copyFile('../word-battle/fonts/OFL.txt', `${OUT}/fonts/OFL.txt`),
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
