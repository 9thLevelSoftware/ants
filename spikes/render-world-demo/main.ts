/**
 * Render-world demo: the production WorldRenderer (src/render/world/**) on a hand-made world with every ground
 * material, level steps (kerb), a paving field, a nest entrance with its mound, and many primitive materials, or on
 * whatever generateWorld returns (?world=generated). The kernel provides the carve grid and field the renderer's
 * hole mask reads; a tiny fake Sim object carries them (plus dynamic prims and mounds) through the real adapter.
 *
 * URL flags: ?quality=test|low|medium|high|ultra (test=1 -> test)  &post=0|1  &hour=0..24  &weather=clear|overcast|...
 *            &view=<name> (see VIEWS)  &pos=x,y,z&look=x,y,z  &t=SECONDS (frozen clock, render on demand)
 *            &world=demo|generated  &seed=N  &scatter=N (pebbles over the map)  &wet=0..1  &under=1  &hud=0  &haze=0
 * Globals:   window.__ready, window.__demo (setView, setCamera, setHour, setWeather, setQuality, render, stats,
 *            addPrim, removePrim, growMound, dig, setWet, setUnderground, views, dispose)
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId, type QualityPreset, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { WorldRenderer } from '@/render/world/lighting';
import type { Primitive, Sim, WeatherState, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createKernel, type Kernel } from '@/sim/kernel';
import { emptyCarve } from '@/sim/kernel.testWorld';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { BU, buildDemoWorld, ENTRANCE, LEVEL, makeEntranceMound, sampleH } from './demoWorld';
import { NestPreview } from './nestPreview';

declare global {
  interface Window { __ready?: boolean; __demo?: unknown }
}

const qs = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : null;
const worldKind = qs.get('world') === 'generated' ? 'generated' : 'demo';
let hour = qs.has('hour') ? Number(qs.get('hour')) : 13;
let weather = (qs.get('weather') ?? 'clear') as WeatherState;
let underground = qs.get('under') === '1';
const hudEl = document.getElementById('hud')!;
const showHud = qs.get('hud') !== '0';

// --------------------------------------------------------------------------------------------- world + kernel
const world: WorldData = worldKind === 'generated'
  ? generateWorld(defaultWorldParams('lasius-niger', Number(qs.get('seed') ?? 7)))
  : buildDemoWorld(Number(qs.get('scatter') ?? 1500));
const carveData = emptyCarve(world.bu);
const kernel: Kernel = createKernel(world, carveData);
const H = (x: number, z: number) => sampleH(world, x, z);
const dynPrims: Primitive[] = [];
const moundList = worldKind === 'demo' ? [makeEntranceMound(world, 4)] : [];
if (worldKind === 'demo') carveEntrance();
/** The parts of a Sim the world renderer's adapter reads (kernel field + carve grid + world delta). */
const sim = {
  world, field: kernel.field, carve: kernel.carve,
  state: { tick: 0, worldDelta: { carve: carveData, dynPrims, mounds: moundList, objectStates: [], heightDeltas: [] } },
} as unknown as Sim;

function carveEntrance(): void {
  const e = ENTRANCE, y = H(e.x, e.z);
  kernel.carveSphere({ x: e.x, y: y + 1, z: e.z }, 5.5);
  kernel.carveCapsule({ x: e.x, y: y - 2, z: e.z }, { x: e.x + 14, y: y - 30, z: e.z + 6 }, 4.4);
  kernel.carveCapsule({ x: e.x + 14, y: y - 30, z: e.z + 6 }, { x: e.x + 30, y: y - 62, z: e.z + 20 }, 4.4);
  kernel.carveEllipsoid({ x: e.x + 40, y: y - 72, z: e.z + 26 }, { x: 22, y: 9, z: 18 });
}

