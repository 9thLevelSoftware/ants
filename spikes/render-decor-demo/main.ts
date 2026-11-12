/**
 * Render-decor demo: the production DecorRenderer (src/render/world/{vegetation,decor,water}) over the production
 * WorldRenderer on a hand-made world (demoWorld.ts): lawn, forest floor, patio joints with moss, a puddle and a pet
 * water bowl. A 4 mm stand-in ant with bright foot beads marks the walker's foot height.
 *
 * URL flags: ?quality=test|low|medium|high|ultra  &post=0|1  &hour=0..24  &season=spring|summer|autumn|winter
 *            &wind=m/s  &dew=0..1  &puddle=k (water level multiplier)  &wet=0..1  &view=<name>  &t=SECONDS (frozen
 *            clock)  &hud=0  &decor=0 (hide decor: before/after)
 * Globals:   window.__ready, window.__demo (views, setView, setHour, setSeason, setWind, setDew, setWater, setQuality,
 *            render, stats, hashes, revisit, budget, dispose)
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId, type QualityPreset, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { WorldRenderer } from '@/render/world/lighting';
import { DecorRenderer } from '@/render/world/decor';
import type { WeatherState } from '@/sim/types';
import { AREA, BOWL, buildDecorDemoWorld, BU, PUDDLE, sampleH, SHRUB, SLAB } from './demoWorld';
import { conformFeet, makeStandIn } from './standIn';

declare global {
  interface Window { __ready?: boolean; __demo?: unknown }
}

const qs = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : null;
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
let hour = qs.has('hour') ? Number(qs.get('hour')) : 13;
let yearFrac = SEASONS.includes(qs.get('season') ?? '') ? (SEASONS.indexOf(qs.get('season')!) + 0.5) / 4 : 0.375;
let windMs = qs.has('wind') ? Number(qs.get('wind')) : 2;
let dew = qs.has('dew') ? Number(qs.get('dew')) : 0;
let weather = (qs.get('weather') ?? 'clear') as WeatherState;
const showHud = qs.get('hud') !== '0';
const hudEl = document.getElementById('hud')!;

const world = buildDecorDemoWorld();
const H = (x: number, z: number) => sampleH(world, x, z);

// --------------------------------------------------------------------------------------------- views
// A view = subject point on the ground (the ant stands there) + camera yaw / pitch / distance around it (mm).
interface View { at: [number, number]; yaw: number; pitch: number; dist: number; lookUp: number; ant: boolean; antYaw?: number }
const VIEWS: Record<string, View> = {
  lawn: { at: [3000, 3000], yaw: 0.6, pitch: 0.3, dist: 4.5 * BU, lookUp: 4.5, ant: true },
  'lawn-wide': { at: [3000, 3000], yaw: 0.6, pitch: 0.28, dist: 14 * BU, lookUp: 5, ant: true },
  forest: { at: [4600, 3300], yaw: 2.4, pitch: 0.42, dist: 5.5 * BU, lookUp: 2.5, ant: true, antYaw: 0.9 },
  'forest-wide': { at: [4600, 3300], yaw: 2.4, pitch: 0.35, dist: 30 * BU, lookUp: 4, ant: true },
  joints: { at: [SLAB.x0 + SLAB.size + SLAB.joint / 2, 1150], yaw: -1.57, pitch: 0.55, dist: 14 * BU, lookUp: 0, ant: true, antYaw: 1.57 },
  puddle: { at: [PUDDLE.x - PUDDLE.r * 0.75, PUDDLE.z + 30], yaw: 0.15, pitch: 0.2, dist: 16 * BU, lookUp: 0, ant: true, antYaw: 0 },
  petals: { at: [SHRUB.x + 120, SHRUB.z - 260], yaw: 1.2, pitch: 0.5, dist: 40 * BU, lookUp: 0, ant: true },
  bowl: { at: [BOWL.x, BOWL.z], yaw: 2.2, pitch: 0.75, dist: 260, lookUp: 0, ant: false },
  overview: { at: [4000, 2400], yaw: 0.8, pitch: 0.5, dist: 2600, lookUp: 0, ant: false },
};
let viewName = qs.get('view') ?? 'lawn';

// --------------------------------------------------------------------------------------------- renderer
const scene = new Scene();
const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
let qualityId: QualityId = isQualityId(flags.quality) ? flags.quality : flags.test ? 'test' : 'high';
function presetFor(id: QualityId): QualityPreset {
  const p = getPreset(id);
  if (flags.post !== null) {
    p.post.enabled = flags.post;
    if (flags.post && !p.post.dof.enabled) p.post = getPreset('high').post;
  }
  return p;
}
const preset = presetFor(qualityId);
const assets = createBrowserAssetLoader({ anisotropy: preset.anisotropy, maxTextureSize: preset.maxTextureSize, warn: (m) => console.warn('[assets]', m) });
let canvas = makeCanvas();
let app: RenderApp = createRenderApp(canvas, { quality: preset, scene, camera });
const worldRenderer = new WorldRenderer();
const decor = new DecorRenderer();
const ant = makeStandIn();
scene.add(ant);
let time = frozenT ?? 2;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.prepend(c);
  return c;
}

const subject = new Vector3();
function placeCamera(name: string): boolean {
  const v = VIEWS[name];
  if (!v) return false;
  viewName = name;
  const [sx, sz] = v.at, sy = H(sx, sz);
  ant.visible = v.ant;
  ant.position.set(sx, sy, sz);
  ant.rotation.set(0, v.antYaw ?? v.yaw + Math.PI / 2, 0);
  conformFeet(ant, H);
  subject.set(sx, sy + (v.ant ? 1 : 0), sz);
  camera.position.set(sx - Math.cos(v.yaw) * Math.cos(v.pitch) * v.dist, sy + Math.sin(v.pitch) * v.dist + 1, sz - Math.sin(v.yaw) * Math.cos(v.pitch) * v.dist);
  camera.lookAt(sx, sy + v.lookUp, sz);
  camera.updateMatrixWorld();
  return true;
}

function frame(dt: number): void {
  const env = { hour, yearFrac, weather };
  const subj = VIEWS[viewName]?.ant ? subject : null;
  worldRenderer.update({ dt, time, sim: null, subject: subj ?? subject, env });
  if (qs.get('decor') !== '0') decor.update({ dt, time, sim: null, subject: subj, env, yearFrac, windMs, dew, still: weather === 'frost' });
  app.setFocus(camera.position.distanceTo(subject), undefined, true);
}

const pixel = new Uint8Array(4);
function render(dt = 0): void {
  frame(dt);
  decor.flush();
  app.renderFrame(dt);
  const gl = app.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // wait for the GPU (no backlog in scripted runs)
  if (showHud) hudEl.textContent = hudText();
}

function hudText(): string {
  const s = app.frameStats(), d = decor.stats();
  return `${viewName} ${qualityId} post:${!!app.post} hour:${hour.toFixed(1)} ${SEASONS[Math.min(3, Math.floor(yearFrac * 4))]} wind ${windMs} m/s dew ${dew}\n` +
    `draws ${s.drawCalls}  tris ${s.triangles}  ${s.width}x${s.height}\n` +
    `decor blocks ${d.blocks}  blades ${d.blades}  draped ${d.draped}  drops ${d.drops}  water ${d.waterSurfaces}  revisit mismatches ${d.revisitMismatches}`;
}

async function initRenderers(p: QualityPreset): Promise<void> {
  const ctx = { renderer: app.renderer, scene, camera, quality: p, assets, setExposure: (ev: number) => app.setExposure(ev) };
  await worldRenderer.init(ctx);
  await worldRenderer.setWorld(world, null);
  if (qs.has('wet')) worldRenderer.setWetness(Number(qs.get('wet')));
  await decor.init(ctx, worldRenderer);
  decor.setWorld(world, null);
  if (qs.has('puddle')) decor.setWater({ bodyLevelScale: Number(qs.get('puddle')) });
}

async function setQuality(id: QualityId): Promise<void> {
  qualityId = id;
  const p = presetFor(id);
  app.setQuality(p);
  if (app.needsRecreate) {
    app.dispose();
    canvas.remove();
    canvas = makeCanvas();
    app = createRenderApp(canvas, { quality: p, scene, camera });
    decor.dispose();
    worldRenderer.dispose();
    await initRenderers(p);
  } else {
    worldRenderer.setQuality(app.quality);
    decor.setQuality(app.quality);
  }
  render(0);
  await app.ready;
  render(0);
}

/** Moves the camera far away (blocks around the view are disposed), comes back and compares the block hashes. */
function revisit(): { before: Record<number, number>; after: Record<number, number>; common: number; same: boolean; mismatches: number } {
  const before = decor.blockHashes();
  const keep = viewName;
  camera.position.set(500, 300, 7500); camera.lookAt(600, 0, 7600); camera.updateMatrixWorld();
  for (let i = 0; i < 3; i++) { frame(0); decor.flush(); }
  placeCamera(keep);
  render(0);
  const after = decor.blockHashes();
  // blocks kept by the dispose hysteresis before the trip may not be wanted again: compare the blocks in both sets
  const keys = Object.keys(before).filter((k) => Number(k) in after);
  const same = keys.length > 0 && keys.every((k) => after[Number(k)] === before[Number(k)]);
  return { before, after, common: keys.length, same, mismatches: decor.stats().revisitMismatches };
}

