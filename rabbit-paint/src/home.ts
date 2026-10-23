// Home: today's page, the gallery link, pages in progress, the player's own
// pictures, then a shelf per category.

import { composite, forgetArt, loadArt, pageUrl } from './art';
import { msUntilNextDay, type Catalog, type PageEntry } from './catalog';
import { filledCount } from './fills';
import { deleteMine, listMine, mineKey, type MinePage } from './mine';
import { mountSplashes } from './splashes';
import { forgetProgress, loadProgress, loadWip, type Session } from './store';
import { canSubmit, openSubmit } from './submit';
import { button, el, icon, serverNow, toast } from './ui';
import { canAddMore, chooseImage, openUpload } from './upload';

export interface HomeOptions {
  catalog: Catalog;
  day: number;
  todaySlug: string | null;
  onOpen(session: Session): void;
  onGallery(day: number): void;
}

export async function mountHome(root: HTMLElement, o: HomeOptions): Promise<() => void> {
  const screen = el('div', 'home');
  // No title (the player opened the game by name): the bar only keeps the
  // status bar and the back button's row clear once the page scrolls. It is
  // clear at the top so the splashes behind it show.
  const header = el('header', 'bar');
  const main = el('main', 'home-body');
  screen.append(header, main);
  root.replaceChildren(screen);
  const stopSplashes = mountSplashes(screen, o.day);
  const onScroll = () => screen.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });

  const bySlug = new Map(o.catalog.pages.map((p) => [p.slug, p]));
  const today = o.todaySlug ? bySlug.get(o.todaySlug) : undefined;
  if (today) main.append(await todayCard(o, today));

  const wip = (await loadWip()).filter((w) => bySlug.has(w.slug));
  if (wip.length) {
    const row = shelf('Keep coloring');
    for (const w of wip) {
      const page = bySlug.get(w.slug)!;
      const tile = pageTile(page, pageUrl(page.slug, 'thumb-lineart.png'), () => o.onOpen({ key: w.key, slug: w.slug, day: null }));
      const bar = el('div', 'tile-progress');
      const fillBar = el('div', 'tile-progress-fill');
      fillBar.style.width = `${Math.round((100 * w.filled) / w.total)}%`;
      bar.append(fillBar);
      tile.querySelector('.tile-art')!.append(bar);
      void colorTile(tile, page, { key: w.key, slug: w.slug, day: null });
      row.list.append(tile);
    }
    main.append(row.section);
  }

  main.append(await mineShelf(o));

  for (const cat of o.catalog.categories) {
    const pages = o.catalog.pages.filter((p) => p.category === cat.id);
    if (!pages.length) continue;
    const row = shelf(cat.name);
    for (const page of pages) {
      const session: Session = { key: `page-${page.slug}`, slug: page.slug, day: null };
      row.list.append(pageTile(page, pageUrl(page.slug, 'thumb-lineart.png'), () => o.onOpen(session)));
    }
    main.append(row.section);
  }

  return () => { stopSplashes(); window.removeEventListener('scroll', onScroll); };
}

async function todayCard(o: HomeOptions, page: PageEntry): Promise<HTMLElement> {
  const session: Session = { key: `day-${o.day}`, slug: page.slug, day: o.day };
  const card = el('section', 'today');
  card.setAttribute('aria-label', 'Today’s page');
  const top = el('div', 'today-top');
  const pic = el('div', 'today-pic');
  const img = el('img');
  img.src = pageUrl(page.slug, 'thumb-lineart.png');
  img.alt = page.title;
  pic.append(img);
  const info = el('div', 'today-info');
  const kicker = el('div', 'kicker', 'Today’s page');
  const title = el('h2', '', page.title);
  const meta = el('div', 'muted', `${page.regions} areas · new page in ${untilNext(o)}`);
  const go = button('primary-btn', 'Color it', () => o.onOpen(session));
  info.append(kicker, title, meta, el('div', 'grow'), go);
  top.append(pic, info);
  card.append(top);

  const progress = await loadProgress(session, page.regions);
  const filled = filledCount(progress.fills);
  const done = filled === page.regions;
  if (filled) {
    go.textContent = done ? (progress.posted ? 'See it' : 'Post it') : 'Keep going';
    meta.textContent = done ? (progress.posted ? 'Finished and posted' : 'Finished · not posted yet') : `${filled} of ${page.regions} areas · new page in ${untilNext(o)}`;
    void loadArt(page.slug, 'thumb').then((art) => {
      const c = composite(art, progress.fills, 300);
      c.setAttribute('aria-label', page.title);
      pic.replaceChildren(c);
    }).catch(() => {});
  }

  const gallery = el('button', 'gallery-link');
  gallery.type = 'button';
  const peek = el('div', 'peek');
  for (let i = 0; i < 4; i++) peek.append(el('span', `peek-${i}`));
  const text = el('div', 'gallery-text');
  text.append(el('strong', '', 'See everyone’s'), el('span', 'muted', done ? 'Today’s gallery' : 'Unlocks when you finish yours'));
  gallery.append(peek, text);
  if (done) {
    gallery.classList.add('open');
    gallery.insertAdjacentHTML('beforeend', '<span class="chev" aria-hidden="true">›</span>');
    gallery.addEventListener('click', () => o.onGallery(o.day));
  } else {
    gallery.insertAdjacentHTML('beforeend', icon('lock'));
    gallery.addEventListener('click', () => o.onOpen(session));
  }
  card.append(gallery);
  return card;
}

