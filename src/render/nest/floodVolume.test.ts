// app-seams-4 fix pass: standing water as a volume. The nest walls and floor under the flood level are tinted by the water above them (params.ts FLOOD_VOLUME),
// so a flooded cell reads as water from every view angle, not as a pale line (edge-on) over untinted soil.
import { describe, expect, it } from 'vitest';
import { FLOOD_VOLUME } from './params';
import { createNestUniforms } from './materials/nestUniforms';
import { GLSL_NEST_COMMON, wallFragment } from './materials/glsl';
import { NestRenderer } from './NestRenderer';

describe('flood volume tint of the nest walls', () => {
  it('the uniforms start off and carry the tuning', () => {
    const u = createNestUniforms();
    expect(u.uFlood.value.w).toBe(0);
    expect(u.uFlood.value.y).toBe(FLOOD_VOLUME.efoldMm);
    expect(u.uFlood.value.z).toBe(FLOOD_VOLUME.strength);
    expect(u.uFloodTint.value.g).toBeCloseTo(FLOOD_VOLUME.tint[1], 5);
  });

  it('the wall shader declares the uniforms and tints what lies under the level by the depth of the water above it', () => {
    expect(GLSL_NEST_COMMON).toContain('uniform vec4 uFlood;');
    const f = wallFragment({ woody: false });
    expect(f).toContain('uFlood.x - vNestW.y');
    expect(f).toContain('exp(-wd / uFlood.y)');
    // dry walls (no level, or the wall above the water) are not touched: the tint is behind the on flag and the depth test
    expect(f).toContain('if (uFlood.w > 0.5)');
    expect(f).toContain('if (wd > 0.0)');
  });

  it('NestRenderer.setFloodLevel sets the level and the on flag, null (or a non-finite level) switches it off', () => {
    const r = new NestRenderer();
    r.setFloodLevel(-0.95);
    expect(r.uniforms.uFlood.value.x).toBeCloseTo(-0.95, 6);
    expect(r.uniforms.uFlood.value.w).toBe(1);
    r.setFloodLevel(null);
    expect(r.uniforms.uFlood.value.w).toBe(0);
    r.setFloodLevel(3);
    r.setFloodLevel(Number.NaN);
    expect(r.uniforms.uFlood.value.w).toBe(0);
  });
});
