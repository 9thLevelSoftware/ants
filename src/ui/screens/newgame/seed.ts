// Seed text -> uint32 (GDD 08 3.7): any text up to 32 characters; an 8-hex-digit code (4F7A-21C9, any case, hyphen
// optional) is the seed itself; any other text is hashed with 32-bit FNV-1a. The resolved code is always shown
// under the field and is what the New Game request carries, so what the player sees is what the generator gets.
export const SEED_MAX_CHARS = 32;

const HEX8 = /^([0-9a-f]{4})-?([0-9a-f]{4})$/i;

/** 32-bit FNV-1a over UTF-16 code units (the same hash the generator uses for free text). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type SeedMode = 'hex' | 'hash';

export interface ResolvedSeed {
  /** The uint32 seed. */
  value: number;
  /** "4F7A-21C9" */
  code: string;
  mode: SeedMode;
}

export function formatSeedCode(n: number): string {
  const hex = (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function resolveSeed(text: string): ResolvedSeed {
  const t = text.trim().slice(0, SEED_MAX_CHARS);
  const m = HEX8.exec(t);
  if (m) {
    const value = parseInt(m[1] + m[2], 16) >>> 0;
    return { value, code: formatSeedCode(value), mode: 'hex' };
  }
  const value = fnv1a32(t);
  return { value, code: formatSeedCode(value), mode: 'hash' };
}

/** A fresh random code in display form. `random` returns a uint32; default crypto.getRandomValues (UI layer only). */
export function randomSeedText(random: () => number = cryptoUint32): string {
  return formatSeedCode(random());
}

function cryptoUint32(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return (Date.now() ^ (performance.now() * 1000)) >>> 0; // UI layer, never simulation
  }
}

/** The next seed after a failed generation ("Try another seed" increments by 1). */
export function nextSeedText(text: string): string {
  return formatSeedCode(resolveSeed(text).value + 1);
}
