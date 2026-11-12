/**
 * Render-nest demo: the production NestRenderer (src/render/nest/**) together with the production WorldRenderer on a
 * test world with a generated nest (demoWorld.ts). The kernel provides field + carve grid; a tiny fake Sim carries
 * them through both renderers' adapters.
 *
 * URL flags: ?quality=test|low|medium|high|ultra (test=1 -> test)  &post=0|1  &view=<name> (see VIEWS)
 *            &cut=off|slice|xray|section  &depth=<planeY mm>  &radius=<R_cut BU>  &hour=0..24  &t=SECONDS (frozen)
 *            &seed=N  &dig=N (pre-dig N bites)  &hud=0
 * Globals:   window.__ready, window.__demo (views, setView, setCamera, setCutaway, dig, transition, render, frames,
 *            stats, pick, setQuality, dispose)
 */
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3, type Material } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId, type QualityPreset, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { WorldRenderer } from '@/render/world/lighting';
import { MESH_QUALITY, NestRenderer, type NestCutawayParams } from '@/render/nest';
import type { Sim } from '@/sim/types';
import { BU, buildDemoWorld } from './demoWorld';
import { cameraPath, makeViews, sectionCenter, type View } from './views';

declare global {
  interface Window { __ready?: boolean; __demo?: unknown }
}

const qs = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : null;
const hour = qs.has('hour') ? Number(qs.get('hour')) : 12;
const hudEl = document.getElementById('hud')!;
const showHud = qs.get('hud') !== '0';

// ------------------------------------------------------------------------------------------- world + kernel
const { world, kernel, nest } = buildDemoWorld(Number(qs.get('seed') ?? 7));
const sim = {
  world, field: kernel.field, carve: kernel.carve,
  state: {
    tick: 0, player: { possessedAntId: -1 }, nests: [], env: {},
    worldDelta: { carve: kernel.carve.data, dynPrims: [], mounds: [], objectStates: [], heightDeltas: [] },
  },
} as unknown as Sim;
const H = (x: number, z: number) => kernel.field.height(x, z);
const VIEWS = makeViews(nest, H);

// ------------------------------------------------------------------------------------------- cutaway
const C2 = nest.chambers[1];
let cutaway: NestCutawayParams = {
  mode: 'off', planeY: Number(qs.get('depth') ?? C2.c.y + 1), radius: Number(qs.get('radius') ?? 60) * BU,
  center: { x: 830, z: 860 }, outsideDarken: 0.3,
};
const sliceCenter = { x: 830, z: 860 };
function setCut(mode: string, o: Partial<NestCutawayParams> = {}): void {
  cutaway = mode === 'section'
    ? { ...cutaway, center: sectionCenter(nest), ...o, mode: 'slice', section: 'vertical' }
    : { ...cutaway, center: sliceCenter, ...o, mode: mode === 'slice' || mode === 'xray' ? mode : 'off', section: 'horizontal' };
}

/** Ghost hook demo: a dig-plan ellipsoid beside C3 and a queen marker in C2, drawn through the soil. */
function setGhosts(on: boolean): void {
  const c3 = nest.chambers[2], c2 = nest.chambers[1];
  nestRenderer.ghosts.set(on ? [
    { center: { x: c3.c.x + 6, y: c3.c.y, z: c3.c.z + c3.r.z + 18 }, radii: { x: 18, y: 6, z: 14 }, color: '#F0E442', opacity: 0.45, onTop: true },
    { center: { x: c2.c.x, y: c2.c.y - c2.r.y + 2, z: c2.c.z }, radii: { x: 3, y: 3, z: 3 }, color: '#E69F00', opacity: 0.9, onTop: true },
  ] : []);
}
setCut(qs.get('cut') ?? 'off');

// ------------------------------------------------------------------------------------------- renderer
const scene = new Scene();
const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 40000);
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
const nestRenderer = new NestRenderer();
let time = frozenT ?? 0;

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.prepend(c);
  return c;
}

// stand-in for the possessed ant (the real one is render-ants' job): head, thorax, gaster
const ant = new Group();
{
  const mat = new MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.4 });
  const part = (r: [number, number, number], z: number, y: number) => {
    const m = new Mesh(new SphereGeometry(1, 16, 12), mat);
    m.scale.set(...r); m.position.set(0, y, z);
    ant.add(m);
  };
  part([0.55, 0.5, 0.6], 1.45, 0.55); part([0.35, 0.35, 0.8], 0.3, 0.5); part([0.75, 0.62, 1.0], -1.2, 0.6);
  ant.name = 'demo:ant';
  scene.add(ant);
}

