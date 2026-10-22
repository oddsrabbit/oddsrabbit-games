import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildTrie, findPath, solve } from './board';
import { BANDS, DAY_MAX_BYTES, SPRINT_BANDS, SPRINT_MIN_WORD } from './generate';
import { boardOf, EPOCH, parseDay, shapeForPuzzle } from './puzzle';

// Checks the committed boards file rather than regenerating it: that file is
// what the server serves, so it's what has to be right.
const file = JSON.parse(readFileSync('data/word-rush-boards.json', 'utf8')) as {
  epoch: string;
  boards: unknown[];
};

test('the boards file is for this epoch and has both boards for every day, within the content cap', () => {
  assert.equal(file.epoch, EPOCH);
  assert.ok(file.boards.length >= 365);
  file.boards.forEach((b, i) => {
    assert.ok(parseDay(b), `puzzle-${i} parses`);
    assert.ok(JSON.stringify(b).length <= DAY_MAX_BYTES, `puzzle-${i} fits`);
  });
});

test('every casual board matches its day, its band, and its own word lists', () => {
  file.boards.slice(0, 60).forEach((raw, i) => {
    const c = parseDay(raw)!.casual;
    assert.equal(c.shape, shapeForPuzzle(i).id, `puzzle-${i} shape`);
    const band = BANDS[c.shape];
    assert.ok(c.words.length >= band.minWords && c.words.length <= band.maxWords, `puzzle-${i} band`);
    const board = boardOf(c);
    for (const w of [...c.words, ...c.bonus]) assert.ok(findPath(board, w), `${w} traceable on puzzle-${i}`);
    // The lists are everything a solver finds, nothing more.
    const found = solve(board, buildTrie([...c.words, ...c.bonus]));
    assert.equal(found.size, c.words.length + c.bonus.length);
    assert.equal(new Set([...c.words, ...c.bonus]).size, c.words.length + c.bonus.length);
  });
});

test('every sprint board matches its day and its band, and lists every word on it', () => {
  file.boards.slice(0, 30).forEach((raw, i) => {
    const day = parseDay(raw)!;
    const s = day.sprint;
    assert.equal(s.shape, shapeForPuzzle(i).id);
    const band = SPRINT_BANDS[s.shape];
    assert.ok(s.words.length >= band.minWords && s.words.length <= band.maxWords, `puzzle-${i} band`);
    assert.ok(s.words.every((w) => w.length >= SPRINT_MIN_WORD));
    assert.deepEqual([...s.words].sort(), s.words, 'sorted');
    const found = solve(boardOf(s), buildTrie(s.words), SPRINT_MIN_WORD);
    assert.equal(found.size, s.words.length);
    // The two boards are different grids.
    assert.notDeepEqual(s.tiles, day.casual.tiles);
  });
});

test('no blocked word can be traced on a published board', () => {
  const lines = (p: string): string[] =>
    readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const blocked = [...lines('data/ldnoobw-en.txt'), ...lines('data/blocklist-extra.txt')]
    .filter((w) => /^[a-z]+$/.test(w))
    .map((w) => w.toUpperCase());
  const trie = buildTrie(blocked);
  file.boards.forEach((raw, i) => {
    const day = parseDay(raw)!;
    assert.equal(solve(boardOf(day.casual), trie, 3).size, 0, `puzzle-${i} casual`);
    assert.equal(solve(boardOf(day.sprint), trie, 3).size, 0, `puzzle-${i} sprint`);
  });
});

test('no blocked word is traceable on any board in the file', () => {
  const lines = (path: string): string[] =>
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim().toUpperCase())
      .filter((l) => /^[A-Z]+$/.test(l));
  const blocked = buildTrie([...lines('data/ldnoobw-en.txt'), ...lines('data/blocklist-extra.txt')]);
  file.boards.forEach((raw, i) => {
    const day = parseDay(raw)!;
    for (const grid of [day.sprint, day.casual]) {
      const hits = [...solve(boardOf(grid), blocked, 3).keys()];
      assert.deepEqual(hits, [], `puzzle-${i} ${grid === day.sprint ? 'sprint' : 'casual'}`);
    }
  });
});
