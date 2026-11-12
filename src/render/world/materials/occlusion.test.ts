// Near-camera occlusion (GDD 01 6.5 rule 3) for the world materials: the camera's FadeOutput reaches the shared
// uniforms, every dithering material declares the same GLSL, and depth (shadow) materials never dither.
import { describe, expect, it } from 'vitest';
import type { FadeOutput } from '@/render/camera';
import { applyOcclusion, GLSL_OCCLUSION, WORLD_OCCLUSION_KEEP } from './occlusion';
import { createWorldUniforms } from './uniforms';

const fade = (o: Partial<FadeOutput> = {}): FadeOutput => ({
  target: 1, occlusion: 1, capsuleA: { x: 0, y: 10, z: 0 }, capsuleB: { x: 0, y: 2, z: 18 }, capsuleRadius: 3, coneStart: 0.35, ...o,
});

describe('world occlusion uniforms', () => {
  it('a full-strength cone keeps the nest slot\'s fraction of fragments', () => {
    const u = createWorldUniforms();
    applyOcclusion(u, fade());
    expect(u.uOcc.value.x).toBe(3);
    expect(u.uOcc.value.y).toBeCloseTo(WORLD_OCCLUSION_KEEP);
    expect(u.uOcc.value.z).toBeCloseTo(0.35);
    expect(u.uOccB.value.z).toBe(18);
  });
  it('strength eases the kept fraction toward 1', () => {
    const u = createWorldUniforms();
    applyOcclusion(u, fade({ occlusion: 0.5 }));
    expect(u.uOcc.value.y).toBeCloseTo(1 - 0.5 * (1 - WORLD_OCCLUSION_KEEP));
  });
  it('no fade, zero strength or zero radius switch it off', () => {
    const u = createWorldUniforms();
    for (const f of [null, undefined, fade({ occlusion: 0 }), fade({ capsuleRadius: 0 })]) {
      applyOcclusion(u, fade());
      applyOcclusion(u, f);
      expect(u.uOcc.value.x).toBe(0);
    }
  });
  it('the dither spares fragments below the ant\'s floor and outside (0, tMax) along the cone', () => {
    expect(GLSL_OCCLUSION).toContain('if (w.y < uWrOccB.y - uWrOcc.w * uWrOcc.x) return;');
    expect(GLSL_OCCLUSION).toContain('if (t <= 0.0 || t >= tMax) return;');
  });
});