let view: View = VIEWS[qs.get('view') ?? 'entrance'] ?? VIEWS.entrance;
const subject = new Vector3();
function placeCamera(v: View): void {
  view = v;
  camera.position.set(...v.pos);
  camera.near = v.near;
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(new Vector3(...v.look));
  camera.updateMatrixWorld();
  subject.set(...v.subject);
  ant.visible = v.ant;
  if (v.ant) {
    ant.position.copy(subject);
    const fwd = new Vector3(...v.look).sub(camera.position).setY(0).normalize();
    ant.lookAt(ant.position.clone().add(fwd));
  }
}

const patched = new WeakSet<Material>();
function patchWorldMaterials(): void {
  worldRenderer.group.traverse((o) => {
    const mats = (o as Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (patched.has(m) || !(m as MeshStandardMaterial).isMeshStandardMaterial) continue;
      patched.add(m);
      nestRenderer.patchSurfaceMaterial(m);
    }
  });
}

function frame(dt: number): void {
  if (cutaway.mode !== 'off') patchWorldMaterials();
  nestRenderer.update({ dt, time, sim, subject: view.ant ? subject : null, cutaway });
  worldRenderer.update({ dt, time, sim, subject, underground: nestRenderer.look.underground, env: { hour } });
  const d = Math.max(0, Math.min(1, worldRenderer.env.light));
  nestRenderer.setDaylight(0.9 * d, 0.88 * d, 0.82 * d);
  app.setFocus(camera.position.distanceTo(subject), undefined, true);
}

function render(dt = 0): void {
  frame(dt);
  app.renderFrame(dt);
  if (showHud) hudEl.textContent = hudText();
}

function hudText(): string {
  const s = app.frameStats(), n = nestRenderer.stats();
  return `${qualityId} post:${!!app.post} view:${Object.keys(VIEWS).find((k) => VIEWS[k] === view) ?? 'custom'} cut:${cutaway.mode}${cutaway.section === 'vertical' ? '(section)' : ''}\n` +
    `draws ${s.drawCalls}  tris ${s.triangles}  ${s.width}x${s.height}\n` +
    `nest: ${n.chunks} chunks ${n.regions} regions ${n.triangles} tris  pending ${n.pending}  remesh ${n.lastFrame.ms.toFixed(2)} ms  ` +
    `under ${nestRenderer.look.under.toFixed(2)}  EV ${worldRenderer.lighting.exposureEV.toFixed(2)}`;
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
    nestRenderer.dispose();
    await initRenderers(p);
  } else {
    worldRenderer.setQuality(app.quality);
    nestRenderer.setQuality(app.quality);
  }
  render(0);
  await app.ready;
  render(0);
}

async function initRenderers(p: QualityPreset): Promise<void> {
  await worldRenderer.init({ renderer: app.renderer, scene, camera, quality: p, assets, setExposure: (ev) => app.setExposure(ev) });
  await worldRenderer.setWorld(world, sim);
  await nestRenderer.init({ renderer: app.renderer, scene, camera, quality: p, assets, library: worldRenderer.library });
  nestRenderer.setSim(sim);
  nestRenderer.flush();
}

// ------------------------------------------------------------------------------------------- digging
/** Scripted bites: 0.6 BU spheres on a spiral around an axis from the dig start (GDD 03 DIG_BITE_RADIUS). */
let biteIndex = 0;
function bite(): void {
  const k = biteIndex++;
  const d = nest.digDir, l = Math.hypot(d.x, d.y, d.z);
  const f = { x: d.x / l, y: d.y / l, z: d.z / l };
  const side = new Vector3(f.x, f.y, f.z).cross(new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, new Vector3(f.x, f.y, f.z)).normalize();
  const a = k * 1.9, along = k * 0.22 * BU, rad = 0.45 * BU;
  const s = nest.digStart;
  const c = {
    x: s.x + f.x * along + (side.x * Math.cos(a) + up.x * Math.sin(a)) * rad,
    y: s.y + f.y * along + (side.y * Math.cos(a) + up.y * Math.sin(a)) * rad,
    z: s.z + f.z * along + (side.z * Math.cos(a) + up.z * Math.sin(a)) * rad,
  };
  (sim.state as { tick: number }).tick += 10; // one game second per bite: the fresh-wall look fades with ticks
  kernel.carveSphere(c, 0.6 * BU);
}

interface FrameRec { ms: number; commitMs: number; built: number; committed: boolean; pending: number }

