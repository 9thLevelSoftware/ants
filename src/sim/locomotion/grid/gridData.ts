// Cell data of the coarse 16 BU navigation grid (GDD 04 §11) and its derivation from WorldData (classes, surface
// costs, ground height, holes, water bodies, map edge) and from the world field (cells covered by objects taller
// than NAV_OVER_MAX, or flagged NAV_BLOCK). Pure; typed arrays only.

import type { Primitive, WorldData } from '@/sim/types';
import { NAV_CLASSES, PrimFlag } from '@/sim/types';
import { NAV_CELL_BU } from '@/sim/balance/world';
import type { PrimBounds, WorldField } from '@/sim/world/field';
import { byteAt, heightAt } from '@/sim/world/terrainSample';
import { LOCO_TUNING } from '../params';

/** Nav-grid tuning (GDD 04 §11), BU unless noted. */
export const NAV_GRID_TUNING = {
  /** Objects whose top is more than this above the cell ground block it (NAV_OVER_MAX_BU). */
  overMaxBU: 40,
  /** Ground height difference to a neighbour above which the edge pays the climb cost (NAV_STEP_BU). */
  stepBU: 2,
  /** Climb cost per BU of height difference on a step edge (NAV_CLIMB_COST), in cell-cost units. */
  climbCostPerBU: 1.5,
  /**
   * A cell is blocked when at least this fraction of its samples is covered, or when a full row or column of
   * samples is (a thin wall crossing the cell is a barrier although it covers little area).
   */
  coverFraction: 0.5,
  /** Samples per cell edge for the cover test (16 BU / 5: walls >= 3.2 BU thick always hit a sample column). */
  coverSamples: 5,
  /** Partly covered (still open) cells cost 1 + this x covered fraction: paths keep clear of obstacle ends. */
  partialCost: 3,
  /** Sample heights above the ground for the "tall solid column" test, as fractions of overMax. */
  coverHeights: [0.025, 0.35, 0.7, 1] as readonly number[],
} as const;

export const CLS = {
  open: NAV_CLASSES.indexOf('open'),
  blocked: NAV_CLASSES.indexOf('blocked-solid'),
  step: NAV_CLASSES.indexOf('step'),
  water: NAV_CLASSES.indexOf('water-body'),
  hole: NAV_CLASSES.indexOf('hole'),
  edge: NAV_CLASSES.indexOf('edge'),
} as const;

export interface GridData {
  /** Cell edge, mm; cells per side. */
  cell: number;
  w: number;
  h: number;
  /** World edge, mm; body unit, mm. */
  size: number;
  bu: number;
  /** NAV_CLASSES index from the world data (and holes, water, edge). */
  cls: Uint8Array;
  /** 1 where tall primitives cover the cell (derived from the field). */
  covered: Uint8Array;
  /** Covered fraction of the cell's samples, 0..1 (cells below the blocking rule still pay for it). */
  partial: Float32Array;
  /** Static surface cost multiplier (>= 1). */
  cost: Float32Array;
  /** Runtime cost overlay (1 = none, Infinity = blocked). */
  dyn: Float32Array;
  /** Ground height at the cell centre, mm. */
  ground: Float32Array;
}

export function cellCount(size: number, cell: number): number {
  return Math.max(1, Math.ceil(size / cell));
}

/** Grid data from the world maps only (no primitives yet). */
export function deriveFromWorld(world: WorldData): GridData {
  const bu = world.bu, cell = NAV_CELL_BU * bu, n = cellCount(world.size, cell);
  const N = n * n;
  const g: GridData = {
    cell, w: n, h: n, size: world.size, bu, cls: new Uint8Array(N), covered: new Uint8Array(N), partial: new Float32Array(N),
    cost: new Float32Array(N), dyn: new Float32Array(N).fill(1), ground: new Float32Array(N),
  };
  const margin = LOCO_TUNING.edgeMarginBU * bu;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix, x = (ix + 0.5) * cell, z = (iz + 0.5) * cell;
      g.cls[i] = world.nav.cls.data.length > 0 ? byteAt(world.nav.cls, x, z) : CLS.open;
      const c = world.nav.cost.data.length > 0 ? byteAt(world.nav.cost, x, z) / 10 : 1;
      g.cost[i] = c >= 1 ? c : 1;
      g.ground[i] = heightAt(world.terrain, x, z);
      if (world.terrainHoles && byteAt(world.terrainHoles, x, z) !== 0) g.cls[i] = CLS.hole;
      if (x < margin || z < margin || x > world.size - margin || z > world.size - margin) g.cls[i] = CLS.edge;
    }
  }
  // static water (GDD 04 §13: water bodies are blocked for planning; floating is Tier 2)
  for (const wb of world.waterBodies) markDisc(g, wb.pos.x, wb.pos.z, wb.radius, CLS.water);
  return g;
}

