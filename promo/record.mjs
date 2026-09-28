// Records each promo scene as a folder of screencast frames + an ffmpeg concat list.
//   node record.mjs [sceneName ...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8777/dev/harness.html?';
const W = 360, H = 640, DPR = 3;
const RICH = 'seed=day&at=14&rich=1&visits=0&inbox=0';
const FONT = 'http://127.0.0.1:8777/fonts/press-start-2p-latin.woff2';

const HIDE = '.chips-events,.float-cards,.cards-events,.goal-bar{display:none!important}';

// Caption drawn over the host page (above the iframe), in the game's pixel font.
async function caption(page, text, top = '27%') {
  await page.evaluate(({ text, top, FONT }) => {
    let s = document.getElementById('cap-style');
    if (!s) {
      s = document.createElement('style'); s.id = 'cap-style';
      s.textContent = `@font-face{font-family:px;src:url(${FONT})}
      #cap{position:fixed;left:0;right:0;display:flex;justify-content:center;pointer-events:none;z-index:9}
      #cap span{font-family:px;font-size:19px;line-height:1.45;color:#3b2418;background:#fff6e4;border:3px solid #3b2418;
        border-radius:14px;padding:12px 16px 10px;text-align:center;max-width:300px;box-shadow:0 5px 0 #3b2418;
        animation:pop .35s cubic-bezier(.3,1.6,.5,1) both}
      @keyframes pop{from{transform:scale(.4) rotate(-4deg);opacity:0}to{transform:none;opacity:1}}`;
      document.head.append(s);
    }
    document.getElementById('cap')?.remove();
    const d = document.createElement('div'); d.id = 'cap'; d.style.top = top;
    d.innerHTML = `<span>${text}</span>`;
    document.body.append(d);
  }, { text, top, FONT });
}

async function open(browser, qs) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await page.goto(BASE + qs);
  await page.evaluate(FONT => document.fonts.load('19px px').catch(() => {}), FONT);
  await page.waitForTimeout(2500);
  const fr = page.frames()[1];
  await fr.addStyleTag({ content: HIDE });
  return { page, fr };
}

const btn = (fr, name) => fr.getByRole('button', { name, exact: false }).first().click({ timeout: 3000 });
const act = (fr, name) => fr.locator('.act', { hasText: name }).first().click();

// Room coordinates (98 x 118, as saved in the burrow) to page coordinates: the
// canvas surface is bigger than the room, which sits centred with its floor on the bottom edge.
async function roomToPage(fr) {
  const c = fr.locator('canvas').first();
  const r = await c.boundingBox();
  const [cw, ch] = await c.evaluate((el) => [el.width, el.height]);
  const offX = Math.round((cw - 98) / 2), offY = ch - 118;
  return (x, y) => [r.x + (x + offX) * r.width / cw, r.y + (y + offY) * r.height / ch];
}
async function drag(page, fr, [x1, y1], [x2, y2], ms = 900) {
  const at = await roomToPage(fr);
  await page.mouse.move(...at(x1, y1)); await page.mouse.down();
  const n = 24;
  for (let i = 1; i <= n; i++) { await page.mouse.move(...at(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)); await page.waitForTimeout(ms / n); }
  await page.mouse.up();
}
async function tap(page, fr, x, y) {
  const at = await roomToPage(fr);
  await page.mouse.click(...at(x, y));
}

