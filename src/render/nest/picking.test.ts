import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshDepthMaterial, PerspectiveCamera } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from './simAdapter';
import { kernelSim } from './testing/kernelSim';
import { ChunkMeshManager } from './mesh/chunkMeshManager';
import { CapRaster } from './cutaway/capRaster';
import { capFaces } from './cutaway/capFaces';
import { computeCutPlane, createCutPlane, cutKey, type NestCutawayParams } from './cutaway/cutPlane';
import { pickNest, projectOnCut, snapToWall } from './picking';

const BU = 4;

function scene(mode: NestCutawayParams['mode']) {
  const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
  kernel.carveCapsule({ x: 100, y: -40, z: 200 }, { x: 300, y: -40, z: 200 }, 4, { force: true });
  const src = nestSourceFromSim(kernelSim(kernel));
  const manager = new ChunkMeshManager({ wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() });
  manager.build = { refine: false, ao: false };
  manager.setSource(src);
  manager.flush();
  for (const r of manager.regions.values()) r.mesh!.updateMatrixWorld();
  const plane = computeCutPlane({ mode, planeY: -40, radius: 120, center: { x: 200, z: 200 } }, () => 0, BU, createCutPlane());
  const cap = new CapRaster();
  if (mode === 'slice') { cap.start(capFaces(plane, 0, BU)[0], cutKey(plane), 1, 512); cap.step(src, Infinity); }
  // camera straight above the tunnel axis, looking down
  const camera = new PerspectiveCamera(40, 1, 0.5, 5000);
  camera.position.set(200, 150, 200);
  camera.up.set(0, 0, -1);
  camera.lookAt(200, -40, 200);
  camera.updateMatrixWorld();
  return { src, ctx: { src, manager, plane, cap, skinMm: 0.2, maxDist: 1000 }, camera };
}

describe('nest picking', () => {
  it('x-ray: the first nest wall along the ray, through the ground', () => {
    const { ctx, camera } = scene('xray');
    const p = pickNest(0, 0, camera, ctx)!;
    expect(p.kind).toBe('wall');
    expect(p.point.y).toBeCloseTo(-36, 0); // the tunnel's roof (r = 4 mm around y = -40)
    expect(p.underground).toBe(true);
  });

  it('slice: solid cut face gives a point on the plane; a hole continues to the tunnel floor', () => {
    const { ctx, camera } = scene('slice');
    // ndc y > 0 is towards -z here (camera up = -z): 0.08 ndc ~ 15 mm beside the axis at the plane
    const onCap = pickNest(0, 0.08, camera, ctx)!;
    expect(onCap.kind).toBe('cap');
    expect(onCap.point.y).toBeCloseTo(-40, 3);
    expect(onCap.normal.y).toBeCloseTo(1);
    const through = pickNest(0, 0, camera, ctx)!;
    expect(through.kind).toBe('wall');
    expect(through.point.y).toBeCloseTo(-44, 0); // floor of the cut tunnel
  });

  it('no cutaway: the ground surface', () => {
    const { ctx, camera } = scene('off');
    const p = pickNest(0, 0.3, camera, ctx)!;
    expect(p.kind).toBe('surface');
    expect(Math.abs(p.point.y)).toBeLessThan(0.05);
    expect(p.underground).toBe(false);
  });

  it('snaps a marker to the nearest wall and projects it on the cut plane', () => {
    const { src, ctx } = scene('slice');
    const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
    expect(snapToWall(src, { x: 200, y: -40, z: 210 }, 10, out, n)).toBe(true);
    expect(Math.hypot(out.y + 40, out.z - 200)).toBeCloseTo(4, 0); // on the tunnel wall
    expect(n.z).toBeLessThan(-0.5); // normal into the tunnel (free space)
    const pr = projectOnCut(ctx.plane, { x: 210, y: -55, z: 190 }, { x: 0, y: 0, z: 0 });
    expect(pr).toEqual({ x: 210, y: -40, z: 190 });
  });
});
