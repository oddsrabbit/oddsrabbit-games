// Rabbit Paint's shell: loads the catalog, works out today's page, and swaps
// between home, painting and the gallery.

import { loadArt } from './art';
import { dailySlug, dayIndex, parseCatalog, type Catalog } from './catalog';
import type { Fill } from './fills';
import { mountGallery } from './gallery';
import { mountHome } from './home';
import { getMine, isMineSlug, mineId } from './mine';
import { mountPaint } from './paint';
import { openShare } from './share';
import type { Session } from './store';
import { canSubmit, openSubmit } from './submit';
import { button, el, OR, serverNow, syncClock, toast } from './ui';

const root = document.getElementById('root')!;
let unmount: () => void = () => {};
let catalog: Catalog;

/** Today's day number. Before launch (a negative day) it shows day 0. */
function today(): number {
  return Math.max(0, dayIndex(catalog, serverNow()));
}

async function show(next: (root: HTMLElement) => Promise<() => void>) {
  unmount();
  unmount = () => {};
  window.scrollTo(0, 0);
  unmount = await next(root);
}

function home() {
  const day = today();
  void show((r) => mountHome(r, { catalog, day, todaySlug: dailySlug(catalog, day), onOpen: paint, onGallery: gallery }));
}

function paint(session: Session) {
  void show((r) => mountPaint(r, {
    session,
    onDone: home,
    onShare: (art, fills) => openShare(document.body, art, fills),
    onGallery: gallery,
    onSuggest: isMineSlug(session.slug) && canSubmit()
      ? () => void getMine(mineId(session.slug)).then((p) => { if (p) openSubmit(document.body, p, () => {}); })
      : undefined,
  }));
}

function gallery(day: number) {
  const slug = dailySlug(catalog, day);
  if (!slug) { home(); return; }
  void show((r) => mountGallery(r, {
    catalog,
    day,
    slug,
    onClose: home,
    onOpen: paint,
    onShare: (s: string, fills: ReadonlyArray<Fill | null>) => {
      void loadArt(s, 'full').then((art) => openShare(document.body, art, fills)).catch(() => toast('Couldn’t open the picture'));
    },
  }));
}

async function boot() {
  // A standalone load has no host to answer; don't wait forever for one.
  await Promise.race([OR().whenReady(), new Promise((r) => setTimeout(r, 2500))]);
  void syncClock();
  try {
    const res = await fetch('./catalog.json', { cache: 'no-cache' });
    const parsed = parseCatalog(await res.json());
    if (!parsed) throw new Error('bad catalog');
    catalog = parsed;
  } catch {
    root.replaceChildren(el('p', 'boot', 'Rabbit Paint didn’t load. Check your connection and try again.'), button('pill', 'Try again', () => location.reload()));
    OR().ready();
    return;
  }
  await syncClock();
  home();
  OR().ready();
}

void boot();
