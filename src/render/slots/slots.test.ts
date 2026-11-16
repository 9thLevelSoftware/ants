// int-1A (+ wire-stage2: creatures, humans, weather, fx): the real world / nest / ant renderers behind the registry (headless three in Node, no WebGL; the sky's
// PMREM bake is stubbed): registration, shared material library, game start / end, quality switches, disposal,
// the possessed ant drawn at the predicted pose, statistics as plain numbers.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import { makeTestSim } from '@/sim/testing';
import { AntsSlot, NestSlot, WorldSlot } from './index';

function context(scene: Scene, camera: PerspectiveCamera): RenderContext {
  return {
    renderer: { domElement: { height: 360 } } as unknown as WebGLRenderer, scene, camera, quality: getPreset('test'), assets: null,
    game: { requestRender: () => {}, testMode: true },
  };
}

function stubSky(reg: RenderRegistry): void {
  const w = reg.entries.find((e) => e.slot === 'world')!.renderer as WorldSlot;
  (w.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
}

function frame(sim: FrameInfo['sim'], camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'possess', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

describe('render registry with the real renderers', () => {
  it('registers world, nest and ants; shares the material library; runs a game start, frames and end', async () => {
    const reg = new RenderRegistry();
    const d = reg.describe();
    expect([d.world, d.nest, d.ants, d.creatures, d.humans, d.weather, d.fx]).toEqual(['world', 'nest', 'ants', 'creatures', 'humans', 'weather', 'fx']);
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    await reg.init(context(scene, camera));
    stubSky(reg);
    const world = reg.entries[0]!.renderer as WorldSlot, nest = reg.entries[1]!.renderer as NestSlot;
    expect((nest.nest as unknown as { library: unknown }).library).toBe(world.world.library);

    const sim = makeTestSim({ nest: 'small', workers: 5 });
    await reg.onGameStart(sim);
    const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    camera.position.set(q.pos.x - 30, q.pos.y + 20, q.pos.z);
    camera.lookAt(q.pos.x, q.pos.y, q.pos.z);
    camera.updateMatrixWorld();
    reg.update(frame(sim, camera, { subject: q.pos }));
    const st = reg.stats();
    expect(st.world!.terrainTriangles).toBeGreaterThan(0);
    expect(st.nest!.chunks).toBeGreaterThan(0); // the small test nest is meshed at game start (test mode flushes)
    expect(st.ants!.ants).toBeGreaterThanOrEqual(6);
    for (const slot of Object.values(st)) for (const v of Object.values(slot)) expect(typeof v).toBe('number');

    for (const id of ['low', 'high', 'test'] as const) { reg.setQuality(getPreset(id)); reg.update(frame(sim, camera)); }

    reg.onGameEnd();
    reg.update(frame(null, camera));
    expect(reg.stats().world!.terrainTriangles).toBe(0);
    expect(reg.stats().nest!.chunks).toBe(0);
    reg.dispose();
    expect(scene.children.filter((c) => c.name !== '').map((c) => c.name)).toEqual([]);
  });

  it('draws the possessed ant at the predicted pose, not the tick pose', () => {
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    const ants = new AntsSlot();
    ants.init(context(scene, camera));
    const sim = makeTestSim({});
    const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    sim.state.player.possessedAntId = q.id;
    camera.position.set(q.pos.x - 20, q.pos.y + 10, q.pos.z);
    camera.lookAt(q.pos.x, q.pos.y, q.pos.z);
    camera.updateMatrixWorld();
    const pose = { pos: { x: q.pos.x + 3, y: q.pos.y, z: q.pos.z }, up: { ...q.up }, fwd: { ...q.fwd } };
    ants.update(frame(sim, camera, { possessedId: q.id, possessedPose: pose }));
    const feet = ants.ants.debugFeet(q.id)!;
    const cx = feet.reduce((s, f) => s + f.x, 0) / feet.length;
    expect(Math.abs(cx - pose.pos.x)).toBeLessThan(Math.abs(cx - q.pos.x));
    ants.dispose();
  });
});
