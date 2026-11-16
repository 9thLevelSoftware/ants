// Locomotion API (owner: loco). Behaviours steer walkers only through these functions and poll `nav.status`
// ('moving' -> 'arrived' | 'failed'). The surface walker itself is the kernel's (walker.ts, F2).
//
//   navTo / navToTarget / navToPoi   trips with automatic legs: nest field out -> surface path (nav grid, entrance
//                                    flow field) -> climb route -> entrance -> nest field to the goal
//   navFollowField / navClimb        a single nest field / an authored climb route
//   navWander / navFollowTrail / navRetrace / navStop
//   integratePossessed               per-frame prediction of the possessed ant (the tick moves it authoritatively)
//   placeOnSurface                   spawn / teleport onto the level set (optional hint direction)
//
// Options: arrival radius (mm), speed 'cruise' (species cruise x temperature, health, load, callow factors),
// 'run' (sprint) or a fixed mm/s, and a multiplier.

import type { Vec3 } from '@/core/math/vec3';
import type {
  Ant, CommandHandlerMap, NestFieldTarget, PheroChannel, Sim, SimInvariant, System, TargetRef, Walker,
} from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { DEFAULT_ARRIVE_BU } from '@/sim/balance';
import { TICKS_PER_SECOND } from '@/sim/time';
import { isLocoNavGrid } from './grid/navGridImpl';
import { copy3, dist3 } from './mathx';
import { integratePossessedFrame } from './possessed';
import { routeById, nearestRouteNode, poiById } from './routes';
import { rt, type LocoRuntime } from './runtime';
import { NO_PROGRESS, scratchOf, walkerId, type LocoSpeedKind, type NavScratch } from './scratch';
import { aiSpeed } from './speed';
import { clampToMap, locomotionSystem } from './system';
import { formatStall, stalledAnts } from './stallWatch';
import { finite3, startTrip } from './trip';
import { walkerPlace, walkerSurfaceChanged } from './walker';
import { crumbAt } from './crumbs';

export { locomotionSystem } from './system';
export { stalledAnts, formatStall, type StallInfo } from './stallWatch';
export { isStunned, walkerUnderWater, puddleDepth } from './weather';
export { possessedPose, stepPossessed } from './possessed';
export { setLocoObserver, locoStats, queryAntsNear, registerMovementOverride, type LocoStats, type MovementOverride } from './runtime';
export { registerSpeedFactor, aiSpeed, playerSpeed, casteSpeeds, type SpeedFactor } from './speed';
export { crumbAt, crumbCount, clearCrumbs } from './crumbs';
export { LOCO_TUNING, locoParams, MATERIAL_GRIP } from './params';
export type { NavScratch } from './scratch';

export const systems: readonly System[] = [locomotionSystem];

export interface NavOptions {
  /** Arrival radius, mm (default DEFAULT_ARRIVE_BU). */
  arriveDist?: number;
  /** 'cruise' (default), 'run' (sprint), or a fixed speed in mm/s. */
  speed?: 'cruise' | 'run' | number;
  /** Multiplier on the speed (behaviour-specific, e.g. GDD 02 ROUTE_SYNERGY). */
  speedMult?: number;
}

function arriveOf(sim: Sim, arrive: number | undefined, opts: NavOptions | undefined): number {
  const a = arrive ?? opts?.arriveDist;
  return a !== undefined && a > 0 ? a : DEFAULT_ARRIVE_BU * sim.world.bu;
}

/** Common request set-up: speed request, counters, timeout from the straight-line distance. */
function begin(sim: Sim, w: Walker, opts: NavOptions | undefined, distance: number): { s: NavScratch; r: LocoRuntime } {
  const r = rt(sim), s = scratchOf(w);
  r.stats.requests++;
  const sp = opts?.speed ?? 'cruise';
  s.speedKind = (typeof sp === 'number' ? 'fixed' : sp) as LocoSpeedKind;
  s.speedFixed = typeof sp === 'number' ? sp : 0;
  s.speedMult = opts?.speedMult !== undefined && opts.speedMult >= 0 ? opts.speedMult : 1;
  s.reqTick = sim.state.tick;
  s.ladder = 0; s.ladderUntil = 0; s.episodes = 0; s.relocations = 0;
  s.best = NO_PROGRESS; s.bestTick = sim.state.tick; copy3(s.anchor, w.pos);
  if (Number.isFinite(distance)) {
    const v = Math.max(aiSpeed(sim, w, s, r.P), 0.5 * r.P.bu);
    s.timeoutTick = sim.state.tick + Math.ceil((r.P.timeoutBase + (r.P.timeoutMult * distance) / v) * TICKS_PER_SECOND);
  } else s.timeoutTick = -1;
  w.nav.stuckTicks = 0;
  return { s, r };
}

