// Small 2D helpers for the layout: rects, map sides, bands.

import type { Rect, Side } from './types';

export const SIDES: readonly Side[] = ['x0', 'x1', 'z0', 'z1'];

export function opposite(s: Side): Side {
  return s === 'x0' ? 'x1' : s === 'x1' ? 'x0' : s === 'z0' ? 'z1' : 'z0';
}

/** True if the two sides are perpendicular (one x side, one z side). */
export function perpendicular(a: Side, b: Side): boolean {
  return a[0] !== b[0];
}

/** Band of `depth` along side `s` of an L x L map, covering along-coordinates [a0, a1). */
export function band(s: Side, depth: number, L: number, a0 = 0, a1 = L): Rect {
  switch (s) {
    case 'x0': return { x0: 0, x1: depth, z0: a0, z1: a1 };
    case 'x1': return { x0: L - depth, x1: L, z0: a0, z1: a1 };
    case 'z0': return { x0: a0, x1: a1, z0: 0, z1: depth };
    default: return { x0: a0, x1: a1, z0: L - depth, z1: L };
  }
}

/** Distance of the point from side `s` (inward), and its coordinate along the side. */
export function inward(s: Side, x: number, z: number, L: number): number {
  return s === 'x0' ? x : s === 'x1' ? L - x : s === 'z0' ? z : L - z;
}
export function along(s: Side, x: number, z: number): number {
  return s[0] === 'x' ? z : x;
}

/** World point from (inward distance, along coordinate) relative to side `s`. */
export function fromSide(s: Side, d: number, a: number, L: number): { x: number; z: number } {
  switch (s) {
    case 'x0': return { x: d, z: a };
    case 'x1': return { x: L - d, z: a };
    case 'z0': return { x: a, z: d };
    default: return { x: a, z: L - d };
  }
}

/** Unit inward normal of side `s`. */
export function inwardNormal(s: Side): { x: number; z: number } {
  return s === 'x0' ? { x: 1, z: 0 } : s === 'x1' ? { x: -1, z: 0 } : s === 'z0' ? { x: 0, z: 1 } : { x: 0, z: -1 };
}

export function area(r: Rect): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
}

/** Overlap area of two rects (touching edges = 0). */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** True if the rects share a boundary segment of positive length (or overlap). */
export function touches(a: Rect, b: Rect, eps = 1): boolean {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (w > eps && h > -eps) || (h > eps && w > -eps);
}

export function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
}

/** Distance from a point to the rect (0 inside). */
export function rectDistance(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.sqrt(dx * dx + dz * dz);
}

export function clampRule(f: number, L: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, f * L));
}
