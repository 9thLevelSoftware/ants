// Point queries of the world under construction: terrain height, and the top surface (terrain or the top of
// a primitive) under a column, for resting objects and placing the start pose.

import { heightAt } from '@/sim/world/terrainSample';
import type { GenContext } from './context';
import { primColumn, type ColumnHit } from './column';
import { PrimIndex } from './primIndex';

const indexes = new WeakMap<GenContext, PrimIndex>();
const _hits: number[] = [];
const _col: ColumnHit = { hit: false, bottom: 0, top: 0 };

/** The context's primitive footprint index, synced with ctx.world.prims. */
export function primIndex(ctx: GenContext): PrimIndex {
  let ix = indexes.get(ctx);
  if (!ix) {
    ix = new PrimIndex(ctx.dims.size, ctx.dims.navCell * 4);
    indexes.set(ctx, ix);
  }
  ix.sync(ctx.world.prims);
  return ix;
}

/** Drops the index (after primitives were removed or replaced); the next query rebuilds it. */
export function invalidatePrimIndex(ctx: GenContext): void {
  indexes.delete(ctx);
}

/** Terrain height at (x, z), mm (bilinear). */
export function terrainAt(ctx: GenContext, x: number, z: number): number {
  return heightAt(ctx.world.terrain, x, z);
}

/**
 * Highest support surface at (x, z) at or below `belowY` (mm): the terrain or the top of a primitive whose column
 * passes there. Primitives with a top above `belowY` are ignored (so a pebble under a table rests on the ground).
 */
export function supportAt(ctx: GenContext, x: number, z: number, belowY = Infinity): number {
  let top = terrainAt(ctx, x, z);
  const ix = primIndex(ctx);
  ix.query(x, z, x, z, _hits);
  for (const i of _hits) {
    primColumn(ix.entries[i], x, z, _col);
    if (_col.hit && _col.top <= belowY && _col.top > top) top = _col.top;
  }
  return top;
}
