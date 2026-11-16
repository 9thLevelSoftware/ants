// Where to seal (task founding-close §1; viab-founding work item 1): the leak of the founding cavity (leak.ts)
// decides the target, and the plug is AIMED at it: the guide gives `seal-entrance` a target point on the passage
// (the nest's plugAim: within PLUG_AHEAD + PLUG_RADIUS beyond the head, whichever way she faces), so the queen
// needs only to stand somewhere near it, inside the action's throat reach (src/sim/ants/actions/defs/dig.ts
// inThroat: within SEAL_THROAT_BU of the opening, not above it), not in one exact pose. Aims are the soil samples
// of the throat's passages; stands are the cavity's own surface samples, so a stand is always somewhere she can
// walk to. A strategy (SealStrategy) chooses which aims are tried first; the guide changes it when it is stuck.
// Pure reads.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, Sim } from '@/sim/types';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { THROAT_BU } from '@/sim/balance/nest';
import {
  SEAL_AIM_CANDIDATES, SEAL_AIM_MARGIN_BU, SEAL_CUT_CHECKS, SEAL_DEEP_SPLIT, SEAL_MIN_COVER, SEAL_OTHER_ANTS_BU, SEAL_PLUG_INSIDE_BU,
  SEAL_REACH_MARGIN_BU, SEAL_SOIL_WEIGHT, SEAL_BELOW_STEP_BU, SEAL_LAYER_AIMS, SEAL_STAND_BEHIND_BU, SEAL_TARGET_SOIL_BU,
} from '@/sim/balance/founding';
import { cavityEntrances } from './dig';
import { floodCavity, floodStart, isAirSample, isOpenSample, keyI, keyJ, keyK, keyPos, sampleKey, carvedAirOver, passageLayers, throatClosed, throatLeak, throatPassageSet, type Sphere } from './leak';
import { aimReachMm, plugAround, predictPlug } from './plugPredict';

/**
 * Which aims the plan tries first (the guide moves to the next one when a strategy is stuck, sealGuide.ts):
 * `narrow` the throat's narrowest cross-sections first (each plug closes part of one; a closed cross-section is the
 * seal); `deep` the inner half of the throat (from the shaft below: a wide or steep mouth); `near` the passage
 * nearest her now (least walking); `mouth` the outer half, from any stand (a throat whose deep part she cannot reach);
 * `below` the back-fill: the cell's own leak further down the shaft, within her reach where she is (a queen who
 * cannot climb into the throat: a steep wall, a lip), see planBelow.
 */
export const SEAL_STRATEGIES = ['narrow', 'below', 'deep', 'near', 'mouth'] as const;
export type SealStrategy = (typeof SEAL_STRATEGIES)[number];

export interface SealPlan {
  entrance: Entrance;
  /** The leak path (sample keys, mouth end first) and the point where it crosses into the throat's soil. */
  path: number[];
  target: Vec3;
  /** Where the next plug is aimed (the seal-entrance target point). */
  aim: Vec3;
  /** She can plug the aim from where she stands now (in the action's reach, the aim in hers). */
  here: { ok: boolean; cuts: boolean };
  /** She is inside the action's throat reach now. */
  inReach: boolean;
  /** Where to stand (null: here, or nowhere at all when `here.ok` is false). */
  stand: Vec3 | null;
  /** The aimed plug closes the throat alone. */
  standCuts: boolean;
  /** Where she should face (the aim). */
  standAim: Vec3;
}

/** The action's throat reach (entranceAtThroat + inThroat: the throat sphere, not above the opening), shrunk by `margin` mm. */
export function inSealReach(sim: Sim, e: Entrance, p: Vec3, margin = 0): boolean {
  const bu = sim.world.bu;
  const dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > SEAL_THROAT_BU * bu + e.radius - margin) return false;
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

/**
 * Does the plug s lie inside the throat sphere of e (radius + THROAT_BU, less SEAL_PLUG_INSIDE_BU)? There the nest
 * counts it as e's plug and the first workers' `unseal-entrance` (which stands in, and reaches into, the throat) digs
 * it out at the hand-over. Plugs past the sphere (a queen who cannot climb into the throat) are laid only when the
 * guide finds no other way; the hand-over reopens those with dig plans the workers dig (reopen.ts).
 */
