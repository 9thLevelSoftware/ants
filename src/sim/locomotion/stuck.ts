// Stuck detection and the recovery ladder. A goal-directed request is stuck when its leg's progress metric did not
// improve by stuckProgress within stuckWindow. Each stuck episode climbs the ladder one rung per window:
//   1 replan   2 sidestep   3 back off   4 re-snap to the surface   5 relocate along the route (event `ant-unstuck`)
//   6 fail.
// Progress resets the rung. Episodes and relocations per request are capped, and every request has a timeout,
// so no walker can loop forever: it arrives or reports `failed`. Relocation is a last resort that terminates across
// requests too (loco-fix3): a walker stuck again where it was relocated (relocRepeat) lets go instead, then its walk
// fails with reason 'stuck-repeat' where rung 5 would relocate (the other rungs, which move nobody, still run).
// A wander has no goal to replan toward or relocate along: it has its own short ladder (wanderStuck): pivot on the
// spot, then fail.

import type { Vec3 } from '@/core/math/vec3';
import { createLogger } from '@/core/log';
import type { Ant, Sim, Walker } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { walkerLetGo as walkerLetGoImp, walkerPlace as walkerPlaceImp, walkerSurfaceChanged as walkerSurfaceChangedImp } from './walker';
import { dist3 as dist3Imp, normalizeInPlace as normalizeInPlaceImp, rotateTangent as rotateTangentImp, set3 as set3Imp, tangentPart as tangentPartImp } from './mathx';
import type { LocoRuntime } from './runtime';
import { NO_PROGRESS, type NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const walkerLetGo = walkerLetGoImp, walkerPlace = walkerPlaceImp, walkerSurfaceChanged = walkerSurfaceChangedImp, dist3 = dist3Imp, normalizeInPlace = normalizeInPlaceImp, rotateTangent = rotateTangentImp, set3 = set3Imp, tangentPart = tangentPartImp;

const log = createLogger('loco');
const _t: Vec3 = { x: 0, y: 0, z: 0 }, _p: Vec3 = { x: 0, y: 0, z: 0 }, _from: Vec3 = { x: 0, y: 0, z: 0 };

/** 'fail-repeat': stuck again where the walker was already relocated (nav.failReason 'stuck-repeat'). */
export type StuckAction = 'none' | 'replan' | 'fail' | 'fail-repeat';

/**
 * Updates the progress record with this tick's metric (mm, lower is better). The first metric of a new leg
 * (best = NO_PROGRESS) is only a baseline: the window keeps running from the last real progress. For goal
 * requests s.anchor.y holds the highest point climbed (see below).
 */
export function trackProgress(s: NavScratch, metric: number, advanced: boolean, tick: number, r: LocoRuntime, w: Walker): void {
  if (advanced) { s.best = metric; s.bestTick = tick; s.ladder = 0; s.anchor.y = w.pos.y; return; }
  if (s.best === NO_PROGRESS) { s.best = metric; return; }
  if (metric < s.best - r.P.stuckProgress) { s.best = metric; s.bestTick = tick; s.ladder = 0; return; }
  // climbing counts (viab-loco, int-1B Addendum 3 item 11): on a steep face a new highest point (anchor.y: the
  // highest point since the leg, waypoint or ladder rung began) re-baselines the metric, so a tall board is climbed
  // and descended, not laddered mid-climb; going up and down the same wall is not progress
  if (Math.abs(w.up.y) < r.P.pinnedUpY && w.pos.y > s.anchor.y + r.P.stuckProgress) {
    s.best = metric; s.bestTick = tick; s.ladder = 0; s.anchor.y = w.pos.y;
  }
}

/** Progress of displacement-based requests (wander, trail): moving away from the anchor counts. */
export function trackMovement(w: Walker, s: NavScratch, tick: number, r: LocoRuntime): void {
  if (dist3(w.pos, s.anchor) >= r.P.stuckProgress) {
    set3(s.anchor, w.pos.x, w.pos.y, w.pos.z);
    s.bestTick = tick;
    s.ladder = 0;
  }
}

function isAnt(w: Walker): w is Ant {
  return typeof (w as Ant).caste === 'string';
}

/**
 * Escalates when the window elapsed. `target` is the point the walker should reach next (relocation goal), or
 * null when the request has none (wander, trail). Returns what the caller must do.
 */
export function checkStuck(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, target: Vec3 | null): StuckAction {
  const tick = sim.state.tick, P = r.P;
  if (tick - s.bestTick <= P.stuckWindowS * TICKS_PER_SECOND || tick < s.ladderUntil) return 'none';
  const st = r.stats;
  if (s.ladder === 0) {
    s.episodes++;
    st.stuckEpisodes++;
    if (s.episodes > P.episodesMax) return 'fail';
  }
  s.ladder++;
  s.bestTick = tick;
  s.best = NO_PROGRESS;
  set3(s.anchor, w.pos.x, w.pos.y, w.pos.z);
  w.nav.stuckTicks = tick - s.reqTick;
  switch (s.ladder) {
    case 1: st.replans++; return target ? 'replan' : 'none';
    case 2: st.sidesteps++; s.side = -s.side; s.ladderUntil = tick + Math.round(P.sidestepS * TICKS_PER_SECOND); return 'none';
    case 3: st.backoffs++; s.ladderUntil = tick + Math.round(P.backoffS * TICKS_PER_SECOND); return 'none';
    case 4: {
      st.resnaps++;
      if (!walkerSurfaceChanged(sim.field, w, sim.kernel.walker)) walkerPlace(sim.field, w, w.pos, { dir: negUp(w) }, sim.kernel.walker);
      return target ? 'replan' : 'none';
    }
    case 5: {
      if (!target) return 'none';
      if (repeatHere(w, s, tick, P)) return escalate(sim, w, s, r, id);
      if (s.relocations >= P.relocateMax) return 'fail';
      set3(_from, w.pos.x, w.pos.y, w.pos.z);
      if (!relocate(sim, w, id, target, r)) return 'fail';
      s.relocations++;
      s.relocTick = tick;
      s.relocFrom = { x: _from.x, y: _from.y, z: _from.z };
      s.relocTo = { x: w.pos.x, y: w.pos.y, z: w.pos.z };
      s.relocRepeat = 0;
      s.ladder = 0;
      return 'replan';
    }
    default: return target ? 'fail' : 'none';
  }
}

export type WanderStuck = 'go' | 'pivot' | 'fail';

/**
 * The wander's ladder (call after trackMovement). Stalled for wanderStallS: a new episode starts a pivot of
 * wanderPivotS (the side alternates per episode). A pivot that ends without the walker having moved, or more than
 * wanderStallMax episodes in one request, fails the wander. 'pivot': the caller steers with pivotDesired.
 */
export function wanderStuck(w: Walker, s: NavScratch, r: LocoRuntime, tick: number): WanderStuck {
  const P = r.P;
  if (s.ladder === 1 && tick < s.ladderUntil) return 'pivot';
  if (tick - s.bestTick <= P.wanderStallS * TICKS_PER_SECOND) return 'go';
  // stalled: still on the pivot rung means the pivot freed nothing (any movement resets the rung)
  if (s.ladder >= 1) return 'fail';
  s.episodes++;
  r.stats.stuckEpisodes++;
  if (s.episodes > P.wanderStallMax) return 'fail';
  s.ladder = 1;
  s.side = -s.side;
  s.bestTick = tick;
  s.ladderUntil = tick + Math.round(P.wanderPivotS * TICKS_PER_SECOND);
  set3(s.anchor, w.pos.x, w.pos.y, w.pos.z);
  w.nav.stuckTicks = tick - s.reqTick;
  r.stats.sidesteps++;
  return 'pivot';
}

/**
 * Pivot direction: a quarter turn from the heading on the tangent plane, so the heading sweeps round on the spot
 * (about 24 deg a tick) and the walker steps off in the first direction it can take.
 */
export function pivotDesired(w: Walker, s: NavScratch, out: Vec3): void {
  rotateTangent(out, w.fwd, w.up, s.side * Math.PI * 0.5);
}

/** The walker is stuck within relocRepeat of where it was last relocated from or put, within relocRepeatTicks. */
function repeatHere(w: Walker, s: NavScratch, tick: number, P: LocoRuntime['P']): boolean {
  if (s.relocTick === undefined || tick - s.relocTick > P.relocRepeatTicks) return false;
  const near = (p: Vec3 | undefined) => p !== undefined && dist3(w.pos, p) <= P.relocRepeat;
  return near(s.relocFrom) || near(s.relocTo);
}

/**
 * Stuck again where it was relocated: the first time the walker lets go (drops off the spot; nothing is teleported),
 * after that the walk fails with 'stuck-repeat'. One log line per escalation.
 */
function escalate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number): StuckAction {
  const n = (s.relocRepeat ?? 0) + 1;
  s.relocRepeat = n;
  if (n === 1 && w.medium !== 'air') {
    walkerLetGo(sim.field, w, 0, sim.kernel.walker);
    r.stats.relocRepeatDrops++;
    s.ladder = 0;
    log.info(`walker ${id} stuck again at ${fmt(w.pos)} after a relocation: let go`);
    return 'replan';
  }
  r.stats.relocRepeatFails++;
  log.info(`walker ${id} stuck again at ${fmt(w.pos)}: walk failed (stuck-repeat)`);
  return 'fail-repeat';
}

