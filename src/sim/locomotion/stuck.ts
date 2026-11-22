// Stuck detection and the recovery ladder. A goal-directed request is stuck when its leg's progress metric did not
// improve by stuckProgress within stuckWindow. Each stuck episode climbs the ladder one rung per window:
//   1 replan   2 sidestep   3 back off   4 re-snap to the surface   5 relocate along the route (event `ant-unstuck`)
//   6 fail.
// Progress resets the rung. A stall is judged against the walker's own speed too: the window elapses only once the
// walker could have covered stuckTravel since its last progress (a walker crawling in the cold is not stuck). Episodes and relocations per request are capped, and every request has a timeout,
// so no walker can loop forever: it arrives or reports `failed`. Relocation is a last resort that terminates across
// requests too (loco-fix3): a walker is never relocated twice from one place. It remembers its last relocMemory
// relocations (from and to, no time limit); stuck again at one of those places, it lets go instead (a drop, at most
// once per relocRepeatS), else its walk fails with reason 'stuck-repeat' where rung 5 would relocate (the other
// rungs, which move nobody, still run).
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
  if (metric < s.best - r.P.stuckProgress) {
    s.best = metric;
    if (!beyondEpisode(s, w, metric, r)) return;
    s.bestTick = tick; s.ladder = 0;
    return;
  }
  // climbing counts (viab-loco, int-1B Addendum 3 item 11): on a steep face a new highest point (anchor.y: the
  // highest point since the leg, waypoint or ladder rung began) re-baselines the metric, so a tall board is climbed
  // and descended, not laddered mid-climb; going up and down the same wall is not progress
  if (Math.abs(w.up.y) < r.P.pinnedUpY && w.pos.y > s.anchor.y + r.P.stuckProgress) {
    s.best = metric; s.anchor.y = w.pos.y;
    if (!beyondEpisode(s, w, metric, r)) return;
    s.bestTick = tick; s.ladder = 0;
  }
}

/** Leg signature of the stuck-episode record (NavScratch.epLeg). */
function legKey(w: Walker, s: NavScratch): string {
  return `${w.nav.mode}|${s.flowKey}|${s.legField}|${s.legNest}`;
}

/**
 * A walker on a rung of the ladder made real progress: on the leg it got stuck on, its metric is below the best it
 * had reached before the episode began, or it stands higher than it had climbed; on another leg (the replan changed
 * the way, so the metrics differ) any progress counts. Without this a walker jittering at the foot of an undercut
 * root (sweep 8, playground-park #1: six foragers lost at one point 82 BU from home) beat the fresh baseline that
 * each rung's replan set by the stuckProgress margin every few seconds, the rung went back to 0 at every window, and
 * the ladder never reached the rungs that move the walker; its walk failed by episodes, the forager asked again,
 * and so on until RETURN_LOST_S.
 */
function beyondEpisode(s: NavScratch, w: Walker, metric: number, r: LocoRuntime): boolean {
  if (s.ladder === 0 || s.epBest === undefined || s.epLeg !== legKey(w, s)) return true;
  const P = r.P;
  return metric < s.epBest - P.stuckProgress || w.pos.y > (s.epTop ?? Infinity) + P.stuckProgress;
}

/**
 * Counts the distance the walker can cover this step at its commanded speed (mm/s) toward the stall allotment;
 * a new bestTick (progress, a ladder rung, a new request) starts the count again. A walker slower than stuckCrawl
 * (held still by the cold) counts nothing. Call once per step, after the request logic.
 */
export function accrueTravel(s: NavScratch, speed: number, dt: number, P: LocoRuntime['P']): void {
  if (s.stallFrom !== s.bestTick) { s.stallFrom = s.bestTick; s.stallTravel = 0; }
  s.stallTravel = (s.stallTravel ?? 0) + (speed >= P.stuckCrawl ? speed * dt : 0);
}

/**
 * Holds the stall window of a walker that stands this step for a reason that excuses it (dozing, stunned): the
 * window start moves on by the ticks of the step (`ticks`: 1, or the LOD step of a walker stepped every k ticks), and
 * the travel count stays with it, so the walker resumes where it was when it walks again.
 */
export function pauseStall(s: NavScratch, tick: number, ticks: number): void {
  const b = Math.min(tick, s.bestTick + ticks);
  if (s.stallFrom === s.bestTick) s.stallFrom = b;
  s.bestTick = b;
}

/**
 * Since its last progress the walker could not yet have covered stuckTravel at its own speed (it crawls in the
 * cold, or stands still with speed 0): too early to call it stuck, whatever the clock says. A walker whose count
 * does not belong to its current bestTick (none taken yet) is judged by the window alone.
 */
