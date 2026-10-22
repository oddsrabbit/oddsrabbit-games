// Today's gallery: everyone's version of the day's page. Each post is a score
// row on `day-N` whose metadata is the packed fills, so a thumbnail is drawn
// here from the page's own region map; no images are stored. Hearts are
// `scores.like` on those rows; Everyone sorts by them (or newest first).

import type { FriendScore, TopScoreEntry } from '@oddsrabbit/apps-sdk';
import { composite, loadArt, Painter, type Art } from './art';
import { dayRoundKey, type Catalog } from './catalog';
import { filledCount, unpackColoring, type Fill } from './fills';
import { loadProgress, type Session } from './store';
import { button, el, haptic, icon, OR, toast } from './ui';

export interface GalleryOptions {
  catalog: Catalog;
  day: number;
  slug: string;
  onClose(): void;
  onOpen(session: Session): void;
  onShare(slug: string, fills: ReadonlyArray<Fill | null>): void;
}

type Tab = 'everyone' | 'friends';
type Sort = 'likes' | 'latest';
type Entry = { row: TopScoreEntry; fills: Array<Fill | null> };
const LIMIT = 100;
const THUMB = 320;

export async function mountGallery(root: HTMLElement, o: GalleryOptions): Promise<() => void> {
  const page = o.catalog.pages.find((p) => p.slug === o.slug);
  const screen = el('div', 'gallery');
  const header = el('header', 'bar');
  const titles = el('div', 'bar-titles');
  titles.append(el('h1', '', 'Today’s gallery'), el('div', 'muted', page?.title ?? ''));
  header.append(titles, el('div', 'grow'), button('round-btn', icon('close', 16), o.onClose, 'Close'));
  const body = el('main', 'gallery-body');
  screen.append(header, body);
  root.replaceChildren(screen);
  if (!page) { body.append(el('p', 'muted', 'This page isn’t available.')); return () => {}; }

  const session: Session = { key: `day-${o.day}`, slug: o.slug, day: o.day };
  const [art, mine] = await Promise.all([loadArt(o.slug, 'thumb'), loadProgress(session, page.regions)]);
  const finished = filledCount(mine.fills) === page.regions;

  if (!finished) {
    const locked = el('div', 'locked');
    locked.append(
      el('div', 'locked-icon'),
      el('h2', '', 'Finish yours first'),
      el('p', 'muted', 'Everyone’s versions of today’s page show up here once you’ve colored every area of your own.'),
      button('primary-btn', 'Color it', () => o.onOpen(session)),
    );
    locked.querySelector('.locked-icon')!.innerHTML = icon('lock', 28);
    body.append(locked);
    return () => {};
  }

  const painter = new Painter(art);
  const yours = el('div', 'yours');
  const yourPic = composite(art, mine.fills, 160, painter);
  yourPic.setAttribute('aria-label', 'Your version');
  const yoursText = el('div', 'grow');
  const yoursSub = el('div', 'muted', mine.posted ? 'Posted to the gallery' : 'Not posted yet');
  yoursText.append(el('strong', '', 'Yours'), yoursSub);
  const showMyLikes = (n: number) => {
    if (mine.posted && canLike) yoursSub.innerHTML = `${icon('heart', 13)} ${n} ${n === 1 ? 'like' : 'likes'}`;
  };
  yours.append(
    yourPic,
    yoursText,
    mine.posted
      ? button('pill accent', `${icon('share', 16)} Share`, () => o.onShare(o.slug, mine.fills))
      : button('pill accent', 'Post it', () => o.onOpen(session)),
  );

  const tabs = el('div', 'seg');
  tabs.setAttribute('role', 'tablist');
  const sorts = el('div', 'sort-row');
  const grid = el('div', 'gallery-grid');
  const status = el('p', 'muted center');
  body.append(tabs, yours, sorts, status, grid);

  // Hosts from before likes get the plain gallery: earliest first, no hearts.
  const canLike = OR().capabilities.has('scores.like');
  const roundKey = dayRoundKey(o.day);
  const me = OR().user?.uuid;
  const liked = new Set<string>();
  const likesReady = me && canLike
    ? OR().scores.myLikes({ roundKey }).then((u) => u.forEach((id) => liked.add(id)), () => {})
    : Promise.resolve();

  const setStatus = (text: string) => { status.textContent = text; status.hidden = !text; };
  let tab: Tab = 'everyone';
  let sort: Sort = 'likes';
  let token = 0;
  const tabBtns = (['everyone', 'friends'] as Tab[]).map((t) => {
    const b = button('seg-btn', t === 'everyone' ? 'Everyone' : 'Friends', () => { tab = t; void load(); });
    b.setAttribute('role', 'tab');
    tabs.append(b);
    return { t, b };
  });
  const sortBtns = (['likes', 'latest'] as Sort[]).map((k) => {
    const b = button('chip', k === 'likes' ? 'Most liked' : 'Newest', () => { sort = k; void load(); });
    sorts.append(b);
    return { k, b };
  });

  async function load() {
    const my = ++token;
    tabBtns.forEach(({ t, b }) => b.setAttribute('aria-selected', String(t === tab)));
    sortBtns.forEach(({ k, b }) => b.setAttribute('aria-pressed', String(k === sort)));
    sorts.hidden = tab !== 'everyone' || !canLike;
    grid.replaceChildren();
    setStatus('Loading…');
    let rows: Array<TopScoreEntry | FriendScore> = [];
    try {
      if (tab === 'friends') {
        if (!me) { setStatus('Sign in to see your friends’ pages.'); return; }
        rows = (await OR().scores.friends({ roundKey })).sort((a, b) => b.likes - a.likes || a.createdAt.localeCompare(b.createdAt));
      } else {
        rows = await OR().scores.top({ roundKey, limit: LIMIT, order: canLike ? sort : 'first' });
      }
      await likesReady;
    } catch {
      if (my === token) setStatus('The gallery didn’t load. Try again in a moment.');
      return;
    }
    if (my !== token) return;
    const self = rows.find((r) => r.uuid === me);
    if (self) showMyLikes(self.likes);
    const entries = rows
      .filter((r) => r.uuid !== me)
      .map((r) => ({ row: r, fills: decode(r.metadata, o.slug, page!.regions) }))
      .filter((e): e is Entry => e.fills !== null);
    setStatus(entries.length
      ? ''
      : tab === 'friends' ? 'None of the people you follow have posted today’s page yet.' : 'Nobody else has posted yet. Check back later.');
    renderEntries(entries, my);
  }

  function renderEntries(entries: Entry[], my: number) {
    // A few per frame so a long gallery doesn't stall the first paint.
    let i = 0;
    const batch = () => {
      if (my !== token) return;
      for (const end = Math.min(entries.length, i + 6); i < end; i++) {
        const e = entries[i]!;
        const card = entryCard(art, painter, e);
        if (canLike) card.querySelector('figcaption')!.append(heartButton(e.row));
        grid.append(card);
      }
      if (i < entries.length) requestAnimationFrame(batch);
    };
    batch();
  }

  function heartButton(row: TopScoreEntry): HTMLButtonElement {
    let count = row.likes;
    let on = liked.has(row.uuid);
    let busy = false;
    const b = button('heart', '', () => void toggle());
    const paint = () => {
      b.innerHTML = `${icon('heart', 16)}<span>${count || ''}</span>`;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `Like ${row.username}’s page${count ? `, ${count} ${count === 1 ? 'like' : 'likes'}` : ''}`);
    };
    async function toggle() {
      if (!me) {
        if (OR().capabilities.has('actions.requestSignIn')) void OR().actions.requestSignIn('Sign in to like pages in the gallery');
        else toast('Sign in to like pages.');
        return;
      }
      if (busy) return;
      busy = true;
      // Optimistic, then settle on the server's count.
      const want = !on;
      on = want;
      count = Math.max(0, count + (want ? 1 : -1));
      paint();
      if (want) haptic('light');
      try {
        const res = await OR().scores.like({ roundKey, uuid: row.uuid, liked: want });
        on = res.liked;
        count = res.likes;
      } catch {
        on = !want;
        count = Math.max(0, count + (want ? -1 : 1));
        toast('That like didn’t go through. Try again.');
      }
      if (on) liked.add(row.uuid); else liked.delete(row.uuid);
      busy = false;
      paint();
    }
    paint();
    return b;
  }

  void load();
  return () => { token++; };
}

function decode(meta: Record<string, unknown> | null, slug: string, regions: number): Array<Fill | null> | null {
  if (!meta || meta.slug !== slug) return null;
  const fills = unpackColoring(meta, regions);
  return fills && filledCount(fills) ? fills : null;
}

function entryCard(art: Art, painter: Painter, e: Entry): HTMLElement {
  const card = el('figure', 'entry');
  const pic = composite(art, e.fills, THUMB, painter);
  pic.setAttribute('role', 'img');
  pic.setAttribute('aria-label', `${e.row.username}’s version`);
  const cap = el('figcaption');
  if (e.row.avatar) {
    const a = el('img', 'avatar');
    a.src = e.row.avatar;
    a.alt = '';
    cap.append(a);
  } else {
    cap.append(el('span', 'avatar initial', e.row.username.slice(0, 1).toUpperCase()));
  }
  cap.append(el('span', 'entry-name', e.row.username));
  card.append(pic, cap);
  return card;
}