function negUp(w: Walker): Vec3 {
  return set3(_t, -w.up.x, -w.up.y, -w.up.z);
}

/**
 * Moves the walker a bounded distance toward target (on the surface there). A target closer than relocMin (a field
 * lookahead that ends where the walker stands, the mouth of an exit field) moves nobody: then the point is pushed
 * relocMin along the way to the walker's destination. Emits `ant-unstuck` (no log line: one per escalation only).
 */
function relocate(sim: Sim, w: Walker, id: number, target: Vec3, r: LocoRuntime): boolean {
  set3(_from, w.pos.x, w.pos.y, w.pos.z);
  const maxD = 6 * r.P.bu;
  let tx = target.x - w.pos.x, ty = target.y - w.pos.y, tz = target.z - w.pos.z;
  if (Math.hypot(tx, ty, tz) < r.P.relocMin) {
    const g = w.nav.dest, gx = g.x - w.pos.x, gy = g.y - w.pos.y, gz = g.z - w.pos.z, gl = Math.hypot(gx, gy, gz);
    if (gl > r.P.relocMin) { const k = Math.min(gl, 2 * r.P.relocMin) / gl; tx = gx * k; ty = gy * k; tz = gz * k; }
  }
  const d = Math.hypot(tx, ty, tz);
  const k = d > maxD ? maxD / d : 1;
  set3(_p, w.pos.x + tx * k, w.pos.y + ty * k, w.pos.z + tz * k);
  set3(_t, tx, ty, tz);
  if (!walkerPlace(sim.field, w, _p, { dir: { x: 0, y: -1, z: 0 }, heading: _t }, sim.kernel.walker)) return false;
  r.stats.relocations++;
  void id;
  if (isAnt(w)) sim.emit({ type: 'ant-unstuck', antId: w.id, from: { ..._from }, to: { ...w.pos } });
  return true;
}

function fmt(p: Vec3): string {
  return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
}

/**
 * While a sidestep or back-off rung is active, replaces the desired direction (goalDir = the leg's desired
 * direction). Returns true if it did.
 */
export function ladderOverride(w: Walker, s: NavScratch, tick: number, goalDir: Vec3): boolean {
  if (tick >= s.ladderUntil || (s.ladder !== 2 && s.ladder !== 3)) return false;
  const l = tangentPart(_t, goalDir, w.up);
  if (l < 1e-9) set3(_t, w.fwd.x, w.fwd.y, w.fwd.z); else { _t.x /= l; _t.y /= l; _t.z /= l; }
  if (s.ladder === 3) { set3(goalDir, -_t.x, -_t.y, -_t.z); return true; }
  // sidestep: perpendicular on the tangent plane, a little forward
  const px = w.up.y * _t.z - w.up.z * _t.y, py = w.up.z * _t.x - w.up.x * _t.z, pz = w.up.x * _t.y - w.up.y * _t.x;
  set3(goalDir, px * s.side + 0.3 * _t.x, py * s.side + 0.3 * _t.y, pz * s.side + 0.3 * _t.z);
  normalizeInPlace(goalDir);
  return true;
}