/** The speed request in opts is the one the scratch holds. */
function sameSpeed(s: NavScratch, opts: NavOptions | undefined): boolean {
  const sp = opts?.speed ?? 'cruise';
  const kind = typeof sp === 'number' ? 'fixed' : sp;
  const mult = opts?.speedMult !== undefined && opts.speedMult >= 0 ? opts.speedMult : 1;
  return s.speedKind === kind && s.speedMult === mult && (kind !== 'fixed' || s.speedFixed === sp);
}

function rejected(w: Walker, s: NavScratch): false {
  s.req = 'none';
  w.nav.status = 'failed';
  w.nav.failReason = 'rejected';
  w.nav.desiredSpeed = 0;
  return false;
}

/**
 * The same trip asked for again while it runs (same target, arrival radius and speed; a point within 0.5 BU of the
 * one it was made with): a behaviour re-issuing its walk on every think would restart the stuck ladder each time, so
 * a walker wedged on the way never escalated (loco-fix3: rival raiders stalled in their nest's exit at woodland-edge
 * #2 and playground-park #2, re-issued every second by the raid job). Kept as it is, like navWander.
 */
function sameTrip(sim: Sim, w: Walker, kind: TargetRef['kind'], id: number, dest: Vec3, arrive: number, opts: NavOptions | undefined): boolean {
  const s = w.nav.loco, nav = w.nav;
  return !!s && s.req === 'goto' && nav.status === 'moving' && nav.destKind === kind && nav.destId === id && nav.arriveDist === arrive
    && s.reqDest !== undefined && dist3(s.reqDest, dest) < 0.5 * sim.world.bu && sameSpeed(s, opts);
}

/** Seek a point (planner composes the legs); arriveDist mm. False if no route can exist. */
export function navTo(sim: Sim, w: Walker, dest: Vec3, arriveDist?: number, opts?: NavOptions): boolean {
  const arrive = arriveOf(sim, arriveDist, opts);
  if (finite3(dest) && sameTrip(sim, w, 'point', -1, dest, arrive, opts)) return true;
  const { s, r } = begin(sim, w, opts, dist3(w.pos, dest));
  if (!startTrip(sim, w, s, r, dest, 'point', -1, arrive, walkerId(w))) return rejected(w, s);
  s.reqDest = { x: dest.x, y: dest.y, z: dest.z };
  return true;
}

/** Seek a (possibly moving) target: entity, entrance, chamber, plan, nest, marker or point. False if it is gone. */
export function navToTarget(sim: Sim, w: Walker, target: TargetRef, arriveDist?: number, opts?: NavOptions): boolean {
  const arrive = arriveOf(sim, arriveDist, opts);
  // a moving target is re-resolved by the request itself: the same entity asked for again keeps the request
  if (finite3(target.pos) && (target.id >= 0 || target.kind === 'point') && sameTrip(sim, w, target.kind, target.id,
    target.id >= 0 ? (w.nav.loco?.reqDest ?? target.pos) : target.pos, arrive, opts)) return true;
  const { s, r } = begin(sim, w, opts, dist3(w.pos, target.pos));
  if (!startTrip(sim, w, s, r, target.pos, target.kind, target.id, arrive, walkerId(w))) return rejected(w, s);
  s.reqDest = { x: target.pos.x, y: target.pos.y, z: target.pos.z };
  return true;
}

/** Go to a point of interest of a world object (GDD 04 §10); elevated POIs are reached by climb routes. */
export function navToPoi(sim: Sim, w: Walker, poiId: number, arriveDist?: number, opts?: NavOptions): boolean {
  const poi = poiById(sim.world, poiId);
  if (!poi) return rejected(w, scratchOf(w));
  return navTo(sim, w, poi.pos, arriveDist, opts);
}

/** Stop and hold position (status 'idle'). */
export function navStop(_sim: Sim, w: Walker): void {
  const s = w.nav.loco; // no scratch is created for a walker that never had a request (keeps saves small)
  if (s) s.req = 'none';
  w.nav.mode = 'none';
  w.nav.status = 'idle';
  w.nav.desiredSpeed = 0;
  w.nav.path = null;
}

/**
 * Random walk around a centre within a radius (mm; 0 = unbounded). Never arrives; stop it with another request. A
 * walker that cannot move pivots on the spot; if that frees nothing the wander ends with status 'failed' and mode
 * 'none' (stuck.ts wanderStuck).
 */
