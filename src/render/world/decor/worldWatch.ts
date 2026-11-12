// What changed in the simulation's dynamic world since the last look, as XZ rectangles (mm), so the decor rebuilds
// only the blocks there: footprints and digging deform the terrain, sward heights grow and are mown (GDD 04 §15.5),
// mounds and moved objects change the primitives that grass grows around and leaves rest on. Pure (no three).
import type { Primitive, Sim, WorldData } from '@/sim/types';
import {
  dynamicPrims, HEIGHT_DELTA_TILE, movedStaticPrims, objectMoves, objectMovesSignature,
} from '../lighting/simAdapter';
import { HASH_SEED, hashNum, hashStr } from '../lighting/signature';
import type { PrimColumns } from './primColumns';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** One deformation tile as the contract stores it (32 x 32 grid points, 1/16 mm units). */
export interface DeltaTile {
  tileIndex: number;
  data: Int16Array;
}

export function deltaTiles(sim: Sim | null | undefined): readonly DeltaTile[] {
  return (sim?.state.worldDelta as { heightDeltas?: DeltaTile[] } | undefined)?.heightDeltas ?? [];
}

function swardOf(sim: Sim | null | undefined): Uint16Array | null {
  const g = (sim?.state.worldDelta as { grassHeightMm?: Uint16Array } | undefined)?.grassHeightMm;
  return g && g.length ? g : null;
}

function tileHash(d: Int16Array): number {
  let h = HASH_SEED ^ d.length;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ (d[i] & 0xffff), 0x01000193);
  return h;
}

function primSignature(p: Primitive): number {
  let h = hashStr(HASH_SEED, p.shape);
  for (const v of [p.pos.x, p.pos.y, p.pos.z, p.rot.x, p.rot.y, p.rot.z, p.rot.w, p.size.x, p.size.y, p.size.z, p.round, p.flags]) h = hashNum(h, v);
  return hashStr(h, p.material);
}

export class WorldWatch {
  private tiles = new Map<number, number>();
  private sward: Uint16Array | null = null;
  private movesSig = Number.NaN;
  private moved = new Map<number, Primitive>();
  private dyn = new Map<number, number>();

  constructor(private readonly world: WorldData) {}

  /**
   * Deformation tiles whose content changed (added, edited or removed since the last call): their index and current
   * data (null = removed).
   */
  heightTiles(sim: Sim | null | undefined): { tileIndex: number; data: Int16Array | null }[] {
    const out: { tileIndex: number; data: Int16Array | null }[] = [];
    const next = new Map<number, number>();
    for (const t of deltaTiles(sim)) {
      const h = tileHash(t.data);
      next.set(t.tileIndex, h);
      if (this.tiles.get(t.tileIndex) !== h) out.push({ tileIndex: t.tileIndex, data: t.data });
    }
    for (const k of this.tiles.keys()) if (!next.has(k)) out.push({ tileIndex: k, data: null });
    this.tiles = next;
    return out;
  }

  /** Ground rectangle whose heights depend on a deformation tile (its grid points plus one bilinear cell), mm. */
  tileRect(tileIndex: number): Rect {
    const hf = this.world.terrain, T = HEIGHT_DELTA_TILE, tilesX = Math.ceil(hf.nx / T);
    const tx = tileIndex % tilesX, tz = Math.floor(tileIndex / tilesX);
    return { x0: (tx * T - 1) * hf.cell, z0: (tz * T - 1) * hf.cell, x1: (tx * T + T) * hf.cell, z1: (tz * T + T) * hf.cell };
  }

  /** Nav cells whose sward height changed since the last call (cell rectangles, mm). */
  swardCells(sim: Sim | null | undefined): Rect[] {
    const g = swardOf(sim), out: Rect[] = [];
    const prev = this.sward, m = this.world.maps.zone;
    if (g) {
      const n = Math.min(g.length, m.nx * m.nz);
      for (let i = 0; i < n; i++) {
        if (prev && prev.length === g.length && prev[i] === g[i]) continue;
        if (!prev && g[i] === 0) continue; // no sim value yet = the default the blocks were built with
        const ci = i % m.nx, ck = Math.floor(i / m.nx);
        out.push({ x0: ci * m.cell, z0: ck * m.cell, x1: (ci + 1) * m.cell, z1: (ck + 1) * m.cell });
      }
      this.sward = Uint16Array.from(g);
    } else if (prev) {
      out.push({ x0: 0, z0: 0, x1: this.world.size, z1: this.world.size });
      this.sward = null;
    }
    return out;
  }

  /**
   * Brings `cols` up to date with the simulation's moved objects and dynamic primitives and returns the rectangles
   * that changed (old and new footprint of every changed primitive). Unchanged inputs cost one hash per dynamic
   * primitive and none per static one.
   */
  prims(sim: Sim | null | undefined, cols: PrimColumns): Rect[] {
    const set: Primitive[] = [], remove: number[] = [], rects: Rect[] = [];
    const moves = objectMoves(sim), ms = objectMovesSignature(moves);
    if (ms !== this.movesSig) {
      this.movesSig = ms;
      const next = movedStaticPrims(this.world, moves, new Map());
      const ids = new Set([...this.moved.keys(), ...next.keys()]);
      for (const id of ids) {
        const a = this.moved.get(id), b = next.get(id);
        if (a && b && primSignature(a) === primSignature(b)) continue;
        const p = b ?? this.world.prims.find((q) => q.id === id);
        if (p) set.push(p);
      }
      this.moved = next;
    }
    const nextDyn = new Map<number, number>();
    for (const p of dynamicPrims(sim)) {
      const sig = primSignature(p);
      nextDyn.set(p.id, sig);
      if (this.dyn.get(p.id) !== sig) set.push(p);
    }
    for (const id of this.dyn.keys()) if (!nextDyn.has(id)) remove.push(id);
    this.dyn = nextDyn;
    if (!set.length && !remove.length) return rects;
    for (const id of [...remove, ...set.map((p) => p.id)]) { const r = cols.boundsOf(id); if (r) rects.push(r); }
    cols.update(set, remove);
    for (const p of set) { const r = cols.boundsOf(p.id); if (r) rects.push(r); }
    return rects;
  }
}
