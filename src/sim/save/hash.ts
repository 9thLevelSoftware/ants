// Deterministic hash of a SimState for determinism tests (same seed + commands => same hash).

import { encode } from '@/core/serialize';
import type { SimState } from '@/sim/types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * 32-bit FNV-1a over the binary encoding of the state, as 8 hex digits. For tests and debugging only: it encodes
 * the whole state (about 0.2 ms per ant, ~0.5 s at 2500 ants), so never call it per frame or per tick.
 */
export function stateHash(state: SimState): string {
  const bytes = encode(state);
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
