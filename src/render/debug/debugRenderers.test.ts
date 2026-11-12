// The debug renderers on a real (small) sim, without WebGL: scene contents, true scale and orientation.
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3, type Object3D } from 'three';
import { getPreset } from '@/render/app/quality';
import { makeTestSim } from '@/sim/testing';
import { RenderRegistry, type FrameInfo, type RenderContext } from '../index';
import { buildAntShape } from './antShape';

function setup(opts: Parameters<typeof makeTestSim>[0] = {}) {
  const sim = makeTestSim(opts);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const reg = new RenderRegistry();
  const ctx = { renderer: {} as RenderContext['renderer'], scene, camera, quality: getPreset('test'), assets: null, game: { requestRender: () => {}, testMode: true } };
  reg.init(ctx);
  reg.onGameStart(sim);
  const frame: FrameInfo = {
    dt: 0, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 720, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null,
  };
  reg.update(frame);
  return { sim, scene, reg, frame };
}

function find(root: Object3D, name: string): Object3D | undefined {
  let hit: Object3D | undefined;
  root.traverse((o) => { if (o.name === name && !hit) hit = o; });
  return hit;
}

describe('debug renderers', () => {
  it('every slot falls back to its debug renderer', () => {
    const { reg } = setup();
    expect(reg.entries.map((e) => [e.slot, e.debug])).toEqual([['world', true], ['nest', true], ['ants', true], ['creatures', true], ['fx', true]]);
  });

  it('terrain follows the field height and covers the world', () => {
    const { scene, sim } = setup({ terrain: 'noise' });
    const fine = find(scene, 'debug-terrain-fine') as Mesh;
    expect(fine).toBeDefined();
    const p = fine.geometry.getAttribute('position');
    for (const i of [0, 77, p.count - 1]) expect(p.getY(i)).toBeCloseTo(sim.field.height(p.getX(i), p.getZ(i)), 4);
    fine.geometry.computeBoundingBox();
    expect(fine.geometry.boundingBox!.max.x).toBeCloseTo(sim.world.size, 3);
  });

  it('draws each ant at its true length, oriented by fwd / up, feet on its foot plane', () => {
    const { scene, sim } = setup({ nest: 'small', workers: 3 });
    const ants = find(scene, 'debug-ants') as InstancedMesh;
    expect(ants.count).toBe(sim.state.ants.filter((a) => a.alive).length);
    const queen = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const idx = sim.state.ants.filter((a) => a.alive).indexOf(queen);
    const m = new Matrix4();
    ants.getMatrixAt(idx, m);
    const x = new Vector3(), y = new Vector3(), z = new Vector3();
    m.extractBasis(x, y, z);
    const L = queen.lengthBu * sim.world.bu;
    expect(x.length()).toBeCloseTo(L, 6);
    expect(x.clone().normalize().dot(new Vector3(queen.fwd.x, queen.fwd.y, queen.fwd.z))).toBeGreaterThan(0.999);
    expect(y.clone().normalize().dot(new Vector3(queen.up.x, queen.up.y, queen.up.z))).toBeGreaterThan(0.999);
    const origin = new Vector3().setFromMatrixPosition(m);
    expect(origin.distanceTo(new Vector3(queen.pos.x, queen.pos.y, queen.pos.z))).toBeCloseTo(queen.footOffset, 6);
  });

  it('meshes the carved test nest and discards nothing it should keep', () => {
    const { scene, reg } = setup({ nest: 'small' });
    let chunks = 0;
    find(scene, 'debug-nest-root')!.traverse((o) => { if (o.name.startsWith('chunk-')) chunks++; });
    expect(chunks).toBeGreaterThan(0);
    expect(reg.stats().nest.triangles).toBeGreaterThan(100);
  });

  it('the stand-in ant shape is one body length long with its feet on y = 0', () => {
    const g = buildAntShape();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.y).toBeCloseTo(0, 2);
    expect(b.max.x - b.min.x).toBeGreaterThan(0.85);
    expect(b.max.x - b.min.x).toBeLessThan(1.15);
  });

  it('game end removes game meshes; dispose leaves the scene empty of debug roots', () => {
    const { scene, reg } = setup({ nest: 'small' });
    reg.onGameEnd();
    expect(find(scene, 'debug-terrain-fine')).toBeUndefined();
    reg.dispose();
    expect(scene.children.length).toBe(0);
  });
});
