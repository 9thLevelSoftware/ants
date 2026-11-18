// Seeded random numbers for the offline sound renderers (mulberry32). No Math.random anywhere in tools/audio:
// the same seed must give the same bytes on every run.

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** @param {number} seed */
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** Uniform in [a, b). */
    range: (a, b) => a + (b - a) * next(),
    /** Uniform integer in [a, b]. */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    /** Zero-mean, unit-variance noise sample (uniform, scaled). */
    white: () => (next() * 2 - 1) * Math.SQRT2 * Math.sqrt(1.5),
    /** Standard normal (Box-Muller). */
    gauss: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** An independent generator derived from this seed and a label (so adding a layer never shifts the others). */
    fork: (label) => makeRng((seed ^ hashString(label)) >>> 0),
  };
  return rng;
}
