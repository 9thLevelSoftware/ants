// The possession camera's last two steps every frame (views task):
//  1. no jumps: relative to the moving pivot base the camera travels at most CAM_MAX_REL_SPEED_L L/s (a pull-in that
//     is still in free space then takes a few frames; line of sight is the occlusion cutaway's job, GDD 6.5 rule 3);
//  2. GDD 6.1 clearance (f >= 0.5 R on every frame): if the sphere does not fit, the camera moves toward an anchor that
//     fits - this frame's framing result (collision-resolved, so normally clear), else the pivot base - by bisection,
//     staying as close as possible to where step 1 wanted it.
import { v3AddScaled, v3Copy, v3Length, v3Lerp, v3Sub, vec3, type Vec3 } from '@/core';
import { fitsAt } from './boomPath';
import { CAM_MAX_REL_SPEED_L } from './constants';
import type { TraceFn } from './types';

export class MotionGuard {
  private lastCam = vec3();
  private lastBase = vec3();
  private hasLast = false;
  private tmp = vec3(); private dir = vec3(); private from = vec3(); private to = vec3();

  reset(): void {
    this.hasLast = false;
  }

  /**
   * Applies both steps to `p` (in place): `goal` is the framing result before the limit, `base` the pivot base this
   * frame, `clearance` the guaranteed f (mm). Returns true when the clearance step had to move the camera.
   */
  apply(p: Vec3, goal: Vec3, base: Vec3, up: Vec3, dt: number, lengthMm: number, clearance: number, trace: TraceFn): boolean {
    this.limit(p, base, dt, lengthMm);
    const guarded = this.clear(p, goal, base, up, clearance * 1.05, trace);
    v3Copy(this.lastCam, p);
    v3Copy(this.lastBase, base);
    this.hasLast = true;
    return guarded;
  }

  private limit(p: Vec3, base: Vec3, dt: number, lengthMm: number): void {
    if (!this.hasLast || dt <= 0) return;
    // where last frame's camera would be if it had moved with the pivot
    this.tmp.x = this.lastCam.x + base.x - this.lastBase.x;
    this.tmp.y = this.lastCam.y + base.y - this.lastBase.y;
    this.tmp.z = this.lastCam.z + base.z - this.lastBase.z;
    v3Sub(this.dir, p, this.tmp);
    const d = v3Length(this.dir), max = CAM_MAX_REL_SPEED_L * lengthMm * dt;
    if (d > max) v3AddScaled(p, this.tmp, this.dir, max / d);
  }

  private clear(p: Vec3, goal: Vec3, base: Vec3, up: Vec3, r: number, trace: TraceFn): boolean {
    if (fitsAt(trace, p, up, r)) return false;
    const anchor = fitsAt(trace, goal, up, r) ? goal : base;
    if (anchor === base && !fitsAt(trace, base, up, r)) { v3Copy(p, base); return true; }
    v3Copy(this.to, p);
    v3Copy(this.from, anchor);
    let lo = 0, hi = 1; // fraction of the way from the anchor to p
    for (let i = 0; i < 10; i++) {
      const m = (lo + hi) / 2;
      v3Lerp(this.tmp, this.from, this.to, m);
      if (fitsAt(trace, this.tmp, up, r)) lo = m; else hi = m;
    }
    v3Lerp(p, this.from, this.to, lo);
    return true;
  }
}
