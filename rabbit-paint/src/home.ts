// Home: three tabs along the bottom. Discover is the library, a grid per
// category; My art is every library page the player has painted; Gallery is
// everyone's posts across all pages.

import { composite, forgetArt, loadArt, pageUrl } from './art';
import { msUntilNextDay, pageRoundKey, type Catalog, type PageEntry } from './catalog';
import { mountFeed } from './feed';
import { filledCount } from './fills';
import { deleteMine, listMine, mineKey, type MinePage } from './mine';
import { mountSplashes } from './splashes';
import { clearProgress, forgetProgress, loadArtIndex, loadProgress, type ArtEntry, type Session } from './store';
import { canSubmit, openSubmit } from './submit';
import { button, el, icon, ICONS, OR, serverNow, toast } from './ui';
import { canAddMore, chooseImage, openUpload } from './upload';

/** "Your pictures": off for now, until pictures that aren't line art come out well. */
const ADD_PICTURES = false;
/** Today's page card: off for now, until there are enough pages for a daily rotation. */
const TODAYS_PAGE = false;

export type HomeTab = 'discover' | 'mine' | 'feed';

export interface HomeOptions {
  catalog: Catalog;
  day: number;
  todaySlug: string | null;
  tab: HomeTab;
  onTab(tab: HomeTab): void;
  onOpen(session: Session): void;
  /** A page's gallery: everyone's versions of it. */
  onGallery(slug: string): void;
}

const TABS: Array<{ tab: HomeTab; label: string; icon: keyof typeof ICONS }> = [
  { tab: 'discover', label: 'Discover', icon: 'compass' },
  { tab: 'mine', label: 'My art', icon: 'palette' },
  { tab: 'feed', label: 'Gallery', icon: 'people' },
];

export async function mountHome(root: HTMLElement, o: HomeOptions): Promise<() => void> {
  const screen = el('div', 'home');
  // No title on Discover (the player opened the game by name): the bar only
  // keeps the status bar and the back button's row clear once the page
  // scrolls. It is clear at the top so the splashes behind it show.
  const header = el('header', 'bar');
  const main = el('main', 'home-body');
  const nav = el('nav', 'tabbar');
  nav.setAttribute('aria-label', 'Rabbit Paint');
  for (const t of TABS) {
    const b = button('tab', `${icon(t.icon, 22)}<span>${t.label}</span>`, () => { if (t.tab !== o.tab) o.onTab(t.tab); });
    if (t.tab === o.tab) b.setAttribute('aria-current', 'page');
    nav.append(b);
  }
  screen.append(header, main, nav);
  root.replaceChildren(screen);
  const stopSplashes = mountSplashes(screen, o.day);
  const onScroll = () => screen.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  let stopTab = () => {};

  const art = await loadArtIndex(o.catalog.pages);
  const painted = new Map(art.map((e) => [e.slug, e]));
  if (o.tab === 'discover') await discoverTab(o, main, painted);
  else if (o.tab === 'mine') await mineTab(o, main, art);
  else stopTab = mountFeed(main, { catalog: o.catalog, onGallery: o.onGallery });

  return () => { stopTab(); stopSplashes(); window.removeEventListener('scroll', onScroll); };
}

async function discoverTab(o: HomeOptions, main: HTMLElement, painted: Map<string, ArtEntry>) {
  const bySlug = new Map(o.catalog.pages.map((p) => [p.slug, p]));
  const today = o.todaySlug ? bySlug.get(o.todaySlug) : undefined;
  if (TODAYS_PAGE && today) main.append(await todayCard(o, today));
  for (const cat of o.catalog.categories) {
    const pages = o.catalog.pages.filter((p) => p.category === cat.id);
    if (!pages.length) continue;
    const row = shelf(cat.name, 'grid');
    for (const page of pages) row.list.append(libraryTile(o, page, painted.get(page.slug)));
    main.append(row.section);
  }
}

