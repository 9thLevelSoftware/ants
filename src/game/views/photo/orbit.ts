// Orbiting a subject in photo mode (GDD 01 6.9: "fly/orbit within the rig's limits"): look input turns the view like a
// free look, but the camera pivots about the subject point at its current distance, so the subject stays framed while the
// angle changes. The arc is walked in short steps against the world's sphere trace: the camera never enters solid.
import { v3Normalize, vec3, type Vec3 } from '@/core';
import { PHOTO_COLLISION_BU, type PhotoRig, type TraceFn } from '@/render/camera';
import { PHOTO_ORBIT_MAX_DEG, PHOTO_ORBIT_MIN_BU, PHOTO_ORBIT_STEP_DEG } from './constants';
import { viewDirection } from './lens';

const DEG = Math.PI / 180;
const MAX_PITCH = 89 * DEG;
const _o = vec3(), _t = vec3(), _n = vec3();

/**
 * Turns the camera about `center` by `yawDeg` (view yaw to the right) and `pitchDeg` (view pitch up), keeping its
 * distance. The camera's current offset from the centre and its view direction are rotated by the same angles, so a
 * subject that is off the view axis (framed on a third, or just not centred) keeps its place in the picture and the
 * first small turn moves the camera a small distance. Returns the degrees actually turned in yaw (0 when blocked or when
 * there was nothing to do).
 */
export function orbitAround(rig: PhotoRig, center: Vec3, yawDeg: number, pitchDeg: number, trace: TraceFn): number {
  if (!Number.isFinite(yawDeg) || !Number.isFinite(pitchDeg) || (yawDeg === 0 && pitchDeg === 0)) return 0;
  const bu = rig.bu, r = PHOTO_COLLISION_BU * bu;
  const total = Math.max(Math.abs(yawDeg), Math.abs(pitchDeg));
  if (total > PHOTO_ORBIT_MAX_DEG) { const k = PHOTO_ORBIT_MAX_DEG / total; yawDeg *= k; pitchDeg *= k; }
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(yawDeg), Math.abs(pitchDeg)) / PHOTO_ORBIT_STEP_DEG));
  let turned = 0;
  for (let i = 0; i < steps; i++) {
    offsetFromCenter(rig, center, _o);
    const yaw = rig.yaw - (yawDeg / steps) * DEG;
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rig.pitch + (pitchDeg / steps) * DEG));
    // the view turns about the vertical axis by the yaw step, then about its own right axis by the (clamped) pitch step
    rotateY(_o, yaw - rig.yaw);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    rotateAbout(_o, cy, 0, -sy, pitch - rig.pitch);
    _t.x = center.x + _o.x; _t.y = center.y + _o.y; _t.z = center.z + _o.z;
    // walk from the current position to the target; stop where the sphere would touch solid
    _o.x = _t.x - rig.pos.x; _o.y = _t.y - rig.pos.y; _o.z = _t.z - rig.pos.z;
    const dist = v3Normalize(_n, _o);
    if (dist > 1e-9) {
      const free = trace(rig.pos, _n, dist, r);
      if (free < dist - 1e-6) { // blocked: stay where the arc ends against the surface and keep the subject framed
        const g = Math.max(0, free - r * 0.05);
        const rx = center.x - rig.pos.x, ry = center.y - rig.pos.y, rz = center.z - rig.pos.z;
        rig.pos.x += _n.x * g; rig.pos.y += _n.y * g; rig.pos.z += _n.z * g;
        followSubject(rig, rx, ry, rz, center);
        return turned;
      }
    }
    rig.pos.x = _t.x; rig.pos.y = _t.y; rig.pos.z = _t.z;
    rig.yaw = yaw; rig.pitch = pitch;
    turned += yawDeg / steps;
  }
  return turned;
}

/**
 * The camera moved, so the subject is seen from a new direction: turns the view by the shortest rotation that takes the
 * old direction to the subject (r, from the old position) to the new one. The subject keeps its place in the picture.
 */
function followSubject(rig: PhotoRig, rx: number, ry: number, rz: number, center: Vec3): void {
  const ol = Math.hypot(rx, ry, rz);
  _n.x = center.x - rig.pos.x; _n.y = center.y - rig.pos.y; _n.z = center.z - rig.pos.z;
  const nl = Math.hypot(_n.x, _n.y, _n.z);
  if (ol < 1e-6 || nl < 1e-6) return;
  const ax = ry * _n.z - rz * _n.y, ay = rz * _n.x - rx * _n.z, az = rx * _n.y - ry * _n.x; // old x new (scaled)
  const sin = Math.hypot(ax, ay, az) / (ol * nl), cos = (rx * _n.x + ry * _n.y + rz * _n.z) / (ol * nl);
  if (sin < 1e-9) return;
  viewDirection(rig, _t);
  rotateAbout(_t, ax / (sin * ol * nl), ay / (sin * ol * nl), az / (sin * ol * nl), Math.atan2(sin, cos));
  rig.yaw = Math.atan2(-_t.x, -_t.z);
  rig.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.asin(Math.max(-1, Math.min(1, _t.y)))));
}

/**
 * The camera's offset from `center` (mm), at least the minimum orbit radius long. A camera on top of the centre has no
 * direction of its own: it backs off along its view direction.
 */
function offsetFromCenter(rig: PhotoRig, center: Vec3, out: Vec3): void {
  out.x = rig.pos.x - center.x; out.y = rig.pos.y - center.y; out.z = rig.pos.z - center.z;
  const min = PHOTO_ORBIT_MIN_BU * rig.bu, len = Math.hypot(out.x, out.y, out.z);
  if (len >= min) return;
  if (len > 1e-6) { const k = min / len; out.x *= k; out.y *= k; out.z *= k; return; }
  viewDirection(rig, out);
  out.x *= -min; out.y *= -min; out.z *= -min;
}

/** Rotates `v` about the world Y axis by `rad` (right-handed). */
function rotateY(v: Vec3, rad: number): void {
  const c = Math.cos(rad), s = Math.sin(rad), x = v.x, z = v.z;
  v.x = x * c + z * s; v.z = -x * s + z * c;
}

/** Rotates `v` about the unit axis (ax, ay, az) by `rad` (Rodrigues; right-handed). */
function rotateAbout(v: Vec3, ax: number, ay: number, az: number, rad: number): void {
  if (rad === 0) return;
  const c = Math.cos(rad), s = Math.sin(rad), d = (ax * v.x + ay * v.y + az * v.z) * (1 - c);
  const cx = ay * v.z - az * v.y, cy = az * v.x - ax * v.z, cz = ax * v.y - ay * v.x;
  v.x = v.x * c + cx * s + ax * d; v.y = v.y * c + cy * s + ay * d; v.z = v.z * c + cz * s + az * d;
}

/** Camera distance to `center` (mm). */
export function distanceTo(rig: PhotoRig, center: Vec3): number {
  return Math.hypot(rig.pos.x - center.x, rig.pos.y - center.y, rig.pos.z - center.z);
}
