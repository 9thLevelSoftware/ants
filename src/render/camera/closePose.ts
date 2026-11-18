// Close chase pose (look pass 3 review, stage1a strict): where the possession camera stands when the framing's own place does
// not keep GDD 6.1's f >= 0.5 R - typically a queen's cell, whose ceiling is a fraction of a millimetre above her back, so the
// pivot base itself has no room for the camera sphere and the old fallback put the camera ON the base (a frame of soil).
// A camera does not need room at the pivot, only where it stands and a free line to the ant: this tries a fan of places round
// the pivot (yaw from the wanted side, a few small elevations, distances from the wanted one down to near) and takes the valid
// one nearest to where the framing wanted the camera, so the pose moves continuously as the framing does.
import { v3AddScaled, v3Copy, v3Distance, vec3, type Vec3 } from '@/core';
import { fitsAt } from './boomPath';
import { CAM_CLOSE_DIST_FRACTIONS, CAM_CLOSE_ELEVS_DEG, CAM_CLOSE_GAP_R, CAM_CLOSE_YAWS_DEG } from './constants';
import { clampN, DEG, rotateAboutAxis } from './frameMath';
import type { TraceFn } from './types';

const _h = vec3(), _d = vec3(), _c = vec3(), _dn = vec3();

/**
 * In a low room the height at which a sphere fits is a thin band (a 2.2 mm room holds a clearance of 1.05 mm only at its middle):
 * moves `c` along `up` to the middle of the free gap above and below it when that gap is small. Leaves `c` alone in open space
 * (more than CAM_CLOSE_GAP_R radii of gap) and inside solid (both traces 0).
 */
function centreInGap(c: Vec3, trace: TraceFn, up: Vec3, r: number): void {
  _dn.x = -up.x; _dn.y = -up.y; _dn.z = -up.z;
  const reach = CAM_CLOSE_GAP_R * r;
  const above = trace(c, up, reach, 0), below = trace(c, _dn, reach, 0);
  if (above + below >= reach || above + below <= 0) return;
  v3AddScaled(c, c, up, (above - below) / 2);
}

/**
 * Looks for a camera place with a sphere of `r` clear, at most `maxDist` from `pivot`, with a free line to it.
 * `side` is the horizontal direction (in the plane normal to `up`) the framing wanted the camera on, `wanted` the place it wanted.
 * Writes the nearest valid place to `wanted` into `out` and returns true; false (out untouched) when the room has none.
 */
export function findClosePose(out: Vec3, trace: TraceFn, pivot: Vec3, up: Vec3, side: Vec3, wanted: Vec3, maxDist: number, r: number): boolean {
  let best = Infinity;
  for (const yawDeg of CAM_CLOSE_YAWS_DEG) {
    rotateAboutAxis(_h, side, up, yawDeg * DEG);
    for (const elevDeg of CAM_CLOSE_ELEVS_DEG) {
      const el = clampN(elevDeg, -80, 80) * DEG, ce = Math.cos(el), se = Math.sin(el);
      _d.x = _h.x * ce + up.x * se; _d.y = _h.y * ce + up.y * se; _d.z = _h.z * ce + up.z * se;
      for (const frac of CAM_CLOSE_DIST_FRACTIONS) {
        const dist = frac * maxDist;
        v3AddScaled(_c, pivot, _d, dist);
        centreInGap(_c, trace, up, r);
        const score = v3Distance(_c, wanted);
        if (score >= best) continue;
        if (!fitsAt(trace, _c, up, r)) continue;
        if (trace(pivot, _d, dist, 0) < dist * 0.98) continue; // the ant must be in sight (a zero-radius line: the pivot may touch the ceiling)
        best = score;
        v3Copy(out, _c);
      }
    }
  }
  return best < Infinity;
}
