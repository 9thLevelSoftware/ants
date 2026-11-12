// Allocation-free change signatures (FNV-1a over the exact bits of numbers and the chars of strings). Per-frame
// "did this change?" checks use these instead of building strings, which churned the garbage collector.
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
const PRIME = 0x01000193;

export const HASH_SEED = 0x811c9dc5 | 0;

/** Mixes a number (its exact float64 bits; -0 and 0 differ, NaN is stable) into h. */
export function hashNum(h: number, v: number): number {
  f64[0] = v;
  h = Math.imul(h ^ u32[0], PRIME);
  return Math.imul(h ^ u32[1], PRIME);
}

/** Mixes a string (or null / undefined as a marker) into h. */
export function hashStr(h: number, s: string | null | undefined): number {
  if (s == null) return Math.imul(h ^ 0x5bd1e995, PRIME);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), PRIME);
  return Math.imul(h ^ s.length, PRIME);
}
