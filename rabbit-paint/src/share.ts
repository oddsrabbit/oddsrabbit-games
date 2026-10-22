// Share and save a picture: Clean, Framed (white border and title), or
// Before / after. The platform's share verb only carries text, so the image
// goes through the Web Share API where the browser allows files, and is
// downloaded otherwise.

import { composite, type Art } from './art';
import type { Fill } from './fills';
import { button, el, icon, OR, toast } from './ui';

type Style = 'clean' | 'framed' | 'before-after';
const STYLES: Array<[Style, string]> = [['clean', 'Clean'], ['framed', 'Framed'], ['before-after', 'Before / after']];
const SIZE = 1080;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';

export function openShare(host: HTMLElement, art: Art, fills: ReadonlyArray<Fill | null>): void {
  let style: Style = 'framed';
  const wrap = el('div', 'sheet-wrap');
  const sheet = el('div', 'sheet share');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Share your page');
  const preview = el('div', 'share-preview');
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Picture style');
  const segBtns = STYLES.map(([id, label]) => {
    const b = button('seg-btn', label, () => { style = id; render(); });
    b.setAttribute('role', 'radio');
    seg.append(b);
    return { id, b };
  });
  const actions = el('div', 'share-actions');
  actions.append(
    button('big-action accent', `${icon('share', 22)}<span>Share</span>`, () => void share()),
    button('big-action', `${icon('save', 22)}<span>Save</span>`, () => void save()),
  );
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  sheet.append(el('h2', '', 'Share your page'), preview, seg, actions, button('text-btn', 'Close', close));
  wrap.append(sheet);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  host.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let canvas: HTMLCanvasElement = el('canvas');
  render();

  function render() {
    segBtns.forEach(({ id, b }) => b.setAttribute('aria-checked', String(id === style)));
    canvas = draw(art, fills, style);
    canvas.className = 'share-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Preview');
    preview.replaceChildren(canvas);
  }

  function blob(): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
  }
  const fileName = () => `${art.info.slug}-rabbit-paint.png`;

  async function share() {
    const title = `${art.info.title} · Rabbit Paint`;
    try {
      const file = new File([await blob()], fileName(), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
    if (OR().capabilities.has('actions.share')) {
      await OR().actions.share({ title, text: `I colored “${art.info.title}” in Rabbit Paint on OddsRabbit.` }).catch(() => {});
      return;
    }
    await save();
  }

  async function save() {
    try {
      const url = URL.createObjectURL(await blob());
      const a = el('a');
      a.href = url;
      a.download = fileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('Saved');
    } catch {
      toast('Couldn’t save the picture');
    }
  }
}

function draw(art: Art, fills: ReadonlyArray<Fill | null>, style: Style): HTMLCanvasElement {
  if (style === 'clean') return composite(art, fills, SIZE);
  const out = el('canvas');
  const ctx = out.getContext('2d')!;
  if (style === 'framed') {
    const pad = 64;
    const pic = composite(art, fills, SIZE - pad * 2);
    out.width = SIZE;
    out.height = pad + pic.height + 150;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(pic, pad, pad);
    ctx.fillStyle = '#2a2230';
    ctx.font = `600 46px ${FONT}`;
    ctx.textBaseline = 'middle';
    const y = pad + pic.height + 75;
    ctx.fillText(art.info.title, pad, y);
    ctx.fillStyle = '#6b6270';
    ctx.font = `500 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('Rabbit Paint', SIZE - pad, y);
    return out;
  }
  const half = (SIZE - 48) / 2;
  const before = composite(art, fills.map(() => null), half);
  const after = composite(art, fills, half);
  out.width = SIZE;
  out.height = Math.round(16 + before.height + 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(before, 16, 16);
  ctx.drawImage(after, 32 + half, 16);
  return out;
}
