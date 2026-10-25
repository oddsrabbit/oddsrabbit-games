// A page's gallery: everyone's version of it, open whether or not you've
// finished yours. Each post is a score row on `page-<slug>` whose metadata is
// the packed fills, so a thumbnail is drawn here from the page's own region
// map; no images are stored. A post goes in once most of the page is colored
// and keeps up after (autopost.ts), so some are still in progress. Hearts are
// `scores.like` on those rows (likes.ts); Everyone sorts by them (or newest first).

import type { FriendScore, TopScoreEntry } from '@oddsrabbit/apps-sdk';
import { composite, loadArt, Painter, type Art } from './art';
import { canAutoPost, postThreshold } from './autopost';
import { pageRoundKey, type Catalog } from './catalog';
import { filledCount, unpackColoring, type Fill } from './fills';
import { canLike as hostLikes, heartButton, myLikes } from './likes';
import { loadProgress, type Session } from './store';
import { button, el, icon, OR } from './ui';

export interface GalleryOptions {
  catalog: Catalog;
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
  titles.append(el('h1', '', 'Everyone’s versions'), el('div', 'muted', page?.title ?? ''));
  header.append(titles, el('div', 'grow'), button('round-btn', icon('close', 16), o.onClose, 'Close'));
  const body = el('main', 'gallery-body');
  screen.append(header, body);
  root.replaceChildren(screen);
  if (!page) { body.append(el('p', 'muted', 'This page isn’t available.')); return () => {}; }

  const session: Session = { key: `page-${o.slug}`, slug: o.slug, day: null };
  const [art, mine] = await Promise.all([loadArt(o.slug, 'thumb'), loadProgress(session, page.regions)]);
  const filled = filledCount(mine.fills);
  const finished = filled === page.regions;
  const toGo = postThreshold(page.regions) - filled;

  const painter = new Painter(art);
  const yours = el('div', 'yours');
  const yourPic = composite(art, mine.fills, 160, painter);
  yourPic.setAttribute('aria-label', 'Your version');
  const yoursText = el('div', 'grow');
  const yoursSub = el('div', 'muted', mine.posted ? (finished ? 'In the gallery' : `In the gallery · ${filled} of ${page.regions} areas`)
    : finished ? 'Finished · not posted yet'
    : !filled ? 'Not started yet'
    : !canAutoPost() ? `${filled} of ${page.regions} areas · finish it to post it`
    : `${filled} of ${page.regions} areas · ${toGo} more to show it here`);
  yoursText.append(el('strong', '', 'Yours'), yoursSub);
  const showMyLikes = (n: number) => {
    if (mine.posted && canLike) yoursSub.innerHTML = `${icon('heart', 13)} ${n} ${n === 1 ? 'like' : 'likes'}`;
  };
  yours.append(
    yourPic,
    yoursText,
    mine.posted
      ? button('pill accent', `${icon('share', 16)} Share`, () => o.onShare(o.slug, mine.fills))
      : button('pill accent', finished ? 'Post it' : filled ? 'Keep going' : 'Color it', () => o.onOpen(session)),
  );

  const tabs = el('div', 'seg');
  tabs.setAttribute('role', 'tablist');
  const sorts = el('div', 'sort-row');
  const grid = el('div', 'gallery-grid');
  const status = el('p', 'muted center');
  body.append(tabs, yours, sorts, status, grid);

  // Hosts from before likes get the plain gallery: earliest first, no hearts.
  const canLike = hostLikes();
  const roundKey = pageRoundKey(o.slug);
  const me = OR().user?.uuid;
  const likesReady = myLikes(roundKey);

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
    } catch {
      if (my === token) setStatus('The gallery didn’t load. Try again in a moment.');
      return;
    }
    const liked = await likesReady;
    if (my !== token) return;
    const self = rows.find((r) => r.uuid === me);
    if (self) showMyLikes(self.likes);
    const entries = rows
      .filter((r) => r.uuid !== me)
      .map((r) => ({ row: r, fills: decode(r.metadata, o.slug, page!.regions) }))
      .filter((e): e is Entry => e.fills !== null);
    setStatus(entries.length
      ? ''
      : tab === 'friends' ? 'None of the people you follow have colored this page yet.' : 'Nobody else has colored this page yet. Color yours and be the first.');
    renderEntries(entries, liked, my);
  }

  function renderEntries(entries: Entry[], liked: Set<string>, my: number) {
    // A few per frame so a long gallery doesn't stall the first paint.
    let i = 0;
    const batch = () => {
      if (my !== token) return;
      for (const end = Math.min(entries.length, i + 6); i < end; i++) {
        const e = entries[i]!;
        const card = entryCard(art, painter, e, page!.regions);
        if (canLike) card.querySelector('figcaption')!.append(heartButton(roundKey, e.row, liked));
        grid.append(card);
      }
      if (i < entries.length) requestAnimationFrame(batch);
    };
    batch();
  }

  void load();
  return () => { token++; };
}

function decode(meta: Record<string, unknown> | null, slug: string, regions: number): Array<Fill | null> | null {
  if (!meta || meta.slug !== slug) return null;
  const fills = unpackColoring(meta, regions);
  return fills && filledCount(fills) ? fills : null;
}

function entryCard(art: Art, painter: Painter, e: Entry, regions: number): HTMLElement {
  const card = el('figure', 'entry');
  const pic = composite(art, e.fills, THUMB, painter);
  pic.setAttribute('role', 'img');
  const going = filledCount(e.fills) < regions;
  pic.setAttribute('aria-label', `${e.row.username}’s version${going ? ', in progress' : ''}`);
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
  card.append(going ? withBadge(pic) : pic, cap);
  return card;
}

/** A post still being colored: the picture with a corner label. */
export function withBadge(pic: HTMLElement): HTMLElement {
  const box = el('div', 'entry-pic');
  box.append(pic, el('span', 'entry-badge', 'In progress'));
  return box;
}
