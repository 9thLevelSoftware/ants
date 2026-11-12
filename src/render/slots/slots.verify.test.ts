// Review of int-1A-app (adversarial): the registry slot adapters around the real world / nest / ant renderers.
// Headless three in Node (no WebGL); the sky's PMREM bake is stubbed as in slots.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type Material, type Mesh, type PointLight, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import type { CutawayParams } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { AntsSlot, NestSlot, WorldSlot } from './index';
import { WET_EASE_S, WET_PER_PRECIP } from './params';

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

function frame(sim: Sim | null, camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'possess', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

function lookAtQueen(sim: Sim, camera: PerspectiveCamera, back = 30, up = 20) {
  const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
  camera.position.set(q.pos.x - back, q.pos.y + up, q.pos.z);
  camera.lookAt(q.pos.x, q.pos.y, q.pos.z);
  camera.updateMatrixWorld();
  return q;
}

async function bootRegistry() {
  const reg = new RenderRegistry();
  const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
  await reg.init(context(scene, camera));
  stubSky(reg);
  const world = reg.entries[0]!.renderer as WorldSlot, nest = reg.entries[1]!.renderer as NestSlot, ants = reg.entries[2]!.renderer as AntsSlot;
  return { reg, scene, camera, world, nest, ants };
}

function materialsOf(root: { traverse(fn: (o: unknown) => void): void }, skip?: unknown): Material[] {
  const out: Material[] = [];
  root.traverse((o) => {
    const m = (o as Mesh).material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) out.push(x);
  });
  return skip ? out.filter((m) => m !== skip) : out;
}