export function plugInThroat(sim: Sim, e: Entrance, s: Sphere): boolean {
  const R = e.radius + (THROAT_BU - SEAL_PLUG_INSIDE_BU) * sim.world.bu;
  return Math.hypot(s.c.x - e.pos.x, s.c.y - e.pos.y, s.c.z - e.pos.z) + s.r <= R;
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
  return e ? throatLeak(sim, e, [], nest) : null;
}

/** Does the founding cell reach the outside air through open samples (the cavity is not closed)? */
export function cellReachesAir(sim: Sim, nest: Nest): boolean {
  return floodCavity(sim, floodStart(sim, nest)).path !== null;
}

/** Is the aim within the queen's plug reach from p (aimReachMm less a margin)? */
function aimInReach(sim: Sim, q: Ant, p: Vec3, aim: Vec3): boolean {
  const reach = aimReachMm(sim, q.lengthBu * sim.world.bu) - SEAL_AIM_MARGIN_BU * sim.world.bu;
  return Math.hypot(aim.x - p.x, aim.y - p.y, aim.z - p.z) <= reach;
}

/** Positions of sample keys, spread to at most `max` by a fixed stride (deterministic). */
function spread(sim: Sim, keys: readonly number[], max: number): Vec3[] {
  const stride = Math.max(1, Math.ceil(keys.length / max));
  const out: Vec3[] = [];
  for (let i = 0; i < keys.length; i += stride) out.push(keyPos(sim, keys[i], { x: 0, y: 0, z: 0 }));
  return out;
}

/**
 * The aim groups a strategy tries, in order: each group is a list of aims scored against its own `focus` samples
 * (a plug's worth there counts first). `narrow`: the throat's cross-sections from the narrowest (plugs that close a
 * cross-section seal); `deep` / `mouth`: the inner / outer half of the passage; `near`: the passage nearest her.
 */
function aimGroups(sim: Sim, e: Entrance, q: Ant, strategy: SealStrategy): { aims: Vec3[]; focus: number[] }[] {
  const layers = passageLayers(sim, e);
  const all = [...layers.values()].flat();
  if (strategy === 'narrow') {
    // narrowest first; among equals the one nearer the opening (room behind it for her to stand in)
    const order = [...layers.entries()].sort((x, y) => x[1].length - y[1].length || x[0] - y[0]);
    return order.map(([, keys]) => ({ aims: spread(sim, keys, SEAL_LAYER_AIMS), focus: keys }));
  }
  const R = e.radius + SEAL_THROAT_BU * sim.world.bu;
  const fromMouth = (k: number) => { const p = keyPos(sim, k, { x: 0, y: 0, z: 0 }); return Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z); };
  let keys = all;
  if (strategy === 'deep') keys = all.filter((k) => fromMouth(k) >= SEAL_DEEP_SPLIT * R);
  else if (strategy === 'mouth') keys = all.filter((k) => fromMouth(k) < SEAL_DEEP_SPLIT * R);
  if (keys.length === 0) keys = all;
  if (strategy === 'near') {
    const d = (k: number) => { const p = keyPos(sim, k, { x: 0, y: 0, z: 0 }); return Math.hypot(p.x - q.pos.x, p.y - q.pos.y, p.z - q.pos.z); };
    keys = [...keys].sort((x, y) => d(x) - d(y)).slice(0, SEAL_AIM_CANDIDATES);
  }
  return [{ aims: spread(sim, keys, SEAL_AIM_CANDIDATES), focus: keys }];
}

/**
 * The sealing plan for the queen now, or null when there is nothing to seal (no unsealed entrance, or no leak).
 * `exclude`: stands to avoid (ones she could not reach), with the radius around each, mm.
 */
