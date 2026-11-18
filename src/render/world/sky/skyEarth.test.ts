// The cutaway's inside-of-the-earth colour (app-seams-2 item 12): off by default, dark, and never part of the environment bake.
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { createSkyMaterial, createSkyUniforms, EARTH_BACKDROP } from './skyDome';

describe('sky dome earth backdrop', () => {
  it('is off until the possession cutaway asks for it', () => {
    expect(createSkyUniforms().earthAmt.value).toBe(0);
  });
  it('is a dark brown, far below the haze colour it replaces', () => {
    const c = new Color(EARTH_BACKDROP.color);
    expect(c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722).toBeLessThan(0.02);
    expect(c.r).toBeGreaterThan(c.b);
  });
  it('applies below the horizon only, and not in the image-based-light bake', () => {
    const m = createSkyMaterial(createSkyUniforms());
    expect(m.fragmentShader).toMatch(/if \(envPass < 0\.5\) col = mix\(col, earthColor, earthAmt \* \(1\.0 - smoothstep\(-0\.2, -0\.04, h\)\)\)/);
  });
});
