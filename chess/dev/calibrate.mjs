// Bot-vs-bot matches for the computer opponent (js/engine.js), to check that
// its strength rises with its rating. Not shipped.
//
//   node dev/calibrate.mjs <ratingA> <ratingB> <games> [jobs=8]
//
// Prints A's score and the Elo difference it implies. Each worker loads
// rules.js and engine.js and plays with their pick, plausibility and TUNING;
// only the UCI search is repeated here (keep it in step with engine.js
// `search`), over Stockfish run by Node. Set VERBOSE=1 for every game's moves.
// Needs `npm install` (for the engine).
import { readFileSync } from 'node:fs';
import { spawn, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const CHESS = process.env.CHESS_DIR || fileURLToPath(new URL('..', import.meta.url));
const SF = process.env.SF_BIN || CHESS + '/node_modules/stockfish/bin/stockfish-18-lite-single.js';
const MAX_PLIES = 200;

function load() {
  const window = {};
  const ctx = { window, console, setTimeout, clearTimeout, Promise, JSON, Math, Date };
  for (const f of ['rules.js', 'engine.js']) vm.runInNewContext(readFileSync(CHESS + '/js/' + f, 'utf8'), ctx);
  return { R: window.ChessRules, E: window.ChessEngine };
}

class Engine {
  constructor() {
    this.p = spawn(process.execPath, [SF], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.buf = ''; this.listener = null;
    this.p.stdout.on('data', d => {
      this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (this.listener) this.listener(l);
      }
    });
  }
  post(c) { this.p.stdin.write(c + '\n'); }
  until(test, onLine) {
    return new Promise(res => { this.listener = l => { if (onLine) onLine(l); if (test(l)) { this.listener = null; res(l); } }; });
  }
  async init() { const r = this.until(l => l === 'uciok'); this.post('uci'); await r; await this.ready(); }
  async ready() { const r = this.until(l => l === 'readyok'); this.post('isready'); await r; }
  async newGame() { this.post('ucinewgame'); await this.ready(); }
  quit() { try { this.post('quit'); } catch {} setTimeout(() => this.p.kill(), 200); }
}

function parseInfo(line, MATE) {
  const mpv = /\bmultipv (\d+)/.exec(line), cp = /\bscore cp (-?\d+)/.exec(line);
  const mate = /\bscore mate (-?\d+)/.exec(line), pv = /\bpv (\S+)/.exec(line);
  if (!pv || (!cp && !mate) || / (upperbound|lowerbound)/.test(line)) return null;
  const score = cp ? Number(cp[1]) : (Number(mate[1]) > 0 ? MATE - Number(mate[1]) : -MATE - Number(mate[1]));
  return { k: mpv ? Number(mpv[1]) : 1, move: pv[1], cp: score };
}

// Mirror of engine.js `search`.
async function search(eng, E, fen, rating, legalCount) {
  const strong = rating >= E.STRONG_FROM, lines = {};
  eng.post('setoption name UCI_LimitStrength value ' + (strong ? 'true' : 'false'));
  if (strong) eng.post('setoption name UCI_Elo value ' + E.TUNING.elo(rating));
  eng.post('setoption name MultiPV value ' + (strong ? 1 : Math.max(1, Math.min(6, legalCount))));
  eng.post('position fen ' + fen);
  const done = eng.until(l => l.startsWith('bestmove'), l => {
    if (!l.startsWith('info ')) return;
    const info = parseInfo(l, E.MATE); if (info) lines[info.k] = info;
  });
  eng.post(strong ? 'go movetime ' + E.TUNING.movetime(rating) : 'go depth ' + E.TUNING.depth(rating));
  const l = await done;
  const best = /^bestmove (\S+)/.exec(l);
  let out = Object.keys(lines).sort((a, b) => a - b).map(k => lines[k]);
  if (strong && best && best[1] !== '(none)') out = [{ move: best[1], cp: out.length ? out[0].cp : 0 }];
  return out;
}

const uciOf = (R, m) => R.squareName(m.from) + R.squareName(m.to) + (m.promo || '');

function insufficient(board) {
  const minors = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '.' || p === 'k' || p === 'K') continue;
    if ('nNbB'.includes(p)) minors.push({ p, sq: i }); else return false;
  }
  if (minors.length <= 1) return true;
  // only bishops, all on one square colour
  if (minors.every(m => 'bB'.includes(m.p))) {
    const c = minors.map(m => ((m.sq % 8) + Math.floor(m.sq / 8)) % 2);
    return c.every(x => x === c[0]);
  }
  return false;
}

