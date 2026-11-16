// Cell data of the coarse 16 BU navigation grid (GDD 04 §11) and its derivation from WorldData (classes, surface
// costs, ground height, holes, water bodies, map edge) and from the world field (cells covered by objects taller
// than NAV_OVER_MAX, or flagged NAV_BLOCK). Pure; typed arrays only.

import type { Vec3 } from '@/core/math/vec3';
import type { Primitive, WorldData } from '@/sim/types';
import { NAV_CLASSES, PrimFlag } from '@/sim/types';
import { NAV_CELL_BU } from '@/sim/balance/world';
import type { PrimBounds, WorldField } from '@/sim/world/field';
import { byteAt, heightAt } from '@/sim/world/terrainSample';
import { LOCO_TUNING, MATERIAL_GRIP } from '../params';

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
  /**
   * The barrier test (full row or column) counts a sample as covered within this fraction of the sample spacing
   * of a solid (pseudo-distance), so a wall thinner than the spacing still forms a closed line of samples.
   */
  crossInflateFrac: 0.5,
  /** A cell's ground is the top of a low object when that top is this far above the terrain, BU. */
  lowTopBU: 0.5,
  /** A step edge onto a face with less grip than this is blocked (GDD 04 §11 "climbable if grip >= 0.5"). */
  stepGripMin: 0.5,
  /**
   * Flow-field edge costs are rounded to multiples of 1 / this mm (must be a power of two: the sums stay exact in
   * float32 up to 2^24 / this mm of path cost), so incremental repair equals a full rebuild bit for bit.
   */
  flowQuantPerMm: 4,
  /** Changed cells kept in the flow-field repair log (a field older than the log is rebuilt in full). */
  flowLogMaxCells: 8192,
  /** A micro-portal mouth attaches to the nearest passable cell within this many cells of the mouth. */
  mouthSnapCells: 2,
  /** Path smoothing: segments are tested this far above the ground, with this sweep radius, BU. */
  smoothLiftBU: 2.5,
  smoothRadiusBU: 1,
  /** Longest smoothed segment, cells (bounds the field traces). */
  smoothMaxCells: 12,
  /** Nearest passable cell search radius when a path endpoint is blocked, cells. */
  snapRadiusCells: 6,
  /** Flow fields kept (least recently used dropped; one per nest that walkers head home to). */
  flowCacheFields: 24,
  /** Flow fields use micro-portals passable by the standard worker (GDD 04 §6.1 PASS_CLEAR_K x 1), BU. */
  flowClearanceBU: 0.45,
  /** Down a flow field: a walker this close (horizontally) to a portal's entry mouth heads for the exit mouth, BU. */
  portalReachBU: 2,
} as const;

/** A micro-connection as a nav edge between the passable cells at its two mouths (GDD 04 §11). */
export interface Portal {
  id: number;
  posA: Vec3;
  posB: Vec3;
  /** Cells at the mouths (-1 = no passable cell near the mouth: the portal is unused). */
  cellA: number;
  cellB: number;
  /** Edge cost = channel length x 1.0, mm. */
  cost: number;
  /** Smallest clear dimension, BU: a walker needing more clearance cannot use it. */
  clearanceBu: number;
  open: boolean;
}

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
  /** Puddle overlay (weather, GDD 06 §3.10): 1 = dry, WX_PUDDLE_AVOID_COST = avoid, Infinity = blocked. */
  wet: Float32Array;
  /** Ground height at the cell centre (top of a low object there, else terrain with mounds), mm. */
  ground: Float32Array;
  /** Grip of the cell's ground (1 on terrain; the object's material on top of a low object). */
  grip: Float32Array;
  /** Micro-connection edges and, per cell, the indices of the portals with a mouth there. */
  portals: Portal[];
  portalsAt: Map<number, number[]>;
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
    cost: new Float32Array(N), dyn: new Float32Array(N).fill(1), wet: new Float32Array(N).fill(1), ground: new Float32Array(N), grip: new Float32Array(N).fill(1),
    portals: world.micro.map((m) => ({
      id: m.id, posA: { ...m.posA }, posB: { ...m.posB }, cellA: -1, cellB: -1, cost: m.lengthBu * bu,
      clearanceBu: m.minClearanceBu, open: true,
    })),
    portalsAt: new Map(),
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
  linkPortals(g);
  return g;
}

/**
 * Attaches each portal to the passable cell nearest each mouth, on that mouth's side (the mouth pushed half a
 * cell away from the other one): the mouths of a door crack lie in the cells the door blocks.
 */
export function linkPortals(g: GridData): void {
  g.portalsAt.clear();
  g.portals.forEach((p, i) => {
    p.cellA = mouthCell(g, p.posA, p.posB);
    p.cellB = mouthCell(g, p.posB, p.posA);
    if (p.cellA < 0 || p.cellB < 0 || p.cellA === p.cellB) { p.cellA = -1; p.cellB = -1; return; }
    for (const c of [p.cellA, p.cellB]) {
      const list = g.portalsAt.get(c);
      if (list) list.push(i); else g.portalsAt.set(c, [i]);
    }
  });
}

