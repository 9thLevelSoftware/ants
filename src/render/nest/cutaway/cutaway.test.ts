import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { CapRaster } from './capRaster';
import { capFaces } from './capFaces';
import { computeCutPlane, createCutPlane, cutKey, isHiddenByCut, toPlane } from './cutPlane';

const BU = 4;
const ground = () => 0;

describe('cut plane', () => {
  it('horizontal slice hides what is above the plane within R_cut only (GDD 01 6.7)', () => {
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 200, z: 200 } }, ground, BU, createCutPlane());
    expect(cp.vertical).toBe(false);
    expect(isHiddenByCut(cp, 200, -39, 200)).toBe(true); // just above the plane
    expect(isHiddenByCut(cp, 200, 0, 280)).toBe(true); // the ground above, inside the radius
    expect(isHiddenByCut(cp, 200, -41, 200)).toBe(false); // below the plane
    expect(isHiddenByCut(cp, 320, 0, 200)).toBe(false); // outside the radius
    const off = computeCutPlane({ mode: 'xray', planeY: -40, radius: 100, center: { x: 200, z: 200 } }, ground, BU, createCutPlane());
    expect(isHiddenByCut(off, 200, 0, 200)).toBe(false); // x-ray hides nothing (the cast is drawn over)
  });

  it('vertical section faces the camera yaw and hides the camera side; it is never mirrored', () => {
    for (const a of [0, 1, 2.5, -2]) {
      const dir = { x: Math.sin(a), z: Math.cos(a) };
      const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 0, z: 0 }, section: 'vertical', viewDir: dir }, ground, BU, createCutPlane());
      expect(cp.n.x * dir.x + cp.n.z * dir.z).toBeCloseTo(-1); // normal points back to the camera
      expect(isHiddenByCut(cp, -dir.x * 10, -50, -dir.z * 10)).toBe(true); // camera side, any depth
      expect(isHiddenByCut(cp, dir.x * 10, -50, dir.z * 10)).toBe(false); // far side stays
      // camera right = view x up: u.(dir x up) > 0
      const right = { x: -dir.z, z: dir.x };
      expect(cp.u.x * right.x + cp.u.z * right.z).toBeCloseTo(1);
      // the section faces reach from above the ground down 2.5 R: back face + two side faces of the hidden slab
      expect(cp.c.y).toBeGreaterThan(0);
      const faces = capFaces(cp, 0, BU);
      expect(faces.length).toBe(3);
      expect(faces[0].v0).toBeCloseTo(-250);
    }
  });

  it('cut key changes with the plane', () => {
    const a = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 0, z: 0 } }, ground, BU, createCutPlane());
    const k = cutKey(a);
    const b = computeCutPlane({ mode: 'slice', planeY: -42, radius: 100, center: { x: 0, z: 0 } }, ground, BU, createCutPlane());
    expect(cutKey(b)).not.toBe(k);
  });
});

describe('cap raster', () => {
  it('shows solid soil with holes exactly where the plane crosses a tunnel, built within a per-frame budget', () => {
    const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 100, y: -40, z: 200 }, { x: 300, y: -40, z: 200 }, 4, { force: true });
    const src = nestSourceFromSim(kernelSim(kernel));
    const cp = computeCutPlane({ mode: 'slice', planeY: -40, radius: 120, center: { x: 200, z: 200 } }, ground, BU, createCutPlane());
    const r = new CapRaster();
    r.start(capFaces(cp, 0, BU)[0], cutKey(cp), 2, 512);
    let frames = 0;
    while (!r.step(src, 0)) frames++; // deadline in the past: one row per call
    expect(frames).toBeGreaterThan(50); // spread over many frames
    const uv = { u: 0, v: 0 };
    toPlane(cp, 200, -40, 200, uv);
    expect(r.solidAt(uv.u, uv.v)).toBeLessThan(0.5); // tunnel axis: open
    toPlane(cp, 200, -40, 210, uv);
    expect(r.solidAt(uv.u, uv.v)).toBeGreaterThan(0.5); // 10 mm beside it: soil
    toPlane(cp, 200, -40, 203, uv);
    expect(r.solidAt(uv.u, uv.v)).toBeLessThan(0.5); // 3 mm from the axis (r = 4): open
    toPlane(cp, 200, -40, 205.5, uv);
    expect(r.solidAt(uv.u, uv.v)).toBeGreaterThan(0.5); // 5.5 mm: soil
  });

  it('is transparent where the plane is above the ground (vertical section above the surface)', () => {
    const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
    const src = nestSourceFromSim(kernelSim(kernel));
    const cp = computeCutPlane({ mode: 'slice', planeY: 0, radius: 60, center: { x: 200, z: 200 }, section: 'vertical', viewDir: { x: 0, z: 1 } }, ground, BU, createCutPlane());
    const r = new CapRaster();
    r.start(capFaces(cp, 0, BU)[0], cutKey(cp), 2, 256);
    r.step(src, Infinity);
    expect(r.solidAt(0, -2)).toBeLessThan(0.5); // 2 mm below the rectangle top = above ground (top is 4 BU up)
    expect(r.solidAt(0, -40)).toBeGreaterThan(0.5); // well below the ground
  });
});
