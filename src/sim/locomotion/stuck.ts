// Stuck detection and the recovery ladder. A goal-directed request is stuck when its leg's progress metric did not
// improve by stuckProgress within stuckWindow. Each stuck episode climbs the ladder one rung per window:
//   1 replan   2 sidestep   3 back off   4 re-snap to the surface   5 relocate along the route (logged event)
//   6 fail.
// Progress resets the rung. Episodes and relocations per request are capped, and every request has a timeout,
// so no walker can loop forever: it arrives or reports `failed`.

import type { Vec3 } from '@/core/math/vec3';
import { createLogger } from '@/core/log';
import type { Ant, Sim, Walker } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { walkerPlace as walkerPlaceImp, walkerSurfaceChanged as walkerSurfaceChangedImp } from './walker';
import { dist3 as dist3Imp, normalizeInPlace as normalizeInPlaceImp, set3 as set3Imp, tangentPart as tangentPartImp } from './mathx';
import type { LocoRuntime } from './runtime';
import { NO_PROGRESS, type NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const walkerPlace = walkerPlaceImp, walkerSurfaceChanged = walkerSurfaceChangedImp, dist3 = dist3Imp, normalizeInPlace = normalizeInPlaceImp, set3 = set3Imp, tangentPart = tangentPartImp;

const log = createLogger('loco');
const _t: Vec3 = { x: 0, y: 0, z: 0 }, _p: Vec3 = { x: 0, y: 0, z: 0 }, _from: Vec3 = { x: 0, y: 0, z: 0 };

export type StuckAction = 'none' | 'replan' | 'fail';

/** Updates the progress record with this tick's metric (mm, lower is better). */
export function trackProgress(s: NavScratch, metric: number, advanced: boolean, tick: number, r: LocoRuntime): void {
  if (advanced || s.best === NO_PROGRESS) { s.best = metric; s.bestTick = tick; return; }
  if (metric < s.best - r.P.stuckProgress) { s.best = metric; s.bestTick = tick; s.ladder = 0; }
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
      if (!target || s.relocations >= P.relocateMax) return target ? 'fail' : 'none';
      if (!relocate(sim, w, id, target, r)) return 'fail';
      s.relocations++;
      s.ladder = 0;
      return 'replan';
    }
    default: return target ? 'fail' : 'none';
  }
}

function negUp(w: Walker): Vec3 {
  return set3(_t, -w.up.x, -w.up.y, -w.up.z);
}

/** Moves the walker a bounded distance toward target (on the surface there) and logs it. */
function relocate(sim: Sim, w: Walker, id: number, target: Vec3, r: LocoRuntime): boolean {
  set3(_from, w.pos.x, w.pos.y, w.pos.z);
  const maxD = 6 * r.P.bu;
  const d = dist3(w.pos, target);
  const k = d > maxD ? maxD / d : 1;
  set3(_p, w.pos.x + (target.x - w.pos.x) * k, w.pos.y + (target.y - w.pos.y) * k, w.pos.z + (target.z - w.pos.z) * k);
  set3(_t, target.x - w.pos.x, target.y - w.pos.y, target.z - w.pos.z);
  if (!walkerPlace(sim.field, w, _p, { dir: { x: 0, y: -1, z: 0 }, heading: _t }, sim.kernel.walker)) return false;
  r.stats.relocations++;
  log.info(`relocated walker ${id} from ${fmt(_from)} to ${fmt(w.pos)}`);
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
