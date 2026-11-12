// Route memory (GDD 02 §9.3): after a successful round trip the loop-erased breadcrumbs of the outbound path
// (entrance -> source, recorded by locomotion) are simplified into at most ROUTE_WAYPOINTS_MAX waypoints. A new
// path within ROUTE_MATCH_DIST of >= 70 % of the stored waypoints counts as a repeat (visits + 1, the shorter is
// kept); otherwise it replaces the slot (visits 1). Three visits make the route learned: the ant then walks the
// waypoints both ways. Slots unused for ROUTE_FORGET_GD are cleared; the least recently used slot is replaced.
//
// The candidate is prepared at the source (crumbs still describe the outbound leg there) and committed on a
// successful delivery: `prepareRoute` stores the waypoints in a slot and returns the visits to commit.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, RouteMemory, Sim } from '@/sim/types';
import { ROUTE_WAYPOINTS_MAX } from '@/sim/balance';
import {
  ROUTE_FIX_VISITS, ROUTE_FORGET_GD, ROUTE_MATCH_DIST_BU, ROUTE_MATCH_FRACTION, ROUTE_SIMPLIFY_TOL_BU,
} from '@/sim/balance/foraging';
import { crumbAt, crumbCount } from '@/sim/locomotion';
import { daysToTicks } from '@/sim/time';
import { K } from './keys';

const pts: Vec3[] = [];
const keep: boolean[] = [];

function segDist(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

/** Douglas-Peucker over pts[i..j] (iterative stack), marking kept points. */
function simplify(tol: number): void {
  const stack: number[] = [0, pts.length - 1];
  keep.length = pts.length;
  keep.fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  while (stack.length > 0) {
    const j = stack.pop()!, i = stack.pop()!;
    let worst = -1, wd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > wd) { wd = d; worst = k; }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push(i, worst, worst, j);
    }
  }
}

/** Outbound path from the crumbs (entrance first) plus the ant's position, simplified; into `out` as x,y,z. */
export function outboundWaypoints(sim: Sim, ant: Ant, out: Float32Array): number {
  const n = crumbCount(ant);
  pts.length = 0;
  for (let i = 0; i < n; i++) pts.push(crumbAt(ant, i, { x: 0, y: 0, z: 0 }));
  pts.push({ x: ant.pos.x, y: ant.pos.y, z: ant.pos.z });
  if (pts.length < 2) return 0;
  const cap = Math.min(ROUTE_WAYPOINTS_MAX, (out.length / 3) | 0);
  let tol = ROUTE_SIMPLIFY_TOL_BU * sim.world.bu;
  let count = 0;
  for (;;) {
    simplify(tol);
    count = keep.reduce((m, k) => m + (k ? 1 : 0), 0);
    if (count <= cap) break;
    tol *= 1.5;
  }
  let w = 0;
  for (let i = 0; i < pts.length; i++) {
    if (!keep[i]) continue;
    out[3 * w] = pts[i].x; out[3 * w + 1] = pts[i].y; out[3 * w + 2] = pts[i].z;
    w++;
  }
  return w;
}

export function pathLength(wp: Float32Array, n: number): number {
  let len = 0;
  for (let i = 1; i < n; i++) {
    len += Math.hypot(wp[3 * i] - wp[3 * i - 3], wp[3 * i + 1] - wp[3 * i - 2], wp[3 * i + 2] - wp[3 * i - 1]);
  }
  return len;
}

/** Distance from p to the polyline wp[0..n), mm. */
function polyDist(p: Vec3, wp: Float32Array, n: number, a: Vec3, b: Vec3): number {
  let best = Infinity;
  for (let k = 1; k < n; k++) {
    a.x = wp[3 * k - 3]; a.y = wp[3 * k - 2]; a.z = wp[3 * k - 1];
    b.x = wp[3 * k]; b.y = wp[3 * k + 1]; b.z = wp[3 * k + 2];
    best = Math.min(best, segDist(p, a, b));
  }
  return best;
}

/**
 * Fraction of the stored route within `dist` of the new polyline. GDD 02 §9.3 compares "stored waypoints", but a
 * simplified straight route keeps only its two ends (entrance and source), which every path shares; the stored
 * route is therefore sampled every `dist` along its length.
 */
