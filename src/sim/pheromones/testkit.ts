// Helpers for this module's tests (pure; no test framework imports).

import type { PheromoneState } from '@/sim/types';
import { PHERO_CHUNK_CELLS } from '@/sim/balance';
import { createPheromoneField, type PheroFieldOptions, type PheromoneRuntime } from './field';

/** Lasius: BU 4 mm, cell 4 BU = 16 mm. */
export const TEST_BU = 4;
export const TEST_CELL = 16;

export function emptyPheroState(cell = TEST_CELL): PheromoneState {
  return { cell, chunkCells: PHERO_CHUNK_CELLS, layers: [], lastDecayTick: 0 };
}

export function newField(opts?: PheroFieldOptions, cell = TEST_CELL): PheromoneRuntime {
  return createPheromoneField(emptyPheroState(cell), opts);
}

/** Small deterministic generator for test inputs (xorshift32). */
export function testRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