/** n bites (all at once, or one per frame), then frames until every mesh is rebuilt; per-frame remesh records. */
function dig(n: number, perFrame = false, renderFrames = true): { frames: FrameRec[]; budgetMs: number; framesToVisible: number } {
  const recs: FrameRec[] = [];
  const step = () => {
    if (renderFrames) render(1 / 60); else frame(1 / 60);
    const s = nestRenderer.stats().lastFrame;
    recs.push({ ms: +s.ms.toFixed(3), commitMs: +s.commitMs.toFixed(3), built: s.built, committed: s.committed, pending: s.pending });
  };
  if (perFrame) for (let i = 0; i < n; i++) { bite(); step(); }
  else for (let i = 0; i < n; i++) bite();
  let guard = 0;
  do step(); while (nestRenderer.stats().pending > 0 && guard++ < 200);
  const firstCommit = recs.findIndex((r) => r.committed);
  return { frames: recs, budgetMs: MESH_QUALITY[qualityId].budgetMs, framesToVisible: perFrame ? -1 : firstCommit + 1 };
}

// ------------------------------------------------------------------------------------------- API
const path = cameraPath(nest, H);
window.__demo = {
  views: () => Object.keys(VIEWS),
  setView: (name: string) => { placeCamera(VIEWS[name] ?? view); render(0); return name in VIEWS; },
  setCamera: (pos: [number, number, number], look: [number, number, number], near = 0.3) => {
    placeCamera({ pos, look, subject: look, near, fov: 60, ant: false }); render(0);
  },
  setCutaway: (mode: string, o: Partial<NestCutawayParams> = {}) => {
    setCut(mode, o);
    render(0);
    nestRenderer.flushCutaway();
    render(0);
    return { mode: cutaway.mode, section: cutaway.section ?? 'horizontal' };
  },
  /** Camera on the surface -> underground -> surface path, t in 0..1; renders one frame with dt. */
  transition: (t: number, dt: number, draw = true) => {
    const p = path(t);
    placeCamera(p);
    time += dt;
    if (draw) render(dt); else frame(dt);
    return { t, under: nestRenderer.look.under, underground: nestRenderer.look.underground, exposureEV: worldRenderer.lighting.exposureEV, fogDensity: worldRenderer.lighting.fogDensity };
  },
  dig,
  setGhosts: (on: boolean) => { setGhosts(on); render(0); },
  render: () => { render(0); return app.frameStats(); },
  frames: (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) { time += dt; render(dt); } return app.frameStats(); },
  stats: () => ({ frame: app.frameStats(), nest: nestRenderer.stats(), look: { ...nestRenderer.look }, exposureEV: worldRenderer.lighting.exposureEV, world: worldRenderer.stats() }),
  pick: (x: number, y: number) => nestRenderer.pick(x, y),
  /** Layer visibility for diagnosis: 'nest' | 'world' | 'ant'. */
  setVisible: (layer: string, on: boolean) => {
    const o = layer === 'nest' ? nestRenderer.group : layer === 'world' ? worldRenderer.group : ant;
    o.visible = on;
    render(0);
  },
  /** Renders one frame and waits for the GPU (1-pixel readback): call before a screenshot. Returns ms. */
  sync: (update = true) => {
    const gl = app.renderer.getContext();
    const t0 = performance.now();
    if (update) render(0); else app.renderFrame(0); // no update: keeps eased values (exposure series)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return performance.now() - t0;
  },
  /** Synchronous timing of n frames (each ends with a 1-pixel readback so the GPU must finish), ms per frame. */
  bench: (n = 3) => {
    const gl = app.renderer.getContext();
    const px = new Uint8Array(4);
    render(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { render(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / n;
  },
  setQuality,
  dispose: () => { nestRenderer.dispose(); worldRenderer.dispose(); app.dispose(); },
};

async function boot(): Promise<void> {
  await assets.init();
  placeCamera(view);
  await initRenderers(app.quality);
  const pre = Number(qs.get('dig') ?? 0);
  for (let i = 0; i < pre; i++) bite();
  nestRenderer.flush();
  if (frozenT !== null || app.quality.renderOnDemand) app.setOnDemand(true);
  for (let i = 0; i < 4; i++) render(0); // hole-mask tiles are rasterised within a budget per frame
  nestRenderer.flushCutaway();
  render(0);
  await app.ready;
  render(0);
  app.start((dt) => {
    if (frozenT === null) { time += dt; frame(dt); }
  });
  window.__ready = true;
}

boot().catch((e) => console.error('[demo] boot failed', e));
