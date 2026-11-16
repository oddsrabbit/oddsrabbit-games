// Tiny synthesised sounds: a soft thump on a drop, a pop on a merge (lower for
// bigger breeds), a chime for a new breed. No audio files.
(function () {
  const RM = (window.RM = window.RM || {});
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, slide) {
    if (muted) return;
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  RM.Sound = {
    unlock() { ac(); },
    setMuted(m) { muted = m; },
    get muted() { return muted; },
    drop() { tone(220, 0.12, 'sine', 0.12, 0.6); },
    merge(tier) {
      const f = 880 * Math.pow(0.86, tier);
      tone(f, 0.16, 'triangle', 0.16, 1.5);
      setTimeout(() => tone(f * 1.5, 0.12, 'sine', 0.08, 1.2), 50);
    },
    discover() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.12), i * 90));
    },
    over() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.12), i * 160));
    },
  };
})();
