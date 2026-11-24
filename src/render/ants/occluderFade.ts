/**
 * Ants between the third-person camera and the possessed ant (GDD 01 6.5 rule 2, rewritten by app-seams-4 with the
 * integrator's ruling): a creature whose body lies inside the cone from the camera to the subject, nearer the camera
 * than half the boom, is not drawn. It fades out and in with plain alpha (never a screen-door pattern); every
 * other ant is drawn solid. Pure maths: AntRenderer feeds the weight through a per-ant smoother into the instance
 * attribute `aFootB.w` ("hidden" 0..1).
 */
import type { Vec3 } from '@/core/math/vec3';
import { OCCLUDER } from './tuning';

/** Share of the camera-to-subject distance that is the near half (the zone ends at `nearFraction` of the boom). */
export function boomFraction(cam: Vec3, subject: Vec3, p: Vec3): number {
  const abx = subject.x - cam.x, aby = subject.y - cam.y, abz = subject.z - cam.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  if (len2 < 1e-9) return 1;
  return ((p.x - cam.x) * abx + (p.y - cam.y) * aby + (p.z - cam.z) * abz) / len2;
}

function smooth01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

/**
 * How much of the zone an ant at `p` (its centre) is in: 0 = outside (drawn solid) .. 1 = inside (not drawn). The
 * cone narrows toward the camera (OCCLUDER.coneStart of its width there) and widens to `radiusL` body lengths of the
 * subject at the subject; the ant's own half length counts as part of the radius, so a body that overlaps the line of
 * sight is in. The edges are soft over `softL` subject lengths laterally and over `softFraction` of the boom along the axis,
 * so the weight is continuous in the ant's position (and the fade follows it smoothly on top of the time smoothing).
 */
export function occluderWeight(cam: Vec3, subject: Vec3, subjectLenMm: number, p: Vec3, antLenMm: number): number {
  const abx = subject.x - cam.x, aby = subject.y - cam.y, abz = subject.z - cam.z;
  const boom = Math.hypot(abx, aby, abz);
  if (boom < subjectLenMm * OCCLUDER.minBoomL) return 0; // the camera is in or on her: nothing stands between
  const h = boomFraction(cam, subject, p);
  // along the axis: from the camera (a body at the lens is in) to half the boom, the far edge soft
  const axial = smooth01(h / OCCLUDER.softFraction + 1) * (1 - smooth01((h - OCCLUDER.nearFraction) / OCCLUDER.softFraction + 0.5));
  if (axial <= 0) return 0;
  const hc = Math.min(1, Math.max(0, h));
  const ax = cam.x + abx * hc, ay = cam.y + aby * hc, az = cam.z + abz * hc;
  const lateral = Math.hypot(p.x - ax, p.y - ay, p.z - az);
  const radius = subjectLenMm * OCCLUDER.radiusL * (OCCLUDER.coneStart + (1 - OCCLUDER.coneStart) * hc) + 0.5 * antLenMm;
  const soft = Math.max(1e-6, OCCLUDER.softL * subjectLenMm);
  const side = 1 - smooth01((lateral - radius) / soft + 0.5);
  return Math.min(1, axial * side);
}

/** Exponential approach of the per-ant hidden amount to its target (0..1): quicker in than out is not wanted, both read as one fade. */
export function stepHidden(cur: number, target: number, dtS: number): number {
  const tau = target > cur ? OCCLUDER.fadeOutS : OCCLUDER.fadeInS; // "out" of view = hidden rising
  const k = dtS > 0 ? 1 - Math.exp(-dtS / tau) : 1;
  const v = cur + (target - cur) * k;
  if (v < OCCLUDER.epsilon) return 0;
  if (v > 1 - OCCLUDER.epsilon) return 1;
  return v;
}

/** An ant this hidden is not written to any batch (no draw, no shadow); between 0 and this it blends. */
export function fullyHidden(hidden: number): boolean {
  return hidden >= OCCLUDER.hideFrom;
}
