// Trips (navTo-family requests): resolve the goal (surface point, entrance, chamber, plan field, entity, POI), then
// compose legs automatically: nest field out of the current nest -> surface path (nav-grid A*, cached entrance flow
// field, or direct) -> climb route -> entrance -> nest field to the goal. Legs are re-planned when one ends, the walker
// enters or leaves a nest, lands after a fall, the carve grid changed under it, or a moving target moved.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, TargetKind, Walker } from '@/sim/types';
import { AntFlag, nestFieldId } from '@/sim/types';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { followClimb as followClimbImp, followField as followFieldImp, followFlow as followFlowImp, followPath as followPathImp, followSeek as followSeekImp, type LegResult } from './legs';
import { copy3 as copy3Imp, dist3 as dist3Imp, distXZ as distXZImp, noise01 as noise01Imp, set3 as set3Imp } from './mathx';
import { chamberById as chamberByIdImp, chamberField as chamberFieldImp, entranceById as entranceByIdImp, exitField as exitFieldImp, isBelowGround as isBelowGroundImp, nearestOpenEntrance as nearestOpenEntranceImp, nestContaining as nestContainingImp, planField as planFieldImp, pointField as pointFieldImp } from './nests';
import { nearestRouteNode as nearestRouteNodeImp } from './routes';
import { avoidDiscs as avoidDiscsImp, avoidSig as avoidSigImp, nestEntrances as nestEntrancesImp, nestFlowKey as nestFlowKeyImp, takePlanBudget as takePlanBudgetImp, type LocoRuntime } from './runtime';
import { NO_PROGRESS, type NavScratch } from './scratch';
import { PASS_CLEAR_K } from './params';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const isLocoNavGrid = isLocoNavGridImp, followClimb = followClimbImp, followField = followFieldImp, followFlow = followFlowImp, followPath = followPathImp, followSeek = followSeekImp, copy3 = copy3Imp, dist3 = dist3Imp, distXZ = distXZImp, noise01 = noise01Imp, set3 = set3Imp, chamberById = chamberByIdImp, chamberField = chamberFieldImp, entranceById = entranceByIdImp, exitField = exitFieldImp, isBelowGround = isBelowGroundImp, nearestOpenEntrance = nearestOpenEntranceImp, nestContaining = nestContainingImp, planField = planFieldImp, pointField = pointFieldImp, nearestRouteNode = nearestRouteNodeImp, avoidDiscs = avoidDiscsImp, avoidSig = avoidSigImp, nestEntrances = nestEntrancesImp, nestFlowKey = nestFlowKeyImp, takePlanBudget = takePlanBudgetImp;

const _d: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Nest the walker is in now (-1 on the surface). In a cavity it keeps its nest (walkers do not change nests
 * underground; a walker cut off by a fill is still in its nest), else the nest whose open space contains it.
 * Walkers in the air keep their last value.
 */
export function walkerNest(sim: Sim, w: Walker, prev: number): number {
  if (w.medium === 'air') return prev;
  if (w.medium !== 'cavity') return -1;
  if (prev >= 0 && sim.stores.nests.get(prev)) return prev;
  return nestContaining(sim, w.pos, prev);
}

function colonyOf(w: Walker): number {
  const c = (w as Partial<Ant>).colony;
  return typeof c === 'number' ? c : -1;
}

export function isAutonomousAnt(w: Walker): boolean {
  const a = w as Partial<Ant>;
  return typeof a.caste === 'string' && ((a.flags ?? 0) & AntFlag.POSSESSED) === 0;
}

/**
 * Sets the steering goal: field goals as they are, point goals jittered within spread x arriveDist of the
 * destination (deterministic per walker and request), so a crowd arriving at one place spreads out instead of
 * piling up (spike-nest §5 item 12), and put back on the surface there. tripArrived uses the remaining
 * (1 - spread) x arriveDist around this goal, so an arrived walker is always within arriveDist of the destination.
 */