export function planSeal(
  sim: Sim, nest: Nest, q: Ant, exclude: readonly Vec3[] = [], excludeR = 0, strategy: SealStrategy = 'narrow', deepOk = false,
): SealPlan | null {
  const e = entranceToSeal(sim, nest);
  if (!e) return null;
  // plugs inside the throat sphere only, unless the guide got stuck laying one there (deepOk, sealGuide.ts); the
  // workers dig a plug past it out through short dig plans at the hand-over (reopen.ts closingPlugPlan)
  const placeable = (s: Sphere) => deepOk || plugInThroat(sim, e, s);
  if (strategy === 'below') return planBelow(sim, nest, q, e, placeable);
  // the leak by the nest's founding pocket rule, else the plain one (the nest still reads the throat open)
  const path = throatLeak(sim, e, [], nest) ?? throatLeak(sim, e);
  if (!path) return null;
  // what the plugs still have to fill or cut: the soil samples on any passage through the throat
  const passage = throatPassageSet(sim, e);
  const airOver = carvedAirOver(sim, passage);
  // a plug's worth: the passage soil it fills, then (much less) the carved air over the passage it uses up
  const worth = (s: Sphere) => SEAL_SOIL_WEIGHT * crossCount(sim, passage, s) + countIn(sim, airOver, s);
  const cuts = (s: Sphere) => throatLeak(sim, e, [s], nest) === null;
  const target = crossing(sim, path), bu = sim.world.bu;
  const len = q.lengthBu * bu, margin = SEAL_REACH_MARGIN_BU * bu;
  const others = otherAnts(sim, q, e.pos, SEAL_OTHER_ANTS_BU * bu);
  const inReach = inSealReach(sim, e, q.pos);
  // stands: the cavity's surface samples (the cell's side of any plug so far) near the throat; the aimed plug reaches
  // by its aim (src/sim/ants/actions/defs/dig.ts aimedInReach), so a stand just below the throat sphere serves too
  const flood = floodCavity(sim, floodStart(sim, nest));
  const stands: { p: Vec3; floor: number }[] = [];
  const near = e.radius + SEAL_THROAT_BU * bu + aimReachMm(sim, len) - margin;
  for (const k of flood.cavity.keys()) {
    const p = keyPos(sim, k, { x: 0, y: 0, z: 0 });
    if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z) > near || sim.field.substrateXYZ(p.x, p.y, p.z) >= 0) continue;
    const floor = onSurface(sim, keyI(k), keyJ(k), keyK(k));
    if (floor === 0 || exclude.some((x) => Math.hypot(x.x - p.x, x.y - p.y, x.z - p.z) < excludeR)) continue;
    stands.push({ p, floor });
  }
  // she stands on the cell's side of the plug, deeper in the throat than its aim, so that the plug never lands
  // between her and the cell and her way back down for soil stays open (viab-founding)
  // (the last strategy, `mouth`, lets her stand anywhere: plugKeepsQueenInside still keeps her connected to the cell)
  const fromMouth = (p: Vec3) => Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z);
  const behind = (p: Vec3, a: Vec3) => strategy === 'mouth' || fromMouth(p) >= fromMouth(a) + SEAL_STAND_BEHIND_BU * bu;
  for (const g of aimGroups(sim, e, q, strategy)) {
    // the aims of the group, scored by the plug the nest would place there: its share of the group's focus samples
    // first (a cross-section closed), then of the whole passage (the queen's own clearance is checked at the stand)
    const aims: { a: Vec3; n: number; s: Sphere }[] = [];
    for (const a of g.aims) {
      const s = plugAround(sim, a, others);
      if (!s || !placeable(s)) continue;
      const n = SEAL_SOIL_WEIGHT * crossCount(sim, g.focus, s) + worth(s);
      if (worth(s) >= SEAL_MIN_COVER) aims.push({ a, n, s });
    }
    if (strategy !== 'near') aims.sort((x, y) => y.n - x.n);
    // first any aim of the group she can plug from her pose now (no walking: the walker need not settle on an exact
    // stand), her own clearance included
    {
      let floods = 0; // plugKeepsQueenInside floods the cavity: a few per plan at most
      for (const c of aims) {
        if (!aimInReach(sim, q, q.pos, c.a) || !behind(q.pos, c.a)) continue;
        const s = predictPlug(sim, e, q.pos, q.fwd, len, others, c.a);
        if (!s || !placeable(s) || worth(s) < SEAL_MIN_COVER || floods >= SEAL_CUT_CHECKS) continue;
        floods++;
        if (!plugKeepsQueenInside(sim, nest, q, c.a)) continue;
        const cut = cuts(s);
        return { entrance: e, path, target, aim: c.a, here: { ok: true, cuts: cut }, inReach, stand: null, standCuts: cut, standAim: c.a };
      }
    }
    for (const c of aims) {
      // else the nearest stand within reach of the aim (floors first: a walker settles there)
      let best: { p: Vec3; floor: number; d: number } | null = null;
      for (const st of stands) {
        if (!aimInReach(sim, q, st.p, c.a) || !behind(st.p, c.a)) continue;
        const d = Math.hypot(st.p.x - q.pos.x, st.p.y - q.pos.y, st.p.z - q.pos.z);
        if (!best || st.floor > best.floor || (st.floor === best.floor && d < best.d)) best = { ...st, d };
      }
      if (!best) continue;
      const s = predictPlug(sim, e, best.p, unitTo(best.p, c.a), len, others, c.a);
      if (!s || !placeable(s) || worth(s) < SEAL_MIN_COVER) continue;
      return { entrance: e, path, target, aim: c.a, here: { ok: false, cuts: false }, inReach, stand: best.p, standCuts: cuts(s), standAim: c.a };
    }
  }
  return { entrance: e, path, target, aim: target, here: { ok: false, cuts: false }, inReach, stand: null, standCuts: false, standAim: target };
}

