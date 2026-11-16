// Independent review of wire-stage2 (adversarial checks on the registry side). Tests that pass stay as regressions.
// Headless three in Node, no WebGL; the sky's PMREM bake is stubbed as in stage2.test.ts.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { RENDERER_SLOTS, RenderRegistry, type FrameInfo, type RenderContext, type SubRenderer } from '@/render';
import { DEBUG_RENDERERS } from '@/render/debug';
import { readWeather } from '@/render/world/weather/WeatherRenderer';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { WeatherSlot, WorldSlot } from './index';
import { WET_EASE_S } from './params';
import { wetnessTarget } from './worldSlot';

function context(scene: Scene, camera: PerspectiveCamera, peer?: RenderContext['peer']): RenderContext {
  return {
    renderer: { domElement: { height: 360 }, toneMappingExposure: 1 } as unknown as WebGLRenderer, scene, camera, quality: getPreset('test'),
    assets: null, game: { requestRender: () => {}, testMode: true }, peer,
  };
}

function frame(sim: Sim | null, camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

async function boot(opts: { forceDebug?: boolean } = {}) {
  const reg = new RenderRegistry(opts);
  const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
  await reg.init(context(scene, camera));
  const w = reg.entries.find((e) => e.slot === 'world')!.renderer;
  if (w instanceof WorldSlot) (w.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
  return { reg, scene, camera, world: w };
}

const worldWet = (w: SubRenderer) => ((w as WorldSlot).world as unknown as { wet: number }).wet;

describe('wire-stage2 review: debug fallbacks', () => {
  it('every slot has a debug fallback, and a ?render=debug registry runs a whole game frame and disposes cleanly', async () => {
    for (const slot of RENDERER_SLOTS) expect(typeof DEBUG_RENDERERS[slot]).toBe('function');
    const { reg, scene, camera } = await boot({ forceDebug: true });
    expect(reg.describe().humans).toBe('humans-null (debug)');
    expect(reg.describe().weather).toBe('weather-null (debug)');
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    expect(() => reg.update(frame(sim, camera, { comfort: { spiderComfort: 'abstract', comfortMites: true, comfortCentipedes: true } }))).not.toThrow();
    reg.onGameEnd();
    reg.dispose();
    expect(scene.children.filter((c) => c.name !== '').map((c) => c.name)).toEqual([]);
  });
});

describe('wire-stage2 review: the weather slot adapter', () => {
  it('withholds only the world peer from the weather renderer; every other peer passes through', () => {
    const seen: string[] = [];
    const fake = { name: 'fake', init() {}, update() {}, dispose() {} } as SubRenderer;
    const peer = (slot: Parameters<NonNullable<RenderContext['peer']>>[0]) => { seen.push(slot); return fake; };
    const slot = new WeatherSlot();
    let inner: RenderContext | null = null;
    (slot.weather as unknown as { init: (c: RenderContext) => void }).init = (c) => { inner = c; };
    slot.init(context(new Scene(), new PerspectiveCamera(), peer));
    expect(inner!.peer!('world')).toBeNull();
    expect(inner!.peer!('nest')).toBe(fake);
    expect(inner!.peer!('fx')).toBe(fake);
    expect(seen).toEqual(['nest', 'fx']);
  });

  it('a downpour starting on dry ground: the ground soaks with the WET_EASE_S easing, not in one frame', async () => {
    const { reg, camera, world } = await boot();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    const env = sim.state.env;
    env.weather.precip = 0; env.weather.rainRateMmH = 0; env.moisture.surfaceWet = 0;
    reg.update(frame(sim, camera, { dt: 0 })); // settle: dry
    expect(worldWet(world)).toBe(0);
    env.weather.state = 'rain'; env.weather.intensityClass = 'downpour'; env.weather.rainRateMmH = 18;
    const target = wetnessTarget(sim);
    expect(target).toBeCloseTo(readWeather(sim).wet, 12);
    expect(target).toBeGreaterThan(0.9);
    reg.update(frame(sim, camera, { dt: 1 }));
    const k = 1 - Math.exp(-1 / WET_EASE_S);
    expect(worldWet(world)).toBeCloseTo(target * k, 6); // the weather slot later in the order did not snap it
    for (let i = 0; i < 200; i++) reg.update(frame(sim, camera, { dt: 1 }));
    expect(worldWet(world)).toBeCloseTo(target, 3);
    reg.dispose();
  });

  it('the weather renderer re-shows its group on every update (why hiding the group cannot measure its frame cost)', async () => {
    const { reg, camera } = await boot();
    const sim = makeTestSim({});
    await reg.onGameStart(sim);
    const weather = reg.entries.find((e) => e.slot === 'weather')!.renderer as WeatherSlot;
    weather.weather.group.visible = false;
    reg.update(frame(sim, camera));
    // tests/e2e/stage2.mjs (perf section) hides this group, renders a frame and reads the difference: always 0 / 0
    expect(weather.weather.group.visible).toBe(true);
    reg.dispose();
  });

  it('wetness target stays in 0..1 for out-of-range sim values', () => {
    const sim = makeTestSim({});
    const env = sim.state.env;
    env.weather.precip = 50; env.moisture.surfaceWet = 3;
    expect(wetnessTarget(sim)).toBe(1);
    env.weather.precip = -2; env.moisture.surfaceWet = -1; env.weather.rainRateMmH = 0;
    expect(wetnessTarget(sim)).toBe(0);
  });

  it('a new game snaps the wetness to the new world (no easing from the last game)', async () => {
    const { reg, camera, world } = await boot();
    const wet = makeTestSim({});
    await reg.onGameStart(wet);
    wet.state.env.moisture.surfaceWet = 0.8;
    reg.update(frame(wet, camera, { dt: 0.016 }));
    expect(worldWet(world)).toBeCloseTo(0.8, 6);
    reg.onGameEnd();
    const dry = makeTestSim({});
    dry.state.env.moisture.surfaceWet = 0; dry.state.env.weather.precip = 0; dry.state.env.weather.rainRateMmH = 0;
    await reg.onGameStart(dry);
    reg.update(frame(dry, camera, { dt: 0.016 }));
    expect(worldWet(world)).toBe(0);
    reg.dispose();
  });
});
