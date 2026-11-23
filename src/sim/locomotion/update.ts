// Per-tick navigation update of one autonomous walker: runs its request (trip, field, climb, wander, trail,
// retrace), tracks progress, climbs the recovery ladder when stuck, and returns the speed (mm/s) with the desired
// world direction (unnormalised; zero = stand). Arrival and failure set nav.status and end the request.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, NavFailReason, Sim, Walker } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { exitPoint as exitPointImp, followClimb as followClimbImp, followField as followFieldImp, type LegResult } from './legs';
import { copy3 as copy3Imp, dist3 as dist3Imp, set3 as set3Imp } from './mathx';
import { retraceDesired as retraceDesiredImp, trailDesired as trailDesiredImp, wanderDesired as wanderDesiredImp } from './modes';
import { routeById as routeByIdImp } from './routes';
import { atMouth as atMouthImp, ensureField as ensureFieldImp } from './nests';
import type { LocoRuntime } from './runtime';
import type { NavScratch } from './scratch';
import { aiSpeedCached as aiSpeedCachedImp } from './speed';
import { accrueTravel as accrueTravelImp, travelShort as travelShortImp, checkStuck as checkStuckImp, ladderOverride as ladderOverrideImp, pivotDesired as pivotDesiredImp, trackMovement as trackMovementImp, trackProgress as trackProgressImp, wanderStuck as wanderStuckImp } from './stuck';
import { walkerLetGo as walkerLetGoImp } from './walker';
import { afterClimb as afterClimbImp, discsChanged as discsChangedImp, finalLeg as finalLegImp, finite3 as finite3Imp, followLeg as followLegImp, legFlow as legFlowImp, planLeg as planLegImp, resolveTarget as resolveTargetImp, setGoal as setGoalImp, surfaceDist as surfaceDistImp, tripArrived as tripArrivedImp, walkerNest as walkerNestImp } from './trip';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const accrueTravel = accrueTravelImp, travelShort = travelShortImp;
const ensureField = ensureFieldImp;
const atMouth = atMouthImp, exitPoint = exitPointImp, walkerLetGo = walkerLetGoImp, isLocoNavGrid = isLocoNavGridImp, followClimb = followClimbImp, followField = followFieldImp, copy3 = copy3Imp, dist3 = dist3Imp, set3 = set3Imp, retraceDesired = retraceDesiredImp, trailDesired = trailDesiredImp, wanderDesired = wanderDesiredImp, routeById = routeByIdImp, aiSpeedCached = aiSpeedCachedImp, checkStuck = checkStuckImp, ladderOverride = ladderOverrideImp, pivotDesired = pivotDesiredImp, wanderStuck = wanderStuckImp, trackMovement = trackMovementImp, trackProgress = trackProgressImp, afterClimb = afterClimbImp, discsChanged = discsChangedImp, finalLeg = finalLegImp, finite3 = finite3Imp, followLeg = followLegImp, legFlow = legFlowImp, planLeg = planLegImp, resolveTarget = resolveTargetImp, setGoal = setGoalImp, surfaceDist = surfaceDistImp, tripArrived = tripArrivedImp, walkerNest = walkerNestImp;

const _target: Vec3 = { x: 0, y: 0, z: 0 }, _tmp: Vec3 = { x: 0, y: 0, z: 0 };
const MOVING_KINDS = new Set(['ant', 'creature', 'item', 'brood']);
const MAX_LEG_SWITCHES = 3;
/** Step length of field and climb requests (never LOD-skipped below the tick), s. */
const TICK_DT = 1 / TICKS_PER_SECOND;
/** Speed cap (mm/s) of the arrive behaviour, set by tripUpdate for this walker's step (Infinity = none). */
let speedCap = Infinity;

export function nestIdOf(w: Walker): number {
  const n = (w as Partial<Ant>).nestId;
  return typeof n === 'number' ? n : -1;
}

export function arrive(w: Walker, s: NavScratch, r: LocoRuntime): void {
  w.nav.status = 'arrived';
  w.nav.desiredSpeed = 0;
  s.req = 'none';
  r.stats.arrivals++;
}

