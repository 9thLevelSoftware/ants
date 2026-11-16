/**
 * FX demo (scent-fx task): the production world, nest and ant slot renderers plus the FxRenderer (scent view,
 * overlays, particles) over a REAL new game: the test world with the small nest, 40 workers, a sugar spill on top
 * of a wall and a carrion item (scenario.ts); the colony's own foragers lay the trail. `?world=garden` uses a
 * generated suburban garden instead (varied surfaces for the temperature and moisture overlays).
 *
 * URL flags: ?quality=test|low|medium|high|ultra (test=1 -> test)  &world=test|garden|bench  &seed=N  &ticks=N (sim ticks
 *            run before the first frame)  &t=SECONDS (frozen clock)  &hud=0
 * Globals:   window.__ready, window.__fx (step, play, view, setCamera, overlay, palette, effects, act, possessNear,
 *            render, stats, bench100k, dispose)
 * Scripted by spikes/fx-demo/scripts/shots.mjs.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { RenderRegistry, registerRenderer, type FrameInfo } from '@/render';
import { FxRenderer } from '@/render/fx/overlays/FxRenderer';
import type { OverlayId, PaletteId } from '@/ui/overlays/catalogue';
import type { Vec3 } from '@/core';
import type { ActionId, Ant, Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { fxScenario, runTicks, type FxScenario } from './scenario';
import { bench100k } from './bench';
import { surfaceTemp } from '@/sim/environment/surface';
import { topsoilMoistureAt } from '@/render/fx/overlays/samplers';

/** Bench world edge, BU (400 pheromone cells per side). */
const BENCH_WORLD_BU = 1600;

declare global {
  interface Window { __ready?: boolean; __fx?: unknown }
}

const qs = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : 2;
const showHud = qs.get('hud') !== '0';
const hudEl = document.getElementById('hud')!;
const worldKind = qs.get('world') === 'garden' ? 'garden' : qs.get('world') === 'bench' ? 'bench' : 'test';
const qualityId: QualityId = isQualityId(flags.quality) ? flags.quality : flags.test ? 'test' : 'high';

// ------------------------------------------------------------------------------------------ sim
let scenario: FxScenario | null = null;
let sim: Sim;
if (worldKind === 'garden') {
  const cfg = defaultGameConfig('lasius-niger', Number(qs.get('seed') ?? 3));
  cfg.cheats = true;
  cfg.world = { ...cfg.world, archetype: 'suburban-garden', sizeClass: 'compact' };
  cfg.startSeason = 'summer';
  cfg.startHour = Number(qs.get('hour') ?? 12); // midday: sun-warmed paving next to cool lawn and shade
  const g = createNewGame(cfg);
  sim = createSim(g.state, g.world);
} else if (worldKind === 'bench') {
  sim = makeTestSim({ sizeBu: BENCH_WORLD_BU, seed: 1 }); // flat ground with room for 100,000 ground cells
} else {
  scenario = fxScenario(Number(qs.get('seed') ?? 1));
  sim = scenario.sim;
}
runTicks(sim, Number(qs.get('ticks') ?? 0));

// ------------------------------------------------------------------------------------------ renderers
const scene = new Scene();
const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
const preset = getPreset(qualityId);
preset.dynamicResolution.enabled = false; // scripted frames: fixed drawing-buffer size
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const app: RenderApp = createRenderApp(canvas, { quality: preset, scene, camera });
const assets = createBrowserAssetLoader({ anisotropy: preset.anisotropy, maxTextureSize: preset.maxTextureSize, warn: (m) => console.warn('[assets]', m) });
const fx = new FxRenderer();
registerRenderer('fx', () => fx); // the demo's registry uses the new fx renderer (the game's slot is the integrator's)
const registry = new RenderRegistry();
const target = new Vector3();
let subject: Vec3 | null = null;
let time = frozenT;

async function boot(): Promise<void> {
  await registry.init({
    renderer: app.renderer, scene, camera, quality: app.quality, assets,
    game: { requestRender: () => {}, testMode: flags.test }, setExposure: (ev) => app.setExposure(ev), setGrade: (g) => app.setGrade(g),
  });
  await registry.onGameStart(sim);
  view(worldKind === 'garden' ? 'overview' : 'trail');
  render(0);
  await app.ready;
  render(0);
  window.__ready = true;
}

