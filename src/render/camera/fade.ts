// Fade and occlusion-cutaway rules of the possession camera (GDD 01 6.5), with the views-task deviations decided on
// the real nest: the cutaway is a narrow cone between the camera and the ant (not a 0.8 L capsule), and the
// `crevice` state forces it (rule 4) only above ground. Underground "crevice" is simply a queen-sized tunnel: forcing
// the cutaway there dithered every wall around the camera and showed the sky through the soil (gate 1A report).
import { v3AddScaled, v3Copy, v3Distance, v3Normalize, v3Sub, type Vec3 } from '@/core';
import {
  FADE_CREVICE_OPACITY, FADE_FULL_L, FADE_MIN_L, FADE_MIN_OPACITY, OCCLUSION_CONE_END_L, OCCLUSION_CONE_RADIUS_L, OCCLUSION_CONE_START,
  OCCLUSION_RELEASE_S, OCCLUSION_TRIGGER_S,
} from './constants';
import type { FadeOutput, TraceFn } from './types';

/** Target opacity from the camera-thorax distance (mm) and body length (mm). `crevice`: rule 4's 0.5 cap applies. */
export function targetOpacity(distMm: number, lengthMm: number, crevice: boolean): number {
  const full = FADE_FULL_L * lengthMm, min = FADE_MIN_L * lengthMm;
  let o = distMm >= full ? 1 : distMm <= min ? FADE_MIN_OPACITY : FADE_MIN_OPACITY + ((1 - FADE_MIN_OPACITY) * (distMm - min)) / (full - min);
  if (crevice) o = Math.min(o, FADE_CREVICE_OPACITY);
  return o;
}

/** Rule 4 (deviation): only a surface crevice forces the cutaway and the 0.5 opacity cap. */
export function creviceForcesCutaway(state: string, underground: boolean): boolean {
  return state === 'crevice' && !underground;
}

const _pts = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
const _d = { x: 0, y: 0, z: 0 };

/** Head, thorax and gaster sample points of an ant at pos with up / fwd (mm). */
export function bodyPoints(pos: Vec3, up: Vec3, fwd: Vec3, lengthMm: number, out: Vec3[] = _pts): Vec3[] {
  v3AddScaled(out[0], pos, fwd, 0.35 * lengthMm);
  v3AddScaled(out[0], out[0], up, 0.15 * lengthMm);
  v3AddScaled(out[1], pos, up, 0.15 * lengthMm);
  v3AddScaled(out[2], pos, fwd, -0.35 * lengthMm);
  v3AddScaled(out[2], out[2], up, 0.15 * lengthMm);
  return out;
}

/** Occlusion cutaway: >= 2 of 3 rays (camera -> head, thorax, gaster) blocked for 0.15 s; ends 0.3 s after clear. */
export class OcclusionTracker {
  private blockedFor = 0;
  private clearFor = 0;
  private on = false;
  value = 0;
  /** Seconds the ant has been occluded without a break (E13 measures it). */
  occludedFor = 0;

  reset(): void {
    this.blockedFor = this.clearFor = 0;
    this.on = false;
    this.value = 0;
    this.occludedFor = 0;
  }

  /** Number of the 3 body rays blocked from `cam`. */
  static blockedRays(trace: TraceFn, cam: Vec3, pos: Vec3, up: Vec3, fwd: Vec3, lengthMm: number): number {
    let blocked = 0;
    for (const p of bodyPoints(pos, up, fwd, lengthMm)) {
      v3Sub(_d, p, cam);
      const len = v3Normalize(_d, _d);
      if (len < 1e-6) continue;
      if (trace(cam, _d, len, 0) < len - 0.1 * lengthMm) blocked++;
    }
    return blocked;
  }

  update(dt: number, trace: TraceFn, cam: Vec3, pos: Vec3, up: Vec3, fwd: Vec3, lengthMm: number, forced: boolean): number {
    const blocked = OcclusionTracker.blockedRays(trace, cam, pos, up, fwd, lengthMm);
    if (blocked >= 2) { this.blockedFor += dt; this.clearFor = 0; this.occludedFor += dt; } else { this.clearFor += dt; this.blockedFor = 0; this.occludedFor = 0; }
    if (this.blockedFor >= OCCLUSION_TRIGGER_S) this.on = true;
    if (this.clearFor >= OCCLUSION_RELEASE_S) this.on = false;
    const goal = this.on || forced ? 1 : 0;
    const rate = dt / OCCLUSION_TRIGGER_S;
    this.value += Math.max(-rate, Math.min(rate, goal - this.value));
    return this.value;
  }
}

/**
 * Fills the fade output. The occlusion shape is a cone: capsuleA = camera, capsuleB = a point OCCLUSION_CONE_END_L
 * short of the thorax (never past the camera), capsuleRadius = the cone radius at B (the nest shader narrows it to
 * OCCLUSION_CONE_START of that at the camera and dithers only fragments between A and B).
 */
export function writeFade(out: FadeOutput, cam: Vec3, thorax: Vec3, lengthMm: number, crevice: boolean, occlusion: number): FadeOutput {
  const d = v3Distance(cam, thorax);
  out.target = targetOpacity(d, lengthMm, crevice);
  out.occlusion = occlusion;
  v3Copy(out.capsuleA, cam);
  const k = d > 1e-9 ? Math.max(0, d - OCCLUSION_CONE_END_L * lengthMm) / d : 0;
  out.capsuleB.x = cam.x + (thorax.x - cam.x) * k;
  out.capsuleB.y = cam.y + (thorax.y - cam.y) * k;
  out.capsuleB.z = cam.z + (thorax.z - cam.z) * k;
  out.capsuleRadius = k > 0 ? OCCLUSION_CONE_RADIUS_L * lengthMm : 0;
  out.coneStart = OCCLUSION_CONE_START;
  return out;
}
