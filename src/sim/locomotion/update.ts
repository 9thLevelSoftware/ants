// Per-tick navigation update of one autonomous walker: runs its request (trip, field, climb, wander, trail,
// retrace), tracks progress, climbs the recovery ladder when stuck, and returns the speed (mm/s) with the desired
// world direction (unnormalised; zero = stand). Arrival and failure set nav.status and end the request.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, Walker } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { followClimb as followClimbImp, followField as followFieldImp, type LegResult } from './legs';
import { copy3 as copy3Imp, dist3 as dist3Imp, set3 as set3Imp } from './mathx';
import { retraceDesired as retraceDesiredImp, trailDesired as trailDesiredImp, wanderDesired as wanderDesiredImp } from './modes';
import { routeById as routeByIdImp } from './routes';
import type { LocoRuntime } from './runtime';
import type { NavScratch } from './scratch';
import { aiSpeed as aiSpeedImp } from './speed';
import { checkStuck as checkStuckImp, ladderOverride as ladderOverrideImp, trackMovement as trackMovementImp, trackProgress as trackProgressImp } from './stuck';
import { afterClimb as afterClimbImp, followLeg as followLegImp, planLeg as planLegImp, resolveTarget as resolveTargetImp, setGoal as setGoalImp, tripArrived as tripArrivedImp, walkerNest as walkerNestImp } from './trip';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const isLocoNavGrid = isLocoNavGridImp, followClimb = followClimbImp, followField = followFieldImp, copy3 = copy3Imp, dist3 = dist3Imp, set3 = set3Imp, retraceDesired = retraceDesiredImp, trailDesired = trailDesiredImp, wanderDesired = wanderDesiredImp, routeById = routeByIdImp, aiSpeed = aiSpeedImp, checkStuck = checkStuckImp, ladderOverride = ladderOverrideImp, trackMovement = trackMovementImp, trackProgress = trackProgressImp, afterClimb = afterClimbImp, followLeg = followLegImp, planLeg = planLegImp, resolveTarget = resolveTargetImp, setGoal = setGoalImp, tripArrived = tripArrivedImp, walkerNest = walkerNestImp;

const _target: Vec3 = { x: 0, y: 0, z: 0 }, _tmp: Vec3 = { x: 0, y: 0, z: 0 };
const MOVING_KINDS = new Set(['ant', 'creature', 'item', 'brood']);
const MAX_LEG_SWITCHES = 3;

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

export function fail(w: Walker, s: NavScratch, r: LocoRuntime): void {
  w.nav.status = 'failed';
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
      const g = sim.navGrid;
      if (s.flowKey && isLocoNavGrid(g)) {
        copy3(out, w.pos);
        return true;
      }
      return false;
    }
    case 'field': return Number.isFinite(sim.nestNav.lookahead(s.legField, w.pos, r.P.relocateSteps, out));
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
  trackProgress(s, res.metric, res.advanced, sim.state.tick, r);
  const hasTarget = legTarget(sim, w, s, r, _target);
  const act = checkStuck(sim, w, s, r, id, hasTarget ? _target : w.nav.dest);
  if (act === 'fail') { fail(w, s, r); return false; }
  if (act === 'replan') s.planTick = -1;
  ladderOverride(w, s, sim.state.tick, out);
  return true;
}

function tripUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, out: Vec3): boolean {
  const tick = sim.state.tick, nav = w.nav;
  if (s.timeoutTick >= 0 && tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r); return false; }
  const here = walkerNest(sim, w, nestIdOf(w));
  if (nav.destId >= 0 && MOVING_KINDS.has(nav.destKind) && tick - s.retargetTick >= r.P.retargetS * TICKS_PER_SECOND) {
    s.retargetTick = tick;
    copy3(_tmp, nav.dest);
    if (!resolveTarget(sim, nav.destKind, nav.destId, nav.dest, s, r, nav.dest)) { fail(w, s, r); return false; }
    setGoal(s, nav.dest, nav.arriveDist, id, r.P.spread);
    if (dist3(_tmp, nav.dest) > r.P.retarget) s.planTick = -1;
  }
  if (tripArrived(sim, w, s, here, r.P.spread)) { arrive(w, s, r); return false; }
  if (s.planTick < 0 || here !== s.legNest) {
    if (!planLeg(sim, w, s, r, here)) { fail(w, s, r); return false; }
  }
  let res = followLeg(sim, w, s, r, out);
  for (let k = 0; k < MAX_LEG_SWITCHES && res.state !== 'go'; k++) {
    if (res.state === 'done' && nav.mode === 'climb' && afterClimb(w, s)) { res = followLeg(sim, w, s, r, out); continue; }
    if (!planLeg(sim, w, s, r, here)) { fail(w, s, r); return false; }
    const prev = res.state;
    res = followLeg(sim, w, s, r, out);
    if (prev === 'fail' && res.state === 'fail') { fail(w, s, r); return false; }
  }
  if (res.state === 'fail') { fail(w, s, r); return false; }
  return stuckStep(sim, w, s, r, id, res, out);
}

function fieldUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, out: Vec3): boolean {
  if (s.timeoutTick >= 0 && sim.state.tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r); return false; }
  const res = followField(sim, w, s, r, w.nav.arriveDist, out);
  if (res.state === 'done') { arrive(w, s, r); return false; }
  if (res.state === 'fail') { fail(w, s, r); return false; }
  return stuckStep(sim, w, s, r, id, res, out);
}

function climbUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, out: Vec3): boolean {
  if (s.timeoutTick >= 0 && sim.state.tick > s.timeoutTick) { r.stats.timeouts++; fail(w, s, r); return false; }
  const res = followClimb(sim, w, s, r, out);
  if (res.state === 'done') { arrive(w, s, r); return false; }
  if (res.state === 'fail') { fail(w, s, r); return false; }
  return stuckStep(sim, w, s, r, id, res, out);
}

/** Runs the walker's request; returns the speed (mm/s) and writes the desired direction into out. */
export function aiUpdate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, dt: number, out: Vec3): number {
  set3(out, 0, 0, 0);
  const tick = sim.state.tick;
  let go = false;
  switch (s.req) {
    case 'goto': go = tripUpdate(sim, w, s, r, id, out); break;
    case 'field': go = fieldUpdate(sim, w, s, r, id, out); break;
    case 'climb': go = climbUpdate(sim, w, s, r, id, out); break;
    case 'wander':
      wanderDesired(w, s, r, id, tick, dt, out);
      trackMovement(w, s, tick, r);
      checkStuck(sim, w, s, r, id, null);
      ladderOverride(w, s, tick, out);
      go = true;
      break;
    case 'trail': {
      const v = trailDesired(sim, w, s, r, id, tick, dt, out);
      s.trailLostS = v > 0 ? 0 : s.trailLostS + dt;
      if (s.trailLostS >= r.P.trailLostS) { fail(w, s, r); break; }
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
  const v = aiSpeed(sim, w, s, r.P);
  w.nav.desiredSpeed = v;
  return v;
}
