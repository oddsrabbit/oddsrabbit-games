// Generates the daily boards file the backend serves from.
//
//   npm run gen-boards                      # 400 days from puzzle-0 → data/word-rush-boards.json
//   npm run gen-boards -- --days 30 --stats # spread of word counts per shape
//   npm run gen-boards -- --preview 3       # print a few boards, don't write
//
// Output is `{ epoch, salt, boards: [day for puzzle-0, puzzle-1, …] }`, each
// day `{ v: 2, sprint, casual }` (see DayContent in src/puzzle.ts).
// Copy it to the backend's tools/data/word-rush-boards.json and deploy; the
// provisioning cron (WordGridProvider) seeds each day from it ahead of time.
//
// Regenerating is safe: boards are seeded from their index, so unchanged inputs
// rebuild the same boards, and a day already seeded on the server is never
// rewritten from the file anyway (ContentProvisioner only fills missing days).

import { readFileSync, writeFileSync } from 'node:fs';
import { BANDS, dictionaries, generateDay, SPRINT_BANDS } from '../src/generate';
import { EPOCH, SHAPES, type DayContent, type ShapeId } from '../src/puzzle';

const SALT = 'v1';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const from = Number(arg('from', '0'));
const days = Number(arg('days', '400'));
const out = arg('out', 'data/word-rush-boards.json');
const preview = Number(arg('preview', '0'));
// 12dicts frequency tiers run 1 (commonest) to 21. Tiers up to 16 hold about
// 20k word forms in ENABLE: everyday words plus their plurals and tenses. 17
// and up start letting in DEMUR, RIME and UREA as required words.
const maxTier = Number(arg('tier', '16'));

const lines = (path: string): string[] =>
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

// Letters only; Q only as "QU", since that's the only way a Q can be traced.
const playable = (w: string): boolean => /^[a-z]+$/.test(w) && !/q(?!u)/.test(w);

const all = lines('data/enable1.txt').filter(playable);

/** 12dicts 2+2+3frq: `----- N -----` tier headers, a lemma per line, its inflections indented under it. */
function commonWords(path: string): string[] {
  const words: string[] = [];
  let tier = 0;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const header = /^----- (\d+) -----/.exec(raw);
    if (header) {
      tier = Number(header[1]);
      continue;
    }
    if (tier > maxTier) continue;
    for (const w of raw.split(',')) {
      const word = w.trim();
      if (playable(word)) words.push(word);
    }
  }
  return words;
}

const blocked = [...lines('data/ldnoobw-en.txt'), ...lines('data/blocklist-extra.txt')].filter((w) => /^[a-z]+$/.test(w));
const blockedSet = new Set(blocked);
const enable = new Set(all);
const common = commonWords('data/12dicts-2+2+3frq.txt').filter((w) => enable.has(w) && !blockedSet.has(w));

const upper = (list: string[]): string[] => list.map((w) => w.toUpperCase());
const dicts = dictionaries(
  upper(all.filter((w) => !blockedSet.has(w))),
  upper(common),
  upper(blocked)
);

console.log(`ENABLE ${all.length} words, common ${common.length} (tiers ≤ ${maxTier}), blocked ${blocked.length}.`);

function grid(c: { rows: number; cols: number; tiles: (string | null)[] }): void {
  for (let r = 0; r < c.rows; r++) {
    const row = c.tiles.slice(r * c.cols, (r + 1) * c.cols).map((t) => (t === null ? ' ·' : t.padStart(2)));
    console.log('   ' + row.join(' '));
  }
}

function show(index: number, d: DayContent): void {
  const { sprint, casual } = d;
  console.log(`\npuzzle-${index} (#${index + 1}) ${SHAPES[casual.shape].name} · ${JSON.stringify(d).length} bytes`);
  const longest = sprint.words.reduce((a, w) => (w.length > a.length ? w : a), '');
  console.log(`  Sprint: ${sprint.words.length} words, longest ${longest}`);
  grid(sprint);
  console.log(`  Casual: ${casual.words.length} required, ${casual.bonus.length} bonus, star ${casual.star}`);
  grid(casual);
  console.log('   ' + casual.words.join(' '));
}

const boards: (DayContent | null)[] = [];
const stats = new Map<ShapeId, DayContent[]>();
const started = Date.now();
const count = preview > 0 ? preview : days;
for (let i = from; i < from + count; i++) {
  const day = generateDay(i, dicts, SALT);
  if (!day) {
    console.warn(`puzzle-${i}: no day passed (boards or size) — left empty.`);
    boards.push(null);
    continue;
  }
  boards.push(day);
  const list = stats.get(day.casual.shape) ?? [];
  list.push(day);
  stats.set(day.casual.shape, list);
  if (preview > 0) show(i, day);
}
console.log(`\n${count} days in ${((Date.now() - started) / 1000).toFixed(1)}s.`);

if (has('stats') || preview === 0) {
  const mid = (xs: number[]): number => xs[Math.floor(xs.length / 2)] ?? 0;
  const span = (xs: number[]): string => `${xs[0]}–${xs[xs.length - 1]} (median ${mid(xs)})`;
  const sorted = (xs: number[]): number[] => xs.sort((a, b) => a - b);
  for (const [shape, list] of stats) {
    const req = sorted(list.map((d) => d.casual.words.length));
    const sprint = sorted(list.map((d) => d.sprint.words.length));
    const bytes = sorted(list.map((d) => JSON.stringify(d).length));
    const b = BANDS[shape];
    const sb = SPRINT_BANDS[shape];
    console.log(
      `${SHAPES[shape].name.padEnd(8)} ${String(list.length).padStart(4)} days · casual required ${span(req)} [${b.minWords}–${b.maxWords}] · sprint words ${span(sprint)} [${sb.minWords}–${sb.maxWords}] · bytes ${span(bytes)}`
    );
  }
}

if (preview === 0) {
  if (from !== 0) {
    console.error('--from only works with --preview: the file always starts at puzzle-0.');
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify({ epoch: EPOCH, salt: SALT, boards }) + '\n');
  console.log(`Wrote ${boards.length} days to ${out}.`);
}