// --------------------------------------------------------------------------------------------- views
interface View { pos: [number, number, number]; look: [number, number, number] }
const g = (x: number, z: number, up: number) => H(x, z) + up;
const VIEWS: Record<string, View> = worldKind === 'demo' ? {
  lawn: { pos: [7560, g(7560, 8140, 9), 8140], look: [7700, g(7700, 8165, 3), 8165] },
  breach: { pos: [7672, g(7672, 8128, 26), 8128], look: [7701, g(7701, 8151, 0), 8151] },
  pavement: { pos: [9380, LEVEL.patio + 9, 7930], look: [9620, LEVEL.patio - 6, 8020] },
  kerb: { pos: [9900, LEVEL.road + 10, 7990], look: [9700, LEVEL.road + 70, 8030] },
  asphalt: { pos: [9790, LEVEL.road + 8, 7900], look: [9880, LEVEL.road, 7975] },
  sand: { pos: [7040, LEVEL.sand + 9, 9700], look: [7300, LEVEL.sand + 25, 9420] },
  interior: { pos: [5720, LEVEL.interior + 9, 7560], look: [5900, LEVEL.interior + 40, 7700] },
  prims: { pos: [9800, LEVEL.road + 45, 7700], look: [9900, LEVEL.road + 10, 8050] },
  forest: { pos: [7080, g(7080, 6180, 12), 6180], look: [7300, g(7300, 6300, 40), 6300] },
  sampler: { pos: [7300, 300, 10300], look: [7300, 0, 10750] },
  wide: { pos: [7200, 900, 6900], look: [8400, 0, 8300] },
} : {
  wide: { pos: [world.size / 2 - 600, g(world.size / 2, world.size / 2, 300), world.size / 2 - 600], look: [world.size / 2, g(world.size / 2, world.size / 2, 0), world.size / 2] },
  ground: { pos: [world.size / 2 - 60, g(world.size / 2 - 60, world.size / 2, 9), world.size / 2], look: [world.size / 2 + 80, g(world.size / 2 + 80, world.size / 2 + 20, 0), world.size / 2 + 20] },
};
let view: View = VIEWS[qs.get('view') ?? ''] ?? VIEWS.lawn ?? VIEWS.ground;
if (qs.has('pos') && qs.has('look')) {
  const p = qs.get('pos')!.split(',').map(Number), l = qs.get('look')!.split(',').map(Number);
  view = { pos: [p[0], p[1], p[2]], look: [l[0], l[1], l[2]] };
}

// --------------------------------------------------------------------------------------------- renderer
const scene = new Scene();
const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
let qualityId: QualityId = isQualityId(flags.quality) ? flags.quality : flags.test ? 'test' : 'high';
const postOverride = flags.post;
function presetFor(id: QualityId): QualityPreset {
  const p = getPreset(id);
  if (postOverride !== null) {
    p.post.enabled = postOverride;
    if (postOverride && !p.post.dof.enabled) p.post = getPreset('high').post;
  }
  if (qs.get('haze') === '0') p.fog.enabled = false;
  return p;
}
const preset = presetFor(qualityId);
const assets = createBrowserAssetLoader({ anisotropy: preset.anisotropy, maxTextureSize: preset.maxTextureSize, warn: (m) => console.warn('[assets]', m) });
let canvas = makeCanvas();
let app: RenderApp = createRenderApp(canvas, { quality: preset, scene, camera });
const worldRenderer = new WorldRenderer();
const nestPreview = new NestPreview();
scene.add(nestPreview.group);
let time = frozenT ?? 0;
let nextId = 100000;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.prepend(c);
  return c;
}

const subject = new Vector3();
function placeCamera(v: View): void {
  view = v;
  camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
  subject.set(v.look[0], v.look[1], v.look[2]);
  camera.lookAt(subject);
  camera.updateMatrixWorld();
}

function frame(dt: number): void {
  worldRenderer.update({ dt, time, sim, subject, underground, env: { hour, weather } });
  app.setFocus(camera.position.distanceTo(subject), undefined, true);
}

const pixel = new Uint8Array(4);
function render(dt = 0): void {
  frame(dt);
  app.renderFrame(dt);
  // wait for the GPU (software GL queues work asynchronously; scripted renders must not build a backlog)
  const gl = app.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  if (showHud) hudEl.textContent = hudText();
}

function hudText(): string {
  const s = app.frameStats(), w = worldRenderer.stats();
  return `${worldKind} ${qualityId} post:${!!app.post} hour:${hour.toFixed(1)} ${weather}\n` +
    `draws ${s.drawCalls}  tris ${s.triangles}  ${s.width}x${s.height}\n` +
    `terrain L${w.terrainLevels} ${w.terrainTriangles} tris  prims ${w.prims.prims} (${w.prims.buckets} buckets)  holes ${w.holeSlots}`;
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
    worldRenderer.dispose();
    await initWorld(p);
  } else {
    worldRenderer.setQuality(app.quality);
  }
  assets.setAnisotropy(p.anisotropy);
  render(0);
  await app.ready;
  render(0);
}

