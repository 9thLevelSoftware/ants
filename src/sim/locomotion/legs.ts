// Following one leg of a trip: a direct seek, nav-grid waypoints, a cached flow field, a nest distance field or a
// climb route. Each call writes the desired world direction (unnormalised; zero = stand) and returns whether the
// leg goes on, is done, or failed, plus its progress metric (mm, lower is better) for stuck detection.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, Walker } from '@/sim/types';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { dist3 as dist3Imp, distXZ as distXZImp, set3 as set3Imp } from './mathx';
import { ensureField as ensureFieldImp, entranceById as entranceByIdImp } from './nests';
import type { LocoRuntime } from './runtime';
import { routeById as routeByIdImp } from './routes';
import type { NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const isLocoNavGrid = isLocoNavGridImp, dist3 = dist3Imp, distXZ = distXZImp, set3 = set3Imp, entranceById = entranceByIdImp, ensureField = ensureFieldImp, routeById = routeByIdImp;

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
  // the final seek never ends by itself: only the trip's arrival test ends it (no replan loop at the goal)
  if (s.seekFinal === 1) return result('go', Math.max(0, d - w.footOffset));
  if (d <= r.P.wpReach * 0.5) return result('done', d);
  // horizontal surface seek: the target may be above or below (a mound, a stone); close enough in plan view
  if (w.medium === 'surface' && distXZ(w.pos, s.seekTarget) <= r.P.wpReach * 0.4 && Math.abs(w.pos.y - s.seekTarget.y) < 2 * r.P.bu) {
    return result('done', d);
  }
  return result('go', d);
}

export function followPath(w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
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
  const last = w.nav.pathIdx === path.length - 1;
  // the last waypoint of a path to the trip's goal never ends the leg: only the arrival test does
  if (last && s.seekFinal === 1) return result('go', Math.max(0, d - w.footOffset), advanced);
  if (last && distXZ(w.pos, t) <= r.P.wpReach * 0.5) return result('done', d, advanced);
  return result('go', d, advanced);
}

export function followFlow(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, flow: Float32Array | null, out: Vec3): LegResult {
  const g = sim.navGrid;
  if (!flow || !isLocoNavGrid(g)) return result('done', 0);
  const d = g.flowNext(flow, w.pos, 2, _t);
  if (!Number.isFinite(d)) return result('fail', 0);
  if (d <= g.cell * 0.5) return result('done', d);
  towardXZ(out, w, _t);
  // continuous progress metric: cost left from the steering cell plus the way to it (the cell value alone is a step)
  const tc = g.cellOf(_t.x, _t.z);
  return result('go', (tc >= 0 ? flow[tc] : d) + distXZ(w.pos, _t));
}

/**
 * Nest field leg: steer to the field's lookahead sample. For exit legs at the field's seeds (the entrance mouth)
 * the walker climbs out towards the entrance; the leg ends when it is on the surface (membership change).
 */
export function followField(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, arrive: number, out: Vec3): LegResult {
  const nav = sim.nestNav;
  ensureField(sim, r, s.legField);
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

/**
 * Reach radius of route node i walked in direction dir: climbReach, but at most half the way from the previous
 * node, so closely spaced nodes around an edge (top -> lip -> underside of a table top) are each really passed:
 * a walker counted at the lip while still on the top would head for the underside across the top.
 */
function nodeReach(pts: readonly Vec3[], i: number, dir: number, w: Walker, r: LocoRuntime): number {
  const prev = pts[i - dir];
  const half = prev ? 0.5 * dist3(prev, pts[i]) : Infinity;
  return Math.max(Math.min(r.P.climbReach, half), 2 * w.footOffset);
}

/** Climb-route leg: node to node along the route in routeDir until routeEnd. */
export function followClimb(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): LegResult {
  const route = routeById(sim.world, w.nav.routeId);
  if (!route) return result('fail', 0);
  const pts = route.points;
  let advanced = false;
  const past = (i: number) => (s.routeDir > 0 ? i > s.routeEnd : i < s.routeEnd);
  while (!past(w.nav.pathIdx) && dist3(w.pos, pts[w.nav.pathIdx]) <= nodeReach(pts, w.nav.pathIdx, s.routeDir, w, r)) {
    w.nav.pathIdx += s.routeDir;
    advanced = true;
  }
  if (past(w.nav.pathIdx) || w.nav.pathIdx < 0 || w.nav.pathIdx >= pts.length) return result('done', 0, advanced);
  const t = pts[w.nav.pathIdx];
  toward3(out, w, t);
  // approach the node horizontally too: a node straight above leaves no tangent direction on the ground, so the
  // walker would keep a stale heading instead of walking into the object and climbing it
  const h = Math.hypot(out.x, out.z);
  if (h > 1e-3 * r.P.bu) { out.x += (out.x / h) * r.P.bu; out.z += (out.z / h) * r.P.bu; }
  return result('go', dist3(w.pos, t), advanced);
}