const MOUTH_SNAP_CELLS = NAV_GRID_TUNING.mouthSnapCells;

function mouthCell(g: GridData, m: Vec3, other: Vec3): number {
  const dx = m.x - other.x, dz = m.z - other.z, l = Math.hypot(dx, dz);
  const qx = m.x + (l > 0 ? (dx / l) * 0.5 * g.cell : 0), qz = m.z + (l > 0 ? (dz / l) * 0.5 * g.cell : 0);
  const cx = Math.floor(qx / g.cell), cz = Math.floor(qz / g.cell);
  let best = -1, bd = Infinity;
  for (let k = cz - MOUTH_SNAP_CELLS; k <= cz + MOUTH_SNAP_CELLS; k++) for (let i = cx - MOUTH_SNAP_CELLS; i <= cx + MOUTH_SNAP_CELLS; i++) {
    if (i < 0 || k < 0 || i >= g.w || k >= g.h) continue;
    const c = k * g.w + i;
    if (isBlocked(g, c)) continue;
    const d = ((i + 0.5) * g.cell - qx) ** 2 + ((k + 0.5) * g.cell - qz) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
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
  // 0 = no candidate, 1 = tall-column test, 2 = NAV_BLOCK (foot-level test), 3 = low object (ground only)
  const mark = new Uint8Array((ib - ia + 1) * (kb - ka + 1));
  const mw = ib - ia + 1;
  for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
    const c = k * g.w + i;
    g.ground[c] = field.height((i + 0.5) * g.cell, (k + 0.5) * g.cell);
    g.grip[c] = 1;
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
      if (tall) mark[m] = 1; else if (navBlock && mark[m] !== 1) mark[m] = 2; else if (mark[m] === 0) mark[m] = 3;
    }
  }
  for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
    if (mark[(k - ka) * mw + (i - ia)] !== 0) lowTop(g, field, k * g.w + i, overMax);
  }
  const S = T.coverSamples, need = Math.ceil(T.coverFraction * S * S - 1e-9);
  const inflate = (T.crossInflateFrac * g.cell) / S;
  for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) {
    const m = mark[(k - ka) * mw + (i - ia)];
    if (m === 0 || m === 3) continue;
    const c = k * g.w + i;
    let hit = 0, near = 0;
    for (let sz = 0; sz < S; sz++) for (let sx = 0; sx < S; sx++) {
      const x = (i + (sx + 0.5) / S) * g.cell, z = (k + (sz + 0.5) / S) * g.cell;
      const f = columnClearance(field, x, field.height(x, z), z, overMax, m === 2);
      _cov[sz * S + sx] = f < inflate ? 1 : 0;
      if (f < 0) hit++;
      if (f < inflate) near++;
    }
    if (hit >= need || (near >= S && crossesCell(S))) g.covered[c] = 1;
    g.partial[c] = hit / (S * S);
  }
  linkPortals(g);
}

/**
 * Ground of a cell with an object in it: the highest solid surface at the cell centre within overMax of the
 * terrain (a kerb, a slab, a log), found by sphere tracing down; a centre inside a tall solid keeps the terrain.
 */
function lowTop(g: GridData, field: WorldField, c: number, overMax: number): void {
  const T = NAV_GRID_TUNING, bu = g.bu, ix = c % g.w, iz = (c - ix) / g.w;
  const x = (ix + 0.5) * g.cell, z = (iz + 0.5) * g.cell, h = g.ground[c];
  let y = h + overMax;
  if (field.substrateXYZ(x, y, z) < 0) return;
  for (let guard = 0; guard < 256 && y > h + T.lowTopBU * bu; guard++) {
    const f = field.substrateXYZ(x, y, z);
    if (f <= 0.02 * bu) {
      g.ground[c] = y;
      _p.x = x; _p.y = y - 0.05 * bu; _p.z = z;
      g.grip[c] = MATERIAL_GRIP[field.materialAt(_p)] ?? LOCO_TUNING.gripDefault;
      return;
    }
    y -= Math.max(0.9 * f, 0.05 * bu);
  }
}

const _p: Vec3 = { x: 0, y: 0, z: 0 };
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

/**
 * Largest substrate pseudo-distance over the column's sample heights (< 0: solid all the way up = covered; small:
 * solid within that distance at every height). NAV_BLOCK primitives test the foot height only.
 */
function columnClearance(field: WorldField, x: number, gy: number, z: number, overMax: number, footOnly: boolean): number {
  const H = NAV_GRID_TUNING.coverHeights;
  let f = field.substrateXYZ(x, gy + H[0] * overMax, z);
  if (footOnly) return f;
  for (let j = 1; j < H.length; j++) f = Math.max(f, field.substrateXYZ(x, gy + H[j] * overMax, z));
  return f;
}

function clampCell(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** Blocked for planning: tall cover, blocked classes, or a runtime overlay of Infinity. */
export function isBlocked(g: GridData, c: number): boolean {
  const k = g.cls[c];
  return g.covered[c] !== 0 || k === CLS.blocked || k === CLS.water || k === CLS.hole || k === CLS.edge
    || g.dyn[c] === Infinity || g.wet[c] === Infinity;
}