export function setGoal(sim: Sim, s: NavScratch, dest: Vec3, arrive: number, id: number, spread: number): void {
  if (s.goalNest >= 0 && s.goalField && !s.goalField.startsWith('loco:pt:')) { copy3(s.goal, dest); return; }
  const a = noise01(id, s.reqTick, 17) * 2 * Math.PI, rr = Math.sqrt(noise01(id, s.reqTick, 29)) * spread * arrive;
  set3(s.goal, dest.x + Math.cos(a) * rr, dest.y, dest.z + Math.sin(a) * rr);
  if (rr > 0) snapToSurface(sim, s.goal, sim.world.bu);
}

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
/** A goal farther than this from any surface is moved onto the surface below (or above, if inside a solid), BU. */
const SNAP_TOL_BU = 0.2;
const SNAP_MAX_BU = 16;

/**
 * Moves a goal point onto the walkable surface: a point in open space (a chamber's centre, a point above the
 * ground) drops onto the surface below it, a point inside a solid (y = 0 under a mound) rises to the surface above.
 * Walkers stand on the level set, so a goal off it could never satisfy the arrival test.
 */
export function snapToSurface(sim: Sim, p: Vec3, bu: number): void {
  const f = sim.field.sample(p);
  if (!Number.isFinite(f) || Math.abs(f) <= SNAP_TOL_BU * bu) return;
  const maxD = SNAP_MAX_BU * bu;
  if (f > 0) {
    const t = sim.field.sphereTrace(p, DOWN, maxD, 0);
    if (t < maxD) p.y -= t;
    return;
  }
  let y = p.y, g = f;
  for (let i = 0; i < 64 && g < 0 && y - p.y < maxD; i++) { y += Math.max(-g, 0.05 * bu); g = sim.field.sample(set3(_d, p.x, y, p.z)); }
  if (g >= 0) p.y = y;
}