export function navWander(sim: Sim, w: Walker, center: Vec3, radius: number, opts?: NavOptions): boolean {
  // the same wander asked for again while it runs (a behaviour re-issuing it on each think) goes on as it is: a
  // fresh request would restart its stall ladder every time, and a walker wedged in a crack would never pivot out
  // (viab-loco: playground-park #2 raiders at the bottom of a slit in a rival nest)
  const cur = w.nav.loco;
  if (cur && cur.req === 'wander' && w.nav.status === 'moving' && finite3(center) && dist3(cur.center, center) < 0.5 * sim.world.bu
    && cur.radius === (Number.isFinite(radius) && radius > 0 ? radius : 0) && sameSpeed(cur, opts)) return true;
  const { s } = begin(sim, w, opts, Infinity);
  if (!finite3(center)) return rejected(w, s);
  s.req = 'wander';
  copy3(s.center, center);
  s.radius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  w.nav.mode = 'wander';
  w.nav.status = 'moving';
  copy3(w.nav.dest, center);
  return true;
}

/**
 * Follow a pheromone trail of a colony and channel (three antennal sensors). dir 'out' walks away from home,
 * 'in' toward home (by the ant's home vector), 'any' keeps the current heading. Fails after TRAIL_LOST_S without
 * a followable reading (the behaviour falls back to route memory, search or the planner).
 */
export function navFollowTrail(sim: Sim, w: Walker, colony: number, channel: PheroChannel, dir: 'out' | 'in' | 'any' = 'any',
  opts?: NavOptions): boolean {
  const { s } = begin(sim, w, opts, Infinity);
  s.req = 'trail';
  s.trailColony = colony;
  s.trailChannel = channel;
  s.trailDir = dir === 'out' ? 1 : dir === 'in' ? -1 : 0;
  s.trailLostS = 0;
  s.trailTurned = 0;
  copy3(s.lastDir, w.fwd);
  w.nav.mode = 'trail';
  w.nav.status = 'moving';
  return true;
}

/** Retrace the ant's breadcrumbs home, taking shortcuts (GDD 02 §9.2). Arrives at crumb 0 (the entrance). */
export function navRetrace(sim: Sim, ant: Ant, opts?: NavOptions): boolean {
  const n = ant.mem.crumbLen;
  if (n === 0) return rejected(ant, scratchOf(ant));
  let len = 0;
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  for (let i = 1; i < n; i++) { crumbAt(ant, i - 1, a); crumbAt(ant, i, b); len += dist3(a, b); }
  const { s } = begin(sim, ant, opts, len + dist3(ant.pos, crumbAt(ant, n - 1, a)));
  s.req = 'retrace';
  s.crumbIdx = -1;
  s.routeEnd = -2;
  crumbAt(ant, 0, ant.nav.dest);
  ant.nav.arriveDist = arriveOf(sim, undefined, opts);
  ant.nav.mode = 'retrace';
  ant.nav.status = 'moving';
  return true;
}

/** Follow a nest distance field downhill to its target. False if the field is not registered. */
export function navFollowField(sim: Sim, w: Walker, nestId: number, target: NestFieldTarget, arriveDist?: number,
  opts?: NavOptions): boolean {
  const id = nestFieldId(nestId, target);
  const d = sim.nestNav.hasTarget(id) ? sim.nestNav.distanceAt(id, w.pos) : Infinity;
  const { s } = begin(sim, w, opts, d);
  if (!Number.isFinite(d)) return rejected(w, s);
  s.req = 'field';
  s.legField = id;
  s.legExit = false;
  const nav = w.nav;
  nav.mode = 'field';
  nav.status = 'moving';
  nav.fieldNest = nestId;
  nav.fieldKind = target.kind;
  nav.fieldTarget = target.id;
  nav.arriveDist = arriveOf(sim, arriveDist, opts);
  return true;
}

/** Follow an authored climb route from its nearest node to the far end (up from the base, down from the top). */
export function navClimb(sim: Sim, w: Walker, routeId: number, opts?: NavOptions): boolean {
  const route = routeById(sim.world, routeId);
  const r0 = rt(sim);
  const hit = route ? nearestRouteNode({ ...sim.world, climbRoutes: [route] }, w.pos, Infinity) : null;
  const { s } = begin(sim, w, opts, route ? route.lengthBu * r0.P.bu : Infinity);
  if (!route || !hit) return rejected(w, s);
  const toTop = hit.idx < route.points.length / 2;
  s.req = 'climb';
  s.routeDir = toTop ? 1 : -1;
  s.routeEnd = toTop ? route.points.length - 1 : 0;
  const nav = w.nav;
  nav.mode = 'climb';
  nav.status = 'moving';
  nav.routeId = routeId;
  nav.pathIdx = hit.idx;
  copy3(nav.dest, route.points[s.routeEnd]);
  return true;
}

/** Per-frame prediction of the possessed ant (does not change sim state; see possessed.ts). */
export function integratePossessed(sim: Sim, ant: Ant, dtSeconds: number): void {
  integratePossessedFrame(sim, ant, dtSeconds);
}