async function record(page, name, fn) {
  const dir = `frames/${name}`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: performance.now() / 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
  const t0 = performance.now() / 1000;
  await fn();
  const t1 = performance.now() / 1000;
  await cdp.send('Page.stopScreencast');
  // concat list: each frame held until the next one; the last until the end
  let list = '';
  frames.forEach((f, i) => {
    const file = `${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(`${dir}/${file}`, Buffer.from(f.data, 'base64'));
    const end = i + 1 < frames.length ? frames[i + 1].t : t1;
    list += `file '${file}'\nduration ${Math.max(0.001, end - f.t).toFixed(4)}\n`;
  });
  list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(`${dir}/list.txt`, list);
  console.log(name, frames.length, 'frames', (t1 - t0).toFixed(2) + 's', (frames.length / (t1 - t0)).toFixed(1), 'fps');
}

const SCENES = {
  async end(b) {
    const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    await page.goto('file://' + process.cwd() + '/endcard.html?hold');
    await page.evaluate(() => { document.body.style.visibility = 'hidden'; document.getAnimations().forEach(a => a.pause()); });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await record(page, 'end', async () => {
      await page.evaluate(() => { document.body.style.visibility = ''; document.getAnimations().forEach(a => { a.currentTime = 0; a.play(); }); });
      await page.waitForTimeout(3800);
    });
    await page.close();
  },
  async adopt(b) {
    const { page, fr } = await open(b, '');
    await fr.addStyleTag({ content: 'h1,h1+p{visibility:hidden}' });
    await record(page, 'adopt', async () => {
      await caption(page, 'Adopt your own<br>tiny rabbit', '2.5%');
      for (const c of ['Cream', 'Cocoa', 'Silver', 'Midnight', 'Ginger']) {
        await page.waitForTimeout(380); await fr.getByRole('button', { name: c, exact: true }).click();
      }
      await page.waitForTimeout(300); await fr.getByRole('button', { name: 'Lop', exact: true }).click();
      await page.waitForTimeout(700);
    });
    await page.close();
  },
  async feed(b) {
    const { page, fr } = await open(b, RICH);
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await record(page, 'feed', async () => {
      await caption(page, 'Spoil her with<br>treats');
      await page.waitForTimeout(500); await act(fr, 'Feed');
      await page.waitForTimeout(600); await btn(fr, 'Berry');
      await page.waitForTimeout(2200);
    });
    await page.close();
  },
  async play(b) {
    const { page, fr } = await open(b, RICH + '&coat=ginger');
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await record(page, 'play', async () => {
      await caption(page, 'Pet her, play<br>with her');
      await page.waitForTimeout(400); await act(fr, 'Pet');
      await page.waitForTimeout(1300); await act(fr, 'Play');
      await page.waitForTimeout(500); await btn(fr, 'Ball');
      await page.waitForTimeout(1600);
    });
    await page.close();
  },
  async decorate(b) {
    const { page, fr } = await open(b, RICH);
    await btn(fr, 'Later'); await page.waitForTimeout(500);
    await btn(fr, 'Shop and decorate'); await page.waitForTimeout(800);
    await record(page, 'decorate', async () => {
      await caption(page, 'Decorate her<br>cozy burrow', '18%');
      await page.waitForTimeout(400);
      await fr.addStyleTag({ content: '#toast{display:none!important}' });
      await drag(page, fr, [64, 90], [80, 90], 700);
      await page.waitForTimeout(300);
      await fr.locator('button', { hasText: 'Harvest pumpkin' }).first().click({ timeout: 3000 }).catch(() => console.log('pumpkin miss'));
      await page.waitForTimeout(500);
      await drag(page, fr, [49, 108], [66, 110], 700);
      await page.waitForTimeout(1400);
    });
    await page.close();
  },
  async garden(b) {
    const { page, fr } = await open(b, RICH + '&extras=1&critter=hedgehog');
    await btn(fr, 'Later'); await page.waitForTimeout(500);
    await btn(fr, 'Garden'); await page.waitForTimeout(1200);
    await record(page, 'garden', async () => {
      await caption(page, 'Grow a garden<br>together', '17%');
      await page.waitForTimeout(700); await btn(fr, 'Pick');
      await page.waitForTimeout(2000);
    });
    await page.close();
  },
  async visitor(b) {
    const { page, fr } = await open(b, RICH + '&extras=1&critter=hedgehog');
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await record(page, 'visitor', async () => {
      await fr.addStyleTag({ content: '#toast{display:none!important}' }); await caption(page, 'Woodland friends<br>drop by', '17%');
      await page.waitForTimeout(900); await tap(page, fr, 10, 111);
      await page.waitForTimeout(1900);
    });
    await page.close();
  },
  async winter(b) {
    const { page, fr } = await open(b, 'seed=day&at=21&date=2026-12-20&rich=1&visits=0&inbox=0&coat=cocoa');
    await btn(fr, 'Try it on'); await page.waitForTimeout(800);
    await record(page, 'winter', async () => {
      await page.waitForTimeout(300);
      await caption(page, 'She lives on,<br>even while<br>you\'re away');
      await page.waitForTimeout(2300);
    });
    await page.close();
  },
};

const browser = await chromium.launch();
const want = process.argv.slice(2);
for (const [name, fn] of Object.entries(SCENES)) if (!want.length || want.includes(name)) await fn(browser);
await browser.close();
