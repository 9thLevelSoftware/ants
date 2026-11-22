// Review of look-pass-4 (near-ground density floor). bladeShape.ts says BLADE_GLSL and bladeVertex (CPU) are twins that
// must stay in sync; look pass 4 added the NEAR_GROUND floor to the GLSL only. These tests evaluate the CPU twin, so a
// failure here means the twin (used by the "no blade through the camera" tests and dew visibility) disagrees with the GPU.
import { describe, expect, it } from 'vitest';
import { BLADE_STRIDE } from '../decor/instances';
import { NEAR_GROUND, nearFloorDensity } from '../decor/tuning';
import { BLADE_GLSL, bladeVertex, type BladeView } from './bladeShape';

/** One upright blade record: root (x, 0, z), rank, height 8 mm, width 1 mm, no lean, no curl. */
function blade(x: number, z: number, rank: number): Float32Array {
  const b = new Float32Array(BLADE_STRIDE);
  b[0] = x; b[1] = 0; b[2] = z; b[3] = rank; b[4] = 8; b[5] = 1; b[6] = 0; b[7] = 0.5; b[8] = 0; b[9] = 0;
  return b;
}

const view = (density: number): BladeView => ({
  cam: { x: 0, y: 6, z: 0 }, subject: { x: 0, y: 2, z: 300 }, part: false, bu: 4, time: 0, windDir: { x: 1, z: 0 }, wind: 0, density,
});

describe('bladeShape CPU twin keeps the near-ground floor of the GLSL (look pass 4 review)', () => {
  it('the GLSL applies the floor', () => {
    expect(BLADE_GLSL).toContain(NEAR_GROUND.grass.toFixed(3));
  });

  it('a blade 60 mm from the camera with a rank between the tier and the floor is drawn at the low tier (x0.25) on the GPU, so the CPU twin must keep it too', () => {
    const q = 0.25, d = 60, rank = (q + NEAR_GROUND.grass) / 2; // (was 0.5 while the floor was 0.6; the floor is tuned in decor/tuning.ts)
    expect(nearFloorDensity(q, NEAR_GROUND.grass, d)).toBeGreaterThan(rank); // the GPU keeps it
    const tip = bladeVertex(blade(0, d, rank), 0, 0, 1, view(q));
    expect(tip.fade, 'CPU twin hides a blade the shader draws').toBeGreaterThan(0);
  });

  it('far from the camera both agree that the low tier drops the blade', () => {
    const tip = bladeVertex(blade(0, 400, 0.5), 0, 0, 1, view(0.25));
    expect(tip.fade).toBe(0);
  });
});
