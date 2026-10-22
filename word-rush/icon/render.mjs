// Renders icon.svg to the PNGs the build and the store use. Needs Playwright
// (borrowed from ../promo-kit, like the other games' promo tooling):
//   node icon/render.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../promo-kit/package.json'));
const { chromium } = require('playwright');
const svg = readFileSync(join(here, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [512, 1024]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: join(here, `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('Wrote icon-512.png and icon-1024.png.');
