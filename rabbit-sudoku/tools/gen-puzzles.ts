// Generates the daily puzzles file the backend serves from.
//
//   npm run gen-puzzles                       # 400 days from puzzle-0 → data/rabbit-sudoku-puzzles.json
//   npm run gen-puzzles -- --days 30 --stats  # clue counts and techniques per tier
//   npm run gen-puzzles -- --preview 2        # print a couple of days, write nothing
//
// Output is `{ epoch, salt, days: [day for puzzle-0, puzzle-1, …] }`, each day
// `{ v: 2, tier, givens }` (DayContent in src/puzzle.ts). Copy it to the
// backend's tools/data/ and deploy; the provisioning cron seeds each day from
// it ahead of time. Puzzles are seeded from their day and slot, so unchanged
// inputs rebuild the same file, and a day already seeded on the server is
// never rewritten anyway.

import { writeFileSync } from 'node:fs';
import { generatePuzzle, type Puzzle } from '../src/generate';
import { TIERS, type Tier } from '../src/grade';
import { dailyTierFor, EPOCH, type DayContent } from '../src/puzzle';
import { hashString, mulberry32 } from '../src/rng';

const SALT = 'v1';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const from = Number(arg('from', '0'));
const preview = Number(arg('preview', '0'));
const days = preview || Number(arg('days', '400'));
const out = arg('out', 'data/rabbit-sudoku-puzzles.json');

const seen = new Set<string>();
const made: Puzzle[] = [];

function puzzleFor(index: number, slot: string, tier: Tier): Puzzle {
  // A repeat (vanishingly rare) moves on to the next seed for the same slot.
  for (let k = 0; ; k++) {
    const rng = mulberry32(hashString(`${SALT}:${index}:${slot}:${k}`));
    const p = generatePuzzle(rng, tier, { pick: 3 });
    if (!p) throw new Error(`puzzle-${index} ${slot}: no ${tier} puzzle found`);
    if (seen.has(p.givens)) continue;
    seen.add(p.givens);
    made.push(p);
    return p;
  }
}

const started = Date.now();
const out_days: DayContent[] = [];
for (let index = from; index < from + days; index++) {
  const t0 = Date.now();
  const daily = puzzleFor(index, 'daily', dailyTierFor(index));
  out_days.push({ v: 2, tier: daily.tier, givens: daily.givens });
  if (!preview) process.stdout.write(`\rpuzzle-${index} (${Date.now() - t0} ms)      `);
}
if (!preview) process.stdout.write('\n');

if (preview) {
  for (const [i, day] of out_days.entries()) console.log(`puzzle-${from + i}  ${day.tier.padEnd(6)} ${day.givens}`);
} else {
  writeFileSync(out, `${JSON.stringify({ epoch: EPOCH, salt: SALT, days: out_days }, null, 1)}\n`);
  console.log(`wrote ${out_days.length} days to ${out} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

if (has('stats')) {
  for (const tier of TIERS) {
    const ps = made.filter((p) => p.tier === tier);
    if (!ps.length) continue;
    const clues = ps.map((p) => p.clues);
    const hardest: Record<string, number> = {};
    for (const p of ps) hardest[p.grade.hardest] = (hardest[p.grade.hardest] ?? 0) + 1;
    console.log(
      `${tier.padEnd(6)} n=${ps.length} clues ${Math.min(...clues)}–${Math.max(...clues)} ` +
        `(avg ${(clues.reduce((a, b) => a + b, 0) / ps.length).toFixed(1)}); hardest: ` +
        Object.entries(hardest)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => `${t} ${n}`)
          .join(', ')
    );
  }
}