function untilNext(o: HomeOptions): string {
  const ms = msUntilNextDay(o.catalog, serverNow());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function shelf(name: string) {
  const section = el('section', 'shelf');
  section.append(el('h2', '', name));
  const list = el('div', 'shelf-list');
  section.append(list);
  return { section, list };
}

/** `src` null: the art box stays blank until colorTile draws it. */
function pageTile(page: PageEntry, src: string | null, onOpen: () => void): HTMLButtonElement {
  const tile = el('button', 'tile');
  tile.type = 'button';
  const artBox = el('div', 'tile-art');
  if (src) {
    const img = el('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    artBox.append(img);
  }
  tile.append(artBox, el('span', 'tile-name', page.title));
  if (page.credit) tile.append(el('span', 'tile-credit', `by ${page.credit}`));
  tile.addEventListener('click', onOpen);
  return tile;
}

async function colorTile(tile: HTMLElement, page: PageEntry, session: Session) {
  try {
    const [art, progress] = await Promise.all([loadArt(page.slug, 'thumb'), loadProgress(session, page.regions)]);
    const c = composite(art, progress.fills, 220);
    const box = tile.querySelector('.tile-art')!;
    const img = box.querySelector('img');
    if (img) img.replaceWith(c); else box.prepend(c);
  } catch { /* keep the line art */ }
}

// --- the player's own pictures ------------------------------------------------------

export function mineSession(p: MinePage): Session {
  return { key: mineKey(p.id), slug: p.info.slug, day: null };
}

async function mineShelf(o: HomeOptions): Promise<HTMLElement> {
  const mine = await listMine();
  const row = shelf('Your pictures');
  const add = el('button', 'tile add-tile');
  add.type = 'button';
  const addArt = el('div', 'tile-art');
  addArt.innerHTML = icon('image', 30);
  add.append(addArt, el('span', 'tile-name', 'Add a picture'));
  add.addEventListener('click', () => {
    if (!canAddMore(mine.length)) return;
    chooseImage((file) => openUpload(document.body, file, { onColor: (p) => o.onOpen(mineSession(p)) }));
  });
  row.list.append(add);
  if (!mine.length) row.section.append(el('p', 'hint', 'Turn a drawing or a printed coloring page into a page here. It stays on this device.'));

  for (const m of mine) {
    const session = mineSession(m);
    const entry: PageEntry = { slug: m.info.slug, title: m.title, category: 'mine', regions: m.info.regions.length };
    const wrap = el('div', 'tile-wrap');
    const tile = pageTile(entry, null, () => o.onOpen(session));
    const more = button('tile-more', icon('more', 18), () => mineSheet(o, m, () => { mine.splice(mine.indexOf(m), 1); wrap.remove(); }), `More for ${m.title}`);
    wrap.append(tile, more);
    void colorTile(tile, entry, session);
    row.list.append(wrap);
  }
  return row.section;
}

function mineSheet(o: HomeOptions, page: MinePage, onDeleted: () => void) {
  const wrap = el('div', 'sheet-wrap');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', page.title);
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  const actions = el('div', 'sheet-actions');
  actions.append(button('primary-btn', 'Color it', () => { close(); o.onOpen(mineSession(page)); }));
  if (canSubmit()) {
    actions.append(button('secondary-btn', page.submitted ? 'Sent for review' : 'Share with everyone', () => {
      close();
      openSubmit(document.body, page, (p) => { page.submitted = p.submitted; });
    }));
  }
  let armed = false;
  const del = button('secondary-btn danger', 'Delete', () => {
    if (!armed) { armed = true; del.textContent = 'Tap again to delete'; return; }
    void (async () => {
      try {
        await deleteMine(page.id);
        forgetArt(page.info.slug);
        await forgetProgress(mineKey(page.id));
        onDeleted();
        close();
      } catch {
        toast('Couldn’t delete it. Try again.');
      }
    })();
  });
  actions.append(del, button('text-btn', 'Close', close));
  sheet.append(el('h2', '', page.title), el('p', 'muted center', `${page.info.regions.length} areas · on this device only`), actions);
  wrap.append(sheet);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
}