/**
 * Puts a walker on the level set f = footOffset near `pos` (spawn, teleport, after carving under it), resetting
 * its interpolation state and nav. Where the field gives no direction (open air, a saturated chamber interior) the
 * kernel sphere-traces along `dir` first (default straight down; spike-nest §5 item 2: pass a hint toward the
 * wanted wall, e.g. toward a chamber floor). Returns false (walker unchanged) if no surface was found.
 */
export function placeOnSurface(sim: Sim, w: Walker, pos: Vec3, dir?: Vec3): boolean {
  // GDD 04 §14: never placed beyond the hard map limit (creature jumps and spawns, displacements, teleports)
  const r = rt(sim), lo = r.P.edgeHard, hi = sim.world.size - lo;
  const p = pos.x >= lo && pos.x <= hi && pos.z >= lo && pos.z <= hi ? pos
    : { x: Math.min(hi, Math.max(lo, pos.x)), y: pos.y, z: Math.min(hi, Math.max(lo, pos.z)) };
  if (!walkerPlace(sim.field, w, p, dir ? { dir } : {}, sim.kernel.walker)) return false;
  clampToMap(sim, w, r);
  navStop(sim, w);
  return true;
}

/**
 * Call after the world changed in a box (mm) outside the carve grid: a dynamic primitive added / moved / removed
 * through sim.kernel, or a mound grew. Walkers there re-attach and replan; the nav grid re-derives the cells.
 */
export function notifySurfaceChanged(sim: Sim, min: Vec3, max: Vec3): void {
  const r = rt(sim), m = r.P.bu;
  const g = sim.navGrid;
  if (isLocoNavGrid(g)) g.refreshArea(min.x, min.z, max.x, max.z, [...sim.world.prims, ...sim.state.worldDelta.dynPrims]);
  const touch = (w: Walker & { alive: boolean }) => {
    if (!w.alive) return;
    if (w.pos.x < min.x - m || w.pos.x > max.x + m || w.pos.y < min.y - m || w.pos.y > max.y + m || w.pos.z < min.z - m || w.pos.z > max.z + m) return;
    if (w.medium !== 'air') walkerSurfaceChanged(sim.field, w, sim.kernel.walker);
    const s = w.nav.loco;
    if (s) { s.planTick = -1; s.open = -1; }
  };
  for (const a of sim.stores.ants.list) touch(a);
  for (const c of sim.stores.creatures.list) touch(c);
}

/** GDD 04 E20: no walker outside [8 BU, side - 8 BU] in x and z. */
export const invariants: readonly SimInvariant[] = [{
  name: 'walker-in-bounds',
  check(sim, fail) {
    const lo = rt(sim).P.edgeHard, hi = sim.world.size - lo, eps = 1e-6;
    const test = (kind: string, id: number, p: Vec3) => {
      if (p.x < lo - eps || p.x > hi + eps || p.z < lo - eps || p.z > hi + eps) fail(`${kind} ${id} outside the map limit at ${JSON.stringify(p)}`);
    };
    for (const a of sim.state.ants) if (a.alive) test('ant', a.id, a.pos);
    for (const c of sim.state.creatures) if (c.alive) test('creature', c.id, c.pos);
  },
}, {
  // architecture §5 "no stuck-agent explosions": most walkers with a request must be making progress
  name: 'walker-stuck-explosion',
  check(sim, fail) {
    const P = rt(sim).P, now = sim.state.tick, limit = P.stuckExplosionTicks;
    let moving = 0, stuck = 0;
    for (const a of sim.state.ants) {
      const s = a.alive ? a.nav.loco : undefined;
      if (!s || s.req === 'none' || s.req === 'wander' || a.nav.status !== 'moving') continue;
      moving++;
      if (now - Math.max(s.bestTick, s.reqTick) > limit) stuck++;
    }
    if (moving >= P.stuckExplosionMin && stuck > P.stuckExplosionFrac * moving) {
      fail(`${stuck} of ${moving} moving walkers without progress for > ${limit} ticks`);
    }
  },
}, {
  // viab-loco item 1: no ant spends stallWindowS (600 ticks) with nav status 'moving' within stallMoveBU (0.25 BU)
  // of one point, failed and re-issued walks added up; stallWatch.ts says which time does not count (possessed,
  // cold-held, stunned, airborne, override-held). Each violation names the position, state, target and normal.
  name: 'walker-stall',
  check(sim, fail) {
    for (const st of stalledAnts(sim, rt(sim))) fail(formatStall(st));
  },
}];

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.teleport': (sim, c) => {
    const ant = sim.stores.ants.get(c.antId);
    if (ant && !placeOnSurface(sim, ant, c.pos)) {
      ant.pos = { ...c.pos };
      ant.prevPos = { ...c.pos };
    }
  },
};