/** Every library page the player has painted: in progress, then finished. */
async function mineTab(o: HomeOptions, main: HTMLElement, art: ArtEntry[]) {
  const bySlug = new Map(o.catalog.pages.map((p) => [p.slug, p]));
  const entries = art.filter((e) => bySlug.has(e.slug)).sort((a, b) => b.at - a.at);
  const going = entries.filter((e) => e.filled < e.total);
  const done = entries.filter((e) => e.filled >= e.total);
  main.append(el('h1', 'tab-title', 'My art'));
  if (!entries.length) {
    const empty = el('div', 'empty');
    empty.append(
      el('p', 'muted', 'Pages you color show up here, ready to pick up again.'),
      button('primary-btn', 'Find a page', () => o.onTab('discover')),
    );
    main.append(empty);
  }
  for (const [name, list] of [['In progress', going], ['Finished', done]] as const) {
    if (!list.length) continue;
    const row = shelf(name, 'grid');
    for (const e of list) {
      const wrap = libraryTile(o, bySlug.get(e.slug)!, e);
      const artBox = wrap.querySelector('.tile-art')!;
      if (e.filled < e.total) {
        const bar = el('div', 'tile-progress');
        const fillBar = el('div', 'tile-progress-fill');
        fillBar.style.width = `${Math.round((100 * e.filled) / e.total)}%`;
        bar.append(fillBar);
        artBox.append(bar);
      } else if (e.posted) {
        artBox.append(el('span', 'tile-posted', 'Posted'));
      }
      row.list.append(wrap);
    }
    main.append(row.section);
  }
  if (ADD_PICTURES) main.append(await mineShelf(o));
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
    gallery.addEventListener('click', () => o.onGallery(page.slug));
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

/** A row that scrolls sideways, or a two-column grid of bigger tiles. */
function shelf(name: string, layout: 'row' | 'grid' = 'row') {
  const section = el('section', 'shelf');
  section.append(el('h2', '', name));
  const list = el('div', layout === 'grid' ? 'shelf-grid' : 'shelf-list');
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

/** Draws the player's fills into a tile; resolves to how many areas are filled. A blank page keeps its line art. */
async function colorTile(tile: HTMLElement, page: PageEntry, session: Session): Promise<number> {
  try {
    const progress = await loadProgress(session, page.regions);
    const filled = filledCount(progress.fills);
    const box = tile.querySelector('.tile-art')!;
    const img = box.querySelector('img');
    if (!filled && img) return 0;
    const c = composite(await loadArt(page.slug, 'thumb'), progress.fills, 220);
    if (img) img.replaceWith(c); else box.prepend(c);
    return filled;
  } catch { return 0; /* keep the line art */ }
}

/**
 * A library page: shown as far as the player has colored it (a painted one,
 * from the index, asks whether to carry on or start over), with a corner
 * button to everyone's versions and how many there are.
 */
function libraryTile(o: HomeOptions, page: PageEntry, entry?: ArtEntry): HTMLElement {
  const session: Session = { key: `page-${page.slug}`, slug: page.slug, day: null };
  let filled = entry?.filled ?? 0;
  const tile = pageTile(page, pageUrl(page.slug, 'thumb-lineart.png'), () => (filled ? paintedSheet(o, page, session, filled) : o.onOpen(session)));
  if (entry) void colorTile(tile, page, session).then((n) => { filled = n; });
  const wrap = el('div', 'tile-wrap');
  const others = button('tile-gallery', icon('people', 16), () => o.onGallery(page.slug), `See everyone’s ${page.title}`);
  wrap.append(tile, others);
  void postCount(page.slug).then((n) => {
    if (!n) return;
    others.insertAdjacentHTML('beforeend', `<span>${n > 99 ? '99+' : n}</span>`);
    others.setAttribute('aria-label', `See everyone’s ${page.title}: ${n} posted`);
  });
  return wrap;
}

/** How many players have posted a page, or 0 when the host can't say. */
async function postCount(slug: string): Promise<number> {
  if (!OR().capabilities.has('scores.distribution')) return 0;
  try {
    const buckets = await OR().scores.distribution({ roundKey: pageRoundKey(slug) });
    return buckets.reduce((sum, b) => sum + b.count, 0);
  } catch { return 0; }
}

function paintedSheet(o: HomeOptions, page: PageEntry, session: Session, filled: number) {
  const { actions, close } = openSheet(page.title, filled === page.regions ? 'Finished' : `${filled} of ${page.regions} areas colored`);
  actions.append(button('primary-btn', filled === page.regions ? 'See it' : 'Keep coloring', () => { close(); o.onOpen(session); }));
  let armed = false;
  const fresh = button('secondary-btn', 'Start over', () => {
    if (!armed) { armed = true; fresh.textContent = 'Tap again to clear it and start over'; return; }
    void (async () => {
      try {
        await clearProgress(session.key);
        close();
        o.onOpen(session);
      } catch {
        toast('Couldn’t clear it. Try again.');
      }
    })();
  });
  actions.append(fresh, button('text-btn', 'Close', close));
}

/** A bottom sheet with a title and a line under it; the caller adds the buttons. */
function openSheet(title: string, sub: string) {
  const wrap = el('div', 'sheet-wrap');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  const actions = el('div', 'sheet-actions');
  sheet.append(el('h2', '', title), el('p', 'muted center', sub), actions);
  wrap.append(sheet);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return { actions, close };
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
  const { actions, close } = openSheet(page.title, `${page.info.regions.length} areas · on this device only`);
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
}
