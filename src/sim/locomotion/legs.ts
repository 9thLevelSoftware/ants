// Following one leg of a trip: a direct seek, nav-grid waypoints, a cached flow field, a nest distance field or a
// climb route. Each call writes the desired world direction (unnormalised; zero = stand) and returns whether the
// leg goes on, is done, or failed, plus its progress metric (mm, lower is better) for stuck detection.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, Walker } from '@/sim/types';
import { isLocoNavGrid as isLocoNavGridImp } from './grid/navGridImpl';
import { dist3 as dist3Imp, distXZ as distXZImp, set3 as set3Imp } from './mathx';
import { ensureField as ensureFieldImp, entranceById as entranceByIdImp, isPointField as isPointFieldImp } from './nests';
import { avoidDiscs as avoidDiscsImp, type LocoRuntime } from './runtime';
import { routeById as routeByIdImp } from './routes';
import type { NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const avoidDiscs = avoidDiscsImp, isLocoNavGrid = isLocoNavGridImp, dist3 = dist3Imp, distXZ = distXZImp, set3 = set3Imp, entranceById = entranceByIdImp, ensureField = ensureFieldImp, isPointField = isPointFieldImp, routeById = routeByIdImp;

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
  // a descent from a stem (trip.ts planDescent) aims in 3D: the target lies below, along the stem
  if (w.medium === 'surface' && s.legNest < 0 && s.seekDown === 1) toward3(out, w, s.seekTarget);
  else if (w.medium === 'surface' && s.legNest < 0) towardXZ(out, w, s.seekTarget);
  else {
    // in carved space the target lies on a surface and the walker's centre footOffset above its own: aim at the
    // target lifted by footOffset, so a target on the same floor gives a tangent direction, not one into the floor
    const t = s.seekTarget, u = w.up, k = w.footOffset;
    set3(out, t.x + u.x * k - w.pos.x, t.y + u.y * k - w.pos.y, t.z + u.z * k - w.pos.z);
  }
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
  let d = g.flowNext(flow, w.pos, 2, _t);
  if (!Number.isFinite(d)) return result('fail', 0);
  if (d <= g.cell * 0.5) return result('done', d);
  // a line two cells ahead can cut the corner of a blocked cell (a wall the walker would climb: loco-fix3 review,
  // a trip home along a fence) or, in the disc-weighted field (trip.ts avoidFlowKey), of a cell that touches an avoid
  // disc; then steer to the next cell only
  const discs = s.flowKey.endsWith('|avoid') ? avoidDiscs(sim, r, sim.stores.nests.get(s.flowNest)?.colony ?? -1) : null;
  if (!g.gridVisible(w.pos, _t, discs !== null && discs.length > 0 ? discs : null)) d = g.flowNext(flow, w.pos, 1, _t);
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
      if (!exitPoint(sim, w, s, r, _t)) set3(out, 0, 1, 0);
      else if (w.pos.y < _t.y + w.footOffset - r.P.exitClimb) {
        // still below the rim (on the throat wall, under an overhanging lip): up first, leaning to the exit side;
        // aimed straight at the exit point it pressed into the lip and circled under it
        set3(out, 0.3 * (_t.x - w.pos.x), Math.hypot(_t.x - w.pos.x, _t.z - w.pos.z) + r.P.bu, 0.3 * (_t.z - w.pos.z));
      } else toward3(out, w, _t);
      return result('go', d);
    }
  } else if (d <= near || (s.goalNest >= 0 && isPointField(s.legField) && d <= r.P.pointSeek)) return result('done', d);
  toward3(out, w, _t);
  return result('go', d);
}

/**
 * Where an exit leg at the entrance mouth heads (into out; false without an entrance): on the ground just beyond
 * the rim, on the side of the trip's goal. The point one BU out along the entrance axis (the old aim) lies in the
 * air over a vertical shaft: a walker cannot reach it and circled the lip in and out of the hole (loco-fix3,
 * relocations at the mouth on suburban-garden #2). Also the relocation target of such a walker (update.ts).
 */
export function exitPoint(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  const hit = s.entranceId >= 0 ? entranceById(sim, s.entranceId) : null;
  if (!hit) return false;
  const e = hit.entrance, bu = r.P.bu;
  // horizontal direction from the hole to the goal, without its part along the entrance axis
  let hx = s.goal.x - e.pos.x, hz = s.goal.z - e.pos.z;
  const along = hx * e.dir.x + hz * e.dir.z;
  hx -= along * e.dir.x; hz -= along * e.dir.z;
  let l = Math.hypot(hx, hz);
  if (l < 1e-6) { hx = w.pos.x - e.pos.x; hz = w.pos.z - e.pos.z; l = Math.hypot(hx, hz); }
  if (l < 1e-6) { hx = 1; hz = 0; l = 1; }
  const k = (e.radius + r.P.exitRim) / l;
  const x = e.pos.x + e.dir.x * 0.5 * bu + hx * k, z = e.pos.z + e.dir.z * 0.5 * bu + hz * k;
  set3(out, x, sim.field.height(x, z), z);
  return true;
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
