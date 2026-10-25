// Build for Rabbit Paint. Produces dist/rabbit-paint/, uploaded to
// apps.oddsrabbit.com/rabbit-paint/ next to the SDK's own dist.
//
// The game loads the SDK from the host (`../sdk-v1.js`), so it isn't bundled.
// It's read from the repo root for its cache-bust stamp and
// copied into dist/ so dev/harness.html runs locally; don't upload that copy.
//
// Pages come from art/<slug>/ (run `npm run prep-page -- --all` first).
// Sample pages (`"sample": true`) are left out unless SAMPLES=1.

import * as esbuild from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const watch = process.argv.includes('--watch');
const SAMPLES = process.env.SAMPLES === '1';
const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const SDK_DIST = process.env.SDK_DIST || '../dist';
const OUT = 'dist/rabbit-paint';
const PAGE_FILES = ['page.json', 'lineart.png', 'lineart.svg', 'regions.png', 'thumb-lineart.png', 'thumb-regions.png'];

await rm('dist', { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const sdk = await readFile(`${SDK_DIST}/sdk-v1.js`).catch(() => null);
if (!sdk) console.warn(`${SDK_DIST}/sdk-v1.js not found; run npm run build at the repo root first. Using BUILD_ID for the SDK stamp.`);
const SDK_VERSION = sdk ? createHash('sha256').update(sdk).digest('hex').slice(0, 12) : BUILD_ID;
if (sdk) await writeFile('dist/sdk-v1.js', sdk);

async function copyPages() {
  const config = JSON.parse(await readFile('art/catalog.json', 'utf8'));
  const pages = [];
  for (const slug of (await readdir('art', { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const dir = `art/${slug}`;
    if (!existsSync(`${dir}/page.config.json`)) continue;
    const pageConfig = JSON.parse(await readFile(`${dir}/page.config.json`, 'utf8'));
    if (pageConfig.sample && !SAMPLES) continue;
    const missing = PAGE_FILES.filter((f) => !existsSync(`${dir}/${f}`));
    if (missing.length) throw new Error(`${dir}: missing ${missing.join(', ')}; run npm run prep-page -- ${slug}`);
    const info = JSON.parse(await readFile(`${dir}/page.json`, 'utf8'));
    await mkdir(`${OUT}/pages/${slug}`, { recursive: true });
    await Promise.all(PAGE_FILES.map((f) => copyFile(`${dir}/${f}`, `${OUT}/pages/${slug}/${f}`)));
    pages.push({ slug, title: info.title, category: info.category, regions: info.regions.length, ...(info.credit ? { credit: info.credit } : {}) });
  }
  const slugs = new Set(pages.map((p) => p.slug));
  const dropped = config.daily.filter((s) => !slugs.has(s));
  if (dropped.length) console.warn(`daily schedule skips pages not in this build: ${dropped.join(', ')}`);
  const catalog = { epoch: config.epoch, categories: config.categories, daily: config.daily.filter((s) => slugs.has(s)), pages };
  await writeFile(`${OUT}/catalog.json`, JSON.stringify(catalog));
  console.log(`${pages.length} pages, ${catalog.daily.length} in the daily rotation${SAMPLES ? ' (samples included)' : ''}`);
}

const shared = { bundle: true, platform: 'browser', target: ['es2020'], sourcemap: watch, minify: true, logLevel: 'info' };
const buildOpts = { ...shared, entryPoints: ['src/main.ts'], outfile: `${OUT}/main.js`, format: 'esm' };
// The page-prep worker for players' own pictures; main.js loads it beside itself.
const workerOpts = { ...shared, entryPoints: ['src/worker/prep.worker.ts'], outfile: `${OUT}/prep-worker.js`, format: 'iife' };

async function copyAssets() {
  const html = await readFile('index.html', 'utf8');
  await Promise.all([
    writeFile(`${OUT}/index.html`, html.replaceAll('__BUILD_ID__', BUILD_ID).replaceAll('__SDK_VERSION__', SDK_VERSION)),
    copyFile('styles.css', `${OUT}/styles.css`),
    // The platform manifest points at <slug>/icon-512.png (tools/setup-apps-
    // platform.php in the web repo), so the icon ships with the bundle.
    copyFile('icon/icon-512.png', `${OUT}/icon-512.png`),
    copyPages(),
  ]);
}

if (watch) {
  const ctxs = await Promise.all([esbuild.context(buildOpts), esbuild.context(workerOpts)]);
  await Promise.all(ctxs.map((c) => c.watch()));
  await copyAssets();
  console.log('Watching for changes (Ctrl+C to stop)...');
} else {
  await Promise.all([esbuild.build(buildOpts), esbuild.build(workerOpts)]);
  await copyAssets();
  console.log('Build complete.');
}