/** Ends the request as failed; `reason` says why (nav.failReason, read by behaviours while the status is 'failed'). */
export function fail(w: Walker, s: NavScratch, r: LocoRuntime, reason: NavFailReason): void {
  w.nav.status = 'failed';
  w.nav.failReason = reason;
  w.nav.desiredSpeed = 0;
  s.req = 'none';
  r.stats.failures++;
}

/** The point the walker should reach next on its current leg (relocation goal) into out; false if none. */
function legTarget(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  const nav = w.nav;
  switch (nav.mode) {
    case 'seek': copy3(out, s.seekTarget); return true;
    case 'path': {
      if (nav.path && nav.path.length > 0) { copy3(out, nav.path[Math.min(nav.pathIdx, nav.path.length - 1)]); return true; }
      const g = sim.navGrid, flow = legFlow(sim, s, r);
      return flow !== null && isLocoNavGrid(g) && Number.isFinite(g.flowNext(flow, w.pos, r.P.relocateSteps, out));
    }
    case 'field': {
      ensureField(sim, r, s.legField); // a point field is a derived cache: registered again from its name after a load
      const d = sim.nestNav.lookahead(s.legField, w.pos, r.P.relocateSteps, out);
      // an exit leg at the mouth: the lookahead ends at the mouth; the way on is over the rim (legs.ts exitPoint)
      if (s.legExit && Number.isFinite(d) && d <= Math.max(w.nav.arriveDist, 1.5 * sim.carve.voxel) + r.P.bu) return exitPoint(sim, w, s, r, out) || true;
      return Number.isFinite(d);
    }
    case 'climb': {
      const route = routeById(sim.world, nav.routeId);
      if (!route) return false;
      copy3(out, route.points[Math.max(0, Math.min(route.points.length - 1, nav.pathIdx))]);
      return true;
    }
    default: return false;
  }
}

function stuckStep(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, res: LegResult, out: Vec3): boolean {
  const tick = sim.state.tick;
  trackProgress(s, res.metric, res.advanced, tick, r, w);
  // the relocation target (a field lookahead or a flow step) is only needed when the ladder may climb a rung
  if (tick - s.bestTick <= r.P.stuckWindowS * TICKS_PER_SECOND || tick < s.ladderUntil || travelShort(s, r.P)) {
    ladderOverride(w, s, tick, out);
    return true;
  }
  const hasTarget = legTarget(sim, w, s, r, _target);
  const act = checkStuck(sim, w, s, r, id, hasTarget ? _target : w.nav.dest);
  if (act === 'fail' || act === 'fail-repeat') { fail(w, s, r, act === 'fail' ? 'stuck' : 'stuck-repeat'); return false; }
  if (act === 'replan') s.planTick = -1;
  ladderOverride(w, s, sim.state.tick, out);
  return true;
}

function tripUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, dt: number, out: Vec3): boolean {
  const tick = sim.state.tick, nav = w.nav;
  if (s.timeoutTick >= 0 && tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r, 'timeout'); return false; }
  const here = mouthHold(sim, w, s, r, walkerNest(sim, w, nestIdOf(w)));
  // a moving target is re-resolved every retargetS, and every tick once the walker is close to it (arrival is
  // judged against where the target is now, not where it was up to a second ago)
  if (nav.destId >= 0 && MOVING_KINDS.has(nav.destKind)
    && (tick - s.retargetTick >= r.P.retargetS * TICKS_PER_SECOND || surfaceDist(w, nav.dest) < nav.arriveDist + r.P.retarget)) {
    s.retargetTick = tick;
    copy3(_tmp, nav.dest);
    if (!resolveTarget(sim, nav.destKind, nav.destId, nav.dest, s, r, nav.dest) || !finite3(nav.dest)) { fail(w, s, r, 'rejected'); return false; }
    setGoal(sim, s, nav.dest, nav.arriveDist, id, r.P.spread);
    if (dist3(_tmp, nav.dest) > r.P.retarget) s.planTick = -1;
  }
  if (tripArrived(sim, w, s, here, r.P.spread)) { arrive(w, s, r); return false; }
  // an avoid marker placed (or removed) while the walker is under way: plan the surface leg again
  if (here < 0 && s.planTick >= 0 && discsChanged(sim, w, s, r)) s.planTick = -1;
  if (s.planTick < 0 || here !== s.legNest) {
    if (!planLeg(sim, w, s, r, here)) { fail(w, s, r, 'no-route'); return false; }
  }
  let res = followLeg(sim, w, s, r, out);
  for (let k = 0; k < MAX_LEG_SWITCHES && res.state !== 'go'; k++) {
    if (res.state === 'done' && nav.mode === 'climb' && afterClimb(w, s)) { res = followLeg(sim, w, s, r, out); continue; }
    if (!planLeg(sim, w, s, r, here)) { fail(w, s, r, 'no-route'); return false; }
    const prev = res.state;
    res = followLeg(sim, w, s, r, out);
    if (prev === 'fail' && res.state === 'fail') { fail(w, s, r, 'leg'); return false; }
  }
  if (res.state === 'fail') { fail(w, s, r, 'leg'); return false; }
  // stuck within the arrival radius of the destination (the spread goal may be unreachable, e.g. inside a stone):
  // that is arrival, not a reason to climb the recovery ladder
  const last = finalLeg(w, s);
  const stallWindowS = last ? r.P.arriveStallS : r.P.stuckWindowS;
  if (tick - s.bestTick > stallWindowS * TICKS_PER_SECOND && surfaceDist(w, nav.dest) <= nav.arriveDist) { arrive(w, s, r); return false; }
  if ((last && dropToGoal(sim, w, s, r)) || letGoPinned(sim, w, s, r, dt)) return false;
  if (last) speedCap = arriveCap(w, s, r, res.metric, dt, out, aiSpeedCached(sim, w, s, r.P));
  return stuckStep(sim, w, s, r, id, res, out);
}

/**
 * Hysteresis at an entrance mouth (loco-fix3): on the lip a walker flips between the cavity and the surface, and
 * every flip re-planned its leg (exit field <-> surface seek), so it stayed on the rim until the ladder relocated it.
 * A walker on its way out keeps its surface leg while in the mouth; one on its way in keeps its nest leg.
 */
function mouthHold(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, here: number): number {
  const rim = r.P.entranceHandover, depth = r.P.mouthDepth;
  if (here >= 0 && s.legNest < 0 && s.goalNest !== here && atMouth(sim, here, w.pos, rim, depth)) return -1;
  if (here < 0 && s.legNest >= 0 && !s.legExit && s.goalNest === s.legNest && inNestLeg(sim, w, s, r) && atMouth(sim, s.legNest, w.pos, rim, depth)) return s.legNest;
  return here;
}

/**
 * The walker is on a nest field leg it can follow from where it stands. A new request has no leg yet, and a field
 * that does not reach the lip cannot be followed from it: holding such a walker in the nest failed its walk with
 * 'leg' on every tick, and the behaviour asked again on the next (review of loco-fix3: workers on the lip of the
 * suburban-garden #2 entrance failed thousands of walks on the spot).
 */
function inNestLeg(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  if (w.nav.mode !== 'field' || s.legField === '') return false;
  ensureField(sim, r, s.legField); // a point field is a derived cache: registered again from its name after a load
  return Number.isFinite(sim.nestNav.distanceAt(s.legField, w.pos));
}

/**
 * Pinned: standing (every step rejected), no progress for pinnedS. Let go and drop; the request goes on from there
 * (a trip plans its leg again after the landing). In a cavity: on a wall, fin or overhang (up.y < pinnedUpY). On the
 * surface (viab-loco, int-1B Addendum 3 item 11):
 * hanging on a wall or under a stone's bulge, or standing on a raised edge (a thin leaf tip the walker cannot wrap
 * round) with its next point at least dropBelow lower, or upside down (up.y < ceilingUpY) under a sheet or a
 * bulge it keeps circling with the next point lower: the ant steps off and falls (GDD 01 `let-go`), once per stuck
 * window. The window is not restarted: a walker that lands back on the same spot (a step it cannot take at a
 * crease of the field, a crack it is wedged in) climbs the recovery ladder. `dt`: the step's seconds (LOD). True if
 * the walker let go.
 */
