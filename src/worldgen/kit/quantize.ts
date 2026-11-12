// Stored positions, sizes and angles are quantised (GDD 04 DET-5): 1/256 mm and 1e-6 rad.

import type { Vec3 } from '@/core/math/vec3';
import { PLACE } from '../tuning/pipeline';

export function qmm(v: number): number {
  return Math.round(v * PLACE.posQuantum) / PLACE.posQuantum;
}

export function qangle(a: number): number {
  return Math.round(a * PLACE.angleQuantum) / PLACE.angleQuantum;
}

export function qvec(v: Vec3): Vec3 {
  return { x: qmm(v.x), y: qmm(v.y), z: qmm(v.z) };
}
