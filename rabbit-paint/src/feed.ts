// The Gallery tab: posts across all pages, from everyone or just the people
// the player follows, newest or most liked. Posts live in one round per page
// (gallery.ts), and there is no query across rounds, so this asks each page
// for its latest few and merges them: fine for a library of tens of pages.
// A card's picture opens that page's gallery; its heart likes it in place.

import type { TopScoreEntry } from '@oddsrabbit/apps-sdk';
import { composite, loadArt, Painter, type Art } from './art';
import { pageRoundKey, type Catalog, type PageEntry } from './catalog';
import { filledCount, unpackColoring, type Fill } from './fills';
import { withBadge } from './gallery';
import { canLike, heartButton, myLikes } from './likes';
import { button, el, icon, OR } from './ui';

export interface FeedOptions {
  catalog: Catalog;
  onGallery(slug: string): void;
}

type Tab = 'everyone' | 'friends';
type Sort = 'latest' | 'likes';
type Post = { row: TopScoreEntry; page: PageEntry; fills: Array<Fill | null> };
/** Posts asked of each page, and the most shown. */
const PER_PAGE = 20;
const SHOWN = 60;
const THUMB = 320;

/** Fills `main` with the feed. Returns a stop function. */
export function mountFeed(main: HTMLElement, o: FeedOptions): () => void {
  // Hosts from before likes list earliest first, with no hearts or sorting.
  const hearts = canLike();
  const hasFriends = OR().capabilities.has('scores.friends');
  const me = OR().user?.uuid;
  const tabs = el('div', 'seg');
  tabs.setAttribute('role', 'tablist');
  const sorts = el('div', 'sort-row');
  const status = el('p', 'muted center');
  const grid = el('div', 'gallery-grid');
  main.append(el('h1', 'tab-title', 'Everyone’s art'), ...(hasFriends ? [tabs] : []), sorts, status, grid);
  let tab: Tab = 'everyone';
  let sort: Sort = 'latest';
  let token = 0;
  const tabBtns = (['everyone', 'friends'] as Tab[]).map((t) => {
    const b = button('seg-btn', t === 'everyone' ? 'Everyone' : 'Friends', () => { tab = t; void load(); });
    b.setAttribute('role', 'tab');
    tabs.append(b);
    return { t, b };
  });
  const sortBtns = (['latest', 'likes'] as Sort[]).map((k) => {
    const b = button('chip', k === 'likes' ? 'Most liked' : 'Newest', () => { sort = k; void load(); });
    sorts.append(b);
    return { k, b };
  });
  sorts.hidden = !hearts;
  const setStatus = (text: string) => { status.textContent = text; status.hidden = !text; };
  const arts = new Map<string, Promise<{ art: Art; painter: Painter }>>();
  const artFor = (slug: string) => {
    let a = arts.get(slug);
    if (!a) { a = loadArt(slug, 'thumb').then((art) => ({ art, painter: new Painter(art) })); arts.set(slug, a); }
    return a;
  };
  // The player's likes, per page, asked once a post of that page is shown.
  const likes = new Map<string, Promise<Set<string>>>();
  const likesFor = (slug: string) => {
    let l = likes.get(slug);
    if (!l) { l = myLikes(pageRoundKey(slug)); likes.set(slug, l); }
    return l;
  };

  async function rowsFor(page: PageEntry, order: 'latest' | 'likes' | 'first'): Promise<TopScoreEntry[]> {
    const roundKey = pageRoundKey(page.slug);
    if (tab === 'everyone') return OR().scores.top({ roundKey, limit: PER_PAGE, order });
    return (await OR().scores.friends({ roundKey })).filter((r) => !r.isSelf && r.uuid !== me);
  }

  async function load() {
    const my = ++token;
    tabBtns.forEach(({ t, b }) => b.setAttribute('aria-selected', String(t === tab)));
    sortBtns.forEach(({ k, b }) => b.setAttribute('aria-pressed', String(k === sort)));
    grid.replaceChildren();
    if (tab === 'friends' && !me) { setStatus('Sign in to see your friends’ art.'); return; }
    setStatus('Loading…');
    const order = hearts ? sort : 'first';
    const perPage = await Promise.all(o.catalog.pages.map(async (page) => {
      try {
        const rows = await rowsFor(page, order);
        return rows.map((row) => ({ row, page, fills: decode(row.metadata, page) }));
      } catch { return null; }
    }));
    if (my !== token) return;
    if (perPage.every((p) => p === null)) { setStatus('The gallery didn’t load. Try again in a moment.'); return; }
    const posts = perPage.flatMap((p) => p ?? []).filter((p): p is Post => p.fills !== null);
    posts.sort(sort === 'likes' && hearts
      ? (a, b) => b.row.likes - a.row.likes || b.row.createdAt.localeCompare(a.row.createdAt)
      : (a, b) => b.row.createdAt.localeCompare(a.row.createdAt));
    setStatus(posts.length ? ''
      : tab === 'friends' ? 'None of the people you follow have shared a page yet.'
      : 'Nobody has shared a page yet. Color one and be the first.');
    const shown = posts.slice(0, SHOWN);
    // A few per frame so a long feed doesn't stall the first paint.
    let i = 0;
    const batch = async () => {
      for (const end = Math.min(shown.length, i + 6); i < end; i++) {
        const post = shown[i]!;
        let card: HTMLElement;
        try {
          const [a, liked] = await Promise.all([artFor(post.page.slug), hearts ? likesFor(post.page.slug) : null]);
          card = postCard(a, post, liked, post.row.uuid === me, () => o.onGallery(post.page.slug));
        } catch { continue; }
        if (my !== token) return;
        grid.append(card);
      }
      if (i < shown.length) requestAnimationFrame(() => void batch());
    };
    void batch();
  }

  void load();
  return () => { token++; };
}

function decode(meta: Record<string, unknown> | null, page: PageEntry): Array<Fill | null> | null {
  if (!meta || meta.slug !== page.slug) return null;
  const fills = unpackColoring(meta, page.regions);
  return fills && filledCount(fills) ? fills : null;
}

/** `liked` is null on a host without likes; the player's own post shows its count, with no heart to tap. */
function postCard(a: { art: Art; painter: Painter }, post: Post, liked: Set<string> | null, own: boolean, onOpen: () => void): HTMLElement {
  const card = el('figure', 'entry');
  const open = el('button', 'entry-link');
  open.type = 'button';
  const going = filledCount(post.fills) < post.page.regions;
  open.setAttribute('aria-label', `${post.row.username}’s ${post.page.title}${going ? ', in progress' : ''}`);
  const pic = composite(a.art, post.fills, THUMB, a.painter);
  open.append(going ? withBadge(pic) : pic, el('span', 'entry-page', post.page.title));
  open.addEventListener('click', onOpen);
  const cap = el('figcaption');
  if (post.row.avatar) {
    const av = el('img', 'avatar');
    av.src = post.row.avatar;
    av.alt = '';
    cap.append(av);
  } else {
    cap.append(el('span', 'avatar initial', post.row.username.slice(0, 1).toUpperCase()));
  }
  cap.append(el('span', 'entry-name', post.row.username));
  if (liked && !own) cap.append(heartButton(pageRoundKey(post.page.slug), post.row, liked));
  else if (liked && post.row.likes) cap.insertAdjacentHTML('beforeend', `<span class="entry-likes">${icon('heart', 13)} ${post.row.likes}</span>`);
  card.append(open, cap);
  return card;
}
