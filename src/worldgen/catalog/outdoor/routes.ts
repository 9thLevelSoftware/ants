// Climb-route node helpers (GDD 04 §10): nodes lie on the object surface pushed out by the walker's foot offset,
// bottom first. Curved stretches are sampled densely here (chords of at most `step` mm) because addClimbRoute
// only subdivides straight chords, which would cut through a trunk or a rim.

import type { Vec3 } from '@/core/math/vec3';
import { dcos, dsin } from '../../kit/dmath';
import { add, cross, dot, len, norm, scale, sub, v } from './prims';

/**
 * Nodes beside an axis polyline (stem, trunk, post, branch): each axis point pushed by its radius + foot along
 * `side` made perpendicular to the local axis direction.
 */
export function besideAxis(axis: readonly Vec3[], radius: (i: number) => number, side: Vec3, foot: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < axis.length; i++) {
    const t = norm(sub(axis[Math.min(axis.length - 1, i + 1)], axis[Math.max(0, i - 1)]));
    let s = sub(side, scale(t, dot(side, t)));
    if (len(s) < 1e-6) s = cross(t, v(0, 0, 1));
    out.push(add(axis[i], scale(norm(s), radius(i) + foot)));
  }
  return out;
}

/** Horizontal arc of radius r around (cx, cz) at height y from angle a0 to a1 (rad, dirYaw convention). */
export function arc(cx: number, cz: number, y: number, r: number, a0: number, a1: number, step: number): Vec3[] {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(v(cx + r * dcos(a), y, cz + r * dsin(a)));
  }
  return out;
}

/**
 * Nodes over a convex cross-section edge: from point p on face 1 around the edge centre e (radius of the turn =
 * rounding + foot) to face 2, as a quarter circle in the plane of the two face normals n1 -> n2.
 */
export function aroundEdge(e: Vec3, n1: Vec3, n2: Vec3, rTurn: number, steps = 4): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    out.push(add(e, add(scale(n1, rTurn * dcos(t)), scale(n2, rTurn * dsin(t)))));
  }
  return out;
}

/** Linear subdivision so that no chord exceeds `step` (keeps straight runs explicit). */
export function densify(pts: readonly Vec3[], step: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) { out.push(pts[0]); continue; }
    const a = pts[i - 1], b = pts[i], d = len(sub(b, a));
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push(add(a, scale(sub(b, a), k / n)));
  }
  return out;
}

/** Drops consecutive nodes closer than `min` mm (duplicates at joins). */
export function dedupe(pts: readonly Vec3[], min = 0.5): Vec3[] {
  const out: Vec3[] = [];
  for (const p of pts) if (out.length === 0 || len(sub(p, out[out.length - 1])) >= min) out.push(p);
  return out;
}

/** Point on a horizontal circle (dirYaw convention). */
export function onCircle(cx: number, cz: number, y: number, r: number, a: number): Vec3 {
  return v(cx + r * dcos(a), y, cz + r * dsin(a));
}
