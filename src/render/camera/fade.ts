// Fade and occlusion-cutaway rules of the possession camera (GDD 01 6.5).
import { v3AddScaled, v3Copy, v3Distance, v3Normalize, v3Sub, type Vec3 } from '@/core';
import {
  FADE_CREVICE_OPACITY, FADE_FULL_L, FADE_MIN_L, FADE_MIN_OPACITY, OCCLUSION_CAPSULE_L, OCCLUSION_RELEASE_S, OCCLUSION_TRIGGER_S,
} from './constants';
import type { FadeOutput, TraceFn } from './types';

/** Target opacity from the camera-thorax distance (mm) and body length (mm). */
export function targetOpacity(distMm: number, lengthMm: number, crevice: boolean): number {
  const full = FADE_FULL_L * lengthMm, min = FADE_MIN_L * lengthMm;
  let o = distMm >= full ? 1 : distMm <= min ? FADE_MIN_OPACITY : FADE_MIN_OPACITY + ((1 - FADE_MIN_OPACITY) * (distMm - min)) / (full - min);
  if (crevice) o = Math.min(o, FADE_CREVICE_OPACITY);
  return o;
}

const _pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
const _d = { x: 0, y: 0, z: 0 };

/** Occlusion cutaway: >= 2 of 3 rays (camera -> head, thorax, gaster) blocked for 0.15 s; ends 0.3 s after clear. */
export class OcclusionTracker {
  private blockedFor = 0;
  private clearFor = 0;
  private on = false;
  value = 0;

  reset(): void {
    this.blockedFor = this.clearFor = 0;
    this.on = false;
    this.value = 0;
  }

  update(dt: number, trace: TraceFn, cam: Vec3, pos: Vec3, up: Vec3, fwd: Vec3, lengthMm: number, forced: boolean): number {
    v3AddScaled(_pts[0], pos, fwd, 0.35 * lengthMm);
    v3AddScaled(_pts[0], _pts[0], up, 0.15 * lengthMm);
    v3AddScaled(_pts[1], pos, up, 0.15 * lengthMm);
    v3AddScaled(_pts[2], pos, fwd, -0.35 * lengthMm);
    v3AddScaled(_pts[2], _pts[2], up, 0.15 * lengthMm);
    let blocked = 0;
    for (const p of _pts) {
      v3Sub(_d, p, cam);
      const len = v3Normalize(_d, _d);
      if (len < 1e-6) continue;
      if (trace(cam, _d, len, 0) < len - 0.1 * lengthMm) blocked++;
    }
    if (blocked >= 2) { this.blockedFor += dt; this.clearFor = 0; } else { this.clearFor += dt; this.blockedFor = 0; }
    if (this.blockedFor >= OCCLUSION_TRIGGER_S) this.on = true;
    if (this.clearFor >= OCCLUSION_RELEASE_S) this.on = false;
    const goal = this.on || forced ? 1 : 0;
    const rate = dt / OCCLUSION_TRIGGER_S;
    this.value += Math.max(-rate, Math.min(rate, goal - this.value));
    return this.value;
  }
}

export function writeFade(out: FadeOutput, cam: Vec3, thorax: Vec3, lengthMm: number, crevice: boolean, occlusion: number): FadeOutput {
  out.target = targetOpacity(v3Distance(cam, thorax), lengthMm, crevice);
  out.occlusion = occlusion;
  v3Copy(out.capsuleA, cam);
  v3Copy(out.capsuleB, thorax);
  out.capsuleRadius = OCCLUSION_CAPSULE_L * lengthMm;
  return out;
}