// Plays one game; returns score for white (1, 0.5, 0) and reason.
async function playGame(R, E, white, black) {
  let pos = R.start(), half = 0, full = 1, plies = 0;
  const seen = new Map(), key = p => p.board + p.turn + p.castling + (p.ep || '-');
  seen.set(key(pos), 1);
  const moves = [];
  while (true) {
    const legalObjs = R.legalMoves(pos);
    if (!legalObjs.length) {
      if (R.inCheck(pos.board, pos.turn)) return { w: pos.turn === 'w' ? 0 : 1, why: 'mate', plies, moves };
      return { w: 0.5, why: 'stalemate', plies, moves };
    }
    if (insufficient(pos.board)) return { w: 0.5, why: 'material', plies, moves };
    if (half >= 100) return { w: 0.5, why: '50move', plies, moves };
    if (plies >= MAX_PLIES) return { w: 0.5, why: 'cap', plies, moves };
    const side = pos.turn === 'w' ? white : black;
    const legal = legalObjs.map(m => uciOf(R, m));
    let lines = await search(side.eng, E, E.toFen(pos, half, full), side.rating, legal.length);
    lines = lines.filter(l => legal.includes(l.move));
    const choice = E.pick(lines, legal, side.rating, null, side.rating < E.STRONG_FROM && E.plausibility ? E.plausibility(pos, legalObjs) : null);
    const m = legalObjs[legal.indexOf(choice.move)];
    const capture = pos.board[m.to] !== '.' || m.flag === 'ep';
    const pawn = pos.board[m.from].toLowerCase() === 'p';
    moves.push(choice.move);
    pos = R.play(pos, m);
    half = capture || pawn ? 0 : half + 1;
    if (pos.turn === 'w') full++;
    plies++;
    const k = key(pos), n = (seen.get(k) || 0) + 1; seen.set(k, n);
    if (n >= 3) return { w: 0.5, why: 'threefold', plies, moves };
  }
}

async function worker(a, b, indices) {
  const { R, E } = load();
  const ea = new Engine(), eb = new Engine();
  await ea.init(); await eb.init();
  for (const i of indices) {
    await ea.newGame(); await eb.newGame();
    const A = { rating: a, eng: ea }, B = { rating: b, eng: eb };
    const aWhite = i % 2 === 0;
    const r = await playGame(R, E, aWhite ? A : B, aWhite ? B : A);
    const scoreA = aWhite ? r.w : 1 - r.w;
    process.send({ i, aWhite, scoreA, why: r.why, plies: r.plies, moves: r.moves.join(' ') });
  }
  ea.quit(); eb.quit();
  process.send({ done: true });
}

function elo(s) { if (s <= 0) return -Infinity; if (s >= 1) return Infinity; return -400 * Math.log10(1 / s - 1); }

async function main() {
  const [a, b, games, jobs = 8] = process.argv.slice(2).map(Number);
  if (!a || !b || !games) { console.error('usage: node dev/calibrate.mjs <ratingA> <ratingB> <games> [jobs=8]'); process.exit(1); }
  const nj = Math.min(jobs, games), t0 = Date.now();
  let sum = 0, n = 0, w = 0, d = 0, l = 0; const whys = {};
  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: nj }, (_, j) => new Promise(res => {
    const idx = []; for (let i = j; i < games; i += nj) idx.push(i);
    const c = fork(self, ['--worker', a, b, idx.join(',')]);
    c.on('message', m => {
      if (m.done) return;
      sum += m.scoreA; n++; m.scoreA === 1 ? w++ : m.scoreA === 0 ? l++ : d++;
      whys[m.why] = (whys[m.why] || 0) + 1;
      if (process.env.VERBOSE) console.error(JSON.stringify(m));
      else console.error(`game ${m.i} A=${a} ${m.aWhite ? 'white' : 'black'}: ${m.scoreA} (${m.why}, ${m.plies} plies)`);
    });
    c.on('exit', res);
  })));
  const s = sum / n, se = Math.sqrt(Math.max(s * (1 - s), 0.01) / n);
  console.log(`A=${a} vs B=${b}: ${n} games, +${w} =${d} -${l}, A score ${sum}/${n} = ${(100 * s).toFixed(1)}%, ` +
    `Elo(A-B) ~ ${Math.round(elo(s))} [95%: ${Math.round(elo(s - 2 * se))}..${Math.round(elo(s + 2 * se))}], ` +
    `endings ${JSON.stringify(whys)}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

if (process.argv[2] === '--worker') worker(Number(process.argv[3]), Number(process.argv[4]), process.argv[5].split(',').map(Number));
else main();
