// Camera-relative movement mapping (GDD 01 §4.1 steps 1-3): stick/key vector m = (mx, my) with |m| <= 1, camera
// forward c and camera up, ant up n -> world-space desired direction d with |d| = |m|. The edge latch (step 4)
// is locomotion's: it needs the ant's frame history and runs in the sim (src/sim/locomotion/possessed.ts).
import type { Vec3 } from '@/core';

/** Above this |c . n| the camera looks along the ant's up: use the camera up projected instead (GDD 01 §4.1). */
export const CAMERA_ALONG_UP_DOT = 0.95;

const _fc: Vec3 = { x: 0, y: 0, z: 0 };
const _rc: Vec3 = { x: 0, y: 0, z: 0 };

/** out = v - (v.n) n normalised; false when the projection vanishes. */
function projectUnit(out: Vec3, v: Vec3, n: Vec3): boolean {
  const d = v.x * n.x + v.y * n.y + v.z * n.z;
  out.x = v.x - d * n.x; out.y = v.y - d * n.y; out.z = v.z - d * n.z;
  const len = Math.hypot(out.x, out.y, out.z);
  if (len < 1e-9) return false;
  out.x /= len; out.y /= len; out.z /= len;
  return true;
}

/**
 * Writes the world-space desired direction into `out` and returns its magnitude (0..1). `camFwd`, `camUp` and
 * `antUp` must be unit vectors. mx = right, my = forward.
 */
export function cameraRelativeDir(out: Vec3, mx: number, my: number, camFwd: Vec3, camUp: Vec3, antUp: Vec3): number {
  // a non-finite axis (bad pad data, debug input) counts as centred: NaN must never reach the persisted intent
  if (!Number.isFinite(mx)) mx = 0;
  if (!Number.isFinite(my)) my = 0;
  let mag = Math.hypot(mx, my);
  if (mag < 1e-9) { out.x = 0; out.y = 0; out.z = 0; return 0; }
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
  const along = Math.abs(camFwd.x * antUp.x + camFwd.y * antUp.y + camFwd.z * antUp.z);
  // Looking straight down at the ant (top-down): the camera's up is the screen's "forward".
  const src = along > CAMERA_ALONG_UP_DOT ? camUp : camFwd;
  if (!projectUnit(_fc, src, antUp) && !projectUnit(_fc, src === camUp ? camFwd : camUp, antUp)) {
    out.x = 0; out.y = 0; out.z = 0;
    return 0;
  }
  // rc = fc x n (right-handed, Y up: forward x up = right)
  _rc.x = _fc.y * antUp.z - _fc.z * antUp.y;
  _rc.y = _fc.z * antUp.x - _fc.x * antUp.z;
  _rc.z = _fc.x * antUp.y - _fc.y * antUp.x;
  const dx = my * _fc.x + mx * _rc.x, dy = my * _fc.y + mx * _rc.y, dz = my * _fc.z + mx * _rc.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len >= 1e-9) || !Number.isFinite(len)) { out.x = 0; out.y = 0; out.z = 0; return 0; } // also a NaN camera basis
  out.x = (dx / len) * mag; out.y = (dy / len) * mag; out.z = (dz / len) * mag;
  return mag;
}

/**
 * A world-space direction safe to put into PlayerIntent: finite components, length at most 1. Anything non-finite
 * becomes the zero vector.
 */
export function sanitizeDir(out: Vec3, v: Vec3): Vec3 {
  const x = v.x, y = v.y, z = v.z;
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len < 1e-9) { out.x = 0; out.y = 0; out.z = 0; return out; }
  const k = len > 1 ? 1 / len : 1;
  out.x = x * k; out.y = y * k; out.z = z * k;
  return out;
}
