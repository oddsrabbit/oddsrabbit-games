// Loads a page's assets and paints fills into a canvas.
//
// regions.png holds each pixel's region id (+1) in R + G·256. Every pixel,
// line pixels included, belongs to a region, so a fill runs under the lines
// and the line art drawn on top hides the edge: no white halos.

import { parseFill, type Fill } from './fills';
import { getMine, isMineSlug, mineId, type MinePage } from './mine';

export interface RegionInfo {
  id: number;
  area: number;
  /** Deepest interior point, source pixels. */
  label: [number, number];
  /** x0, y0, x1, y1 inclusive, source pixels. */
  bbox: [number, number, number, number];
}

export interface PageInfo {
  slug: string;
  title: string;
  category: string;
  width: number;
  height: number;
  regions: RegionInfo[];
}

export interface Art {
  info: PageInfo;
  /** Canvas size: the source size, or 360 on the long side for thumbnails. */
  w: number;
  h: number;
  /** w / info.width */
  scale: number;
  /** Region id + 1 per pixel; 0 = none. */
  ids: Uint16Array;
  lineart: HTMLImageElement;
}

const infoCache = new Map<string, Promise<PageInfo>>();
const artCache = new Map<string, Promise<Art>>();
/** Object URLs for the player's own pages, by slug: revoked by forgetArt. */
const blobUrls = new Map<string, string[]>();

export function pageUrl(slug: string, file: string): string {
  return `./pages/${encodeURIComponent(slug)}/${file}`;
}

async function minePage(slug: string): Promise<MinePage> {
  const page = await getMine(mineId(slug));
  if (!page) throw new Error(`page ${slug}: not on this device`);
  return page;
}

/** Where a page's regions and line art images are: the server, or this device. */
async function imageUrls(slug: string, size: 'full' | 'thumb'): Promise<[string, string]> {
  const prefix = size === 'thumb' ? 'thumb-' : '';
  if (!isMineSlug(slug)) return [pageUrl(slug, `${prefix}regions.png`), pageUrl(slug, `${prefix}lineart.png`)];
  const { files } = await minePage(slug);
  const urls = (size === 'thumb' ? [files.thumbRegions, files.thumbLineart] : [files.regions, files.lineart]).map((b) => URL.createObjectURL(b));
  blobUrls.set(slug, [...(blobUrls.get(slug) ?? []), ...urls]);
  return urls as [string, string];
}

/** Drops a page from the caches, after the player deletes their picture. */
export function forgetArt(slug: string): void {
  infoCache.delete(slug);
  artCache.delete(`${slug}:full`);
  artCache.delete(`${slug}:thumb`);
  for (const u of blobUrls.get(slug) ?? []) URL.revokeObjectURL(u);
  blobUrls.delete(slug);
}