/** Resolves where a target ref is now; false if it is gone. Also sets the goal nest / field for nest targets. */
export function resolveTarget(sim: Sim, kind: TargetKind, id: number, fallback: Vec3, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  s.goalNest = -1; s.goalField = '';
  switch (kind) {
    case 'ant': { const e = sim.stores.ants.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'creature': { const e = sim.stores.creatures.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'item': { const e = sim.stores.items.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'brood': { const e = sim.stores.brood.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'source': { const e = sim.stores.sources.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'marker': { const e = sim.stores.markers.get(id); if (!e) return false; copy3(out, e.pos); break; }
    case 'entrance': { const h = entranceById(sim, id); if (!h) return false; copy3(out, h.entrance.pos); return true; }
    case 'chamber': {
      const h = chamberById(sim, id);
      if (!h) return false;
      copy3(out, h.chamber.center);
      s.goalNest = h.nest.id;
      s.goalField = chamberField(sim, h.nest.id, id) || pointField(sim, r, h.chamber.center);
      return true;
    }
    case 'plan': {
      copy3(out, fallback);
      for (const n of sim.state.nests) {
        if (!n.alive || !n.digPlans.some((p) => p.id === id)) continue;
        s.goalNest = n.id;
        s.goalField = planField(sim, n.id, id);
      }
      if (s.goalNest < 0) return false;
      if (!s.goalField) s.goalField = pointField(sim, r, fallback);
      return true;
    }
    case 'nest': {
      const n = sim.stores.nests.get(id);
      if (!n) return false;
      const c = n.chambers[0];
      if (c) { copy3(out, c.center); s.goalNest = n.id; s.goalField = chamberField(sim, n.id, c.id) || pointField(sim, r, c.center); return true; }
      const e = n.entrances[0];
      if (!e) return false;
      copy3(out, e.pos);
      return true;
    }
    case 'none': return false;
    default: copy3(out, fallback); break;
  }
  if (!finite3(out)) return false;
  snapToSurface(sim, out, sim.world.bu);
  if (isBelowGround(sim, out)) {
    const n = nestContaining(sim, out);
    if (n >= 0) { s.goalNest = n; s.goalField = pointField(sim, r, out); }
  }
  return true;
}

/** Clears leg state (keeps the request). */
function resetLeg(w: Walker, s: NavScratch): void {
  w.nav.path = null; w.nav.pathIdx = 0; w.nav.routeId = -1;
  w.nav.fieldNest = -1; w.nav.fieldTarget = -1; w.nav.fieldKind = 'none';
  s.legField = ''; s.legExit = false; s.flowKey = ''; s.seekFinal = 0;
}

/** Seek leg to t; a seek to the trip's goal itself (t === s.goal) is the final one. */
function setSeek(w: Walker, s: NavScratch, t: Vec3): void {
  resetLeg(w, s);
  w.nav.mode = 'seek';
  copy3(s.seekTarget, t);
  s.seekFinal = t === s.goal ? 1 : 0;
}

function setField(w: Walker, s: NavScratch, nestId: number, field: string, exit: boolean): void {
  resetLeg(w, s);
  w.nav.mode = 'field';
  s.legField = field;
  s.legExit = exit;
  w.nav.fieldNest = nestId;
  const parts = field.split(':');
  w.nav.fieldKind = exit ? (parts[2] === 'seal' ? 'seal' : 'exit') : parts[2] === 'plan' ? 'plan' : parts[2] === 'chamber' ? 'chamber' : 'none';
  w.nav.fieldTarget = exit ? -1 : Number(parts[3] ?? -1) || -1;
}

function setClimb(w: Walker, s: NavScratch, routeId: number, from: number, to: number, thenSeek: boolean): void {
  resetLeg(w, s);
  w.nav.mode = 'climb';
  w.nav.routeId = routeId;
  s.routeDir = to >= from ? 1 : -1;
  s.routeEnd = to;
  s.routeThenSeek = thenSeek ? 1 : 0;
  w.nav.pathIdx = from;
}

/**
 * Surface leg to t: direct when close and clear, else the entrance flow field of nest `flowNest` (a trip home into
 * one's own nest), else A* (budgeted). False = no route.
 */
function planSurface(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, t: Vec3, flowNest: number): boolean {
  const g = sim.navGrid;
  const discs = isAutonomousAnt(w) ? avoidDiscs(sim, r, colonyOf(w)) : null;
  const loco = isLocoNavGrid(g) ? g : null;
  const d = distXZ(w.pos, t);
  // within one nav cell of the entrance there is nothing left for the flow field to do (it ends there): walk, and
  // climb a stone beside the hole if need be, straight to it
  const atEntrance = flowNest >= 0 && loco !== null && d <= loco.cell;
  if (d < r.P.direct && (!loco || atEntrance || loco.segmentWalkable(w.pos, t, discs))) { setSeek(w, s, t); return true; }
  if (loco && flowNest >= 0 && (!discs || discs.length === 0)) {
    const f = nestEntrances(sim, r, flowNest);
    if (f.seeds.length > 0) {
      resetLeg(w, s);
      w.nav.mode = 'path';
      s.flowKey = nestFlowKey(flowNest);
      s.flowNest = flowNest;
      return true;
    }
  }
  if (!takePlanBudget(sim, r)) { setSeek(w, s, t); s.planTick = -1; return true; }
  const path: Vec3[] = [];
  const ok = loco ? loco.findPathEx(w.pos, t, path, { discs, clearanceBu: clearanceOf(w) }) : g.findPath(w.pos, t, path);
  if (!ok) { r.stats.planFailed++; return false; }
  resetLeg(w, s);
  w.nav.mode = 'path';
  w.nav.path = path;
  w.nav.pathIdx = 0;
  // a path that ends at the trip's goal: its last waypoint behaves like the final seek
  s.seekFinal = t === s.goal ? 1 : 0;
  return true;
}

/** Clearance a walker needs in a micro-connection, BU (GDD 04 §6.1: PASS_CLEAR_K x size). */
function clearanceOf(w: Walker): number {
  const len = (w as Partial<Ant>).lengthBu;
  return PASS_CLEAR_K * (typeof len === 'number' && len > 0 ? len : 1);
}

/**
 * Leg out of carved space that belongs to no nest (natural cavity, crack, pit): to the nearest opening of the
 * natural cavity containing the walker, else straight toward the goal (the walker climbs the walls in its way).
 */
function planCavityExit(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  const bu = r.P.bu;
  const inBox = (c: { min: Vec3; max: Vec3 }, p: Vec3) => p.x >= c.min.x - bu && p.y >= c.min.y - bu && p.z >= c.min.z - bu
    && p.x <= c.max.x + bu && p.y <= c.max.y + bu && p.z <= c.max.z + bu;
  let best: { pos: Vec3; normal: Vec3 } | null = null, bd = Infinity;
  for (const c of sim.world.cavities) {
    // a goal in the same cavity is sought directly
    if (!inBox(c, w.pos) || inBox(c, s.goal)) continue;
    for (const o of c.openings) {
      const dd = dist3(w.pos, o.pos);
      if (dd < bd) { bd = dd; best = o; }
    }
  }
  if (best && bd > r.P.wpReach) {
    set3(_d, best.pos.x + best.normal.x * bu, best.pos.y + best.normal.y * bu, best.pos.z + best.normal.z * bu);
    setSeek(w, s, _d);
    return true;
  }
  setSeek(w, s, s.goal);
  return true;
}

/** Chooses the next leg from where the walker is and where the goal lies. False = no route (request fails). */
export function planLeg(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, here: number): boolean {
  const P = r.P;
  s.planTick = sim.state.tick;
  s.legNest = here;
  // a new leg has a new progress metric, but planning is not progress: the stuck window keeps running (a leg that
  // ends without the trip arriving would otherwise re-plan every tick and never count as stuck)
  s.best = NO_PROGRESS; copy3(s.anchor, w.pos);
  s.discSig = isAutonomousAnt(w) ? avoidSig(sim, r, colonyOf(w)) : 0;
  if (here < 0 && w.medium === 'cavity' && s.goalNest < 0) return planCavityExit(sim, w, s, r);
  if (here >= 0) {
    if (s.goalNest === here) {
      setField(w, s, here, s.goalField || pointField(sim, r, s.goal), false);
      return true;
    }
    const ef = exitField(sim, here);
    if (!ef) return false;
    setField(w, s, here, ef, true);
    const e = nearestOpenEntrance(sim, here, w.pos);
    s.entranceId = e ? e.id : -1;
    return true;
  }
  if (s.goalNest >= 0) {
    const e = nearestOpenEntrance(sim, s.goalNest, w.pos);
    if (!e) return false;
    s.entranceId = e.id;
    if (distXZ(w.pos, e.pos) <= e.radius + P.entranceHandover) {
      set3(_d, e.pos.x - e.dir.x * P.bu, e.pos.y - e.dir.y * P.bu, e.pos.z - e.dir.z * P.bu);
      setSeek(w, s, _d);
      return true;
    }
    const nest = sim.stores.nests.get(s.goalNest);
    const own = nest && nest.colony === colonyOf(w) ? nest.id : -1;
    return planSurface(sim, w, s, r, e.pos, own);
  }
  const groundW = sim.field.height(w.pos.x, w.pos.z), groundG = sim.field.height(s.goal.x, s.goal.z);
  const walkerUp = w.medium === 'surface' && w.pos.y - groundW > P.elevated;
  const goalUp = s.goal.y - groundG > P.elevated;
  const far = dist3(w.pos, s.goal) > P.routeGoal;
  if (goalUp) {
    const g = nearestRouteNode(sim.world, s.goal, P.routeGoal, 1);
    if (g) {
      const k = nearestRouteNode(sim.world, w.pos, P.routeSnap);
      if (walkerUp && !far) { setSeek(w, s, s.goal); return true; }
      if (k && k.route.id === g.route.id) { setClimb(w, s, g.route.id, k.idx, g.idx, true); return true; }
      if (!walkerUp) return planSurface(sim, w, s, r, g.route.points[0], -1);
    }
  }
  if (walkerUp && far) {
    const k = nearestRouteNode(sim.world, w.pos, P.routeGoal, 1);
    if (k) { setClimb(w, s, k.route.id, k.idx, 0, false); return true; }
  }
  return planSurface(sim, w, s, r, s.goal, -1);
}

/**
 * Distance from a walker to a goal point on a surface, mm: the walker's centre sits footOffset above the surface,
 * so a walker standing on the goal is at distance 0.
 */
export function surfaceDist(w: Walker, p: Vec3): number {
  return Math.max(0, dist3(w.pos, p) - w.footOffset);
}

/** Whether the trip has arrived (goal field reached inside the goal nest, or within arriveDist of the goal). */
export function tripArrived(sim: Sim, w: Walker, s: NavScratch, here: number, spread: number): boolean {
  const nav = w.nav;
  if (s.goalNest >= 0 && s.goalField && !s.goalField.startsWith('loco:pt:')) {
    if (here !== s.goalNest) return false;
    if (!sim.nestNav.hasTarget(s.goalField)) return false;
    const d = sim.nestNav.distanceAt(s.goalField, w.pos);
    return d <= Math.max(nav.arriveDist, 1.5 * sim.carve.voxel);
  }
  return surfaceDist(w, s.goal) <= (1 - spread) * nav.arriveDist || surfaceDist(w, nav.dest) <= 0.25 * nav.arriveDist;
}

/** The current leg is the last one of the trip (the walker brakes on it so it does not overshoot the goal). */
export function finalLeg(w: Walker, s: NavScratch): boolean {
  const nav = w.nav;
  if (nav.mode === 'seek') return s.seekFinal === 1;
  if (nav.mode === 'path') return s.seekFinal === 1 && nav.path !== null && nav.pathIdx >= nav.path.length - 1;
  return nav.mode === 'field' && !s.legExit && s.goalNest >= 0;
}

/** The avoid discs changed since the current surface leg was planned. */
export function discsChanged(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  return isAutonomousAnt(w) && avoidSig(sim, r, colonyOf(w)) !== s.discSig;
}

/** Follows the current leg; leg ends trigger an immediate re-plan (bounded per tick). */
export function followLeg(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
  set3(out, 0, 0, 0);
  switch (w.nav.mode) {
    case 'seek': return followSeek(w, s, r, out);
    case 'path': {
      if (s.flowKey) return followFlow(sim, w, s, r, legFlow(sim, s, r), out);
      return followPath(w, s, r, out);
    }
    case 'field': return followField(sim, w, s, r, w.nav.arriveDist, out);
    case 'climb': return followClimb(sim, w, s, r, out);
    default: return { state: 'done', metric: 0, advanced: false };
  }
}

/** Distance array of the flow-field leg (the leg's nest entrances), or null. */
export function legFlow(sim: Sim, s: NavScratch, r: LocoRuntime): Float32Array | null {
  const g = sim.navGrid;
  if (!s.flowKey || !isLocoNavGrid(g)) return null;
  const f = nestEntrances(sim, r, s.flowNest);
  return f.seeds.length > 0 ? g.flowField(s.flowKey, f.sig, f.seeds) : null;
}

/** After a climb leg: seek the goal or re-plan. */
export function afterClimb(w: Walker, s: NavScratch): boolean {
  if (s.routeThenSeek) { setSeek(w, s, s.goal); return true; }
  return false;
}

/** Initialises a goto request on the walker (nav fields + scratch). */
export function startTrip(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, dest: Vec3, kind: TargetKind, id: number,
  arrive: number, wid: number): boolean {
  const nav = w.nav;
  if (!finite3(dest) || !resolveTarget(sim, kind, id, dest, s, r, nav.dest) || !finite3(nav.dest)) return false;
  nav.destKind = kind; nav.destId = id; nav.arriveDist = arrive;
  nav.status = 'moving'; nav.stuckTicks = 0;
  s.req = 'goto'; s.reqTick = sim.state.tick; s.retargetTick = sim.state.tick;
  setGoal(sim, s, nav.dest, arrive, wid, r.P.spread);
  s.planTick = -1; s.ladder = 0; s.episodes = 0; s.relocations = 0; s.entranceId = -1;
  s.best = NO_PROGRESS; s.bestTick = sim.state.tick;
  setSeek(w, s, s.goal);
  // feasibility: a goal inside a nest needs an open entrance unless the walker is already in that nest
  if (s.goalNest >= 0 && w.medium !== 'cavity' && !nearestOpenEntrance(sim, s.goalNest, w.pos)) return false;
  return true;
}

export function finite3(p: Vec3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Field id helper for nest field requests. */
export function fieldIdFor(sim: Sim, nestId: number, kind: 'exit' | 'seal' | 'chamber' | 'plan', target: number): string {
  const id = nestFieldId(nestId, { kind, id: kind === 'exit' || kind === 'seal' ? -1 : target });
  return sim.nestNav.hasTarget(id) ? id : '';
}