function letGoPinned(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, dt: number): boolean {
  const P = r.P, tick = sim.state.tick;
  if (w.medium === 'air') return false;
  const since = tick - Math.max(s.bestTick, s.reqTick), pinned = P.pinnedS * TICKS_PER_SECOND;
  if (since <= pinned) return false;
  const hanging = w.up.y < P.pinnedUpY;
  // standing: once per stuck window (a walker that lands back on the same spot, wedged in a crack or at a crease of
  // the field, climbs the recovery ladder; restarting the window here kept such walkers dropping in place for game
  // hours: viab-loco, playground-park #2)
  const firstTick = since <= pinned + Math.max(1, Math.round(dt * TICKS_PER_SECOND));
  if (w.medium === 'cavity') {
    if (!hanging || w.speed > 0 || !firstTick) return false;
  } else if (w.speed === 0) {
    // hanging, or at an edge above the next point
    if (!firstTick || (!hanging && !nextPointBelow(sim, w, s, r))) return false;
  } else if (!(w.up.y < P.ceilingUpY && nextPointBelow(sim, w, s, r))) {
    // walking: upside down under a sheet or a bulge it keeps circling (it can wrap round the sheet's rim but not
    // get down from it) with the next point below
    return false;
  }
  walkerLetGo(sim.field, w, 0, sim.kernel.walker);
  s.planTick = -1;
  r.stats.drops++;
  return true;
}

/** The point the walker heads for next (leg target, else the goal) lies at least dropBelow below it. */
function nextPointBelow(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  const t = legTarget(sim, w, s, r, _target) ? _target : s.req === 'goto' ? s.goal : null;
  return t !== null && t.y < w.pos.y - w.footOffset - r.P.dropBelow;
}

/**
 * Upside down on a cavity ceiling with the goal lower down and nearly below: let go and drop (GDD 01 `let-go`). A
 * surface walker cannot walk off a ceiling toward a point across the cavity: the direction has no tangent part. The
 * leg is planned again after the landing. True if the walker let go.
 */
function dropToGoal(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime): boolean {
  const P = r.P;
  if (w.medium !== 'cavity' || w.up.y >= P.ceilingUpY || s.goal.y > w.pos.y - P.dropBelow) return false;
  if (Math.hypot(s.goal.x - w.pos.x, s.goal.z - w.pos.z) > P.dropAbove) return false;
  walkerLetGo(sim.field, w, 0, sim.kernel.walker);
  s.planTick = -1;
  r.stats.drops++;
  return true;
}

/**
 * Arrive behaviour on the last leg: never cover more than about half the distance left in one step, and pivot
 * toward a goal that lies beside or behind the walker when it is within a few turning radii.
 */
function arriveCap(w: Walker, s: NavScratch, r: LocoRuntime, fieldMetric: number, dt: number, dir: Vec3, cruise: number): number {
  const P = r.P;
  const left = w.nav.mode === 'seek' || !s.goalField || s.goalField.startsWith('loco:pt:')
    ? Math.max(0, surfaceDist(w, s.goal) - (1 - P.spread) * 0.5 * w.nav.arriveDist)
    : fieldMetric;
  let cap = left / Math.max(P.brakeS, 2 * dt);
  // the turning circle at the speed the walker will really have (the cap, or its cruise if lower): a cap derived
  // from a long distance left would put every goal "within a few turning radii" and pivot far from the goal
  const turnRadius = Math.min(cap, cruise) / P.aiTurn;
  if (left < P.arriveTurnRadii * Math.max(turnRadius, P.bu)) {
    const u = w.up, dn = dir.x * u.x + dir.y * u.y + dir.z * u.z;
    const tx = dir.x - u.x * dn, ty = dir.y - u.y * dn, tz = dir.z - u.z * dn, tl = Math.hypot(tx, ty, tz);
    if (tl > P.minSteer * Math.hypot(dir.x, dir.y, dir.z)) {
      const c = (tx * w.fwd.x + ty * w.fwd.y + tz * w.fwd.z) / tl;
      // pivot almost on the spot: a little forward creep keeps the walker from standing (it turns 24 deg a tick)
      cap *= Math.max(c, P.pivotCreep);
    }
  }
  return cap;
}

function fieldUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, out: Vec3): boolean {
  if (s.timeoutTick >= 0 && sim.state.tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r, 'timeout'); return false; }
  const res = followField(sim, w, s, r, w.nav.arriveDist, out);
  if (res.state === 'done') { arrive(w, s, r); return false; }
  if (res.state === 'fail') { fail(w, s, r, 'leg'); return false; }
  if (letGoPinned(sim, w, s, r, TICK_DT)) return false;
  return stuckStep(sim, w, s, r, id, res, out);
}

function climbUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, out: Vec3): boolean {
  if (s.timeoutTick >= 0 && sim.state.tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r, 'timeout'); return false; }
  const res = followClimb(sim, w, s, r, out);
  if (res.state === 'done') { arrive(w, s, r); return false; }
  if (res.state === 'fail') { fail(w, s, r, 'leg'); return false; }
  return stuckStep(sim, w, s, r, id, res, out);
}

/** Runs the walker's request; returns the speed (mm/s) and writes the desired direction into out. */
export function aiUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, dt: number, out: Vec3): number {
  set3(out, 0, 0, 0);
  const tick = sim.state.tick;
  let go = false;
  speedCap = Infinity;
  switch (s.req) {
    case 'goto': go = tripUpdate(sim, w, s, r, id, dt, out); break;
    case 'field': go = fieldUpdate(sim, w, s, r, id, out); break;
    case 'climb': go = climbUpdate(sim, w, s, r, id, out); break;
    case 'wander': {
      trackMovement(w, s, tick, r);
      if (letGoPinned(sim, w, s, r, dt)) break;
      const st = wanderStuck(w, s, r, tick);
      // a failed wander also drops its mode: callers that re-issue "while not wandering" do so at once
      if (st === 'fail') { fail(w, s, r, 'wander-stall'); w.nav.mode = 'none'; break; }
      if (st === 'pivot') pivotDesired(w, s, out);
      else wanderDesired(w, s, r, id, tick, dt, out);
      go = true;
      break;
    }
    case 'trail': {
      const v = trailDesired(sim, w, s, r, id, tick, dt, out);
      s.trailLostS = v > 0 ? 0 : s.trailLostS + dt;
      if (s.trailLostS >= r.P.trailLostS) { fail(w, s, r, 'trail-lost'); break; }
      trackMovement(w, s, tick, r);
      checkStuck(sim, w, s, r, id, null);
      ladderOverride(w, s, tick, out);
      go = true;
      break;
    }
    case 'retrace': {
      const ant = w as Ant;
      if (!retraceDesired(sim, ant, s, r, out)) { arrive(w, s, r); break; }
      const res = { state: 'go' as const, metric: dist3(w.pos, w.nav.dest), advanced: false };
      // progress = distance to the current crumb; a crumb change restarts the window
      if (s.routeEnd !== s.crumbIdx) { s.routeEnd = s.crumbIdx; res.advanced = true; }
      res.metric = Math.hypot(out.x, out.y, out.z);
      go = stuckStep(sim, w, s, r, id, res, out);
      break;
    }
    default: go = false;
  }
  if (!go) { w.nav.desiredSpeed = 0; return 0; }
  const v = Math.min(aiSpeedCached(sim, w, s, r.P), speedCap);
  w.nav.desiredSpeed = v;
  accrueTravel(s, v, dt, r.P);
  return v;
}