export function loadInfo(slug: string): Promise<PageInfo> {
  let p = infoCache.get(slug);
  if (!p) {
    p = isMineSlug(slug) ? minePage(slug).then((m) => m.info) : fetch(pageUrl(slug, 'page.json')).then((r) => {
      if (!r.ok) throw new Error(`page ${slug}: ${r.status}`);
      return r.json() as Promise<PageInfo>;
    });
    infoCache.set(slug, p);
    p.catch(() => infoCache.delete(slug));
  }
  return p;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${src}`));
    img.src = src;
  });
}

export function loadArt(slug: string, size: 'full' | 'thumb'): Promise<Art> {
  const key = `${slug}:${size}`;
  let p = artCache.get(key);
  if (!p) {
    p = (async () => {
      const [regionsUrl, lineartUrl] = await imageUrls(slug, size);
      const [info, regions, lineart] = await Promise.all([loadInfo(slug), loadImage(regionsUrl), loadImage(lineartUrl)]);
      const w = regions.naturalWidth;
      const h = regions.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(regions, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      const ids = new Uint16Array(w * h);
      for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4]! + px[i * 4 + 1]! * 256;
      return { info, w, h, scale: w / info.width, ids, lineart };
    })();
    artCache.set(key, p);
    p.catch(() => artCache.delete(key));
  }
  return p;
}

export function regionAt(art: Art, x: number, y: number): number | null {
  const px = Math.floor(x * art.scale);
  const py = Math.floor(y * art.scale);
  if (px < 0 || py < 0 || px >= art.w || py >= art.h) return null;
  const id = art.ids[py * art.w + px]! - 1;
  return id >= 0 && id < art.info.regions.length ? id : null;
}

/** Pattern repeat in source pixels; scaled down with thumbnails. */
const TILE = 56;

export class Painter {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly masks = new Map<number, { c: HTMLCanvasElement; x: number; y: number }>();
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly tmp = document.createElement('canvas');

  constructor(private readonly art: Art, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = art.w;
    this.canvas.height = art.h;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Paint every region: white where there's no fill. */
  paintAll(fills: ReadonlyArray<Fill | null>): void {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.art.w, this.art.h);
    fills.forEach((f, id) => { if (f) this.paint(id, f); });
  }

  paint(id: number, fill: Fill | null): void {
    const m = this.mask(id);
    if (!m) return;
    const ctx = this.ctx;
    const w = m.c.width;
    const h = m.c.height;
    this.tmp.width = w;
    this.tmp.height = h;
    const t = this.tmp.getContext('2d')!;
    t.drawImage(m.c, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = fill ? this.style(fill, t, w, h) : '#ffffff';
    t.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(m.c, m.x, m.y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.tmp, m.x, m.y);
  }

  private mask(id: number) {
    let m = this.masks.get(id);
    if (m) return m;
    const r = this.art.info.regions[id];
    if (!r) return null;
    const s = this.art.scale;
    const { w: W, h: H, ids } = this.art;
    const x0 = Math.max(0, Math.floor(r.bbox[0] * s) - 2);
    const y0 = Math.max(0, Math.floor(r.bbox[1] * s) - 2);
    const x1 = Math.min(W - 1, Math.ceil(r.bbox[2] * s) + 2);
    const y1 = Math.min(H - 1, Math.ceil(r.bbox[3] * s) + 2);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d')!;
    const img = cctx.createImageData(w, h);
    const want = id + 1;
    for (let y = 0; y < h; y++) {
      const row = (y0 + y) * W + x0;
      for (let x = 0; x < w; x++) {
        if (ids[row + x] === want) {
          const o = (y * w + x) * 4;
          img.data[o + 3] = 255;
        }
      }
    }
    cctx.putImageData(img, 0, 0);
    m = { c, x: x0, y: y0 };
    this.masks.set(id, m);
    return m;
  }

  private style(fill: Fill, ctx: CanvasRenderingContext2D, w: number, h: number): string | CanvasGradient | CanvasPattern {
    const p = parseFill(fill);
    if (!p) return '#ffffff';
    if (p.kind === 'solid') return p.a;
    if (p.kind === 'gradient') {
      const g = p.style === 3
        ? ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.55)
        : ctx.createLinearGradient(0, 0, p.style === 0 ? 0 : w, p.style === 1 ? 0 : h);
      g.addColorStop(0, p.a);
      g.addColorStop(1, p.b);
      return g;
    }
    return ctx.createPattern(this.tile(fill), 'repeat') ?? p.b;
  }

  private tile(fill: Fill): HTMLCanvasElement {
    const T = Math.max(6, Math.round(TILE * this.art.scale));
    const key = `${fill}:${T}`;
    let c = this.tiles.get(key);
    if (c) return c;
    const p = parseFill(fill)!;
    c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const t = c.getContext('2d')!;
    t.fillStyle = p.b;
    t.fillRect(0, 0, T, T);
    t.fillStyle = p.a;
    t.strokeStyle = p.a;
    const dot = (x: number, y: number, r: number) => { t.beginPath(); t.arc(x * T, y * T, r * T, 0, Math.PI * 2); t.fill(); };
    switch (p.style) {
      case 0: // dots
        dot(0.5, 0.5, 0.2);
        break;
      case 1: // stripes
        t.lineWidth = T * 0.28;
        t.beginPath();
        for (const k of [-1, 0, 1, 2]) { t.moveTo(k * T, T); t.lineTo((k + 1) * T, 0); }
        t.stroke();
        break;
      case 2: // checks
        t.fillRect(0, 0, T / 2, T / 2);
        t.fillRect(T / 2, T / 2, T / 2, T / 2);
        break;
      case 3: { // grid
        const lw = Math.max(1, Math.round(T * 0.1));
        t.fillRect(0, 0, T, lw);
        t.fillRect(0, 0, lw, T);
        break;
      }
      default: // confetti
        dot(0.25, 0.3, 0.08);
        dot(0.72, 0.62, 0.07);
        dot(0.8, 0.12, 0.05);
        dot(0.35, 0.82, 0.05);
    }
    this.tiles.set(key, c);
    return c;
  }
}

/**
 * A picture, fills under line art, `size` px on its long side. Pass a painter
 * to reuse its masks when drawing many (the gallery).
 */
export function composite(art: Art, fills: ReadonlyArray<Fill | null>, size: number, painter = new Painter(art)): HTMLCanvasElement {
  painter.paintAll(fills);
  const k = size / Math.max(art.w, art.h);
  const out = document.createElement('canvas');
  out.width = Math.round(art.w * k);
  out.height = Math.round(art.h * k);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(painter.canvas, 0, 0, out.width, out.height);
  ctx.drawImage(art.lineart, 0, 0, out.width, out.height);
  return out;
}
