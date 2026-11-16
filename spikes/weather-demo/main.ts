/**
 * Weather demo (weather-effects task): the production world, nest and ant slot renderers plus the WeatherRenderer
 * (registered in the demo's own registry under the `fx` slot; the game's `weather` slot is the integrator's) over a
 * REAL new game: the test world with the small nest on a low, flood-prone site next to a paved hollow (scenario.ts).
 * The scene is time-stepped: before (clear), during a held thunderstorm, after (overcast, the ground still wet).
 *
 * URL flags: ?quality=test|low|medium|high|ultra (test=1 -> test)  &seed=N  &t=SECONDS (frozen clock)  &hud=0
 * Globals:   window.__ready, window.__wx (phase, view, play, render, flash, stats, dispose)
 * Scripted by spikes/weather-demo/scripts/shots.mjs.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { RenderRegistry, registerRenderer, type FrameInfo } from '@/render';
import { WeatherSlot } from '@/render/world/weather';
import type { Vec3 } from '@/core';
import type { WeatherState } from '@/sim/types';
import { holdWeather, runTicks, weatherScenario } from './scenario';

declare global {
  interface Window { __ready?: boolean; __wx?: unknown }
}

const qs = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : 1.3;
const showHud = qs.get('hud') !== '0';
const reducedMotion = qs.get('reduced') === '1';
const hudEl = document.getElementById('hud')!;
const qualityId: QualityId = isQualityId(flags.quality) ? flags.quality : flags.test ? 'test' : 'high';

const scenario = weatherScenario(Number(qs.get('seed') ?? 1));
const sim = scenario.sim;
let hold: WeatherState | null = 'clear';
holdWeather(sim, 'clear');

const scene = new Scene();
const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
const preset = getPreset(qualityId);
preset.dynamicResolution.enabled = false;
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const app: RenderApp = createRenderApp(canvas, { quality: preset, scene, camera });
const assets = createBrowserAssetLoader({ anisotropy: preset.anisotropy, maxTextureSize: preset.maxTextureSize, warn: (m) => console.warn('[assets]', m) });
const slot = new WeatherSlot();
registerRenderer('fx', () => slot);
const registry = new RenderRegistry();
const target = new Vector3();
let subject: Vec3 | null = null;
let time = frozenT;
let underground = false;

async function boot(): Promise<void> {
  await registry.init({
    renderer: app.renderer, scene, camera, quality: app.quality, assets,
    game: { requestRender: () => {}, testMode: flags.test }, setExposure: (ev) => app.setExposure(ev), setGrade: (g) => app.setGrade(g),
  });
  await registry.onGameStart(sim);
  view('surface');
  render(0);
  await app.ready;
  render(0);
  window.__ready = true;
}

function frameInfo(dt: number): FrameInfo {
  camera.updateMatrixWorld();
  return {
    dt, time, alpha: 1, sim, view: 'observer', underground, camera, viewportHeightPx: app.renderer.domElement.height,
    subject, possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null, reducedMotion,
  };
}

function render(dt = 0): number {
  const t0 = performance.now();
  registry.update(frameInfo(dt));
  app.setFocus(camera.position.distanceTo(target), undefined, true);
  app.renderFrame(dt);
  if (showHud) hudEl.textContent = hudText();
  return performance.now() - t0;
}

function hudText(): string {
  const s = app.frameStats(), w = slot.stats(), e = sim.state.env, nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
  const ch = nest.chambers.map((c) => `${c.type} ${(c.flooded * 100).toFixed(0)}%`).join('  ');
  return `${qualityId} tick ${sim.state.tick}  ${e.weather.state} ${e.weather.rainRateMmH.toFixed(1)} mm/h  wet ${(e.moisture.surfaceWet ?? 0).toFixed(2)}  draws ${s.drawCalls} tris ${s.triangles}\n`
    + `streaks ${w.streaks} splashes ${w.splashes} ripples ${w.ripples} flood cells ${w.floodCells}  nest water ${nest.flood.water.toFixed(1)} BU3  ${ch}`;
}

function setCamera(pos: Vec3, look: Vec3): void {
  camera.position.set(pos.x, pos.y, pos.z);
  target.set(look.x, look.y, look.z);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

const bu = sim.world.bu;
/** Named camera views: the surface between the nest entrance and the paved hollow, or inside the royal chamber. */
function view(name: 'surface' | 'puddle' | 'tunnel'): void {
  const e = scenario.entrance, h = scenario.hollow;
  const g = (x: number, z: number) => sim.field.height(x, z);
  underground = false;
  if (name === 'surface') {
    const mx = (e.x + h.x) / 2, mz = (e.z + h.z) / 2;
    subject = { x: mx, y: g(mx, mz), z: mz };
    setCamera({ x: mx + 6 * bu, y: g(mx, mz) + 10 * bu, z: mz + 34 * bu }, { x: mx - 2 * bu, y: g(mx, mz), z: mz - 2 * bu });
  } else if (name === 'puddle') {
    subject = { x: h.x, y: g(h.x, h.z), z: h.z };
    setCamera({ x: h.x + 4 * bu, y: g(h.x, h.z) + 7 * bu, z: h.z + 26 * bu }, { x: h.x, y: g(h.x, h.z), z: h.z });
  } else {
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    const c = nest.chambers.find((x) => x.type === 'royal') ?? nest.chambers[0];
    subject = { ...c.center };
    underground = true;
    setCamera({ x: c.center.x + c.radii.x * 0.7, y: c.center.y + c.radii.y * 0.55, z: c.center.z + c.radii.z * 0.55 },
      { x: c.center.x - c.radii.x * 0.3, y: c.center.y - c.radii.y * 0.8, z: c.center.z - c.radii.z * 0.2 });
  }
}

/** Sets the weather phase of the demo: before (clear), storm, after (overcast). */
function phase(name: 'before' | 'storm' | 'after'): void {
  hold = name === 'before' ? 'clear' : name === 'storm' ? 'storm' : 'overcast';
  holdWeather(sim, hold);
}

/** Advances the sim n ticks under the held weather, the renderers alongside; then one settled frame. */
function play(ticks: number, dtPerTick = 0.1): number {
  runTicks(sim, ticks, hold);
  time += ticks * dtPerTick;
  refreshWater();
  return render(0);
}

/**
 * Demo shortcut: the decor water layer re-reads the sim's puddle store every 15 frames; the scripted demo jumps the
 * sim forward between single frames, so it asks for the re-read at once.
 */
function refreshWater(): void {
  const world = registry.entries.find((e) => e.slot === 'world')?.renderer as unknown as { decor?: { water?: { reset(): void } } } | undefined;
  world?.decor?.water?.reset();
}

window.__wx = {
  sim: () => sim, scenario: () => scenario, phase, view, play, render,
  flash: () => slot.weather.flashNow(reducedMotion),
  reducedMotion,
  settle: (n = 4) => { for (let i = 0; i < n; i++) render(0); },
  stats: () => ({ frame: app.frameStats(), weather: slot.stats(), tick: sim.state.tick, env: { state: sim.state.env.weather.state, rain: sim.state.env.weather.rainRateMmH, wet: sim.state.env.moisture.surfaceWet ?? 0 } }),
  dispose: () => { registry.dispose(); app.dispose(); },
};

boot().catch((e) => { console.error(e); });