export function travelShort(s: NavScratch, P: LocoRuntime['P']): boolean {
  return s.stallFrom === s.bestTick && (s.stallTravel ?? 0) < P.stuckTravel;
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
  if (tick - s.bestTick <= P.stuckWindowS * TICKS_PER_SECOND || tick < s.ladderUntil || travelShort(s, P)) return 'none';
  const st = r.stats;
  if (s.ladder === 0) {
    s.episodes++;
    st.stuckEpisodes++;
    if (s.episodes > P.episodesMax) return 'fail';
    // what the walker had reached before this episode (trackProgress: the bar for progress while on a rung)
    s.epBest = s.best; s.epTop = s.anchor.y; s.epLeg = legKey(w, s);
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
      if (repeatHere(w, s, P)) return escalate(sim, w, s, r, id, tick);
      if (s.relocations >= P.relocateMax) return 'fail';
      set3(_from, w.pos.x, w.pos.y, w.pos.z);
      if (!relocate(sim, w, target, r)) return 'fail';
      s.relocations++;
      remember(s, _from, w.pos, tick, P.relocMemory);
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
  if (tick - s.bestTick <= P.wanderStallS * TICKS_PER_SECOND || travelShort(s, P)) return 'go';
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

/** Records a relocation (from -> to, mm) in the walker's memory: the newest relocMemory relocations are kept. */
function remember(s: NavScratch, from: Vec3, to: Vec3, tick: number, memory: number): void {
  const h = s.relocHist ?? (s.relocHist = []);
  h.push(from.x, from.y, from.z, to.x, to.y, to.z);
  if (h.length > 6 * memory) h.splice(0, h.length - 6 * memory);
  s.relocTick = tick;
  s.relocFrom = { x: from.x, y: from.y, z: from.z };
  s.relocTo = { x: to.x, y: to.y, z: to.z };
  s.relocRepeat = 0;
}

/**
 * The walker is stuck within relocRepeat of a place one of its remembered relocations started or ended at, however
 * long ago (AC2 of loco-fix3: no walker is relocated twice from the same place). Saves from before relocHist keep
 * only the last relocation, in relocFrom / relocTo.
 */
function repeatHere(w: Walker, s: NavScratch, P: LocoRuntime['P']): boolean {
  const R2 = P.relocRepeat * P.relocRepeat, p = w.pos;
  const h = s.relocHist;
  if (h === undefined) {
    const near = (q: Vec3 | undefined) => q !== undefined && dist3(p, q) <= P.relocRepeat;
    return near(s.relocFrom) || near(s.relocTo);
  }
  for (let i = 0; i + 2 < h.length; i += 3) {
    const dx = p.x - h[i], dy = p.y - h[i + 1], dz = p.z - h[i + 2];
    if (dx * dx + dy * dy + dz * dz <= R2) return true;
  }
  return false;
}

/**
 * Stuck again where it was relocated: the walker lets go (drops off the spot; nothing is teleported) if it has not
 * let go within relocRepeatTicks, else the walk fails with 'stuck-repeat'. One log line per escalation.
 */
function escalate(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, tick: number): StuckAction {
  s.relocRepeat = (s.relocRepeat ?? 0) + 1;
  const lastDrop = s.relocDropTick;
  if (w.medium !== 'air' && (lastDrop === undefined || tick - lastDrop > r.P.relocRepeatTicks)) {
    walkerLetGo(sim.field, w, 0, sim.kernel.walker);
    s.relocDropTick = tick;
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
 * lookahead that ends where the walker stands, the mouth of an exit field) would move nobody: then the walker is
 * moved 2 x relocMin (at most the whole way) toward its destination; a destination closer than relocMin too leaves
 * nothing to relocate toward (false: the rung fails the walk, nothing is counted or emitted). Emits `ant-unstuck`
 * (no log line: one per escalation only).
 */
function relocate(sim: Sim, w: Walker, target: Vec3, r: LocoRuntime): boolean {
  set3(_from, w.pos.x, w.pos.y, w.pos.z);
  const maxD = 6 * r.P.bu, minD = r.P.relocMin;
  let tx = target.x - w.pos.x, ty = target.y - w.pos.y, tz = target.z - w.pos.z;
  if (Math.hypot(tx, ty, tz) < minD) {
    const g = w.nav.dest, gx = g.x - w.pos.x, gy = g.y - w.pos.y, gz = g.z - w.pos.z, gl = Math.hypot(gx, gy, gz);
    if (!(gl > minD)) return false;
    const k = Math.min(gl, 2 * minD) / gl;
    tx = gx * k; ty = gy * k; tz = gz * k;
  }
  const d = Math.hypot(tx, ty, tz);
  const k = d > maxD ? maxD / d : 1;
  set3(_p, w.pos.x + tx * k, w.pos.y + ty * k, w.pos.z + tz * k);
  set3(_t, tx, ty, tz);
  if (!walkerPlace(sim.field, w, _p, { dir: { x: 0, y: -1, z: 0 }, heading: _t }, sim.kernel.walker)) return false;
  r.stats.relocations++;
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
