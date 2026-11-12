// Tunnel path boom (GDD 01 6.4), retuned on the real nest (views task, Stage 1B). The camera rides the
// breadcrumb polyline of the target's own recent positions, raised toward the middle of the tunnel, so it follows
// bends without clipping. Collision is checked ALONG that path (every BOOM_CHECK_STEP_L) instead of by one straight
// sphere trace from the pivot: a straight chord through a bend always hits a wall, which pulled the Stage 1A camera
// to 0.23 L behind the queen in a 1 BU shaft. The path is continuous, so the camera stops at the last sample where
// its sphere still fits.
import type { Vec3 } from '@/core';
import type { Breadcrumbs } from './breadcrumbs';
import { BOOM_CHECK_STEP_L, BOOM_CENTRE_FRACTION, BOOM_MIN_SIGHT_L, BOOM_RAISE_L } from './constants';
import type { FieldFn } from './sphereTrace';
import type { TraceFn } from './types';

const _p = { x: 0, y: 0, z: 0 }, _u = { x: 0, y: 1, z: 0 };

/** Free-space relaxation of a path point: at most this many gradient steps and this far in total (L). */
const RELAX_STEPS = 4;
const RELAX_MAX_L = 0.5;
/** Central-difference step of the field gradient (L). */
const RELAX_H_L = 0.02;

/**
 * Pushes p up the field gradient until f(p) >= minF (or RELAX_MAX_L is used up): a breadcrumb on a ledge the ant
 * dropped from, raised along its tilted up, lands next to the edge; this moves it into the open. Returns f(p).
 */
export function relaxOut(field: FieldFn, p: Vec3, minF: number, lengthMm: number): number {
  let f = field(p.x, p.y, p.z);
  const h = RELAX_H_L * lengthMm;
  let budget = RELAX_MAX_L * lengthMm;
  for (let i = 0; i < RELAX_STEPS && f < minF && budget > 0; i++) {
    const gx = field(p.x + h, p.y, p.z) - field(p.x - h, p.y, p.z);
    const gy = field(p.x, p.y + h, p.z) - field(p.x, p.y - h, p.z);
    const gz = field(p.x, p.y, p.z + h) - field(p.x, p.y, p.z - h);
    const g = Math.hypot(gx, gy, gz);
    if (g < 1e-9) break;
    const step = Math.min(budget, (minF - f) * 1.2 + 0.02 * lengthMm);
    p.x += (gx / g) * step; p.y += (gy / g) * step; p.z += (gz / g) * step;
    budget -= step;
    f = field(p.x, p.y, p.z);
  }
  return f;
}

/** Does a sphere of radius r at p lie in free space? (A trace returns 0 when the sphere already touches solid.) */
export function fitsAt(trace: TraceFn, p: Vec3, dir: Vec3, r: number): boolean {
  return trace(p, dir, r * 0.01, r) > 0;
}

/**
 * Lift above a floor point along `up`: the GDD's 0.35 L, but never past the middle of the free gap above it (a
 * queen-sized tunnel is barely taller than the queen; the middle is where the camera sphere has most room).
 */
export function boomLift(trace: TraceFn, p: Vec3, up: Vec3, lengthMm: number): number {
  const want = BOOM_RAISE_L * lengthMm;
  const gap = trace(p, up, 4 * want, 0);
  return Math.max(0, Math.min(want, gap * BOOM_CENTRE_FRACTION));
}

/**
 * Raised path point at arc length `s` behind `from` (the target position): breadcrumbs first, then straight back
 * along -fwd when the buffer is shorter. Writes `out`; returns the point's up in `upOut`.
 */
export function boomPoint(crumbs: Breadcrumbs, trace: TraceFn, from: Vec3, fwdTangent: Vec3, targetUp: Vec3, s: number,
  lengthMm: number, out: Vec3, upOut: Vec3, field?: FieldFn, minF = 0): Vec3 {
  const got = crumbs.walkBack(from, s, out, upOut);
  if (got < s - 1e-9) {
    if (got <= 1e-9) { upOut.x = targetUp.x; upOut.y = targetUp.y; upOut.z = targetUp.z; }
    out.x -= fwdTangent.x * (s - got); out.y -= fwdTangent.y * (s - got); out.z -= fwdTangent.z * (s - got);
  }
  const lift = boomLift(trace, out, upOut, lengthMm);
  out.x += upOut.x * lift; out.y += upOut.y * lift; out.z += upOut.z * lift;
  if (field && minF > 0) relaxOut(field, out, minF, lengthMm);
  return out;
}

/**
 * Farthest arc length <= `want` such that a sphere of `checkRadiusMm` fits at every sample from the target back to
 * it. With `seeTo` (the thorax) the camera also prefers samples that still see it: the arc is the farthest sample
 * with a clear line of sight, but never shorter than BOOM_MIN_SIGHT_L (around a sharp bend the occlusion cutaway
 * shows the ant instead). Returns the arc length; `out` holds the camera point there.
 */
export function solveBoom(crumbs: Breadcrumbs, trace: TraceFn, from: Vec3, fwdTangent: Vec3, targetUp: Vec3, want: number,
  lengthMm: number, checkRadiusMm: number, out: Vec3, field?: FieldFn, seeTo?: Vec3): number {
  const step = BOOM_CHECK_STEP_L * lengthMm, r = checkRadiusMm, minF = field ? r * 1.2 : 0;
  const minSight = Math.min(want, BOOM_MIN_SIGHT_L * lengthMm);
  let good = 0, sighted = true;
  boomPoint(crumbs, trace, from, fwdTangent, targetUp, 0, lengthMm, out, _u, field, minF);
  for (let s = Math.min(step, want); ; s = Math.min(s + step, want)) {
    boomPoint(crumbs, trace, from, fwdTangent, targetUp, s, lengthMm, _p, _u, field, minF);
    if (!fitsAt(trace, _p, _u, r)) break;
    if (seeTo && sighted && !clearLine(trace, _p, seeTo, lengthMm)) sighted = false;
    if (!sighted && s > minSight) break;
    good = s;
    out.x = _p.x; out.y = _p.y; out.z = _p.z;
    if (s >= want) break;
  }
  return good;
}

const _d = { x: 0, y: 0, z: 0 };

/** Does the straight line from a to b stay in free space (to within 0.1 L of b)? */
export function clearLine(trace: TraceFn, a: Vec3, b: Vec3, lengthMm: number): boolean {
  _d.x = b.x - a.x; _d.y = b.y - a.y; _d.z = b.z - a.z;
  const len = Math.hypot(_d.x, _d.y, _d.z);
  if (len < 1e-9) return true;
  _d.x /= len; _d.y /= len; _d.z /= len;
  return trace(a, _d, len, 0) >= len - 0.1 * lengthMm;
}
