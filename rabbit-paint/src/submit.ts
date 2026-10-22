// Sending a player's picture for review, to become a page everyone can color.
// Nothing goes public from here: the picture lands in a review queue, and an
// approved one goes through the same prep and curation as our own pages
// (README, "Pages"), credited to the player.
//
// The bridge verb is `content.submit` (docs/content-submit.md). Until a host
// lists it, canSubmit() is false and the option doesn't show.

import { getMine, putMine, type MinePage } from './mine';
import { button, dataUrl, el, haptic, OR, toast } from './ui';

export const canSubmit = (): boolean => OR().capabilities.has('content.submit');

export function openSubmit(host: HTMLElement, page: MinePage, onSent: (p: MinePage) => void): void {
  const wrap = el('div', 'sheet-wrap');
  const sheet = el('div', 'sheet submit');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Share with everyone');
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };

  if (page.submitted) {
    sheet.append(
      el('h2', '', 'Sent for review'),
      el('p', 'muted center', 'We look at every picture. If yours is picked, it shows up for everyone with your name on it.'),
      button('text-btn', 'Close', close),
    );
  } else {
    const title = el('input', 'text-input');
    title.type = 'text';
    title.maxLength = 40;
    title.value = page.title;
    title.setAttribute('aria-label', 'Title');
    const rights = el('input');
    rights.type = 'checkbox';
    const rightsLabel = el('label', 'check-row');
    rightsLabel.append(rights, el('span', '', 'I drew this, or I’m allowed to share it. It isn’t a photo of a person.'));
    const send = button('primary-btn', 'Send for review', () => void go());
    send.disabled = true;
    rights.addEventListener('change', () => { send.disabled = !rights.checked; });
    sheet.append(
      el('h2', '', 'Share with everyone'),
      el('p', 'muted center', 'We look at every picture before it goes in. If yours is picked, everyone can color it, with your name on it.'),
      el('div', 'label', 'Title'),
      title,
      rightsLabel,
      send,
      button('text-btn', 'Not now', close),
    );

    async function go() {
      if (!canSubmit()) { toast('Sharing pictures isn’t available here yet'); return; }
      if (!OR().user) {
        if (OR().capabilities.has('actions.requestSignIn')) void OR().actions.requestSignIn('Sign in to share your picture');
        else toast('Sign in to share your picture');
        return;
      }
      send.disabled = true;
      send.textContent = 'Sending…';
      try {
        const name = title.value.trim().replace(/\s+/g, ' ').slice(0, 40) || page.title;
        const res = await OR().content.submit({ kind: 'coloring-page', title: name, image: await dataUrl(page.files.source), rights: true });
        // Re-read: the page may have changed since the sheet opened.
        const fresh = (await getMine(page.id)) ?? page;
        fresh.submitted = { at: Date.now(), id: res.id };
        await putMine(fresh);
        haptic('success');
        toast('Sent. Thank you!');
        close();
        onSent(fresh);
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        send.disabled = false;
        send.textContent = 'Send for review';
        toast(code === 'content/too-many' ? 'You’ve sent a lot today. Try again tomorrow.' : 'Couldn’t send it. Try again in a moment.');
      }
    }
  }

  wrap.append(sheet);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  host.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
}
