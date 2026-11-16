// The soft blob shadow of a human-event actor follows the light's direction (matching the world's other shadows).
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { newSunBlob, sunBlob, SHADOW_MAX_COT, SHADOW_MIN_STRENGTH } from './sunShadow';

const norm = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

describe('sunBlob', () => {
  it('leans away from the sun: the blob axis and its offset point opposite the light', () => {
    const [x, y, z] = norm(0.6, 0.5, 0.3);
    const b = sunBlob(x, y, z, 1, 100, 1, 0, newSunBlob());
    const axis = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), b.yaw));
    const h = Math.hypot(x, z);
    expect(axis.x).toBeCloseTo(-x / h, 6);
    expect(axis.z).toBeCloseTo(-z / h, 6);
    expect(b.dx * x + b.dz * z).toBeLessThan(0);
  });

  it('is longer for a low sun than a high one, and capped', () => {
    const low = sunBlob(...norm(1, 0.25, 0), 1, 100, 1, 0, newSunBlob());
    const high = sunBlob(...norm(0.1, 1, 0), 1, 100, 1, 0, newSunBlob());
    expect(low.major).toBeGreaterThan(high.major);
    const grazing = sunBlob(...norm(1, 0.001, 0), 1, 100, 1, 0, newSunBlob());
    expect(grazing.major).toBeLessThanOrEqual(100 * (0.8 + 0.55 * SHADOW_MAX_COT) + 1e-9);
  });

  it('a lifted actor casts a wider shadow that slid away; weak light makes it fainter but not gone', () => {
    const d = norm(0.5, 0.6, 0.2);
    const down = sunBlob(...d, 1, 100, 0.55, 0, newSunBlob());
    const up = sunBlob(...d, 1, 100, 0.55, 600, newSunBlob());
    expect(up.minor).toBeGreaterThan(down.minor);
    expect(Math.hypot(up.dx, up.dz)).toBeGreaterThan(Math.hypot(down.dx, down.dz));
    const dark = sunBlob(...d, 0, 100, 0.55, 0, newSunBlob());
    expect(dark.strength).toBeCloseTo(SHADOW_MIN_STRENGTH, 9);
    expect(sunBlob(...d, 1, 100, 0.55, 0, newSunBlob()).strength).toBeCloseTo(1, 9);
  });

  it('light straight overhead gives a symmetric blob without NaN', () => {
    const b = sunBlob(0, 1, 0, 1, 100, 1, 0, newSunBlob());
    for (const v of [b.yaw, b.major, b.minor, b.dx, b.dz]) expect(Number.isFinite(v)).toBe(true);
  });
});
