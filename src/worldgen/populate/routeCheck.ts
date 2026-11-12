// Whether a kernel walker can follow a climb route from its foot to its end (host points are usable only when
// their route is walkable: a few thin plant stems are not, worldgen-outdoor report). The same steering as the
// outdoor placer's verification walker (place/outdoor/routeWalk.ts), one way only: generation walks hundreds of
// routes and only needs the way up.

import type { Vec3 } from '@/core/math/vec3';
import type { Kernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerStep } from '@/sim/locomotion/walker';

/** Waypoint reached within this, BU; step length, BU; steps allowed per waypoint. */
const TOL_BU = 1, STEP_BU = 1, MAX_STEPS = 200;

export function walkRouteUp(k: Kernel, pts: readonly Vec3[], bu: number): boolean {
  if (pts.length < 2) return false;
  const tol = TOL_BU * bu, speed = (STEP_BU * bu) / 0.1;
  const kin = createWalkerKin(k.walker.footOffset);
  const first = pts[0], second = pts[1];
  const heading = { x: second.x - first.x, y: second.y - first.y, z: second.z - first.z };
  if (!walkerPlace(k.field, kin, { x: first.x, y: first.y + 3 * bu, z: first.z }, { dir: { x: 0, y: -1, z: 0 }, heading }, k.walker)) return false;
  const dir: Vec3 = { x: 0, y: 0, z: 0 }, nrm: Vec3 = { x: 0, y: 1, z: 0 };
  for (let i = 1; i < pts.length; i++) {
    const t = pts[i];
    k.field.normal(t, nrm);
    for (let n = 0; ; n++) {
      const dx = t.x - kin.pos.x, dy = t.y - kin.pos.y, dz = t.z - kin.pos.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < tol && kin.up.x * nrm.x + kin.up.y * nrm.y + kin.up.z * nrm.z > 0.5) break;
      if (n > MAX_STEPS) return false;
      dir.x = dx / l; dir.y = dy / l; dir.z = dz / l;
      walkerStep(k.field, kin, dir, Math.min(speed, (l / 0.1) * 1.01 + 1e-3), 0.1, k.walker);
      if (kin.medium === 'air') return false;
    }
  }
  return true;
}