function frameInfo(dt: number): FrameInfo {
  camera.updateMatrixWorld();
  return {
    dt, time, alpha: 1, sim, view: 'observer', underground: sim.field.substrate(camera.position) < 0, camera,
    viewportHeightPx: app.renderer.domElement.height, subject, possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null,
  };
}

/** One rendered frame (dt real seconds for the effects; 0 = settle). Returns render ms. */
function render(dt = 0): number {
  const t0 = performance.now();
  registry.update(frameInfo(dt));
  app.setFocus(camera.position.distanceTo(target), undefined, true);
  app.renderFrame(dt);
  if (showHud) hudEl.textContent = hudText();
  return performance.now() - t0;
}

/** Advances the sim n ticks and the effects alongside (dtPerTick real s each) without drawing; then one frame. */
function play(ticks: number, dtPerTick = 0.1, draw = true): number {
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    time += dtPerTick;
    fx.update(frameInfo(dtPerTick));
  }
  return draw ? render(0) : 0;
}

function hudText(): string {
  const s = app.frameStats(), f = fx.stats();
  return `${qualityId} ${worldKind} tick ${sim.state.tick}  draws ${s.drawCalls} tris ${s.triangles}\n`
    + `fx ${f.ms.toFixed(2)} ms  scent ${f.scentCells} cells (${f.scentMs.toFixed(2)} ms)  field ${f.field}  particles ${f.particles}  motes ${f.motes}  fx draws ${f.drawCalls}`;
}

function setCamera(pos: Vec3, look: Vec3): void {
  camera.position.set(pos.x, pos.y, pos.z);
  target.set(look.x, look.y, look.z);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

const bu = sim.world.bu;
/** Named camera views of the demo scenes (mm). */
function view(name: string): void {
  subject = null;
  if (!scenario) {
    const q = sim.world.queenStart.pos;
    const h = (x: number, z: number) => sim.field.height(x, z);
    if (name === 'hot-temperature' || name === 'hot-moisture') {
      const c = liveliest(name === 'hot-temperature' ? 'temperature' : 'moisture');
      setCamera({ x: c.x, y: h(c.x, c.z) + 150 * bu, z: c.z + 45 * bu }, { x: c.x, y: h(c.x, c.z), z: c.z });
      return;
    }
    if (name === 'overview') setCamera({ x: q.x + 30 * bu, y: h(q.x, q.z) + 55 * bu, z: q.z + 75 * bu }, { x: q.x, y: h(q.x, q.z), z: q.z });
    else if (name === 'wide') setCamera({ x: q.x + 70 * bu, y: h(q.x, q.z) + 120 * bu, z: q.z + 160 * bu }, { x: q.x, y: h(q.x, q.z), z: q.z });
    return;
  }
  const { entrance: e, wall } = scenario;
  const nest = sim.stores.nests.get(scenario.colony.nestIds[0])!;
  if (name === 'trail') setCamera({ x: e.pos.x + 22 * bu, y: 34 * bu, z: e.pos.z + 52 * bu }, { x: (e.pos.x + wall.x) / 2 - 4 * bu, y: 6 * bu, z: wall.z + 2 * bu });
  else if (name === 'wall') setCamera({ x: wall.x + 34 * bu, y: 26 * bu, z: wall.z + 26 * bu }, { x: wall.x, y: 10 * bu, z: wall.z + 3 * bu });
  else if (name === 'home') setCamera({ x: e.pos.x + 30 * bu, y: 70 * bu, z: e.pos.z + 62 * bu }, { x: e.pos.x - 10 * bu, y: 0, z: e.pos.z });
  else if (name === 'overview') setCamera({ x: 128 * bu, y: 120 * bu, z: 150 * bu }, { x: 64 * bu, y: 0, z: 62 * bu });
  else if (name === 'royal' || name === 'nursery') {
    const c = nest.chambers.find((ch) => ch.type === name) ?? nest.chambers[0];
    setCamera({ x: c.center.x + c.radii.x * 0.75, y: c.center.y + c.radii.y * 0.3, z: c.center.z + c.radii.z * 0.6 }, { x: c.center.x - c.radii.x * 0.2, y: c.center.y - c.radii.y * 0.7, z: c.center.z - c.radii.z * 0.1 });
    subject = { ...c.center };
  }
}

/** Centre of the 120 BU window with the widest spread of surface temperature or topsoil moisture (demo framing). */
function liveliest(kind: 'temperature' | 'moisture'): { x: number; z: number } {
  const step = 8 * bu, win = 120 * bu, size = sim.world.size;
  const n = Math.floor(size / step);
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step, z = (j + 0.5) * step;
    v[j * n + i] = kind === 'temperature' ? surfaceTemp(sim, x, z) : topsoilMoistureAt(sim, x, z) ?? 0;
  }
  const k = Math.floor(win / step);
  const cands: { x: number; z: number; spread: number }[] = [];
  for (let j = 0; j + k < n; j += 2) for (let i = 0; i + k < n; i += 2) {
    let lo = Infinity, hi = -Infinity;
    for (let b = 0; b < k; b += 2) for (let a = 0; a < k; a += 2) { const t = v[(j + b) * n + i + a]; if (t < lo) lo = t; if (t > hi) hi = t; }
    cands.push({ x: (i + k / 2) * step, z: (j + k / 2) * step, spread: hi - lo });
  }
  cands.sort((a, b) => b.spread - a.spread);
  // the first window the overhead camera sees clearly (no wall or roof between it and the ground)
  for (const c of cands.slice(0, 60)) {
    const g = sim.field.height(c.x, c.z);
    const eye = { x: c.x, y: g + 150 * bu, z: c.z + 45 * bu };
    const dx = 0, dy = g - eye.y, dz = c.z - eye.z, len = Math.hypot(dx, dy, dz);
    const hit = sim.field.sphereTrace(eye, { x: dx / len, y: dy / len, z: dz / len }, len, 0.5 * bu);
    if (sim.field.sample(eye) > 2 * bu && hit >= len * 0.97) return c;
  }
  return cands[0] ?? { x: size / 2, z: size / 2 };
}