describe('int-1A-app review: slot adapters', () => {
  it('a second game unsubscribes the first sim: its carve / mound events no longer reach the renderers', async () => {
    const { reg, camera, world, nest } = await bootRegistry();
    const simA = makeTestSim({ nest: 'small', workers: 2 });
    await reg.onGameStart(simA);
    reg.onGameEnd();
    const simB = makeTestSim({ nest: 'small', workers: 2, seed: 2 });
    await reg.onGameStart(simB);
    lookAtQueen(simB, camera);
    reg.update(frame(simB, camera));
    const markDirty = vi.spyOn(nest.nest, 'markDirty');
    const moundChanged = vi.spyOn(world.world, 'onMoundChanged');
    simA.events.emit('carve-chunks-dirty', { keys: [1, 2, 3] } as never);
    simA.events.emit('mound-changed', { moundId: 1 } as never);
    expect(markDirty).not.toHaveBeenCalled();
    expect(moundChanged).not.toHaveBeenCalled();
    simB.events.emit('carve-chunks-dirty', { keys: [1] } as never);
    simB.events.emit('mound-changed', { moundId: 7 } as never);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(moundChanged).toHaveBeenCalledWith(7);
    reg.dispose();
  });

  it('two overlapping game starts (the first not awaited) leave the renderers on the newer sim', async () => {
    const { reg, camera } = await bootRegistry();
    const simA = makeTestSim({ nest: 'small', workers: 1 });
    const simB = makeTestSim({ nest: 'small', workers: 4, seed: 3 });
    const pa = reg.onGameStart(simA);
    const pb = reg.onGameStart(simB);
    await Promise.all([pa, pb]);
    lookAtQueen(simB, camera);
    reg.update(frame(simB, camera));
    const st = reg.stats();
    expect(st.world!.terrainTriangles).toBeGreaterThan(0);
    expect(st.ants!.ants).toBe(simB.state.ants.filter((a) => a.alive).length);
    reg.dispose();
  });

  it('a game started after a runtime quality switch is built with the new preset (same as booting at it)', async () => {
    const a = await bootRegistry();
    a.reg.setQuality(getPreset('high'));
    const sim = makeTestSim({});
    await a.reg.onGameStart(sim);
    lookAtQueen(sim, a.camera);
    a.reg.update(frame(sim, a.camera));

    const b = new RenderRegistry();
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    await b.init({ ...context(scene, camera), quality: getPreset('high') });
    stubSky(b);
    const sim2 = makeTestSim({});
    await b.onGameStart(sim2);
    lookAtQueen(sim2, camera);
    b.update(frame(sim2, camera));
    expect(a.reg.stats().world!.terrainLevels).toBe(b.stats().world!.terrainLevels);
    expect(a.reg.stats().world!.terrainTriangles).toBe(b.stats().world!.terrainTriangles);
    a.reg.dispose(); b.dispose();
  });

  it('wetness eases toward min(1, precip x WET_PER_PRECIP) with the WET_EASE_S time constant, and a dt-0 frame snaps', async () => {
    const { reg, camera, world } = await bootRegistry();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    lookAtQueen(sim, camera);
    const weather = sim.state.env.weather as { precip: number };
    weather.precip = 0;
    reg.update(frame(sim, camera, { dt: 0 }));
    const wet = () => (world.world as unknown as { wet: number }).wet;
    expect(wet()).toBe(0);
    weather.precip = 0.25; // target 0.5
    reg.update(frame(sim, camera, { dt: 1 }));
    const target = Math.min(1, 0.25 * WET_PER_PRECIP);
    expect(wet()).toBeCloseTo(target * (1 - Math.exp(-1 / WET_EASE_S)), 6);
    reg.update(frame(sim, camera, { dt: 0 }));
    expect(wet()).toBeCloseTo(target, 9);
    weather.precip = 5; // clamps to 1
    reg.update(frame(sim, camera, { dt: 0 }));
    expect(wet()).toBe(1);
    reg.dispose();
  });

  it('the nest sense point light is off above ground, positive and finite underground, and off again after the game', async () => {
    const { reg, scene, camera, nest } = await bootRegistry();
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    await reg.onGameStart(sim);
    const light = scene.getObjectByName('nest:sense-light') as PointLight;
    expect(light).toBeTruthy();
    const q = lookAtQueen(sim, camera, 40, 400); // high above the ground
    reg.update(frame(sim, camera, { subject: q.pos }));
    expect(light.intensity).toBe(0);
    // camera deep in the soil next to the small nest's chambers: the nest look goes underground (settle frame, dt 0)
    const ch = sim.state.nests[0]?.chambers[0];
    expect(ch).toBeTruthy();
    const c = ch!.center;
    expect(sim.field.substrate(c)).toBeLessThan(0); // really below the ground
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.x + 10, c.y, c.z);
    camera.updateMatrixWorld();
    for (let i = 0; i < 30; i++) reg.update(frame(sim, camera, { dt: 0.2, underground: true, subject: c }));
    expect(nest.nest.look.under).toBeGreaterThan(0.01);
    expect(Number.isFinite(light.intensity)).toBe(true);
    expect(light.intensity).toBeGreaterThan(0);
    reg.onGameEnd();
    expect(light.intensity).toBe(0);
    reg.dispose();
  });

  it('the colony cutaway patches every scene-lit surface material once (ants included) and never the nest group', async () => {
    const { reg, scene, camera, nest } = await bootRegistry();
    const sim = makeTestSim({ nest: 'small', workers: 3 });
    await reg.onGameStart(sim);
    const q = lookAtQueen(sim, camera, 60, 120);
    reg.update(frame(sim, camera));
    const cut: CutawayParams = { mode: 'slice', planeY: q.pos.y - 5, radius: 200, center: { x: q.pos.x, z: q.pos.z }, outsideDarken: 0.3, minPlaneY: q.pos.y - 400 };
    reg.update(frame(sim, camera, { view: 'colony', cutaway: cut }));
    const nestMats = new Set(materialsOf(nest.nest.group as never));
    const surface = materialsOf(scene as never).filter((m) => !nestMats.has(m) && (m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial);
    expect(surface.length).toBeGreaterThan(0);
    for (const m of surface) expect((m.userData as { nestCut?: boolean }).nestCut, m.name).toBe(true);
    for (const m of nestMats) expect((m.userData as { nestCut?: boolean }).nestCut, m.name).not.toBe(true);
    // patched once: the program cache key gains exactly one '|nest-cut'
    const keys = surface.map((m) => m.customProgramCacheKey());
    reg.update(frame(sim, camera, { view: 'colony', cutaway: cut }));
    expect(surface.map((m) => m.customProgramCacheKey())).toEqual(keys);
    for (const k of keys) expect(k.split('|nest-cut').length - 1).toBe(1);
    reg.dispose();
  });

  it('subject opacity and highlight exposure reach the shared ant uniforms clamped and finite', async () => {
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    const slot = new AntsSlot();
    slot.init(context(scene, camera));
    const sim = makeTestSim({});
    lookAtQueen(sim, camera);
    const shared = (slot.ants as unknown as { shared: { uSubjectOpacity: { value: number }; uHiWarm: { value: { r: number } } } }).shared;
    for (const [op, want] of [[0.4, 0.4], [-1, 0], [7, 1], [Number.NaN, 1]] as const) {
      slot.update(frame(sim, camera, { subjectOpacity: op }));
      expect(shared.uSubjectOpacity.value).toBe(want);
    }
    slot.ants.setHighlightExposure(0);
    const r0 = shared.uHiWarm.value.r;
    slot.ants.setHighlightExposure(3);
    expect(shared.uHiWarm.value.r).toBeCloseTo(r0 / 8, 9);
    slot.ants.setHighlightExposure(Number.NaN);
    expect(shared.uHiWarm.value.r).toBeCloseTo(r0, 9);
    slot.dispose();
  });

  it('a predicted pose is ignored when no ant is possessed (it never moves some other ant)', () => {
    const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
    const slot = new AntsSlot();
    slot.init(context(scene, camera));
    const sim = makeTestSim({});
    const q = lookAtQueen(sim, camera, 20, 10);
    sim.state.player.possessedAntId = -1;
    const pose = { pos: { x: q.pos.x + 6, y: q.pos.y, z: q.pos.z }, up: { ...q.up }, fwd: { ...q.fwd } };
    slot.update(frame(sim, camera, { possessedPose: pose }));
    const feet = slot.ants.debugFeet(q.id)!;
    const cx = feet.reduce((s, f) => s + f.x, 0) / feet.length;
    expect(Math.abs(cx - q.pos.x)).toBeLessThan(Math.abs(cx - pose.pos.x));
    slot.dispose();
  });
});
