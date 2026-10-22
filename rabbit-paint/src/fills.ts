// What goes in one region, as a short string, and how a whole page of them is
// packed for storage and for the gallery (score metadata, capped at 2 KB).
//
//   #rrggbb          solid
//   g<d>rrggbbrrggbb gradient, d = GRADIENTS index, from colour then to colour
//   p<k>rrggbbrrggbb pattern,  k = PATTERNS index, pattern colour then background

export type Fill = string;

export const GRADIENTS = ['Top to bottom', 'Left to right', 'Diagonal', 'Glow'] as const;
export const PATTERNS = ['Dots', 'Stripes', 'Checks', 'Grid', 'Confetti'] as const;

export type FillKind = 'solid' | 'gradient' | 'pattern';

export interface ParsedFill {
  kind: FillKind;
  /** GRADIENTS or PATTERNS index; 0 for solid. */
  style: number;
  /** `#rrggbb`: the solid colour, gradient start, or pattern colour. */
  a: string;
  /** `#rrggbb`: gradient end or pattern background; equals `a` for solid. */
  b: string;
}

const HEX = /^[0-9a-f]{6}$/;

export function normHex(hex: string): string | null {
  const h = hex.trim().toLowerCase().replace(/^#/, '');
  return HEX.test(h) ? `#${h}` : null;
}

export function solid(hex: string): Fill {
  return normHex(hex) ?? '#ffffff';
}

export function gradient(style: number, a: string, b: string): Fill {
  return `g${style}${solid(a).slice(1)}${solid(b).slice(1)}`;
}

export function pattern(style: number, a: string, b: string): Fill {
  return `p${style}${solid(a).slice(1)}${solid(b).slice(1)}`;
}

export function makeFill(p: ParsedFill): Fill {
  if (p.kind === 'solid') return solid(p.a);
  return p.kind === 'gradient' ? gradient(p.style, p.a, p.b) : pattern(p.style, p.a, p.b);
}

export function parseFill(s: unknown): ParsedFill | null {
  if (typeof s !== 'string') return null;
  if (s.length === 7 && s[0] === '#' && HEX.test(s.slice(1))) return { kind: 'solid', style: 0, a: s, b: s };
  if (s.length !== 14) return null;
  const kind = s[0] === 'g' ? 'gradient' : s[0] === 'p' ? 'pattern' : null;
  const style = Number(s[1]);
  const a = s.slice(2, 8);
  const b = s.slice(8);
  if (!kind || !HEX.test(a) || !HEX.test(b)) return null;
  if (!Number.isInteger(style) || style < 0 || style >= (kind === 'gradient' ? GRADIENTS.length : PATTERNS.length)) return null;
  return { kind, style, a: `#${a}`, b: `#${b}` };
}

export function fillName(f: Fill): string {
  const p = parseFill(f);
  if (!p) return '';
  if (p.kind === 'solid') return p.a.toUpperCase();
  return p.kind === 'gradient' ? `${GRADIENTS[p.style]} gradient` : `${PATTERNS[p.style]}`;
}

/**
 * A CSS background that looks like the canvas fill, for swatches. `px` is the
 * pattern repeat in CSS pixels.
 */
export function cssFor(f: Fill, px = 12): string {
  const p = parseFill(f);
  if (!p) return '#ffffff';
  const { a, b } = p;
  if (p.kind === 'solid') return a;
  if (p.kind === 'gradient') {
    return [`linear-gradient(180deg, ${a}, ${b})`, `linear-gradient(90deg, ${a}, ${b})`, `linear-gradient(135deg, ${a}, ${b})`, `radial-gradient(circle, ${a}, ${b})`][p.style] ?? a;
  }
  const s = `${px}px ${px}px`;
  return [
    `radial-gradient(${a} 28%, transparent 31%) 0 0 / ${s}, ${b}`,
    `repeating-linear-gradient(45deg, ${a} 0 ${px * 0.4}px, ${b} ${px * 0.4}px ${px * 0.9}px)`,
    `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / ${s}`,
    `linear-gradient(${a} 2px, transparent 2px) 0 0 / ${s}, linear-gradient(90deg, ${a} 2px, transparent 2px) 0 0 / ${s}, ${b}`,
    `radial-gradient(circle at 30% 30%, ${a} ${px * 0.18}px, transparent ${px * 0.2}px) 0 0 / ${s}, radial-gradient(circle at 70% 70%, ${a} ${px * 0.14}px, transparent ${px * 0.16}px) 0 0 / ${px * 0.8}px ${px * 0.8}px, ${b}`,
  ][p.style] ?? b;
}

// --- packing a page -----------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const EMPTY = '.';

/** A page's fills: distinct fills once, then one character per region. */
export interface PackedColoring {
  f: Fill[];
  r: string;
}

export function packColoring(fills: ReadonlyArray<Fill | null>): PackedColoring {
  const f: Fill[] = [];
  let r = '';
  for (const fill of fills) {
    if (!fill || !parseFill(fill)) { r += EMPTY; continue; }
    let i = f.indexOf(fill);
    if (i < 0) {
      // More than 64 distinct fills on one page: the extras fall back to the
      // first one rather than failing the save. A page has ~10–150 regions.
      if (f.length >= B64.length) i = 0;
      else { f.push(fill); i = f.length - 1; }
    }
    r += B64[i];
  }
  return { f, r };
}

/** Null when the data doesn't fit a page of `regionCount` regions. */
export function unpackColoring(data: unknown, regionCount: number): Array<Fill | null> | null {
  if (!data || typeof data !== 'object') return null;
  const { f, r } = data as Partial<PackedColoring>;
  if (!Array.isArray(f) || typeof r !== 'string' || r.length !== regionCount || f.length > B64.length) return null;
  if (!f.every((x) => parseFill(x))) return null;
  const out: Array<Fill | null> = [];
  for (const ch of r) {
    if (ch === EMPTY) { out.push(null); continue; }
    const fill = f[B64.indexOf(ch)];
    if (fill === undefined) return null;
    out.push(fill);
  }
  return out;
}

export function filledCount(fills: ReadonlyArray<Fill | null>): number {
  return fills.reduce((n, f) => n + (f ? 1 : 0), 0);
}

// --- colour helpers for the picker ----------------------------------------------

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToHsv(hex: string): [number, number, number] {
  const n = normHex(hex) ?? '#ffffff';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
