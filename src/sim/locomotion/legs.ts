// Following one leg of a trip: a direct seek, nav-grid waypoints, a cached flow field, a nest distance field or a
// climb route. Each call writes the desired world direction (unnormalised; zero = stand) and returns whether the
// leg goes on, is done, or failed, plus its progress metric (mm, lower is better) for stuck detection.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, Walker } from '@/sim/types';
import { isLocoNavGrid } from './grid/navGridImpl';
import { dist3, distXZ, set3 } from './mathx';
import { entranceById } from './nests';
import type { LocoRuntime } from './runtime';
import { routeById } from './routes';
import type { NavScratch } from './scratch';

export type LegState = 'go' | 'done' | 'fail';

export interface LegResult {
  state: LegState;
  /** Progress metric, mm (distance still to go on this leg's current target). */
  metric: number;
  /** The current target changed (waypoint / node advanced): stuck tracking restarts. */
  advanced: boolean;
}

const _r: LegResult = { state: 'go', metric: 0, advanced: false };
const _t: Vec3 = { x: 0, y: 0, z: 0 };

function result(state: LegState, metric: number, advanced = false): LegResult {
  _r.state = state; _r.metric = metric; _r.advanced = advanced;
  return _r;
}

/** Horizontal direction to a target (surface legs: the walker climbs whatever is in between). */
function towardXZ(out: Vec3, w: Walker, t: Vec3): void {
  set3(out, t.x - w.pos.x, 0, t.z - w.pos.z);
}

function toward3(out: Vec3, w: Walker, t: Vec3): void {
  set3(out, t.x - w.pos.x, t.y - w.pos.y, t.z - w.pos.z);
}

export function followSeek(w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
  const d = dist3(w.pos, s.seekTarget);
  if (w.medium === 'surface' && s.legNest < 0) towardXZ(out, w, s.seekTarget); else toward3(out, w, s.seekTarget);
  if (d <= r.P.wpReach * 0.5) return result('done', d);
  // horizontal surface seek: the target may be above or below (a mound, a stone); close enough in plan view
  if (w.medium === 'surface' && distXZ(w.pos, s.seekTarget) <= r.P.wpReach * 0.4 && Math.abs(w.pos.y - s.seekTarget.y) < 2 * r.P.bu) {
    return result('done', d);
  }
  return result('go', d);
}

export function followPath(w: Walker, r: LocoRuntime, out: Vec3): LegResult {
  const path = w.nav.path;
  if (!path || path.length === 0) return result('done', 0);
  let advanced = false;
  while (w.nav.pathIdx < path.length - 1 && distXZ(w.pos, path[w.nav.pathIdx]) <= r.P.wpReach) {
    w.nav.pathIdx++;
    advanced = true;
  }
  const t = path[w.nav.pathIdx];
  const d = dist3(w.pos, t);
  towardXZ(out, w, t);
  if (w.nav.pathIdx === path.length - 1 && distXZ(w.pos, t) <= r.P.wpReach * 0.5) return result('done', d, advanced);
  return result('go', d, advanced);
}

export function followFlow(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, flow: Float32Array | null, out: Vec3): LegResult {
  const g = sim.navGrid;
  if (!flow || !isLocoNavGrid(g)) return result('done', 0);
  const d = g.flowNext(flow, w.pos, 2, _t);
  if (!Number.isFinite(d)) return result('fail', 0);
  if (d <= g.cell * 0.5) return result('done', d);
  towardXZ(out, w, _t);
  return result('go', d);
}

/**
 * Nest field leg: steer to the field's lookahead sample. For exit legs at the field's seeds (the entrance mouth)
 * the walker climbs out towards the entrance; the leg ends when it is on the surface (membership change).
 */
export function followField(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, arrive: number, out: Vec3): LegResult {
  const nav = sim.nestNav;
  const d = nav.lookahead(s.legField, w.pos, r.P.fieldLook, _t);
  if (!Number.isFinite(d)) return result('fail', 0);
  const near = Math.max(arrive, 1.5 * sim.carve.voxel);
  if (s.legExit) {
    if (d <= near + 0.5 * r.P.bu) {
      const hit = s.entranceId >= 0 ? entranceById(sim, s.entranceId) : null;
      if (hit) {
        const e = hit.entrance;
        set3(out, e.pos.x + e.dir.x * r.P.bu - w.pos.x, e.pos.y + e.dir.y * r.P.bu - w.pos.y, e.pos.z + e.dir.z * r.P.bu - w.pos.z);
      } else set3(out, 0, 1, 0);
      return result('go', d);
    }
  } else if (d <= near) return result('done', d);
  toward3(out, w, _t);
  return result('go', d);
}

/** Climb-route leg: node to node along the route in routeDir until routeEnd. */
export function followClimb(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
  const route = routeById(sim.world, w.nav.routeId);
  if (!route) return result('fail', 0);
  const pts = route.points;
  let advanced = false;
  const past = (i: number) => (s.routeDir > 0 ? i > s.routeEnd : i < s.routeEnd);
  while (!past(w.nav.pathIdx) && dist3(w.pos, pts[w.nav.pathIdx]) <= r.P.climbReach) {
    w.nav.pathIdx += s.routeDir;
    advanced = true;
  }
  if (past(w.nav.pathIdx) || w.nav.pathIdx < 0 || w.nav.pathIdx >= pts.length) return result('done', 0, advanced);
  const t = pts[w.nav.pathIdx];
  toward3(out, w, t);
  return result('go', dist3(w.pos, t), advanced);
}
