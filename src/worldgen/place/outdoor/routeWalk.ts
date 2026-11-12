// Verification support (tests, tools): steer a kernel surface walker along a climb route, waypoint by waypoint, to
// its end (the point of interest) and back; and the field clearance along a micro-connection's passage.
// Pure (kernel field + walker); not used by the generator itself.

import type { Vec3 } from '@/core/math/vec3';
import type { Kernel } from '@/sim/kernel';
import type { MicroConn, WorldData } from '@/sim/types';
import { createWalkerKin, walkerPlace, walkerStep } from '@/sim/locomotion/walker';

export interface RouteWalkResult {
  /** Reached the last waypoint. */
  up: boolean;
  /** Came back to the first waypoint. */
  back: boolean;
  /** Index of the waypoint where it got stuck (-1 none). */
  stuckAt: number;
  steps: number;
}

export interface RouteWalkOptions {
  /** Waypoint reached within this distance, BU. */
  tolBu?: number;
  /** Distance per step, BU (dt 0.1 s). */
  stepBu?: number;
  /** Steps allowed per waypoint. */
  maxSteps?: number;
  /** 'tangent' (default): steer along the tangent part of the direction to the waypoint; 'raw': the direction itself. */
  steer?: 'tangent' | 'raw';
  /** Debug: called after every step with the waypoint index, the walker and the step status. */
  trace?: (target: number, kin: ReturnType<typeof createWalkerKin>, status: string) => void;
}

/** Walks `pts` forward then backward with a kernel walker steered straight at the next waypoint. */
export function walkRoute(k: Kernel, pts: readonly Vec3[], bu: number, o: RouteWalkOptions = {}): RouteWalkResult {
  const tol = (o.tolBu ?? 1) * bu, speed = ((o.stepBu ?? 1) * bu) / 0.1, maxSteps = o.maxSteps ?? 400;
  const kin = createWalkerKin(k.walker.footOffset);
  const first = pts[0], second = pts[Math.min(1, pts.length - 1)];
  const h = { x: second.x - first.x, y: second.y - first.y, z: second.z - first.z };
  // the first node is on the ground beside the object: drop onto it from a little above
  const drop = { x: first.x, y: first.y + 3 * bu, z: first.z };
  if (!walkerPlace(k.field, kin, drop, { dir: { x: 0, y: -1, z: 0 }, heading: h }, k.walker)) return { up: false, back: false, stuckAt: 0, steps: 0 };
  let steps = 0;
  const dir: Vec3 = { x: 0, y: 0, z: 0 };
  const go = (order: readonly Vec3[]): number => {
    for (let i = 1; i < order.length; i++) {
      const t = order[i];
      let n = 0;
      for (;;) {
        const dx = t.x - kin.pos.x, dy = t.y - kin.pos.y, dz = t.z - kin.pos.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l < tol) break;
        if (++n > maxSteps) return i;
        // steer straight at the waypoint (the walker keeps its heading when the target lies along the surface
        // normal); except on level ground below a target that is up a wall: walk into the wall first, which turns
        // the walker onto it
        const u = kin.up, dn = (dx * u.x + dy * u.y + dz * u.z) / l;
        let tx = dx / l, ty = dy / l, tz = dz / l;
        if (o.steer !== 'raw' && u.y > 0.7 && dn * dn > 1 - 0.25 * 0.25) {
          tx -= dn * u.x; ty -= dn * u.y; tz -= dn * u.z;
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
          if (tl > 1e-4) { tx /= tl; ty /= tl; tz /= tl; } else { tx = kin.fwd.x; ty = kin.fwd.y; tz = kin.fwd.z; }
        }
        dir.x = tx; dir.y = ty; dir.z = tz;
        const st = walkerStep(k.field, kin, dir, Math.min(speed, (l / 0.1) * 1.01 + 1e-3), 0.1, k.walker);
        o.trace?.(i, kin, st);
        steps++;
        // a walker that falls off has lost the route
        if (kin.medium === 'air') return i;
      }
    }
    return -1;
  };
  const a = go(pts);
  if (a >= 0) return { up: false, back: false, stuckAt: a, steps };
  const b = go([...pts].reverse());
  return { up: true, back: b < 0, stuckAt: b >= 0 ? pts.length - 1 - b : -1, steps };
}

/** Polyline of a micro-connection's passage: posA, its path points, posB. */
export function microPolyline(m: MicroConn): Vec3[] {
  return [m.posA, ...(m.path ?? []), m.posB];
}

/**
 * Smallest field value along the passage, mm, sampled every `stepMm` (the field is the clearance radius: a body
 * of clearance c fits where f >= c / 2). Mouth ends within `endSkip` mm are not sampled (open air).
 */
export function passageMinField(k: Kernel, m: MicroConn, stepMm: number): number {
  const pts = microPolyline(m);
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
    const n = Math.max(1, Math.ceil(l / stepMm));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      min = Math.min(min, k.field.sampleXYZ(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
    }
  }
  return min;
}

/** Applies a world's pre-carves to a kernel (force: as createNewGame does). */
export function applyPreCarves(k: Kernel, w: WorldData): void {
  for (const op of w.preCarve) {
    const opts = { force: true };
    if (op.shape === 'sphere') k.carve.carveSphere(op.a, op.r, opts);
    else if (op.shape === 'capsule') k.carve.carveCapsule(op.a, op.b, op.r, opts);
    else k.carve.carveEllipsoid(op.a, op.b, opts);
  }
}
