// Seeded randomness for the simulation. Anything random that happens while the
// player is away is keyed on (petId, stepIndex), so the same absence replayed
// on a phone and on a laptop produces the same events, and replaying a gap
// twice can never pay out twice.

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A uniform number in [0, 1) that depends only on its arguments. */
export function roll(petId: string, stepIndex: number, salt = ''): number {
  let x = hash32(`${petId}:${stepIndex}:${salt}`);
  // xorshift finaliser so neighbouring step indexes decorrelate
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

/** A random id for a new pet. Not security-sensitive. */
export function newPetId(): string {
  const a = Math.floor(Math.random() * 0xffffffff).toString(36);
  const b = Date.now().toString(36);
  return `${b}-${a}`;
}
