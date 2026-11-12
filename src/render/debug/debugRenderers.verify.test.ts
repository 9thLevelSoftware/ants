// Reviewer tests (F3b): the debug renderers must be correct, not pretty. Primitive meshes must sit on the field's
// own surface (seed §4: collision == visuals), the possessed ant must follow the prediction and hide on a fade,
// carried items must ride with their carrier, and the registry must survive a game restart.
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3, type Object3D } from 'three';
import { getPreset } from '@/render/app/quality';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { RenderRegistry, type FrameInfo, type RenderContext } from '../index';

function setup(sim: Sim) {
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
  return { scene, reg, frame };
}

function find(root: Object3D, name: string): Object3D | undefined {
  let hit: Object3D | undefined;
  root.traverse((o) => { if (o.name === name && !hit) hit = o; });
  return hit;
}

describe('debug renderers (reviewer)', () => {
  it('every primitive mesh vertex lies on the field surface (within the edge rounding)', () => {
    const sim = makeTestSim({ features: 'all' });
    const { scene } = setup(sim);
    const prims = find(scene, 'debug-prims')!;
    prims.updateMatrixWorld(true);
    const bu = sim.world.bu;
    const maxRound = Math.max(...sim.world.prims.map((p) => p.round));
    let checked = 0, worst = 0;
    const m = new Matrix4(), v = new Vector3();
    const test = (world: Vector3) => {
      if (world.y < sim.field.height(world.x, world.z) + 0.5 * bu) return; // under / at the ground: terrain dominates
      const f = sim.field.sampleXYZ(world.x, world.y, world.z);
      worst = Math.max(worst, Math.abs(f));
      checked++;
    };
    for (const o of prims.children) {
      const pos = (o as Mesh).geometry.getAttribute('position');
      if (o instanceof InstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          for (let k = 0; k < pos.count; k += 3) test(v.fromBufferAttribute(pos, k).applyMatrix4(m));
        }
      } else {
        for (let k = 0; k < pos.count; k += 3) test(v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld));
      }
    }
    expect(checked).toBeGreaterThan(100);
    // sharp box corners stand off a rounded box by at most round * (sqrt 3 - 1); tessellation chords are tiny
    expect(worst).toBeLessThan(maxRound * 0.8 + 0.05 * bu);
  });

  it('the possessed ant is drawn at the predicted pose and hidden when the camera fade says so', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    const { scene, reg, frame } = setup(sim);
    const queen = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const ants = () => find(scene, 'debug-ants') as InstancedMesh;
    const alive = sim.state.ants.filter((a) => a.alive);
    const idx = alive.indexOf(queen);
    const pred = { pos: { x: queen.pos.x + 3, y: queen.pos.y, z: queen.pos.z }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 } };
    reg.update({ ...frame, possessedId: queen.id, possessedPose: pred });
    const m = new Matrix4();
    ants().getMatrixAt(idx, m);
    const x = new Vector3(), y = new Vector3(), z = new Vector3();
    m.extractBasis(x, y, z);
    expect(x.normalize().z).toBeCloseTo(1, 6); // faces the predicted forward
    const o = new Vector3().setFromMatrixPosition(m);
    expect(o.x).toBeCloseTo(pred.pos.x, 6);
    reg.update({ ...frame, possessedId: queen.id, possessedPose: pred, subjectOpacity: 0 });
    expect(ants().count).toBe(alive.length - 1);
  });

  it('interpolates between the previous and current tick pose by alpha', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1 });
    const { scene, reg, frame } = setup(sim);
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    w.prevPos = { x: w.pos.x - 2, y: w.pos.y, z: w.pos.z };
    reg.update({ ...frame, alpha: 0.25 });
    const idx = sim.state.ants.filter((a) => a.alive).indexOf(w);
    const m = new Matrix4();
    (find(scene, 'debug-ants') as InstancedMesh).getMatrixAt(idx, m);
    const o = new Vector3().setFromMatrixPosition(m);
    expect(o.x).toBeCloseTo(w.pos.x - 1.5 + 0 * w.up.x, 1);
  });

  it('a second game after onGameEnd draws the new world, not the old one', () => {
    const a = makeTestSim({ features: ['wall'] });
    const { scene, reg, frame } = setup(a);
    reg.onGameEnd();
    const b = makeTestSim({ features: ['stone', 'stem'], sizeBu: 100 });
    reg.onGameStart(b);
    reg.update({ ...frame, sim: b });
    expect(reg.stats().world.primInstances).toBe(b.world.prims.length);
    const fine = find(scene, 'debug-terrain-fine') as Mesh;
    fine.geometry.computeBoundingBox();
    expect(fine.geometry.boundingBox!.max.x).toBeCloseTo(b.world.size, 3);
    expect(find(scene, 'debug-terrain-coarse')).toBeDefined();
  });

  it('many ants grow the instance pool without losing any', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: 600, caste: 'worker', ageGd: 5, task: null, pos: { ...sim.world.queenStart.pos } });
    sim.applyPendingCommands();
    const { reg } = setup(sim);
    expect(reg.stats().ants.ants).toBe(sim.state.ants.filter((a) => a.alive).length);
    expect(reg.stats().ants.ants).toBeGreaterThan(600);
  });
});
