// Build for Rabbit Pets. Produces dist/rabbit-pets/, uploaded to
// apps.oddsrabbit.com/rabbit-pets/ next to the SDK's own dist.
//
// The game loads the shared SDK from the host (`../sdk-v1.js`), so it's not
// bundled here. It's read from the sibling apps-sdk checkout for two reasons:
//   - `__SDK_VERSION__` must be the same content hash apps-sdk stamps into its
//     own games, so every game busts the cached SDK together.
//   - dist/sdk-v1.js is copied in so dev/harness.html runs locally. It's for
//     local use only; don't upload it from here.
// Run `npm run build` in ../apps-sdk first.

import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const watch = process.argv.includes('--watch');
const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const SDK_DIST = process.env.SDK_DIST || '../apps-sdk/dist';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/rabbit-pets/fonts', { recursive: true });

const sdk = await readFile(`${SDK_DIST}/sdk-v1.js`).catch(() => null);
if (!sdk) {
  console.warn(`${SDK_DIST}/sdk-v1.js not found; build apps-sdk first. Using BUILD_ID for the SDK stamp.`);
}
const SDK_VERSION = sdk ? createHash('sha256').update(sdk).digest('hex').slice(0, 12) : BUILD_ID;
if (sdk) await writeFile('dist/sdk-v1.js', sdk);

// Draws its own pixel art at startup, so there are no image files beyond the
// store icon.
const buildOpts = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/rabbit-pets/main.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  minify: true,
  logLevel: 'info',
};

async function copyAssets() {
  const html = await readFile('index.html', 'utf8');
  await Promise.all([
    writeFile(
      'dist/rabbit-pets/index.html',
      html.replaceAll('__BUILD_ID__', BUILD_ID).replaceAll('__SDK_VERSION__', SDK_VERSION)
    ),
    copyFile('styles.css', 'dist/rabbit-pets/styles.css'),
    copyFile('icon-512.png', 'dist/rabbit-pets/icon-512.png'),
    // Press Start 2P (OFL 1.1, latin subset). OFL.txt ships alongside the
    // woff2 so the redistributed font carries its license, as required.
    copyFile('fonts/press-start-2p-latin.woff2', 'dist/rabbit-pets/fonts/press-start-2p-latin.woff2'),
    copyFile('fonts/OFL.txt', 'dist/rabbit-pets/fonts/OFL.txt'),
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
