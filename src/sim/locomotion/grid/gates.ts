// Edge gates (loco-fix3): two side-by-side nav cells can be connected only through a strip of their shared edge
// (an opening under a raised gravel board at a fence end, a gap between two posts). A walker that aims at the next
// cell's centre meets the solid part of the edge and climbs it; findGate finds the strip instead, as a short
// crossing segment (entry point on this side, exit point on the other) that a walker's body fits through.
// Pure: reads the world field only.

import type { Vec3 } from '@/core/math/vec3';
import { NAV_GRID_TUNING } from './gridData';

/** The part of the world field gates need (WorldField and the kernel's field both have it). */
export interface GateField {
  height(x: number, z: number): number;
  segmentFree(a: Vec3, b: Vec3, radius: number): boolean;
}

export interface Gate {
  entry: Vec3;
  exit: Vec3;
  /** Width of the free strip along the edge, mm. */
  width: number;
}

const _a: Vec3 = { x: 0, y: 0, z: 0 }, _b: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * True if a body of the gate radius, carried gateLift above the ground, can go straight from (ax, az) to (bx, bz).
 */
export function crossingFree(f: GateField, ax: number, az: number, bx: number, bz: number, bu: number, liftBu: number = NAV_GRID_TUNING.gateLiftBU): boolean {
  const T = NAV_GRID_TUNING, lift = liftBu * bu;
  _a.x = ax; _a.y = f.height(ax, az) + lift; _a.z = az;
  _b.x = bx; _b.y = f.height(bx, bz) + lift; _b.z = bz;
  return f.segmentFree(_a, _b, T.gateRadiusBU * bu);
}

/**
 * Gate between the side-by-side cells whose centres are (ax, az) and (bx, bz) (cell edge `cell`, mm). Null when
 * the cells are not side by side (a diagonal step has no shared edge), when the straight crossing between the
 * centres is free, or free at gateTallBU above the ground (a low obstacle the walker climbs), or when no strip
 * of the shared edge at least gateMinRunBU wide lets a body through (the walker then climbs, as before). Of several strips, the one nearest `near` (the walker, or the
 * previous waypoint; default the edge midpoint) is taken.
 */
export function findGate(f: GateField, ax: number, az: number, bx: number, bz: number, cell: number, bu: number,
  near: Vec3 | null = null): Gate | null {
  const T = NAV_GRID_TUNING;
  const dx = bx - ax, dz = bz - az;
  const horiz = Math.abs(dx) > 0.5 * cell && Math.abs(dz) < 0.5 * cell;
  const vert = Math.abs(dz) > 0.5 * cell && Math.abs(dx) < 0.5 * cell;
  if (horiz === vert) return null;
  // a low obstacle (a stone, a kerb: the crossing is free a little higher up) is climbed, as before; gates are for
  // tall barriers (a fence board) that a walker would have to scale
  if (crossingFree(f, ax, az, bx, bz, bu) || crossingFree(f, ax, az, bx, bz, bu, T.gateTallBU)) return null;
  // the shared edge: x = mx (horizontal step) spanning z over the cell, or z = mz spanning x
  const mx = 0.5 * (ax + bx), mz = 0.5 * (az + bz);
  const sx = horiz ? Math.sign(dx) : 0, sz = vert ? Math.sign(dz) : 0;
  const depth = T.gateDepthCells * cell, step = T.gateStepBU * bu, minRun = Math.max(1, Math.round(T.gateMinRunBU / T.gateStepBU));
  const n = Math.floor(cell / step);
  const t0 = -0.5 * cell + 0.5 * (cell - (n - 1) * step);
  const wantT = near ? (horiz ? near.z - mz : near.x - mx) : 0;
  let best = Infinity, bestT = 0, bestRun = 0, run = 0, runStart = 0;
  for (let i = 0; i <= n; i++) {
    let free = false;
    const t = t0 + i * step;
    if (i < n) {
      const px = horiz ? mx : mx + t, pz = horiz ? mz + t : mz;
      free = crossingFree(f, px - sx * depth, pz - sz * depth, px + sx * depth, pz + sz * depth, bu);
    }
    if (free) { if (run === 0) runStart = t; run++; continue; }
    if (run >= minRun) {
      const c = runStart + 0.5 * (run - 1) * step;
      const d = Math.abs(c - wantT);
      if (d < best) { best = d; bestT = c; bestRun = run; }
    }
    run = 0;
  }
  if (best === Infinity) return null;
  const px = horiz ? mx : mx + bestT, pz = horiz ? mz + bestT : mz;
  const ex = px - sx * depth, ez = pz - sz * depth, xx = px + sx * depth, xz = pz + sz * depth;
  return {
    entry: { x: ex, y: f.height(ex, ez), z: ez },
    exit: { x: xx, y: f.height(xx, xz), z: xz },
    width: bestRun * step,
  };
}
