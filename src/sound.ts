// Soft, short sounds, synthesised with WebAudio. No audio files, same as the
// other games. Browsers start an AudioContext suspended, so nothing is audible
// until resume() runs inside a real user gesture; every play() before then,
// or while muted, is a quiet no-op, so callers never guard.
//
// Deliberately gentle: low volume, no music, no loops. Visits are short and
// often in public or at night.

export type SoundName =
  | 'feed' | 'pet' | 'clean' | 'nap' | 'wake'
  | 'gift' | 'clover' | 'place' | 'flip' | 'nope'
  | 'play' | 'harvest' | 'find' | 'bake' | 'ding'
  | 'drumroll' | 'fanfare' | 'puff';

type Ctx = AudioContext;
const AudioCtor: (new () => Ctx) | undefined =
  typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext)
    : undefined;

const MASTER = 0.22;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let muted = false;
let failed = !AudioCtor;

/** Call from a user gesture. Safe to call repeatedly. */
export function resumeSound(): void {
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
  else if (!muted) resumeSound();
}

/** Suspend while the page is hidden, to save battery. */
export function pauseSound(): void {
  if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
}

function ready(): Ctx | null {
  return !failed && !muted && ctx && master && ctx.state === 'running' ? ctx : null;
}

// ---------------------------------------------------------------- building blocks

function tone(c: Ctx, opts: { type?: OscillatorType; from: number; to?: number; at?: number; dur: number; vol?: number; vibrato?: number }): void {
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  if (opts.vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 18;
    depth.gain.value = opts.vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + opts.dur);
  }
  const v = opts.vol ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: Ctx, opts: { at?: number; dur: number; filter: BiquadFilterType; from: number; to?: number; q?: number; vol?: number }): void {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (opts.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.filter;
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.from, t0);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  const g = c.createGain();
  const v = opts.vol ?? 0.4;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
}

// ---------------------------------------------------------------- the sounds

export function play(name: SoundName): void {
  const c = ready();
  if (!c) return;
  switch (name) {
    case 'feed': // three crunchy nibbles
      for (let i = 0; i < 3; i++) noise(c, { at: i * 0.11, dur: 0.07, filter: 'bandpass', from: 1800 + i * 200, q: 3, vol: 0.5 });
      break;
    case 'pet': // a soft rising trill
      tone(c, { from: 880, to: 1320, dur: 0.22, vol: 0.28, vibrato: 25 });
      tone(c, { from: 1320, to: 1480, at: 0.14, dur: 0.16, vol: 0.18, vibrato: 30 });
      break;
    case 'clean': // a bubbly swish
      noise(c, { dur: 0.32, filter: 'highpass', from: 800, to: 5000, vol: 0.18 });
      tone(c, { from: 700, to: 1100, at: 0.06, dur: 0.07, vol: 0.18 });
      tone(c, { from: 900, to: 1500, at: 0.16, dur: 0.07, vol: 0.15 });
      break;
    case 'nap': // a sleepy falling pair
      tone(c, { type: 'triangle', from: 660, at: 0, dur: 0.28, vol: 0.3 });
      tone(c, { type: 'triangle', from: 440, at: 0.22, dur: 0.45, vol: 0.28 });
      break;
    case 'wake': // a little rising boing
      tone(c, { from: 320, to: 760, dur: 0.22, vol: 0.32, vibrato: 12 });
      break;
    case 'gift': // a sparkly arpeggio
      [880, 1109, 1319, 1760].forEach((f, i) => tone(c, { type: 'triangle', from: f, at: i * 0.07, dur: 0.35, vol: 0.22 }));
      break;
    case 'clover': // a quick bright blip
      tone(c, { type: 'square', from: 1320, to: 1760, dur: 0.08, vol: 0.08 });
      break;
    case 'place': // a soft wooden thock
      tone(c, { from: 190, to: 95, dur: 0.1, vol: 0.45 });
      noise(c, { dur: 0.04, filter: 'lowpass', from: 1200, vol: 0.15 });
      break;
    case 'flip': // a paper flip
      noise(c, { dur: 0.05, filter: 'highpass', from: 2500, vol: 0.2 });
      noise(c, { at: 0.06, dur: 0.05, filter: 'highpass', from: 3200, vol: 0.16 });
      break;
    case 'play': // a quick pop
      tone(c, { from: 600, to: 1200, dur: 0.07, vol: 0.22 });
      break;
    case 'harvest': // a leafy rustle, then a blip
      noise(c, { dur: 0.18, filter: 'bandpass', from: 2400, q: 1.5, vol: 0.3 });
      tone(c, { type: 'triangle', from: 988, to: 1319, at: 0.14, dur: 0.14, vol: 0.2 });
      break;
    case 'find': // a small discovery chime
      [1319, 1568, 2093].forEach((f, i) => tone(c, { type: 'sine', from: f, at: i * 0.09, dur: 0.3, vol: 0.18 }));
      break;
    case 'bake': // the oven door, and a warm hum
      tone(c, { type: 'triangle', from: 260, to: 200, dur: 0.12, vol: 0.3 });
      noise(c, { at: 0.08, dur: 0.35, filter: 'lowpass', from: 600, vol: 0.12 });
      break;
    case 'ding': // the oven's little bell: it's ready
      tone(c, { type: 'sine', from: 1568, dur: 0.5, vol: 0.2 });
      tone(c, { type: 'sine', from: 2093, at: 0.12, dur: 0.45, vol: 0.12 });
      break;
    case 'nope': // a gentle low bump, never a buzzer
      tone(c, { type: 'triangle', from: 220, to: 180, dur: 0.14, vol: 0.25 });
      break;
    case 'drumroll': { // the raffle box rattling, faster and higher as it goes
      let at = 0;
      for (let i = 0; i < 14; i++) {
        noise(c, { at, dur: 0.05, filter: 'bandpass', from: 900 + i * 60, q: 4, vol: 0.28 });
        at += 0.13 - i * 0.006;
      }
      break;
    }
    case 'fanfare': // it's the prize: a bright little arpeggio, and a shimmer
      [784, 988, 1175, 1568].forEach((f, i) => tone(c, { type: 'triangle', from: f, at: i * 0.08, dur: 0.22, vol: 0.24 }));
      tone(c, { type: 'triangle', from: 1568, at: 0.32, dur: 0.6, vol: 0.2, vibrato: 12 });
      [2093, 2637, 3136].forEach((f, i) => tone(c, { type: 'sine', from: f, at: 0.4 + i * 0.07, dur: 0.35, vol: 0.08 }));
      break;
    case 'puff': // the box pops open on a miss: soft, not sad
      noise(c, { dur: 0.2, filter: 'lowpass', from: 1800, to: 400, vol: 0.25 });
      tone(c, { type: 'sine', from: 660, to: 520, at: 0.06, dur: 0.18, vol: 0.14 });
      break;
  }
}