/** Places a worker of the player colony at p (cheat.teleport) and possesses it; returns its id. */
function possessNear(p: Vec3, heading: Vec3 = { x: -1, y: 0, z: 0 }): number {
  const col = sim.state.colonies.find((c) => c.isPlayer)!;
  const a = sim.state.ants.find((x) => x.alive && x.colony === col.id && x.caste === 'worker' && x.nestId < 0)
    ?? sim.state.ants.find((x) => x.alive && x.colony === col.id && x.caste === 'worker')!;
  sim.enqueue({ type: 'cheat.teleport', antId: a.id, pos: { x: p.x, y: sim.field.height(p.x, p.z), z: p.z } });
  sim.enqueue({ type: 'possess', antId: a.id });
  sim.applyPendingCommands();
  sim.tick();
  const ant = sim.stores.ants.get(a.id) as Ant;
  ant.fwd.x = heading.x; ant.fwd.y = heading.y; ant.fwd.z = heading.z; // demo framing only
  return a.id;
}

function act(actionId: ActionId, phase: 'start' | 'stop' = 'start'): void {
  sim.enqueue({ type: 'action', actionId, phase });
  sim.applyPendingCommands();
}

window.__fx = {
  sim: () => sim, scenario: () => scenario, fx,
  step: (n: number) => { runTicks(sim, n); return sim.state.tick; },
  play, render, view, setCamera, possessNear, act,
  /** n settle frames (the nest renderer meshes newly seen chunks over a few frames outside test mode). */
  settle: (n = 4) => { for (let i = 0; i < n; i++) render(0); },
  overlay: (id: OverlayId, on: boolean) => { fx.setOverlay(id, on); },
  clear: () => { for (const o of ['scent', 'temperature', 'moisture', 'threats', 'dig-plans'] as const) fx.setOverlay(o, false); },
  palette: (p: PaletteId) => fx.setPalette(p),
  effects: (particles: boolean, motes: boolean) => fx.setEffects({ particles, motes }),
  command: (c: Parameters<Sim['enqueue']>[0]) => { sim.enqueue(c); sim.applyPendingCommands(); },
  stats: () => ({ frame: app.frameStats(), fx: fx.stats(), tick: sim.state.tick, exposure: app.renderer.toneMappingExposure, toneMapping: app.renderer.toneMapping }),
  bench100k: (frames = 120) => bench100k(fx, sim, frames, (dt) => fx.update(frameInfo(dt)), (dt) => render(dt), () => app.frameStats().drawCalls, setCamera),
  dispose: () => { registry.dispose(); app.dispose(); },
};

boot().catch((e) => { console.error(e); });
