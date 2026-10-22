// Adding a picture: the player chooses an image, it becomes a page on this
// device (the prep worker, src/worker/), they check how it split into areas,
// name it, and color it. Works best with line art: a drawing, a printed
// coloring page, or a photo of one.

import { loadImage } from './art';
import { MINE_MAX, mineSlug, newMineId, putMine, type MinePage } from './mine';
import { button, el, toast } from './ui';
import { MAX_SIDE, MIN_SIDE, type Detail, type PrepFailure, type PrepReply, type PrepRequest } from './worker/messages';

const PREP_TIMEOUT_MS = 45_000;
const BUSY_REGIONS = 160;
const PHOTO_INK_SHARE = 0.3;

/** Opens the system picker. Call from a tap: browsers block it otherwise. */
export function chooseImage(onFile: (file: File) => void): void {
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) onFile(f); });
  input.click();
}

export function canAddMore(count: number): boolean {
  if (count < MINE_MAX) return true;
  toast(`You have ${MINE_MAX} pictures. Delete one to add another.`, 3000);
  return false;
}

interface Decoded {
  w: number;
  h: number;
  grey: Uint8Array;
  source: Blob;
}

/** The picture flattened onto white, sized for prep, as greyscale and as a JPEG. */
async function decode(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (!long) throw new Error('empty image');
    const k = Math.min(MAX_SIDE, Math.max(MIN_SIDE, long)) / long;
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = el('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const grey = new Uint8Array(w * h);
    for (let i = 0; i < grey.length; i++) grey[i] = Math.round(0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!);
    const source = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9));
    return { w, h, grey, source };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prep(d: Decoded, detail: Detail): Promise<PrepReply> {
  // Beside main.js, with its cache-bust query.
  const worker = new Worker(new URL(`./prep-worker.js${new URL(import.meta.url).search}`, import.meta.url));
  return new Promise<PrepReply>((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('timeout')); }, PREP_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<PrepReply | PrepFailure>) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok) resolve(e.data); else reject(new Error(e.data.message));
    };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); reject(new Error(e.message || 'worker')); };
    const req: PrepRequest = { grey: d.grey, w: d.w, h: d.h, detail };
    worker.postMessage(req);
  });
}

