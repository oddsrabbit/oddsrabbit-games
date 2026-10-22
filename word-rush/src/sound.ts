// Short sounds, synthesised with WebAudio like the other games: no audio
// files, no music, no loops. Browsers start an AudioContext suspended, so
// nothing plays until unlockSound() runs inside a real user gesture; every
// play() before then, or while muted, is a quiet no-op, so callers never guard.

export type SoundName =
  | 'word1' | 'word2' | 'word3' | 'word5' | 'word11'
  | 'bonus' | 'star' | 'nope' | 'already'
  | 'start' | 'tick' | 'time' | 'milestone' | 'cleared';

type Ctx = AudioContext;
const AudioCtor: (new () => Ctx) | undefined =
  typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext)
    : undefined;

const MASTER = 0.22;
// A major pentatonic run, so any trace sounds like a tune rather than a siren.
const TRACE_NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186];

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;
let failed = !AudioCtor;

/** Call from a user gesture. Safe to call repeatedly. */
export function unlockSound(): void {
  if (failed || muted) return;
  try {
    if (!ctx && AudioCtor) {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  } catch {
    failed = true; // no output device, or a policy that won't allow it
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  if (muted && ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
  else if (!muted) unlockSound();
}

export function isMuted(): boolean {
  return muted;
}

/** Suspend while the page is hidden, to save battery. */
export function pauseSound(): void {
  if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
}

function ready(): Ctx | null {
  return !failed && !muted && ctx && master && ctx.state === 'running' ? ctx : null;
}

function tone(c: Ctx, o: { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; vol?: number }): void {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  const v = o.vol ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** The note for the nth tile of a trace (1-based): one step up the scale per tile. */
export function playTrace(length: number): void {
  const c = ready();
  if (!c) return;
  const f = TRACE_NOTES[Math.min(TRACE_NOTES.length - 1, Math.max(0, length - 1))]!;
  tone(c, { type: 'triangle', from: f, dur: 0.09, vol: 0.18 });
}

const arp = (c: Ctx, notes: number[], step: number, dur: number, vol: number, type: OscillatorType = 'triangle'): void =>
  notes.forEach((f, i) => tone(c, { type, from: f, at: i * step, dur, vol }));

export function play(name: SoundName): void {
  const c = ready();
  if (!c) return;
  switch (name) {
    case 'word1': // a bright pop
      tone(c, { from: 880, to: 1320, dur: 0.1, vol: 0.3 });
      break;
    case 'word2':
      arp(c, [988, 1319], 0.06, 0.16, 0.26);
      break;
    case 'word3':
      arp(c, [988, 1245, 1568], 0.06, 0.2, 0.26);
      break;
    case 'word5': // a little run up
      arp(c, [784, 988, 1175, 1568, 1976], 0.05, 0.22, 0.24);
      break;
    case 'word11': // a fanfare and a shimmer
      arp(c, [784, 988, 1175, 1568], 0.07, 0.22, 0.26);
      tone(c, { type: 'triangle', from: 2093, at: 0.3, dur: 0.6, vol: 0.2 });
      arp(c, [2637, 3136, 3951], 0.06, 0.3, 0.08, 'sine');
      break;
    case 'bonus': // sparkly, a little different from a required word
      arp(c, [1319, 1760, 2217], 0.05, 0.25, 0.18, 'sine');
      break;
    case 'star':
      arp(c, [659, 831, 988, 1319, 1661], 0.07, 0.3, 0.24);
      arp(c, [2637, 3322], 0.08, 0.5, 0.1, 'sine');
      break;
    case 'nope': // a gentle low bump, never a buzzer
      tone(c, { type: 'triangle', from: 220, to: 170, dur: 0.14, vol: 0.25 });
      break;
    case 'already': // a soft double tap
      tone(c, { type: 'sine', from: 660, dur: 0.06, vol: 0.15 });
      tone(c, { type: 'sine', from: 660, at: 0.08, dur: 0.06, vol: 0.12 });
      break;
    case 'start': // off you go
      arp(c, [523, 659, 784, 1047], 0.06, 0.18, 0.26);
      break;
    case 'tick': // the last ten seconds
      tone(c, { type: 'square', from: 1200, dur: 0.035, vol: 0.06 });
      break;
    case 'time': // a soft gong
      tone(c, { type: 'sine', from: 392, dur: 1.1, vol: 0.4 });
      tone(c, { type: 'sine', from: 588, dur: 0.9, vol: 0.18 });
      tone(c, { type: 'triangle', from: 784, at: 0.02, dur: 0.5, vol: 0.1 });
      break;
    case 'milestone':
      arp(c, [1047, 1319, 1568], 0.08, 0.3, 0.2, 'sine');
      break;
    case 'cleared':
      arp(c, [523, 659, 784, 1047, 1319, 1568], 0.08, 0.3, 0.24);
      tone(c, { type: 'triangle', from: 2093, at: 0.5, dur: 0.8, vol: 0.18 });
      break;
  }
}

/** The find sound for a word worth `points` (classic Boggle scale). */
export function playWord(points: number): void {
  play(points >= 11 ? 'word11' : points >= 5 ? 'word5' : points >= 3 ? 'word3' : points >= 2 ? 'word2' : 'word1');
}
