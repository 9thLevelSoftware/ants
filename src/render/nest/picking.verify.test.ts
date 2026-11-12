// Reviewer tests (render-nest): picks must return what is visible at the pixel.
import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshDepthMaterial, PerspectiveCamera } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from './simAdapter';
import { kernelSim } from './testing/kernelSim';
import { ChunkMeshManager } from './mesh/chunkMeshManager';
import { CapRaster } from './cutaway/capRaster';
import { capFaces } from './cutaway/capFaces';
import { computeCutPlane, createCutPlane, cutKey } from './cutaway/cutPlane';
import { pickNest } from './picking';

const BU = 4;

describe('nest picking (review)', () => {
  it('slice: intact ground outside R_cut that lies in front of the cut face wins the pick', () => {
    const kernel = createKernel(makeFlatWorld({ size: 600, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 150, y: -40, z: 300 }, { x: 450, y: -40, z: 300 }, 4, { force: true });
    const src = nestSourceFromSim(kernelSim(kernel));
    const manager = new ChunkMeshManager({ wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() });
    manager.build = { refine: false, ao: false };
    manager.setSource(src);
    manager.flush();
    for (const m of manager.meshes()) m.updateMatrixWorld();
    const plane = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 300, z: 300 } }, () => 0, BU, createCutPlane());
    const cap = new CapRaster();
    cap.start(capFaces(plane, 0, BU)[0], cutKey(plane), 2, 512);
    cap.step(src, Infinity);
    // a low camera outside the cut, looking at the cut centre: the ray meets the (visible, uncut) ground at z ~ 460
    // long before it would reach the plane inside the cut
    const camera = new PerspectiveCamera(40, 1, 0.5, 5000);
    camera.position.set(300, 10, 500);
    camera.lookAt(300, -40, 310);
    camera.updateMatrixWorld();
    const p = pickNest(0, 0, camera, { src, manager, plane, cap, skinMm: 0.2, maxDist: 2000 })!;
    expect(p.kind).toBe('surface');
    expect(p.point.y).toBeCloseTo(0, 1);
  });
});

describe('nest picking on every cut face', () => {
  it('slice: a ray into the pit that meets the pit wall below the ground picks the wall cross-section', () => {
    const kernel = createKernel(makeFlatWorld({ size: 600, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 150, y: -40, z: 300 }, { x: 450, y: -40, z: 300 }, 4, { force: true });
    const src = nestSourceFromSim(kernelSim(kernel));
    const manager = new ChunkMeshManager({ wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() });
    manager.build = { refine: false, ao: false };
    manager.setSource(src);
    manager.flush();
    for (const m of manager.meshes()) m.updateMatrixWorld();
    const plane = computeCutPlane({ mode: 'slice', planeY: -40, radius: 100, center: { x: 300, z: 300 } }, () => 0, BU, createCutPlane());
    const faces = capFaces(plane, 0, BU).map((f, i) => { const r = new CapRaster(); r.start(f, `${cutKey(plane)}|${i}`, 2, 2048); while (!r.step(src, Infinity)); return r; });
    const camera = new PerspectiveCamera(40, 1, 0.5, 5000);
    camera.position.set(300, 30, 150);
    camera.lookAt(300, -20, 395);
    camera.updateMatrixWorld();
    const p = pickNest(0, 0, camera, { src, manager, plane, cap: faces[0], faces, skinMm: 0.2, maxDist: 2000 })!;
    expect(p.kind).toBe('cap');
    expect(Math.hypot(p.point.x - 300, p.point.z - 300)).toBeCloseTo(100, 0); // on the pit wall
    expect(p.point.y).toBeLessThan(0);
    expect(p.point.y).toBeGreaterThan(-40);
    expect(p.normal.z).toBeLessThan(-0.9); // facing back into the pit, towards the camera
  });
});