function matchFraction(stored: RouteMemory, wp: Float32Array, n: number, dist: number): number {
  if (stored.n < 2 || n < 2) return 0;
  let hits = 0, total = 0;
  const p: Vec3 = { x: 0, y: 0, z: 0 }, a: Vec3 = { x: 0, y: 0, z: 0 }, b: Vec3 = { x: 0, y: 0, z: 0 };
  const w = stored.wp;
  for (let i = 1; i < stored.n; i++) {
    const x0 = w[3 * i - 3], y0 = w[3 * i - 2], z0 = w[3 * i - 1];
    const dx = w[3 * i] - x0, dy = w[3 * i + 1] - y0, dz = w[3 * i + 2] - z0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / dist));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      p.x = x0 + (dx * k) / steps; p.y = y0 + (dy * k) / steps; p.z = z0 + (dz * k) / steps;
      total++;
      if (polyDist(p, wp, n, a, b) <= dist) hits++;
    }
  }
  return total > 0 ? hits / total : 0;
}

/** The ant's route slot for a source, or null. */
export function routeFor(ant: Ant, sourceId: number): RouteMemory | null {
  if (sourceId < 0) return null;
  for (const r of ant.mem.routes) if (r.sourceId === sourceId && r.n >= 2) return r;
  return null;
}

/** A learned route (visits >= ROUTE_FIX_VISITS) to the source, or null. */
export function learnedRoute(ant: Ant, sourceId: number): RouteMemory | null {
  const r = routeFor(ant, sourceId);
  return r && r.visits >= ROUTE_FIX_VISITS ? r : null;
}

/** Waypoint i of a route into out. */
export function waypoint(r: RouteMemory, i: number, out: Vec3): Vec3 {
  out.x = r.wp[3 * i]; out.y = r.wp[3 * i + 1]; out.z = r.wp[3 * i + 2];
  return out;
}

/** Clears route slots not used for ROUTE_FORGET_GD. */
export function forgetStaleRoutes(sim: Sim, ant: Ant): void {
  const limit = daysToTicks(ROUTE_FORGET_GD);
  for (const r of ant.mem.routes) {
    if (r.sourceId >= 0 && sim.state.tick - r.lastUsed > limit) { r.sourceId = -1; r.n = 0; r.visits = 0; }
  }
}

const scratch = new Float32Array(ROUTE_WAYPOINTS_MAX * 3);

/**
 * At the source after a successful collection: compares the outbound path with the slot for the source and
 * stores the waypoints to keep. Remembers slot and visits to commit (K.slot, K.pendVisits).
 */
export function prepareRoute(sim: Sim, ant: Ant, sourceId: number): void {
  ant.bb[K.slot] = -1;
  ant.bb[K.pendVisits] = 0;
  const routes = ant.mem.routes;
  if (sourceId < 0 || routes.length === 0) return;
  const n = outboundWaypoints(sim, ant, scratch);
  if (n < 2) return;
  let slot = routes.findIndex((r) => r.sourceId === sourceId);
  let visits = 1;
  if (slot >= 0) {
    const r = routes[slot];
    if (matchFraction(r, scratch, n, ROUTE_MATCH_DIST_BU * sim.world.bu) >= ROUTE_MATCH_FRACTION) {
      visits = r.visits + 1;
      if (pathLength(scratch, n) >= pathLength(r.wp, r.n)) {
        ant.bb[K.slot] = slot;
        ant.bb[K.pendVisits] = visits;
        return; // the stored route is the shorter one: keep it
      }
    }
  } else {
    slot = routes.findIndex((r) => r.sourceId < 0);
    if (slot < 0) {
      slot = 0;
      for (let i = 1; i < routes.length; i++) if (routes[i].lastUsed < routes[slot].lastUsed) slot = i;
    }
  }
  const r = routes[slot];
  const len = Math.min(n * 3, r.wp.length);
  r.wp.set(scratch.subarray(0, len));
  r.n = (len / 3) | 0;
  r.sourceId = sourceId;
  if (visits === 1) r.visits = 0; // not yet a completed trip
  r.lastUsed = sim.state.tick;
  ant.bb[K.slot] = slot;
  ant.bb[K.pendVisits] = visits;
}

/** After a successful delivery: commits the visits prepared at the source; emits `route-learned` on the third. */
export function commitRoute(sim: Sim, ant: Ant): void {
  const slot = ant.bb[K.slot] ?? -1;
  const visits = ant.bb[K.pendVisits] ?? 0;
  ant.bb[K.slot] = -1;
  ant.bb[K.pendVisits] = 0;
  const r = slot >= 0 ? ant.mem.routes[slot] : undefined;
  if (!r || r.sourceId < 0 || visits <= 0) return;
  const before = r.visits;
  r.visits = visits;
  r.lastUsed = sim.state.tick;
  if (before < ROUTE_FIX_VISITS && visits >= ROUTE_FIX_VISITS) sim.emit({ type: 'route-learned', antId: ant.id, sourceId: r.sourceId });
}
