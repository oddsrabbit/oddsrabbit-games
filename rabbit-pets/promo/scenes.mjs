// Rabbit Pets' promo scenes for promo-kit: each opens dev/harness.html with a seeded pet and
// records a few seconds of play. The end card comes from promo-kit (promo.config.mjs).
const RICH = 'seed=day&at=14&rich=1&visits=0&inbox=0';
const HIDE = '.chips-events,.float-cards,.cards-events,.goal-bar{display:none!important}';
const NO_TOAST = '#toast{display:none!important}';

// The harness hosts the game in an iframe; captions go on the host page above it.
async function open(ctx, qs) {
  const page = await ctx.newPage(`${ctx.url}dev/harness.html?${qs}`);
  await page.waitForTimeout(2500);
  const fr = page.frames()[1];
  await fr.addStyleTag({ content: HIDE });
  return { page, fr };
}

const btn = (fr, name) => fr.getByRole('button', { name, exact: false }).first().click({ timeout: 3000 });
const act = (fr, name) => fr.locator('.act', { hasText: name }).first().click();

// Room coordinates (98 x 118, as saved in the burrow) to page coordinates: the canvas surface
// is bigger than the room, which sits centred with its floor on the bottom edge.
async function tap(page, fr, x, y) {
  const c = fr.locator('canvas').first();
  const r = await c.boundingBox();
  const [cw, ch] = await c.evaluate((el) => [el.width, el.height]);
  const offX = Math.round((cw - 98) / 2), offY = ch - 118;
  await page.mouse.click(r.x + (x + offX) * r.width / cw, r.y + (y + offY) * r.height / ch);
}

export default {
  async adopt(ctx) {
    const { page, fr } = await open(ctx, '');
    await fr.addStyleTag({ content: 'h1,h1+p{visibility:hidden}' });
    await ctx.record(page, async () => {
      await ctx.caption(page, 'Adopt your own<br>tiny rabbit', '2.5%');
      for (const c of ['Cream', 'Cocoa', 'Silver', 'Midnight', 'Ginger']) {
        await page.waitForTimeout(380); await fr.getByRole('button', { name: c, exact: true }).click();
      }
      await page.waitForTimeout(300); await fr.getByRole('button', { name: 'Lop', exact: true }).click();
      await page.waitForTimeout(700);
    });
    await page.close();
  },
  async feed(ctx) {
    const { page, fr } = await open(ctx, RICH);
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await ctx.record(page, async () => {
      await ctx.caption(page, 'Spoil her with<br>treats');
      await page.waitForTimeout(500); await act(fr, 'Feed');
      await page.waitForTimeout(600); await btn(fr, 'Berry');
      await page.waitForTimeout(2200);
    });
    await page.close();
  },
  async play(ctx) {
    const { page, fr } = await open(ctx, RICH + '&coat=ginger');
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await ctx.record(page, async () => {
      await ctx.caption(page, 'Pet her, play<br>with her');
      await page.waitForTimeout(400); await act(fr, 'Pet');
      await page.waitForTimeout(1300); await act(fr, 'Play');
      await page.waitForTimeout(500); await btn(fr, 'Ball');
      await page.waitForTimeout(1600);
    });
    await page.close();
  },
  // Buys the harvest pumpkin in the shop, puts it out, then drags it and the honey lantern
  // (from storage) into place. Drag points are page coordinates of the arrange view at 360x640.
  async decorate(ctx) {
    const { page, fr } = await open(ctx, RICH);
    await fr.addStyleTag({ content: NO_TOAST });
    await btn(fr, 'Later'); await page.waitForTimeout(500);
    await btn(fr, 'Shop'); await page.waitForTimeout(800);
    await ctx.record(page, async () => {
      await ctx.caption(page, 'Decorate her<br>cozy burrow', '1.5%');
      await page.waitForTimeout(500); await btn(fr, 'Harvest pumpkin');
      await page.waitForTimeout(700); await btn(fr, 'Buy for');
      await page.waitForTimeout(600); await btn(fr, 'Put it out');
      await page.waitForTimeout(500);
      await ctx.drag(page, [172, 288], [236, 300], 700);
      await page.waitForTimeout(300);
      await ctx.drag(page, [78, 430], [112, 222], 800);
      await page.waitForTimeout(1300);
    });
    await page.close();
  },
  async garden(ctx) {
    const { page, fr } = await open(ctx, RICH + '&extras=1&critter=hedgehog');
    await btn(fr, 'Later'); await page.waitForTimeout(500);
    await btn(fr, 'Garden'); await page.waitForTimeout(1200);
    await ctx.record(page, async () => {
      await ctx.caption(page, 'Grow a garden<br>together', '17%');
      await page.waitForTimeout(700); await btn(fr, 'Pick');
      await page.waitForTimeout(2000);
    });
    await page.close();
  },
  async visitor(ctx) {
    const { page, fr } = await open(ctx, RICH + '&extras=1&critter=hedgehog');
    await btn(fr, 'Later'); await page.waitForTimeout(600);
    await ctx.record(page, async () => {
      await fr.addStyleTag({ content: NO_TOAST }); await ctx.caption(page, 'Woodland friends<br>drop by', '17%');
      await page.waitForTimeout(900); await tap(page, fr, 10, 111);
      await page.waitForTimeout(1900);
    });
    await page.close();
  },
  async winter(ctx) {
    const { page, fr } = await open(ctx, 'seed=day&at=21&date=2026-12-20&rich=1&visits=0&inbox=0&coat=cocoa');
    await btn(fr, 'Try it on'); await page.waitForTimeout(800);
    await ctx.record(page, async () => {
      await page.waitForTimeout(300);
      await ctx.caption(page, 'She lives on,<br>even while<br>you\'re away');
      await page.waitForTimeout(2300);
    });
    await page.close();
  },
};
