// Wall-clock helpers in the player's time zone. The simulation runs on server
// time (epoch ms) but her day (bedtime, the gift rollover, days visited) is
// the player's local day, so every "what time is it for them" question goes
// through here with an explicit IANA zone. Pure; testable in any zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      f = formatter('UTC');
    }
    formatters.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function localParts(ms: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
  };
}

export function localHour(ms: number, tz: string): number {
  return localParts(ms, tz).hour;
}

/**
 * The player's day as `YYYY-MM-DD`, rolling over at `rolloverHour` rather than
 * midnight, so a late-night visit still counts as "today".
 */
export function dayKey(ms: number, tz: string, rolloverHour: number): string {
  // Wall-clock, not "subtract N hours": on the night clocks change, five real
  // hours before 04:30 is not the same local day as five wall-clock hours.
  const p = localParts(ms, tz);
  let date = Date.UTC(p.year, p.month - 1, p.day);
  if (p.hour < rolloverHour) date -= 86_400_000;
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * The first instant after `ms` when local time reaches `hour`:00. Walks forward
 * in 15-minute steps and then back to the exact minute, which stays correct
 * across DST changes without a timezone database of our own.
 */
export function nextLocalHour(ms: number, tz: string, hour: number): number {
  const step = 15 * 60_000;
  let t = ms + 60_000;
  for (let i = 0; i < 4 * 50; i++, t += step) {
    const p = localParts(t, tz);
    if (p.hour === hour) return t - p.minute * 60_000 - (t % 60_000);
  }
  return ms + 24 * 3_600_000;
}

/** The device's IANA zone, or UTC. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