async function initWorld(p: QualityPreset): Promise<void> {
  await worldRenderer.init({ renderer: app.renderer, scene, camera, quality: p, assets, setExposure: (ev) => app.setExposure(ev) });
  await worldRenderer.setWorld(world, sim);
  if (qs.has('wet')) worldRenderer.setWetness(Number(qs.get('wet')));
}

// --------------------------------------------------------------------------------------------- interaction
let drag: { x: number; y: number } | null = null;
addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) * 0.005, dy = (e.clientY - drag.y) * 0.005;
  drag = { x: e.clientX, y: e.clientY };
  const off = camera.position.clone().sub(subject);
  const r = off.length();
  let yaw = Math.atan2(off.x, off.z), pitch = Math.asin(off.y / r);
  yaw -= dx; pitch = Math.max(-0.2, Math.min(1.4, pitch + dy));
  placeCamera({ pos: [subject.x + r * Math.cos(pitch) * Math.sin(yaw), subject.y + r * Math.sin(pitch), subject.z + r * Math.cos(pitch) * Math.cos(yaw)], look: [subject.x, subject.y, subject.z] });
  app.requestRender();
});
addEventListener('wheel', (e) => {
  const off = camera.position.clone().sub(subject).multiplyScalar(Math.exp(e.deltaY * 0.001));
  placeCamera({ pos: [subject.x + off.x, subject.y + off.y, subject.z + off.z], look: [subject.x, subject.y, subject.z] });
  app.requestRender();
});

// --------------------------------------------------------------------------------------------- API
function addPrim(p: Partial<Primitive> & Pick<Primitive, 'shape' | 'pos' | 'size' | 'material'>): number {
  const id = nextId++;
  dynPrims.push({ id, rot: { x: 0, y: 0, z: 0, w: 1 }, round: 0, flags: PrimFlag.DYNAMIC, objectId: -1, ...p });
  render(0);
  return id;
}

window.__demo = {
  views: () => Object.keys(VIEWS),
  setView: (name: string) => { placeCamera(VIEWS[name] ?? view); render(0); return name in VIEWS; },
  setCamera: (pos: [number, number, number], look: [number, number, number]) => { placeCamera({ pos, look }); render(0); },
  /** Ground height (for scripts that place cameras at ant height). */
  height: (x: number, z: number) => H(x, z),
  setHour: (h: number) => { hour = h; render(0); },
  setWeather: (w: WeatherState) => { weather = w; render(0); },
  setWet: (w: number) => { worldRenderer.setWetness(w); render(0); },
  setUnderground: (u: boolean) => { underground = u; render(0); },
  setQuality,
  render: () => { render(0); return app.frameStats(); },
  stats: () => ({ frame: app.frameStats(), world: worldRenderer.stats(), lighting: { exposureEV: worldRenderer.lighting.exposureEV, fogDensity: worldRenderer.lighting.fogDensity, key: worldRenderer.lighting.keyIntensity } }),
  addPrim,
  removePrim: (id: number) => { const i = dynPrims.findIndex((p) => p.id === id); if (i >= 0) dynPrims.splice(i, 1); render(0); return i >= 0; },
  hasPrim: (id: number) => worldRenderer.prims.has(id),
  growMound: (k: number) => {
    const m = moundList[0];
    if (!m) return 0;
    for (let i = 0; i < m.h.length; i++) m.h[i] *= k;
    m.volume *= k; m.lastBatchTick++;
    render(0);
    return worldRenderer.mounds.rebuilds;
  },
  dig: (x: number, z: number, r: number) => {
    const y = H(x, z);
    kernel.carveSphere({ x, y: y + r * 0.3, z }, r);
    kernel.carveCapsule({ x, y: y - r * 0.5, z }, { x: x + r, y: y - 6 * r, z }, r * 0.8);
    nestPreview.rebuild(kernel);
    for (let i = 0; i < 4; i++) render(1 / 60); // hole mask tiles are rasterised within a budget per frame
    return carveData.breaches.length;
  },
  dispose: () => { worldRenderer.dispose(); app.dispose(); },
};

async function boot(): Promise<void> {
  await assets.init();
  placeCamera(view);
  await initWorld(app.quality);
  nestPreview.rebuild(kernel);
  if (frozenT !== null || app.quality.renderOnDemand) app.setOnDemand(true);
  render(0);
  await app.ready;
  render(0);
  app.start((dt) => {
    if (frozenT === null) { time += dt; frame(dt); }
  });
  window.__ready = true;
}

boot().catch((e) => console.error('[demo] boot failed', e));