function png(w: number, h: number, put: (data: Uint8ClampedArray) => void): Promise<Blob> {
  const c = el('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  put(img.data);
  ctx.putImageData(img, 0, 0);
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'));
}

/** Region ids as tools/prep-page.ts writes them: id + 1 in R + G·256, opaque. */
function idsPng(w: number, h: number, ids: Uint16Array): Promise<Blob> {
  return png(w, h, (d) => {
    for (let p = 0; p < ids.length; p++) {
      d[p * 4] = ids[p]! & 255;
      d[p * 4 + 1] = ids[p]! >> 8;
      d[p * 4 + 3] = 255;
    }
  });
}

/** Black ink on transparent. */
function inkPng(w: number, h: number, alpha: Uint8Array, scale: number): Promise<Blob> {
  return png(w, h, (d) => { for (let p = 0; p < alpha.length; p++) d[p * 4 + 3] = alpha[p]! * scale; });
}

/** Each area a distinct pastel under the ink: how the picture split up. */
function previewCanvas(r: PrepReply): HTMLCanvasElement {
  const tints = r.regions.map((g) => {
    // HSL(h, 55%, 78%), as preview.png has them.
    const h = (g.id * 137.508) % 360;
    const a = 0.55 * 0.22;
    const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.78 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)] as const;
  });
  const c = el('canvas', 'upload-preview');
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(r.w, r.h);
  for (let p = 0; p < r.ids.length; p++) {
    const t = r.ink[p] ? [42, 34, 48] as const : (tints[r.ids[p]! - 1] ?? [255, 255, 255] as const);
    img.data.set([t[0], t[1], t[2], 255], p * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function titleFrom(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  // Camera names (IMG 1234, PXL 2026…, 1699999999) say nothing.
  if (!base || /^(img|pxl|dsc|photo|image|screenshot)?[\s\d]*$/i.test(base) || /^(img|pxl|dsc)\s?\d/i.test(base)) return 'My picture';
  return base.slice(0, 40);
}

export interface UploadOptions {
  /** Saved: open it for painting. */
  onColor(page: MinePage): void;
}

/** The sheet after a picture is chosen: prep, check, name, then color. */
export function openUpload(host: HTMLElement, file: File, o: UploadOptions): void {
  const wrap = el('div', 'sheet-wrap');
  const sheet = el('div', 'sheet upload');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Add a picture');
  const heading = el('h2', '', 'Making your page…');
  const stage = el('div', 'upload-stage');
  const spinner = el('div', 'spinner');
  stage.append(spinner);
  const note = el('p', 'muted center', 'Finding the areas to color');
  note.setAttribute('role', 'status');
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Areas');
  seg.hidden = true;
  const title = el('input', 'text-input');
  title.type = 'text';
  title.maxLength = 40;
  title.value = titleFrom(file.name);
  title.setAttribute('aria-label', 'Title');
  title.hidden = true;
  const colorBtn = button('primary-btn', 'Color it', () => void save());
  colorBtn.hidden = true;
  const another = button('secondary-btn', 'Choose another picture', () => chooseImage((f) => { close(); openUpload(host, f, o); }));
  another.hidden = true;
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  sheet.append(heading, stage, note, seg, title, colorBtn, another, button('text-btn', 'Cancel', close));
  wrap.append(sheet);
  host.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let decoded: Decoded | null = null;
  let result: PrepReply | null = null;
  let detail: Detail = 1;
  let token = 0;
  const segBtns = (['Simple', 'Normal', 'Detailed'] as const).map((label, i) => {
    const b = button('seg-btn', label, () => { if (detail !== i) { detail = i as Detail; void run(); } });
    b.setAttribute('role', 'radio');
    seg.append(b);
    return b;
  });

  async function run() {
    const my = ++token;
    segBtns.forEach((b, i) => b.setAttribute('aria-checked', String(i === detail)));
    segBtns.forEach((b) => { b.disabled = true; });
    colorBtn.disabled = true;
    stage.replaceChildren(spinner);
    note.textContent = 'Finding the areas to color';
    try {
      decoded ??= await decode(file);
      const r = await prep(decoded, detail);
      if (my !== token) return;
      result = r;
      show(r);
    } catch (e) {
      if (my !== token) return;
      heading.textContent = 'That didn’t work';
      stage.replaceChildren();
      note.textContent = decoded
        ? ((e as Error).message === 'timeout' ? 'That picture is too busy to turn into a page. Try a simpler drawing.' : 'Something went wrong making the page. Try another picture.')
        : 'We couldn’t open that file. Try a PNG or JPEG.';
      seg.hidden = !decoded;
      another.hidden = false;
    } finally {
      if (my === token) segBtns.forEach((b) => { b.disabled = false; });
    }
  }

  function show(r: PrepReply) {
    const n = r.regions.length;
    heading.textContent = 'Your page';
    stage.replaceChildren(previewCanvas(r));
    seg.hidden = false;
    title.hidden = false;
    colorBtn.hidden = false;
    another.hidden = false;
    colorBtn.disabled = n < 2;
    if (n < 2) note.textContent = 'We couldn’t find any outlines. Pictures with dark lines on a light background work best.';
    else if (r.inkShare > PHOTO_INK_SHARE) note.textContent = `${n} areas. This looks like a photo; drawings with dark outlines work best.`;
    else if (n > BUSY_REGIONS) note.textContent = `${n} areas: that’s a lot of small ones. Try Simple for bigger areas.`;
    else note.textContent = `${n} areas, each its own colour above. Try Simple or Detailed if they look wrong.`;
  }

  async function save() {
    if (!result || !decoded) return;
    const r = result;
    colorBtn.disabled = true;
    colorBtn.textContent = 'Saving…';
    try {
      const id = newMineId();
      const name = title.value.trim().replace(/\s+/g, ' ').slice(0, 40) || 'My picture';
      const [regions, lineart, thumbRegions, thumbLineart] = await Promise.all([
        idsPng(r.w, r.h, r.ids),
        inkPng(r.w, r.h, r.ink, 255),
        idsPng(r.thumbW, r.thumbH, r.thumbIds),
        inkPng(r.thumbW, r.thumbH, r.thumbInk, 1),
      ]);
      const page: MinePage = {
        id,
        title: name,
        createdAt: Date.now(),
        info: { slug: mineSlug(id), title: name, category: 'mine', width: r.w, height: r.h, regions: r.regions },
        files: { regions, lineart, thumbRegions, thumbLineart, source: decoded.source },
      };
      await putMine(page);
      close();
      o.onColor(page);
    } catch {
      colorBtn.disabled = false;
      colorBtn.textContent = 'Color it';
      toast('Couldn’t save the page on this device. Is storage full?', 3000);
    }
  }

  void run();
}