// --------------------------------------------------------------------------------------------- interaction
let drag: { x: number; y: number } | null = null;
addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const v = VIEWS[viewName];
  if (!v) return;
  v.yaw -= (e.clientX - drag.x) * 0.005;
  v.pitch = Math.max(0.05, Math.min(1.4, v.pitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
  placeCamera(viewName);
  app.requestRender();
});
addEventListener('wheel', (e) => { const v = VIEWS[viewName]; if (v) { v.dist *= Math.exp(e.deltaY * 0.001); placeCamera(viewName); app.requestRender(); } });

window.__demo = {
  views: () => Object.keys(VIEWS),
  setView: (name: string) => { const ok = placeCamera(name); render(0); return ok; },
  setHour: (h: number) => { hour = h; render(0); },
  setSeason: (s: string) => { yearFrac = (SEASONS.indexOf(s) + 0.5) / 4; render(0); return decor.stats(); },
  setWind: (ms: number) => { windMs = ms; render(0); },
  setDew: (d: number) => { dew = d; render(0); },
  setWeather: (w: WeatherState) => { weather = w; render(0); },
  setWater: (k: number) => { decor.setWater({ bodyLevelScale: k }); render(0); },
  setTime: (t: number) => { time = t; render(0); },
  setQuality,
  render: () => { render(0); return { frame: app.frameStats(), decor: decor.stats() }; },
  stats: () => ({ frame: app.frameStats(), decor: decor.stats(), world: worldRenderer.stats() }),
  hashes: () => decor.blockHashes(),
  revisit,
  areas: () => AREA,
  dispose: () => { decor.dispose(); worldRenderer.dispose(); app.dispose(); },
};

async function boot(): Promise<void> {
  await assets.init();
  placeCamera(viewName);
  await initRenderers(app.quality);
  app.setOnDemand(true);
  render(0);
  await app.ready;
  render(0);
  app.start((dt) => {
    if (frozenT === null) { time += dt; frame(dt); app.requestRender(); }
  });
  window.__ready = true;
}

boot().catch((e) => console.error('[demo] boot failed', e));