/**
 * The back-fill (strategy `below`): the cell's shortest way to the air (floodCavity), plugged where it passes within
 * her reach, on the opening's side of her, with no stand to walk to first. A plug there cuts the cell off the air.
 * Like every plug it stays inside the throat sphere (plugInThroat, unless deep plugs are allowed: see planSeal);
 * when no part of the leak there is in her reach, the stand is the leak sample SEAL_BELOW_STEP_BU nearer the opening
 * (she climbs toward it).
 */
function planBelow(sim: Sim, nest: Nest, q: Ant, e: Entrance, placeable: (s: Sphere) => boolean): SealPlan | null {
  const flood = floodCavity(sim, floodStart(sim, nest));
  if (!flood.path) return null;
  const bu = sim.world.bu, len = q.lengthBu * bu;
  const pts = flood.path.slice(0, -1).map((k) => keyPos(sim, k, { x: 0, y: 0, z: 0 })); // cell end first, air dropped
  const others = otherAnts(sim, q, q.pos, SEAL_OTHER_ANTS_BU * bu);
  const leakSet = flood.path;
  const worth = (s: Sphere) => SEAL_SOIL_WEIGHT * countIn(sim, leakSet, s);
  let mine = 0, bestD = Infinity; // her own place along the leak
  pts.forEach((p, i) => { const d = Math.hypot(p.x - q.pos.x, p.y - q.pos.y, p.z - q.pos.z); if (d < bestD) { bestD = d; mine = i; } });
  let best: { a: Vec3; n: number } | null = null;
  let floods = 0;
  for (let i = mine + 1; i < pts.length; i++) {
    const a = pts[i];
    if (!aimInReach(sim, q, q.pos, a)) continue;
    const s = predictPlug(sim, e, q.pos, unitTo(q.pos, a), len, others, a);
    if (!s || !placeable(s)) continue;
    const n = worth(s); // the leak samples it fills
    if (n < SEAL_MIN_COVER || (best && n <= best.n)) continue;
    if (floods++ >= SEAL_CUT_CHECKS || !plugKeepsQueenInside(sim, nest, q, a)) continue;
    best = { a, n };
  }
  const target = pts[pts.length - 1] ?? e.pos;
  if (best) {
    return { entrance: e, path: flood.path, target, aim: best.a, here: { ok: true, cuts: false }, inReach: true, stand: null, standCuts: false, standAim: best.a };
  }
  // nothing in reach: climb along the leak toward the opening
  const step = Math.min(pts.length - 1, mine + Math.max(1, Math.round((SEAL_BELOW_STEP_BU * bu) / sim.carve.voxel)));
  const stand = pts[step] ?? null;
  return { entrance: e, path: flood.path, target, aim: stand ?? target, here: { ok: false, cuts: false }, inReach: false, stand, standCuts: false, standAim: stand ?? target };
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
export function plugKeepsQueenInside(sim: Sim, nest: Nest, q: Ant, aim: Vec3 | null = null): boolean {
  const e = entranceToSeal(sim, nest);
  if (!e) return true;
  const s = predictPlug(sim, e, q.pos, q.fwd, q.lengthBu * sim.world.bu, otherAnts(sim, q, e.pos, SEAL_OTHER_ANTS_BU * sim.world.bu), aim);
  if (!s) return true;
  return nearCavity(sim, floodCavity(sim, floodStart(sim, nest), [s]).cavity, q.pos);
}

/** Is the queen in the cavity connected to the founding cell (not out on the air side of a plug)? */
export function queenInCavity(sim: Sim, nest: Nest, q: Ant): boolean {
  return nearCavity(sim, floodCavity(sim, floodStart(sim, nest)).cavity, q.pos);
}
