// Where to seal (task founding-close §1): the leak of the founding cavity (leak.ts) decides the target, and the
// queen's stand is chosen so that the real `seal-entrance` plug (plugPredict.ts) lands across that leak, from a
// pose the action accepts (the throat reach of src/sim/ants/actions/defs/dig.ts entranceAtThroat: within
// SEAL_THROAT_BU of the opening, not above it). Candidates are the cavity's own surface samples, so a stand is
// always somewhere she can walk to. Pure reads.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, Sim } from '@/sim/types';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { SEAL_CUT_CHECKS, SEAL_REACH_MARGIN_BU, SEAL_TARGET_SOIL_BU } from '@/sim/balance/founding';
import { cavityEntrances } from './dig';
import { floodCavity, floodStart, isAirSample, isOpenSample, keyI, keyJ, keyK, keyPos, throatLeak, type Sphere } from './leak';
import { predictPlug } from './plugPredict';

export interface SealPlan {
  entrance: Entrance;
  /** The leak path (sample keys, mouth end first) and the point where it crosses into the throat's soil. */
  path: number[];
  target: Vec3;
  /** The queen's pose now would plug across the leak (and the action accepts it). */
  here: { ok: boolean; cuts: boolean };
  /** Where to stand instead (null: nowhere better than here, or nowhere at all). */
  stand: Vec3 | null;
  standCuts: boolean;
}

/** The action's throat reach (entranceAtThroat + inThroat), shrunk by `margin` mm. */
export function inSealReach(sim: Sim, e: Entrance, p: Vec3, margin = 0): boolean {
  const bu = sim.world.bu;
  const dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > SEAL_THROAT_BU * bu - margin) return false;
  return dx * e.dir.x + dy * e.dir.y + dz * e.dir.z <= e.radius - margin;
}

/** The first leak-path sample (from the mouth) that lies SEAL_TARGET_SOIL_BU inside the soil. */
function crossing(sim: Sim, path: number[]): Vec3 {
  const p = { x: 0, y: 0, z: 0 }, lim = -SEAL_TARGET_SOIL_BU * sim.world.bu;
  for (const k of path) {
    keyPos(sim, k, p);
    if (sim.field.substrateXYZ(p.x, p.y, p.z) <= lim) return p;
  }
  return keyPos(sim, path[path.length - 1], p);
}

function crossCount(sim: Sim, path: number[], s: Sphere): number {
  const p = { x: 0, y: 0, z: 0 };
  let n = 0;
  for (const k of path) {
    keyPos(sim, k, p);
    if ((p.x - s.c.x) ** 2 + (p.y - s.c.y) ** 2 + (p.z - s.c.z) ** 2 <= s.r * s.r) n++;
  }
  return n;
}

/**
 * A cavity sample beside the wall (a 6-neighbour that is neither open nor air), somewhere she can stand: 2 on a
 * floor (solid below), 1 on a wall or ceiling, 0 not on a surface.
 */
function onSurface(sim: Sim, i: number, j: number, k: number): number {
  const solid = (a: number, b: number, c: number) => !isOpenSample(sim, a, b, c) && !isAirSample(sim, a, b, c);
  if (solid(i, j - 1, k)) return 2;
  return solid(i + 1, j, k) || solid(i - 1, j, k) || solid(i, j + 1, k) || solid(i, j, k + 1) || solid(i, j, k - 1) ? 1 : 0;
}

function unitTo(from: Vec3, to: Vec3): Vec3 {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z, l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function otherAnts(sim: Sim, q: Ant, near: Vec3, r: number): Vec3[] {
  const out: Vec3[] = [];
  for (const a of sim.stores.ants.list) {
    if (a.alive && a.id !== q.id && Math.hypot(a.pos.x - near.x, a.pos.y - near.y, a.pos.z - near.z) < r) out.push(a.pos);
  }
  return out;
}

/** The first entrance of the founding cavity still to seal, or null. */
export function entranceToSeal(sim: Sim, nest: Nest): Entrance | null {
  return cavityEntrances(sim, nest).find((e) => e.status !== 'sealed') ?? null;
}

/** The leak now: through the throat of an unsealed entrance of the cavity (null: none, the throat reads sealed). */
export function leakPath(sim: Sim, nest: Nest): number[] | null {
  const e = entranceToSeal(sim, nest);
  return e ? throatLeak(sim, e) : null;
}

/** Does the founding cell reach the outside air through open samples (the cavity is not closed)? */
export function cellReachesAir(sim: Sim, nest: Nest): boolean {
  return floodCavity(sim, floodStart(nest)).path !== null;
}

/**
 * The sealing plan for the queen now, or null when there is nothing to seal (no unsealed entrance, or no leak).
 * `exclude`: stands to avoid (ones she could not reach), with the radius around each, mm.
 */
export function planSeal(sim: Sim, nest: Nest, q: Ant, exclude: readonly Vec3[] = [], excludeR = 0): SealPlan | null {
  const e = entranceToSeal(sim, nest);
  if (!e) return null;
  const path = throatLeak(sim, e);
  if (!path) return null;
  // stands: the cavity's own samples (the cell's side of any plug so far)
  const flood = floodCavity(sim, floodStart(nest));
  const target = crossing(sim, path), bu = sim.world.bu;
  const len = q.lengthBu * bu, margin = SEAL_REACH_MARGIN_BU * bu;
  const others = otherAnts(sim, q, e.pos, 8 * bu);
  const cuts = (s: Sphere) => throatLeak(sim, e, [s]) === null;
  // the queen as she stands now
  let here = { ok: false, cuts: false };
  if (inSealReach(sim, e, q.pos)) {
    const s = predictPlug(sim, e, q.pos, q.fwd, len, others);
    if (s && crossCount(sim, path, s) > 0) here = { ok: true, cuts: cuts(s) };
  }
  if (here.cuts) return { entrance: e, path, target, here, stand: null, standCuts: false };
  // the cavity's surface samples within reach, scored by the plug the action would place from each
  const cands: { p: Vec3; n: number; d: number; s: Sphere; floor: number }[] = [];
  const p = { x: 0, y: 0, z: 0 };
  for (const k of flood.cavity.keys()) {
    keyPos(sim, k, p);
    if (!inSealReach(sim, e, p, margin) || sim.field.substrateXYZ(p.x, p.y, p.z) >= 0) continue;
    const floor = onSurface(sim, keyI(k), keyJ(k), keyK(k));
    if (floor === 0) continue;
    if (exclude.some((x) => Math.hypot(x.x - p.x, x.y - p.y, x.z - p.z) < excludeR)) continue;
    const s = predictPlug(sim, e, p, unitTo(p, target), len, others);
    if (!s) continue;
    const n = crossCount(sim, path, s);
    if (n > 0) cands.push({ p: { ...p }, n, d: Math.hypot(p.x - q.pos.x, p.y - q.pos.y, p.z - q.pos.z), s, floor });
  }
  // floors first (a walker settles there), then the plugs that cross most of the leak, then the nearest
  cands.sort((a, b) => b.floor - a.floor || b.n - a.n || a.d - b.d);
  const top = cands.slice(0, SEAL_CUT_CHECKS).sort((a, b) => a.d - b.d);
  const cutter = top.find((c) => cuts(c.s));
  if (cutter) return { entrance: e, path, target, here, stand: cutter.p, standCuts: true };
  if (here.ok) return { entrance: e, path, target, here, stand: null, standCuts: false };
  return { entrance: e, path, target, here, stand: cands[0]?.p ?? null, standCuts: false };
}