function markDisc(g: GridData, cx: number, cz: number, r: number, cls: number): void {
  const i0 = Math.max(0, Math.floor((cx - r) / g.cell)), i1 = Math.min(g.w - 1, Math.floor((cx + r) / g.cell));
  const k0 = Math.max(0, Math.floor((cz - r) / g.cell)), k1 = Math.min(g.h - 1, Math.floor((cz + r) / g.cell));
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * g.cell, z = (k + 0.5) * g.cell;
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) g.cls[k * g.w + i] = cls;
    }
  }
}

const _b: PrimBounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, diggable: false };

/**
 * Field-dependent part, for the cells overlapping [x0, x1] x [z0, z1] (mm; the whole world by default): ground
 * height with mounds, and the cover by objects taller than NAV_OVER_MAX (or flagged NAV_BLOCK). `prims` are the
 * primitives to consider (static and dynamic).
 */
export function deriveFromField(g: GridData, field: WorldField, prims: readonly Primitive[],
  x0 = 0, z0 = 0, x1 = g.size, z1 = g.size): void {
  const T = NAV_GRID_TUNING, bu = g.bu, overMax = T.overMaxBU * bu;
  const ia = clampCell(Math.floor(x0 / g.cell), g.w), ib = clampCell(Math.floor(x1 / g.cell), g.w);
  const ka = clampCell(Math.floor(z0 / g.cell), g.h), kb = clampCell(Math.floor(z1 / g.cell), g.h);
  // 0 = no candidate, 1 = tall-column test, 2 = NAV_BLOCK (foot-level test)
  const mark = new Uint8Array((ib - ia + 1) * (kb - ka + 1));
  const mw = ib - ia + 1;
  for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
    const c = k * g.w + i;
    g.ground[c] = field.height((i + 0.5) * g.cell, (k + 0.5) * g.cell);
    g.covered[c] = 0;
    g.partial[c] = 0;
  }
  for (const p of prims) {
    if ((p.flags & PrimFlag.VISUAL_ONLY) !== 0 || !field.primBounds(p.id, _b)) continue;
    if (_b.maxX < x0 || _b.minX > x1 || _b.maxZ < z0 || _b.minZ > z1) continue;
    const navBlock = (p.flags & PrimFlag.NAV_BLOCK) !== 0;
    const pi0 = Math.max(ia, Math.floor(_b.minX / g.cell)), pi1 = Math.min(ib, Math.floor(_b.maxX / g.cell));
    const pk0 = Math.max(ka, Math.floor(_b.minZ / g.cell)), pk1 = Math.min(kb, Math.floor(_b.maxZ / g.cell));
    for (let k = pk0; k <= pk1; k++) for (let i = pi0; i <= pi1; i++) {
      const tall = _b.maxY - g.ground[k * g.w + i] > overMax;
      const m = (k - ka) * mw + (i - ia);
      if (tall) mark[m] = 1; else if (navBlock && mark[m] === 0) mark[m] = 2;
    }
  }
  const S = T.coverSamples, need = Math.ceil(T.coverFraction * S * S - 1e-9);
  for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
    const m = mark[(k - ka) * mw + (i - ia)];
    if (m === 0) continue;
    const c = k * g.w + i;
    let hit = 0;
    for (let sz = 0; sz < S; sz++) for (let sx = 0; sx < S; sx++) {
      const x = (i + (sx + 0.5) / S) * g.cell, z = (k + (sz + 0.5) / S) * g.cell;
      const on = columnCovered(field, x, field.height(x, z), z, overMax, m === 2);
      _cov[sz * S + sx] = on ? 1 : 0;
      if (on) hit++;
    }
    if (hit >= need || (hit >= S && crossesCell(S))) g.covered[c] = 1;
    g.partial[c] = hit / (S * S);
  }
}

const _cov = new Uint8Array(NAV_GRID_TUNING.coverSamples * NAV_GRID_TUNING.coverSamples);

/** A full row or column of covered samples: a barrier across the cell. */
function crossesCell(S: number): boolean {
  for (let a = 0; a < S; a++) {
    let row = true, col = true;
    for (let b = 0; b < S; b++) { if (!_cov[a * S + b]) row = false; if (!_cov[b * S + a]) col = false; }
    if (row || col) return true;
  }
  return false;
}

function columnCovered(field: WorldField, x: number, gy: number, z: number, overMax: number, footOnly: boolean): boolean {
  const H = NAV_GRID_TUNING.coverHeights;
  if (!(field.substrateXYZ(x, gy + H[0] * overMax, z) < 0)) return false;
  if (footOnly) return true;
  for (let j = 1; j < H.length; j++) if (!(field.substrateXYZ(x, gy + H[j] * overMax, z) < 0)) return false;
  return true;
}

function clampCell(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** Blocked for planning: tall cover, blocked classes, or a runtime overlay of Infinity. */
export function isBlocked(g: GridData, c: number): boolean {
  const k = g.cls[c];
  return g.covered[c] !== 0 || k === CLS.blocked || k === CLS.water || k === CLS.hole || k === CLS.edge
    || g.dyn[c] === Infinity;
}
