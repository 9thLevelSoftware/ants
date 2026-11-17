// Chewing a cell into wood (GDD 07 §5.2.3 founding cell, §6.2.5 satellite starter cell): an entry on the side of a
// log or stump at walkable height, a horizontal tunnel and a cell long along a horizontal grain, checked to lie in
// the primitive's own solid wood with no open space near it (a hollow would make it too open to seal), carved with
// the species' dig rule, and its opening registered as the nest's entrance (a side opening is no terrain hole, so
// the nest module's breach rule does not see it).

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Nest, Primitive, Sim, WoodState } from '@/sim/types';
import { FOUND_CELL_CLEAR_BU } from '@/sim/balance/species-carpenter';
import { carveCapsule } from '@/sim/nest/carveOps';
import { registerNaturalOpening } from '@/sim/nest/entrances';
import { primDistance } from './primGeom';

/** Cell and tunnel sizes, BU: tunnel diameter and length, cell width (across), height and length (along the grain). */
export interface CellSize { tunnelD: number; tunnelLen: number; w: number; h: number; l: number }

const tmp = { x: 0, y: 0, z: 0 };

/**
 * Entry point on the primitive's side, `t` mm along the grain axis from its centre, on the side facing `from` (or
 * the far side when `flip`), at a walkable height, with the outward horizontal direction.
 */
export function entryOf(sim: Sim, prim: Primitive, w: WoodState, from: Vec3, t: number, flip: boolean): { entry: Vec3; out: Vec3 } | null {
  const bu = sim.world.bu, a = w.grainAxis ?? { x: 0, y: 1, z: 0 };
  const p0 = { x: prim.pos.x + a.x * t, y: prim.pos.y + a.y * t, z: prim.pos.z + a.z * t };
  const ground = sim.field.height(p0.x, p0.z);
  // vertical wood: low on the trunk, where a queen walks up to it
  if (Math.abs(a.y) > 0.7) p0.y = Math.max(p0.y, ground + 3 * bu);
  if (p0.y < ground + bu || primDistance(prim, p0) >= 0) return null;
  let sx = from.x - p0.x, sz = from.z - p0.z;
  if (Math.abs(a.y) < 0.7) { const d = sx * a.x + sz * a.z; sx -= d * a.x; sz -= d * a.z; }
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) { sx = -a.z; sz = a.x; } else { sx /= sl; sz /= sl; }
  if (flip) { sx = -sx; sz = -sz; }
  // march out to the surface, then bisect
  let lo = 0, hi = bu;
  for (let n = 0; n < 400; n++) {
    tmp.x = p0.x + sx * hi; tmp.y = p0.y; tmp.z = p0.z + sz * hi;
    if (primDistance(prim, tmp) >= 0) break;
    lo = hi; hi += bu;
  }
  for (let n = 0; n < 20; n++) {
    const m = (lo + hi) / 2;
    tmp.x = p0.x + sx * m; tmp.y = p0.y; tmp.z = p0.z + sz * m;
    if (primDistance(prim, tmp) < 0) lo = m; else hi = m;
  }
  const entry = { x: p0.x + sx * hi, y: p0.y, z: p0.z + sz * hi };
  // the entry must be free air on the outside (not buried in soil, not inside another solid)
  if (sim.field.substrateXYZ(entry.x + sx * bu, entry.y, entry.z + sz * bu) <= 0) return null;
  return { entry, out: { x: sx, y: 0, z: sz } };
}

/** The cell and tunnel of the wood template for an entry (centre, long axis, across axis, sizes in mm). */
export interface WoodTemplate { c: Vec3; g: Vec3; s: Vec3; r: number; along: number; side: number; mouth: Vec3; tunnelR: number }

export function templateFor(sim: Sim, w: WoodState, entry: Vec3, out: Vec3, t: CellSize): WoodTemplate {
  const bu = sim.world.bu;
  const radius = ((w.thicknessBu ?? 0) / 2) * bu;
  // cell centre as deep as the template asks, but never past the middle of the wood
  const depth = Math.min(radius, (t.tunnelLen + t.w / 2) * bu);
  const c = { x: entry.x - out.x * depth, y: entry.y, z: entry.z - out.z * depth };
  const a = w.grainAxis ?? { x: 0, y: 1, z: 0 };
  // the cell's long axis: the grain when it is horizontal, else across the tunnel
  let gx = a.x, gz = a.z;
  if (Math.abs(a.y) > 0.7 || Math.hypot(gx, gz) < 1e-6) { gx = -out.z; gz = out.x; }
  const gl = Math.hypot(gx, gz); gx /= gl; gz /= gl;
  const r = (t.h / 2) * bu;
  return {
    c, g: { x: gx, y: 0, z: gz }, s: { x: -gz, y: 0, z: gx }, r, along: Math.max(0, (t.l / 2) * bu - r), side: Math.max(0, (t.w / 2) * bu - r),
    mouth: { x: entry.x + out.x * 1.5 * bu, y: entry.y, z: entry.z + out.z * 1.5 * bu }, tunnelR: (t.tunnelD / 2) * bu,
  };
}

