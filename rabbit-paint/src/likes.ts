// The heart on a gallery post: `scores.like` on that row, optimistic, then
// settled on the server's count. Shown only on a host that lists `scores.like`.

import { button, haptic, icon, OR, toast } from './ui';

export const canLike = (): boolean => OR().capabilities.has('scores.like');

/** The posts the player has liked in a page's gallery, by uuid; empty signed out. */
export async function myLikes(roundKey: string): Promise<Set<string>> {
  if (!OR().user || !canLike()) return new Set();
  try { return new Set(await OR().scores.myLikes({ roundKey })); } catch { return new Set(); }
}

/** `liked` is the page's set from myLikes, kept up to date as the player taps. */
export function heartButton(roundKey: string, row: { uuid: string; username: string; likes: number }, liked: Set<string>): HTMLButtonElement {
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
    if (!OR().user) {
      if (OR().capabilities.has('actions.requestSignIn')) void OR().actions.requestSignIn('Sign in to like pages in the gallery');
      else toast('Sign in to like pages.');
      return;
    }
    if (busy) return;
    busy = true;
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
