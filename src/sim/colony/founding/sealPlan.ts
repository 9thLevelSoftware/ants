// Where to seal (task founding-close §1): the leak of the founding cavity (leak.ts) decides the target, and the
// queen's stand is chosen so that the real `seal-entrance` plug (plugPredict.ts) lands across that leak, from a
// pose the action accepts (the throat reach of src/sim/ants/actions/defs/dig.ts entranceAtThroat: within
// SEAL_THROAT_BU of the opening, not above it). Candidates are the cavity's own surface samples, so a stand is
// always somewhere she can walk to. Pure reads.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, Sim } from '@/sim/types';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { SEAL_CUT_CHECKS, SEAL_HERE_SHARE, SEAL_MIN_COVER, SEAL_SOIL_WEIGHT, SEAL_REACH_MARGIN_BU, SEAL_TARGET_SOIL_BU } from '@/sim/balance/founding';
import { cavityEntrances } from './dig';
import { floodCavity, floodStart, isAirSample, isOpenSample, keyI, keyJ, keyK, keyPos, sampleKey, carvedAirOver, throatClosed, throatLeak, throatPassageSet, type Sphere } from './leak';
import { predictPlug } from './plugPredict';

export interface SealPlan {
  entrance: Entrance;
  /** The leak path (sample keys, mouth end first) and the point where it crosses into the throat's soil. */
  path: number[];
  target: Vec3;
  /** The queen's pose now would plug across the leak (and the action accepts it). */
  here: { ok: boolean; cuts: boolean };
  /** She is inside the action's reach now (it would not refuse for want of a target). */
  inReach: boolean;
  /** Where to stand instead (null: nowhere better than here, or nowhere at all). */
  stand: Vec3 | null;
  standCuts: boolean;
  /** Where she should face at the stand (the leak's crossing or the opening). */
  standAim: Vec3;
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

/** Samples of `keys` inside the plug sphere s. */
function countIn(sim: Sim, keys: readonly number[], s: Sphere): number {
  const p = { x: 0, y: 0, z: 0 };
  let n = 0;
  for (const k of keys) {
    keyPos(sim, k, p);
    if ((p.x - s.c.x) ** 2 + (p.y - s.c.y) ** 2 + (p.z - s.c.z) ** 2 <= s.r * s.r) n++;
  }
  return n;
}

/** Soil samples of `keys` inside the plug sphere s (what that plug would fill). */
function crossCount(sim: Sim, path: number[], s: Sphere): number {
  const p = { x: 0, y: 0, z: 0 };
  let n = 0;
  for (const k of path) {
    keyPos(sim, k, p);
    if (sim.field.substrateXYZ(p.x, p.y, p.z) >= 0) continue; // air: no plug fills it
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
  return cavityEntrances(sim, nest).find((e) => !throatClosed(sim, e)) ?? null;
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
  // what the plugs still have to fill or cut: the soil samples on any passage through the throat
  const passage = throatPassageSet(sim, e);
  const airOver = carvedAirOver(sim, passage);
  // a plug's worth: the passage soil it fills, then (much less) the carved air over the passage it uses up
  const worth = (s: Sphere) => SEAL_SOIL_WEIGHT * crossCount(sim, passage, s) + countIn(sim, airOver, s);
  // stands: the cavity's own samples (the cell's side of any plug so far)
  const from = floodStart(nest), flood = floodCavity(sim, from);
  const target = crossing(sim, path), bu = sim.world.bu;
  const len = q.lengthBu * bu, margin = SEAL_REACH_MARGIN_BU * bu;
  const others = otherAnts(sim, q, e.pos, 8 * bu);
  const cuts = (s: Sphere) => throatLeak(sim, e, [s]) === null;
  // the queen as she stands now
  const inReach = inSealReach(sim, e, q.pos);
  const hereS = inReach ? predictPlug(sim, e, q.pos, q.fwd, len, others) : null;
  const hereN = hereS ? worth(hereS) : 0;
  // the cavity's surface samples within reach, scored by the plug the action would place from each (facing the
  // leak's crossing, or the opening)
  const cands: { p: Vec3; n: number; d: number; s: Sphere; floor: number; aim: Vec3 }[] = [];
  const p = { x: 0, y: 0, z: 0 };
  for (const k of flood.cavity.keys()) {
    keyPos(sim, k, p);
    if (!inSealReach(sim, e, p, margin) || sim.field.substrateXYZ(p.x, p.y, p.z) >= 0) continue;
    const floor = onSurface(sim, keyI(k), keyJ(k), keyK(k));
    if (floor === 0) continue;
    if (exclude.some((x) => Math.hypot(x.x - p.x, x.y - p.y, x.z - p.z) < excludeR)) continue;
    let best: { s: Sphere; n: number; aim: Vec3 } | null = null;
    for (const aim of [target, e.pos]) {
      const s = predictPlug(sim, e, p, unitTo(p, aim), len, others);
      const n = s ? worth(s) : 0;
      if (s && (!best || n > best.n)) best = { s, n, aim };
    }
    if (best && best.n >= SEAL_MIN_COVER) {
      cands.push({ p: { ...p }, n: best.n, d: Math.hypot(p.x - q.pos.x, p.y - q.pos.y, p.z - q.pos.z), s: best.s, floor, aim: best.aim });
    }
  }
  // floors first (a walker settles there), then the plugs that fill most of the passage, then the nearest
  cands.sort((a, b) => b.floor - a.floor || b.n - a.n || a.d - b.d);
  const okHere = hereS !== null && hereN >= Math.max(SEAL_MIN_COVER, SEAL_HERE_SHARE * (cands[0]?.n ?? 0));
  const aimOf = (c: { aim: Vec3 } | undefined) => c?.aim ?? target;
  const here = { ok: okHere, cuts: okHere && hereS !== null && cuts(hereS) };
  if (here.cuts) return { entrance: e, path, target, here, inReach, stand: null, standCuts: false, standAim: target };
  const top = cands.slice(0, SEAL_CUT_CHECKS).sort((a, b) => a.d - b.d);
  const cutter = top.find((c) => cuts(c.s));
  if (cutter) return { entrance: e, path, target, here, inReach, stand: cutter.p, standCuts: true, standAim: aimOf(cutter) };
  if (here.ok) return { entrance: e, path, target, here, inReach, stand: null, standCuts: false, standAim: target };
  return { entrance: e, path, target, here, inReach, stand: cands[0]?.p ?? null, standCuts: false, standAim: aimOf(cands[0]) };
}

/** Is any cavity sample within one sample of p in the flood's cavity? */
function nearCavity(sim: Sim, cavity: Map<number, number>, p: Vec3): boolean {
  const v = sim.carve.voxel, ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (cavity.has(sampleKey(ci + di, cj + dj, ck + dk))) return true;
  }
  return false;
}

/**
 * Would the plug from her pose now leave her on the cell's side? (A plug between her and the cell would shut
 * her out of her own nest.) True when no plug would be placed, or when she stays connected to the cell.
 */
export function plugKeepsQueenInside(sim: Sim, nest: Nest, q: Ant): boolean {
  const e = entranceToSeal(sim, nest);
  if (!e) return true;
  const s = predictPlug(sim, e, q.pos, q.fwd, q.lengthBu * sim.world.bu, otherAnts(sim, q, e.pos, 8 * sim.world.bu));
  if (!s) return true;
  return nearCavity(sim, floodCavity(sim, floodStart(nest), [s]).cavity, q.pos);
}

/** Is the queen in the cavity connected to the founding cell (not out on the air side of a plug)? */
export function queenInCavity(sim: Sim, nest: Nest, q: Ant): boolean {
  return nearCavity(sim, floodCavity(sim, floodStart(nest)).cavity, q.pos);
}