/** Sample points of the template's solid part (cell and the tunnel inside the wood). */
export function templatePoints(sim: Sim, tp: WoodTemplate, entry: Vec3): Vec3[] {
  const out: Vec3[] = [];
  const reach = tp.along + tp.r, wide = tp.side + tp.r;
  for (const [ga, sa, dy] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    out.push({ x: tp.c.x + tp.g.x * ga * reach + tp.s.x * sa * wide, y: tp.c.y + dy * tp.r, z: tp.c.z + tp.g.z * ga * reach + tp.s.z * sa * wide });
  }
  const bu = sim.world.bu, len = Math.hypot(tp.c.x - entry.x, tp.c.z - entry.z);
  for (let d = bu; d < len; d += bu) {
    const f = d / len;
    out.push({ x: entry.x + (tp.c.x - entry.x) * f, y: entry.y, z: entry.z + (tp.c.z - entry.z) * f });
  }
  return out;
}

/** Every template point lies in this primitive's own wood (not in a core of other material) and is still solid. */
export function templateFits(sim: Sim, prim: Primitive, pts: readonly Vec3[], tp: WoodTemplate): boolean {
  for (const q of pts) {
    if (primDistance(prim, q) >= -0.5 * sim.world.bu) return false;
    if (sim.field.primAt(q, 0)?.id !== prim.id) return false;
  }
  return clearAround(sim, tp);
}

/**
 * No open carve sample (a hollow, a beetle gallery, another nest) within FOUND_CELL_CLEAR_BU of the cell: the brush
 * would break into it and the cell would be too open to seal (GDD 03 §3 natural-cavity rule).
 */
function clearAround(sim: Sim, tp: WoodTemplate): boolean {
  const bu = sim.world.bu, v = sim.carve.voxel, m = FOUND_CELL_CLEAR_BU * bu;
  const ha = tp.along + tp.r + m, hs = tp.side + tp.r + m, hy = tp.r + m;
  for (let a = -ha; a <= ha; a += v) for (let s = -hs; s <= hs; s += v) for (let y = -hy; y <= hy; y += v) {
    const x = tp.c.x + tp.g.x * a + tp.s.x * s, z = tp.c.z + tp.g.z * a + tp.s.z * s;
    if (sim.carve.openness(x, tp.c.y + y, z) >= 0.5) return false;
  }
  return true;
}

/**
 * A site for a cell in this wood near `from`: entries along the grain (nearest `from` first, then spread over the
 * piece) on both sides, the first whose template fits. Null when none does.
 */
export function cellSiteIn(sim: Sim, prim: Primitive, w: WoodState, from: Vec3, size: CellSize): { entry: Vec3; out: Vec3 } | null {
  const bu = sim.world.bu;
  const a = w.grainAxis ?? { x: 0, y: 1, z: 0 };
  const half = Math.max(0, ((w.lengthBu ?? 0) * bu) / 2 - 6 * bu);
  const toward = Math.max(-half, Math.min(half, (from.x - prim.pos.x) * a.x + (from.y - prim.pos.y) * a.y + (from.z - prim.pos.z) * a.z));
  const ts = Math.abs(a.y) > 0.7 ? [0] : [toward, 0, -0.5 * half, 0.5 * half, -0.9 * half, 0.9 * half];
  for (const t of ts) {
    for (const flip of [false, true]) {
      const e = entryOf(sim, prim, w, from, t, flip);
      if (!e) continue;
      const tp = templateFor(sim, w, e.entry, e.out, size);
      if (templateFits(sim, prim, templatePoints(sim, tp, e.entry), tp)) return e;
    }
  }
  return null;
}

/**
 * Carves the cell and tunnel (clipped to the wood by the species' dig rule) and registers the opening as the nest's
 * chewed entrance facing out of the wood. Returns the template and the entrance.
 */
export function chewCell(sim: Sim, nest: Nest, w: WoodState, entry: Vec3, out: Vec3, size: CellSize): { tp: WoodTemplate; entrance: Entrance } {
  const tp = templateFor(sim, w, entry, out, size);
  for (const k of [-1, 0, 1]) {
    const ox = tp.s.x * tp.side * k, oz = tp.s.z * tp.side * k;
    carveCapsule(sim, { x: tp.c.x + ox - tp.g.x * tp.along, y: tp.c.y, z: tp.c.z + oz - tp.g.z * tp.along },
      { x: tp.c.x + ox + tp.g.x * tp.along, y: tp.c.y, z: tp.c.z + oz + tp.g.z * tp.along }, tp.r);
  }
  carveCapsule(sim, tp.mouth, tp.c, tp.tunnelR);
  const e = registerNaturalOpening(sim, nest, { ...entry });
  e.kind = 'dug';
  e.pos = { ...entry };
  e.dir = { ...out };
  return { tp, entrance: e };
}
