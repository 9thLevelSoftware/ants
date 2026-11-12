// Reviewer tests (render-nest): cut plane edge cases and the cap raster under continuous digging.
import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { CapRaster } from './capRaster';
import { capFaces } from './capFaces';
import { computeCutPlane, createCutPlane, cutKey, isHiddenByCut } from './cutPlane';

const BU = 4;

describe('cut plane edge cases (review)', () => {
  it('vertical section looking straight down (no horizontal view component) still gives a unit normal', () => {
    const cp = computeCutPlane(
      { mode: 'slice', planeY: -40, radius: 100, center: { x: 0, z: 0 }, section: 'vertical', viewDir: { x: 0, z: 0 } },
      () => 0, BU, createCutPlane(),
    );
    expect(Math.hypot(cp.n.x, cp.n.y, cp.n.z)).toBeCloseTo(1);
    expect(Math.hypot(cp.u.x, cp.u.y, cp.u.z)).toBeCloseTo(1);
  });

  it('radius 0 hides nothing; points exactly on the plane are kept (same rule as the shader)', () => {
    const z = computeCutPlane({ mode: 'slice', planeY: -40, radius: 0, center: { x: 0, z: 0 } }, () => 0, BU, createCutPlane());
    expect(isHiddenByCut(z, 0, 0, 0)).toBe(false);
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 0, z: 0 } }, () => 0, BU, createCutPlane());
    expect(isHiddenByCut(cp, 0, -40, 0)).toBe(false);
    expect(isHiddenByCut(cp, 0, -39.999, 0)).toBe(true);
  });

  it('the main cap face of a horizontal slice covers exactly the cut disc', () => {
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 50, z: 70 } }, () => 0, BU, createCutPlane());
    const [disc, pit] = capFaces(cp, 0, BU);
    expect(disc.u1 - disc.u0).toBe(200);
    expect(pit.kind).toBe('cylinder');
    expect(pit.v1).toBeGreaterThanOrEqual(40); // the pit wall reaches the ground from the plane
  });
});

describe('cap raster under continuous digging (review)', () => {
  it('a cap whose key changes every frame (any carve edit anywhere bumps the version) still completes', () => {
    const kernel = createKernel(makeFlatWorld({ size: 800, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 100, y: -40, z: 400 }, { x: 700, y: -40, z: 400 }, 4, { force: true });
    const src = nestSourceFromSim(kernelSim(kernel));
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 300, center: { x: 400, z: 400 } }, () => 0, BU, createCutPlane());
    const face = capFaces(cp, 0, BU)[0];
    const r = new CapRaster();
    // NestRenderer.updateCutaway builds the key as `${cutKey(cp)}|${src.version()}`; a digger far outside the cut
    // bites every frame (an active colony), and every frame has time for a slice of the rows only (here: 8 rows)
    let completed = false;
    for (let frame = 0; frame < 300 && !completed; frame++) {
      kernel.carveSphere({ x: 30 + (frame % 20) * 3, y: -100, z: 30 + Math.floor(frame / 20) * 3 }, 2.4, { force: true });
      r.start(face, `${cutKey(cp)}|${src.version()}`, 2, 512);
      for (let row = 0; row < 8 && !completed; row++) completed = r.step(src, 0);
    }
    expect(completed).toBe(true);
    expect(r.current).not.toBeNull();
  });

  it('reports the full raster time of a default slice cap (R_cut 120 BU)', () => {
    const kernel = createKernel(makeFlatWorld({ size: 1200, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 200, y: -40, z: 600 }, { x: 1000, y: -40, z: 600 }, 4, { force: true });
    const src = nestSourceFromSim(kernelSim(kernel));
    const R = 120 * BU;
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: R, center: { x: 600, z: 600 } }, () => 0, BU, createCutPlane());
    const r = new CapRaster();
    const texel = Math.max(0.5 * BU, (2 * R) / 512); // NestRenderer.updateCutaway's choice
    r.start(capFaces(cp, 0, BU)[0], 'k', texel, 512);
    const t0 = performance.now();
    while (!r.step(src, Infinity));
    const ms = performance.now() - t0;
    console.log(`NEST_REVIEW cap ${r.current!.width}x${r.current!.height}: ${ms.toFixed(0)} ms = ${(ms / 6).toFixed(0)} frames at the 6 ms budget`);
    expect(r.current!.width).toBeGreaterThan(100);
  });
});
