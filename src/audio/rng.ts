// Small seeded generator for presentation randomness (variation, grains, music). Audio is outside the sim, but a
// seeded stream keeps offline renders and tests reproducible.

export class AudioRng {
  private s: number;
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0; }

  /** 0 <= x < 1 (mulberry32). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, bInclusive: number): number { return a + Math.floor(this.next() * (bInclusive - a + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  /** Exponential waiting time for a Poisson process of `ratePerS`. */
  expWait(ratePerS: number): number { return ratePerS > 0 ? -Math.log(1 - this.next()) / ratePerS : Infinity; }
}
