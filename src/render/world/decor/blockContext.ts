// What placement needs around one block (pure): the ground view, a deterministic RNG per (layer, tile), and the
// objects decor reacts to (trees for the leaf fringe, flowering plants for petals, bins for litter) within reach.
import { hash3u, hashString, rngSeed, type RngState } from '@/core';
import type { WorldObject } from '@/sim/types';
import type { GroundView } from './ground';
import { rectDistance, tileMm, type BlockRef } from './tiles';
import { DECOR_OBJECTS, LEAF, LITTER, PETAL } from './tuning';

export interface BlockContext {
  ground: GroundView;
  block: BlockRef;
  trees: WorldObject[];
  flowering: WorldObject[];
  bins: WorldObject[];
}

export function blockContext(ground: GroundView, block: BlockRef): BlockContext {
  const near = (ids: readonly string[], r: number) => ground.objectsOf(ids).filter((o) => rectDistance(o.pos.x, o.pos.z, block) <= r);
  return {
    ground, block,
    trees: near(DECOR_OBJECTS.trees, LEAF.fringeMm),
    flowering: near(DECOR_OBJECTS.flowering, PETAL.radiusMm),
    bins: near(DECOR_OBJECTS.bins, LITTER.binRadiusMm),
  };
}

/** Deterministic stream for one layer in one tile: hash(seed, layer, tile) (GDD 04 §9). */
export function tileRng(seed: number, layer: string, tx: number, tz: number): RngState {
  return rngSeed(hash3u(tx, tz, hashString(layer), seed));
}

/** Distance to the nearest object of a list, mm (Infinity when empty). */
export function nearestObjectMm(list: readonly WorldObject[], x: number, z: number): number {
  let d = Infinity;
  for (const o of list) d = Math.min(d, Math.hypot(o.pos.x - x, o.pos.z - z));
  return d;
}

/** Tile area, m². */
export function tileAreaM2(bu: number): number {
  const t = tileMm(bu) / 1000;
  return t * t;
}

/** Integer count for an expected value, deterministic from one uniform draw (floor(n + u)). */
export function countFor(expected: number, u: number): number {
  return Math.floor(expected + u);
}
