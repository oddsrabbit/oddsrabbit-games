// The page list and the daily schedule. The build writes catalog.json from
// art/catalog.json and each page's page.json.

export interface PageEntry {
  slug: string;
  title: string;
  category: string;
  regions: number;
  /** The player who drew it, for pages that came from a submission. */
  credit?: string;
}

export interface Catalog {
  /** UTC date of day 0, `YYYY-MM-DD`. */
  epoch: string;
  categories: Array<{ id: string; name: string }>;
  /** Slugs in daily order; the schedule loops. */
  daily: string[];
  pages: PageEntry[];
}

const DAY_MS = 86_400_000;

export function epochMs(c: Pick<Catalog, 'epoch'>): number {
  return Date.parse(`${c.epoch}T00:00:00Z`);
}

/** Day number at `ms`; negative before the epoch. */
export function dayIndex(c: Pick<Catalog, 'epoch'>, ms: number): number {
  return Math.floor((ms - epochMs(c)) / DAY_MS);
}

export function dailySlug(c: Pick<Catalog, 'daily'>, day: number): string | null {
  const n = c.daily.length;
  return n ? (c.daily[((day % n) + n) % n] ?? null) : null;
}

export function msUntilNextDay(c: Pick<Catalog, 'epoch'>, ms: number): number {
  return epochMs(c) + (dayIndex(c, ms) + 1) * DAY_MS - ms;
}

/** A page's gallery: every player's posted version of it, as rows of one round. */
export function pageRoundKey(slug: string): string {
  return `page-${slug}`;
}

export function parseCatalog(data: unknown): Catalog | null {
  if (!data || typeof data !== 'object') return null;
  const c = data as Partial<Catalog>;
  if (typeof c.epoch !== 'string' || Number.isNaN(Date.parse(`${c.epoch}T00:00:00Z`))) return null;
  if (!Array.isArray(c.categories) || !Array.isArray(c.daily) || !Array.isArray(c.pages)) return null;
  const pages = c.pages.filter((p): p is PageEntry =>
    !!p && typeof p.slug === 'string' && typeof p.title === 'string' && typeof p.category === 'string' && typeof p.regions === 'number'
    && (p.credit === undefined || typeof p.credit === 'string'));
  const slugs = new Set(pages.map((p) => p.slug));
  return {
    epoch: c.epoch,
    categories: c.categories.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string'),
    daily: c.daily.filter((s): s is string => typeof s === 'string' && slugs.has(s)),
    pages,
  };
}
