// Reviewer tests (render-nest): the NestRenderer facade driven in Node (no GL context is needed until a frame is
// drawn): lifecycle, cutaway modes, the sense-light centre, the underground flag and the ghost hook.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type Object3D, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { NestRenderer, type NestCutawayParams } from './index';
import { kernelSim } from './testing/kernelSim';

const BU = 4;

function world(possessed = false) {
  const kernel = createKernel(makeFlatWorld({ size: 600, bu: BU, h0: 0 }), emptyCarve(BU));
  kernel.carveCapsule({ x: 100, y: -40, z: 300 }, { x: 500, y: -40, z: 300 }, 4, { force: true });
  kernel.carveEllipsoid({ x: 300, y: -40, z: 300 }, { x: 24, y: 7, z: 20 }, { force: true });
  const ants = new Map([[7, { pos: { x: 120, y: -43.4, z: 300 } }]]);
  const sim = kernelSim(kernel, { ants, possessedAntId: possessed ? 7 : -1 });
  return { kernel, sim };
}

async function renderer() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 40000);
  const r = new NestRenderer();
  await r.init({ renderer: {} as WebGLRenderer, scene, camera, quality: getPreset('test'), assets: null });
  return { r, scene, camera };
}

function isInScene(o: Object3D, scene: Scene): boolean {
  let p: Object3D | null = o;
  while (p) { if (p === scene) return true; p = p.parent; }
  return false;
}

describe('NestRenderer (review)', () => {
  it('meshes the nest, hides walls in x-ray and mirrors them in the cast, and goes back to normal', async () => {
    const { sim } = world();
    const { r, camera } = await renderer();
    r.setSim(sim);
    r.flush();
    const s = r.stats();
    expect(s.chunks).toBeGreaterThan(5);
    camera.position.set(300, 300, 0); camera.lookAt(300, -40, 300); camera.updateMatrixWorld();
    const cut: NestCutawayParams = { mode: 'xray', planeY: -40, radius: 400, center: { x: 300, z: 300 } };
    r.update({ dt: 0, time: 0, cutaway: cut });
    expect(r.meshes.group.visible).toBe(false);
    r.update({ dt: 0, time: 0, cutaway: null });
    expect(r.meshes.group.visible).toBe(true);
    r.dispose();
  });

  it('flags the camera as underground inside the tunnel and not above ground', async () => {
    const { sim } = world();
    const { r, camera } = await renderer();
    r.setSim(sim);
    camera.position.set(300, -40, 300); camera.updateMatrixWorld();
    r.update({ dt: 0, time: 0 });
    expect(r.look.underground).toBe(true);
    expect(r.look.under).toBe(1);
    camera.position.set(300, 30, 300); camera.updateMatrixWorld();
    r.update({ dt: 0, time: 0 });
    expect(r.look.underground).toBe(false);
    r.dispose();
  });

  it('centres the sense light on the possessed ant, on the camera when nobody is possessed', async () => {
    const a = world(true), b = world(false);
    const { r, camera } = await renderer();
    camera.position.set(300, -40, 300); camera.updateMatrixWorld();
    r.setSim(a.sim);
    r.update({ dt: 0, time: 0 });
    expect(r.uniforms.uLanternPos.value.x).toBeCloseTo(120);
    r.setSim(b.sim);
    r.update({ dt: 0, time: 0 });
    expect(r.uniforms.uLanternPos.value.x).toBeCloseTo(300);
    r.dispose();
  });

  it('a slice pick returns a point on the cut face once the cap is built', async () => {
    const { sim } = world();
    const { r, camera } = await renderer();
    r.setSim(sim);
    r.flush();
    camera.position.set(300, 200, 330); camera.lookAt(300, -40, 330); camera.updateMatrixWorld();
    const cut: NestCutawayParams = { mode: 'slice', planeY: -40, radius: 200, center: { x: 300, z: 300 } };
    r.update({ dt: 0, time: 0, cutaway: cut });
    r.flushCutaway();
    const p = r.pick(0, 0)!;
    expect(p.kind).toBe('cap');
    expect(p.point.y).toBeCloseTo(-40, 3);
    r.dispose();
  });

  it('ghosts still draw after dispose() + init() (the demo re-creates renderers on a quality switch)', async () => {
    const { r, scene, camera } = await renderer();
    r.dispose();
    await r.init({ renderer: {} as WebGLRenderer, scene, camera, quality: getPreset('test'), assets: null });
    r.ghosts.set([{ center: { x: 0, y: 0, z: 0 }, radii: { x: 2, y: 2, z: 2 }, color: '#F0E442' }]);
    expect(r.ghosts.count).toBe(1);
    const drawn = r.ghosts.group.children.filter((c) => isInScene(c, scene));
    expect(drawn.length).toBe(2); // both ghost layers are still in the scene
  });

  it('NaN / zero dt and a camera far outside the world do not poison the eased look values', async () => {
    const { sim } = world();
    const { r, camera } = await renderer();
    r.setSim(sim);
    camera.position.set(-1e5, 50, -1e5); camera.updateMatrixWorld();
    r.update({ dt: 0.016, time: 0 });
    r.update({ dt: Number.NaN, time: 0 });
    expect(Number.isFinite(r.look.under)).toBe(true);
    expect(Number.isFinite(r.look.exposureEV)).toBe(true);
    r.dispose();
  });
});
