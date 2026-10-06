// The grid, the dictionary trie and the solver. Shared by the game and by the
// board generator (tools/gen-boards.ts), so a board is traced in the browser by
// exactly the code that chose it.
//
// A board is a rows × cols grid read left to right, top to bottom. A tile holds
// one letter, or "QU" (one tile, two letters, as on the classic Qu die), or
// null for a hole in a shaped board. Words run through touching tiles in any of
// the 8 directions and use each tile at most once.

export interface Board {
  rows: number;
  cols: number;
  /** Upper-case tile text, or null for a hole. Length rows × cols. */
  tiles: (string | null)[];
}

/** Shortest word that counts. Four, as in Big Boggle and Squaredle: three-letter words are mostly noise. */
export const MIN_WORD = 4;

/** Tiles touching each tile, holes excluded. */
export function neighbours(board: Board): number[][] {
  const { rows, cols, tiles } = board;
  const out: number[][] = [];
  for (let i = 0; i < tiles.length; i++) {
    const list: number[] = [];
    if (tiles[i] !== null) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const j = nr * cols + nc;
          if (tiles[j] !== null) list.push(j);
        }
      }
    }
    out.push(list);
  }
  return out;
}

export function isAdjacent(board: Board, a: number, b: number): boolean {
  const ra = Math.floor(a / board.cols);
  const rb = Math.floor(b / board.cols);
  const ca = a % board.cols;
  const cb = b % board.cols;
  return a !== b && Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1;
}

/** The word a path spells. */
export function wordForPath(board: Board, path: readonly number[]): string {
  return path.map((i) => board.tiles[i] ?? '').join('');
}

// ---------- Trie ----------

export interface TrieNode {
  next: Map<string, TrieNode>;
  /** Set when the path from the root spells a whole word. */
  word: string | null;
}

export function buildTrie(words: Iterable<string>): TrieNode {
  const root: TrieNode = { next: new Map(), word: null };
  for (const word of words) {
    let node = root;
    for (const ch of word) {
      let child = node.next.get(ch);
      if (!child) {
        child = { next: new Map(), word: null };
        node.next.set(ch, child);
      }
      node = child;
    }
    node.word = word;
  }
  return root;
}

/** Walk a tile's text (one letter, or "QU") down from `node`. */
function step(node: TrieNode, text: string): TrieNode | null {
  let at: TrieNode | undefined = node;
  for (const ch of text) {
    at = at.next.get(ch);
    if (!at) return null;
  }
  return at;
}

// ---------- Solver ----------

/**
 * Every dictionary word on the board of at least `minLength` letters, with the
 * first path found for each. Depth-first from every tile, abandoning a path the
 * moment no word starts with it, so a 5×5 against the whole of ENABLE solves in
 * a few milliseconds.
 */
export function solve(board: Board, trie: TrieNode, minLength = MIN_WORD): Map<string, number[]> {
  const adj = neighbours(board);
  const found = new Map<string, number[]>();
  const path: number[] = [];
  const used = new Array<boolean>(board.tiles.length).fill(false);

  const visit = (tile: number, node: TrieNode): void => {
    const next = step(node, board.tiles[tile]!);
    if (!next) return;
    used[tile] = true;
    path.push(tile);
    if (next.word && next.word.length >= minLength && !found.has(next.word)) {
      found.set(next.word, path.slice());
    }
    if (next.next.size > 0) {
      for (const n of adj[tile]!) if (!used[n]) visit(n, next);
    }
    path.pop();
    used[tile] = false;
  };

  for (let i = 0; i < board.tiles.length; i++) {
    if (board.tiles[i] !== null) visit(i, trie);
  }
  return found;
}

/**
 * A path that spells `word`, starting at `from` when given, or null. Used for
 * typed input and for the hints, where the word is known and only its route is
 * wanted.
 */
export function findPath(board: Board, word: string, from?: number): number[] | null {
  const adj = neighbours(board);
  const used = new Array<boolean>(board.tiles.length).fill(false);
  const path: number[] = [];

  const visit = (tile: number, offset: number): boolean => {
    const text = board.tiles[tile];
    if (!text || !word.startsWith(text, offset)) return false;
    used[tile] = true;
    path.push(tile);
    const end = offset + text.length;
    if (end === word.length) return true;
    for (const n of adj[tile]!) {
      if (!used[n] && visit(n, end)) return true;
    }
    path.pop();
    used[tile] = false;
    return false;
  };

  const starts = from === undefined ? board.tiles.map((_, i) => i) : [from];
  for (const s of starts) {
    if (visit(s, 0)) return path;
  }
  return null;
}

/** Tiles a word can start from (some words have more than one route). */
export function startTiles(board: Board, word: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.tiles.length; i++) {
    if (board.tiles[i] !== null && findPath(board, word, i)) out.push(i);
  }
  return out;
}
