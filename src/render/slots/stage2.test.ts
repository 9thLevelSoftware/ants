// wire-stage2: the creatures, humans, weather and fx renderers behind the registry (headless three in Node, no WebGL;
// the sky's PMREM bake is stubbed as in slots.test.ts): registration and order, comfort mode carried by the frame, the
// ground's single wetness writer, the fx slot as overlay host, a human event drawn, and a clean dispose.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { RENDERER_SLOTS, RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import { overlayHostOf } from '@/render/fx/overlays/FxRenderer';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { CreaturesSlot, HumansSlot, WeatherSlot, WorldSlot } from './index';
import { wetnessTarget } from './worldSlot';

function context(scene: Scene, camera: PerspectiveCamera): RenderContext {
  return {
    renderer: { domElement: { height: 360 }, toneMappingExposure: 1 } as unknown as WebGLRenderer, scene, camera, quality: getPreset('test'),
    assets: null, game: { requestRender: () => {}, testMode: true },
  };
}

function frame(sim: Sim | null, camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

async function boot() {
  const reg = new RenderRegistry();
  const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
  await reg.init(context(scene, camera));
  const w = reg.entries.find((e) => e.slot === 'world')!.renderer as WorldSlot;
  (w.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
  const slot = <T>(name: string) => reg.entries.find((e) => e.slot === name)!.renderer as T;
  return { reg, scene, camera, world: w, slot };
}

function lookAt(camera: PerspectiveCamera, p: { x: number; y: number; z: number }, back = 30, up = 20): void {
  camera.position.set(p.x - back, p.y + up, p.z);
  camera.lookAt(p.x, p.y, p.z);
  camera.updateMatrixWorld();
}

const SOFT = { spiderComfort: 'softened', comfortMites: false, comfortCentipedes: false } as const;
const OFF = { spiderComfort: 'off', comfortMites: false, comfortCentipedes: false } as const;

describe('wire-stage2: Stage 2 renderers in the registry', () => {
  it('registers every slot with a real renderer, humans and weather between creatures and fx', () => {
    expect(RENDERER_SLOTS).toEqual(['world', 'nest', 'ants', 'creatures', 'humans', 'weather', 'fx']);
    const reg = new RenderRegistry();
    expect(reg.entries.every((e) => !e.debug)).toBe(true);
    expect(reg.entries.find((e) => e.slot === 'creatures')!.renderer).toBeInstanceOf(CreaturesSlot);
    expect(reg.entries.find((e) => e.slot === 'humans')!.renderer).toBeInstanceOf(HumansSlot);
    expect(reg.entries.find((e) => e.slot === 'weather')!.renderer).toBeInstanceOf(WeatherSlot);
    expect(overlayHostOf(reg)).not.toBeNull();
    const dbg = new RenderRegistry({ forceDebug: true });
    expect(dbg.entries.map((e) => e.debug)).toEqual(RENDERER_SLOTS.map(() => true));
  });

  it('comfort mode comes in the frame and switches a spider look at once (GDD 08 §12, E17)', async () => {
    const { reg, camera, slot } = await boot();
    const sim = makeTestSim({});
    const q = sim.stores.ants.get(sim.state.colonies[0]!.queenId)!;
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'wolf-spider', variant: null, pos: { x: q.pos.x + 12, y: q.pos.y, z: q.pos.z }, state: null });
    sim.tick();
    const spider = sim.state.creatures.find((c) => c.alive && c.kind === 'wolf-spider');
    expect(spider).toBeDefined();
    await reg.onGameStart(sim);
    lookAt(camera, spider!.pos);
    const creatures = slot<CreaturesSlot>('creatures');
    reg.update(frame(sim, camera, { comfort: SOFT }));
    expect(creatures.lookOf(spider!.id)?.comfort).toBe('softened');
    reg.update(frame(sim, camera, { comfort: OFF }));
    expect(creatures.lookOf(spider!.id)?.comfort).toBe('off');
    reg.update(frame(sim, camera, { comfort: null })); // no comfort in the frame: the last setting stays
    expect(creatures.lookOf(spider!.id)?.comfort).toBe('off');
    reg.dispose();
  });

  it('the world slot alone writes the wetness: it eases toward the weather reading, including wet ground after rain', async () => {
    const { reg, camera, world } = await boot();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    lookAt(camera, sim.world.queenStart.pos);
    const env = sim.state.env;
    env.weather.precip = 0;
    env.weather.rainRateMmH = 0;
    env.moisture.surfaceWet = 0.6; // the rain has stopped; the ground is still wet
    expect(wetnessTarget(sim)).toBeCloseTo(0.6, 9);
    reg.update(frame(sim, camera, { dt: 0 }));
    const wet = () => (world.world as unknown as { wet: number }).wet;
    expect(wet()).toBeCloseTo(0.6, 9);
    env.moisture.surfaceWet = 0;
    reg.update(frame(sim, camera, { dt: 0.1 })); // eased: a later slot must not snap it to 0 within the frame
    expect(wet()).toBeGreaterThan(0.5);
    reg.dispose();
  });

  it('the fx slot is the overlay host: an overlay switched on is drawn', async () => {
    const { reg, camera } = await boot();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    lookAt(camera, sim.world.queenStart.pos);
    const fx = overlayHostOf(reg)!;
    fx.setOverlay('moisture', true);
    reg.update(frame(sim, camera));
    expect(fx.stats().field).toBeGreaterThan(0);
    fx.setOverlay('moisture', false);
    reg.update(frame(sim, camera));
    expect(fx.stats().field).toBe(0);
    reg.dispose();
  });

  it('a footsteps event is drawn by the humans slot once it runs; dispose leaves the scene empty', async () => {
    const { reg, scene, camera, slot } = await boot();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    const at = sim.world.queenStart.pos;
    lookAt(camera, at, 400, 300);
    sim.enqueue({ type: 'cheat.humanEvent', kind: 'footsteps', variant: null, at: { ...at }, startInS: 0 });
    let actors = 0;
    for (let i = 0; i < 300 && actors === 0; i++) {
      sim.tick();
      if (i % 10 === 0) { reg.update(frame(sim, camera)); actors = slot<HumansSlot>('humans').stats().actors ?? 0; }
    }
    expect(actors).toBeGreaterThan(0);
    reg.onGameEnd();
    reg.dispose();
    expect(scene.children.filter((c) => c.name !== '').map((c) => c.name)).toEqual([]);
  });
});
