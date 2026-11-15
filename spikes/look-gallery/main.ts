/**
 * Look gallery (look-pass task): the production world, decor and ant renderers over a REAL generated world and a
 * real new-game sim, framed like the look spike's macro camera (about 4.5 body lengths back, pitch about 17
 * degrees, 50 degree field of view, look target ahead of and above the ant). Plus a material swatch world.
 *
 * URL flags: ?quality=low|medium|high|ultra  &arch=<archetype>|swatch  &frame=start|plant|prop|paving|interior
 *            &light=midday|golden|overcast|night  &seed=N  &t=SECONDS (frozen clock)  &hud=0
 * Globals:   window.__ready, window.__gallery (load, frames, setFrame, setLight, setQuality, setCamera, render,
 *            bench, stats, dispose; probe helpers: sceneNames, boundTarget, setVisible, pose)
 * Scripted by tests/e2e/look.mjs.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, type QualityId, type QualityPreset, type RenderApp } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { WorldRenderer, type EnvOverride } from '@/render/world/lighting';
import { DecorRenderer } from '@/render/world/decor';
import { AntRenderer } from '@/render/ants';
import { MATERIAL_IDS, type Ant, type ArchetypeId, type Sim, type WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { findFrames, type GalleryFrame } from './frames';
import { buildSwatchWorld, swatchCentre, SWATCH_COLS } from './swatchWorld';

declare global {
  interface Window { __ready?: boolean; __gallery?: unknown }
}

type LightId = 'midday' | 'golden' | 'overcast' | 'night' | 'underground';
/** Lighting variants of the reference frames (spike-look 2.3): hour, weather, cloud, wetness. */
const LIGHTS: Record<LightId, { hour: number; weather: EnvOverride['weather']; cloud: number; wet: number }> = {
  midday: { hour: 12.6, weather: 'clear', cloud: 0.1, wet: 0 },
  golden: { hour: 18.6, weather: 'clear', cloud: 0.15, wet: 0 }, // about 8 degrees of sun (sunset 19.2 at yearFrac 0.4)
  overcast: { hour: 12.2, weather: 'overcast', cloud: 0.95, wet: 1 },
  night: { hour: 23.5, weather: 'clear', cloud: 0.1, wet: 0.15 },
  // the ants' light in the nest (camera-side sense fill, dim warm ambient); the gallery draws no nest walls
  underground: { hour: 12.6, weather: 'clear', cloud: 0.1, wet: 0 },
};

const qs = new URLSearchParams(location.search);
const frozenT = qs.has('t') ? Number(qs.get('t')) : 2;
const showHud = qs.get('hud') !== '0';
const hudEl = document.getElementById('hud')!;
let light: LightId = (qs.get('light') as LightId) in LIGHTS ? (qs.get('light') as LightId) : 'midday';

// ------------------------------------------------------------------------------------------ renderers
const scene = new Scene();
const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
let qualityId: QualityId = isQualityId(qs.get('quality') ?? '') ? (qs.get('quality') as QualityId) : 'high';
function presetFor(id: QualityId): QualityPreset {
  const p = getPreset(id);
  p.dynamicResolution.enabled = false; // scripted frames: a fixed drawing-buffer size
  return p;
}
const assets = createBrowserAssetLoader({ anisotropy: presetFor(qualityId).anisotropy, maxTextureSize: presetFor(qualityId).maxTextureSize, warn: (m) => console.warn('[assets]', m) });
let canvas = makeCanvas();
let app: RenderApp = createRenderApp(canvas, { quality: presetFor(qualityId), scene, camera });
// renderers are replaced (not re-initialised) when a quality change needs a new WebGL context
let worldRenderer = new WorldRenderer();
let decor = new DecorRenderer();
let ants = new AntRenderer();

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  document.body.prepend(c);
  return c;
}

// ------------------------------------------------------------------------------------------ world + sim
let world: WorldData | null = null;
let sim: Sim | null = null;
let worldName = '';
let frames: GalleryFrame[] = [];
let frameId = 'start';
let queen: Ant | null = null;
let worker: Ant | null = null;
const subject = new Vector3();

function makeSim(arch: string, seed: number): { sim: Sim; world: WorldData } {
  const cfg = defaultGameConfig('lasius-niger', seed);
  cfg.cheats = true;
  if (arch === 'swatch') {
    const w = buildSwatchWorld();
    cfg.world = { ...cfg.world, ...w.params };
    const g = createNewGame(cfg, w);
    return { sim: createSim(g.state, g.world), world: g.world };
  }
  cfg.world = { ...cfg.world, archetype: arch as ArchetypeId };
  const g = createNewGame(cfg);
  return { sim: createSim(g.state, g.world), world: g.world };
}

async function load(arch: string, seed = Number(qs.get('seed') ?? 1)): Promise<{ frames: string[]; ms: number; objects: number; prims: number }> {
  const t0 = performance.now();
  const made = makeSim(arch, seed);
  world = made.world; sim = made.sim; worldName = arch;
  const s = sim.state;
  queen = s.ants.find((a) => a.caste === 'queen') ?? null;
  // the gallery shows play after the opening's dealation (the founding module's own end state): wings shed
  if (queen?.queen?.founding) queen.queen.founding.wings = false;
  if (s.player.opening) s.player.opening.phase = 'search';
  const ctx = { state: s, stores: sim.stores, emit: () => {}, world: { bu: world.bu } };
  worker = spawnAnt(ctx as never, { colony: s.colonies[0].id, caste: 'worker', pos: { ...world.queenStart.pos }, fwd: { ...world.queenStart.fwd }, lengthBu: 1 });
  await worldRenderer.setWorld(world, sim);
  decor.setWorld(world, sim);
  ants.setSim(sim);
  frames = arch === 'swatch' ? swatchFrames(world) : findFrames(world);
  setFrame(frames[0]?.id ?? 'start');
  return { frames: frames.map((f) => f.id), ms: Math.round(performance.now() - t0), objects: world.objects.length, prims: world.prims.length };
}

/** Swatch frames: one per row of materials (the ant stands left of the row). */
function swatchFrames(w: WorldData): GalleryFrame[] {
  const out: GalleryFrame[] = [];
  const rows = Math.ceil(MATERIAL_IDS.length / SWATCH_COLS);
  // close-ups of the template finishes and plant parts (one per object beyond the material swatches)
  for (const o of w.objects) {
    if (o.templateId.startsWith('swatch-')) continue;
    out.push({
      id: `cell-${o.templateId}` as GalleryFrame['id'], drop: { x: o.pos.x - 22, y: 12, z: o.pos.z - 14 }, dir: { x: 0.55, z: 0.84 }, note: `finish ${o.templateId}`,
      cam: { distBU: 9, pitch: 0.3, aheadBU: 4, upBU: 1.5, yawOff: 0.2 },
    });
  }
  for (let r = 0; r < rows; r++) {
    const c = swatchCentre(r * SWATCH_COLS + 3); // middle of the row
    out.push({
      id: `row${r}` as GalleryFrame['id'], drop: { x: c.x + 6, y: 12, z: c.z - 22 }, dir: { x: 0, z: 1 }, note: `materials ${r * SWATCH_COLS}..${r * SWATCH_COLS + SWATCH_COLS - 1}`,
      cam: { distBU: 32, pitch: 0.42, aheadBU: 6, upBU: 0, yawOff: 0 },
    });
  }
  return out;
}

function place(ant: Ant | null, x: number, y: number, z: number, dx: number, dz: number): boolean {
  if (!ant || !sim) return false;
  return walkerPlace(sim.field, ant, { x, y, z }, { heading: { x: dx, y: 0, z: dz } });
}

/** Camera pose of the spike's macro framing (spike-look 2.2), scaled by BU; optional overrides for wide views. */
const cam = { distBU: 4.5, pitch: 0.3, aheadBU: 1.75, upBU: 1.125, yawOff: 0.35 };

function setFrame(id: string): { ok: boolean; note: string; subjectOnGround: boolean; feetGapMm: number } {
  const f = frames.find((q) => q.id === id);
  if (!f || !world || !sim) return { ok: false, note: 'no frame', subjectOnGround: false, feetGapMm: NaN };
  frameId = id;
  const bu = world.bu;
  const isStart = id === 'start';
  const main = isStart ? queen : worker, other = isStart ? worker : queen;
  const ok = place(main, f.drop.x, f.drop.y, f.drop.z, f.dir.x, f.dir.z);
  // the other ant stands a little to the side and ahead, so both castes are in most frames
  const side = { x: -f.dir.z, z: f.dir.x };
  place(other, f.drop.x + side.x * 4 * bu + f.dir.x * 3 * bu, f.drop.y, f.drop.z + side.z * 4 * bu + f.dir.z * 3 * bu, f.dir.x, f.dir.z);
  if (!main) return { ok: false, note: f.note, subjectOnGround: false, feetGapMm: NaN };
  const p = main.pos, up = main.up;
  const foot = main.footOffset;
  // ground under the feet = walker position minus the foot offset; f there must be ~0 (on the substrate surface)
  const gx = p.x - up.x * foot, gy = p.y - up.y * foot, gz = p.z - up.z * foot;
  const gap = sim.field.sample({ x: gx, y: gy, z: gz });
  subject.set(gx, gy, gz);
  aim(f.dir.x, f.dir.z, f.cam ?? cam);
  render();
  return { ok, note: f.note, subjectOnGround: Math.abs(gap) < 0.25 * bu, feetGapMm: Math.round(gap * 1000) / 1000 };
}

function aim(dx: number, dz: number, c: typeof cam): void {
  const bu = world?.bu ?? 4;
  const cam = c;
  const yaw = Math.atan2(dz, dx) + cam.yawOff;
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  let d = cam.distBU * bu;
  // like the possession camera: a boom from above the ant that stops short of solids (a bin wall behind the start
  // pose put the camera inside the bin)
  if (sim) {
    const o = { x: subject.x, y: subject.y + 0.5 * bu, z: subject.z };
    const dir = { x: -fx * Math.cos(cam.pitch), y: Math.sin(cam.pitch), z: -fz * Math.cos(cam.pitch) };
    const hit = sim.field.sphereTrace(o, dir, d, 0.4 * bu);
    if (hit < d) d = Math.max(1.5 * bu, hit - 0.3 * bu);
  }
  camera.position.set(subject.x - fx * Math.cos(cam.pitch) * d, subject.y + Math.sin(cam.pitch) * d + 0.5 * bu, subject.z - fz * Math.cos(cam.pitch) * d);
  camera.lookAt(subject.x + dx * cam.aheadBU * bu, subject.y + cam.upBU * bu, subject.z + dz * cam.aheadBU * bu);
  camera.updateMatrixWorld();
}

// ------------------------------------------------------------------------------------------ frame
function envNow(): EnvOverride {
  const l = LIGHTS[light];
  return { hour: l.hour, yearFrac: 0.4, weather: l.weather, cloud: l.cloud };
}

const pixel = new Uint8Array(4);
function render(): void {
  if (!world) return;
  const l = LIGHTS[light];
  worldRenderer.setWetness(l.wet);
  const env = envNow();
  const under = light === 'underground';
  worldRenderer.update({ dt: 0, time: frozenT, sim, subject, env, underground: under });
  decor.update({ dt: 0, time: frozenT, sim, subject, env, dew: light === 'overcast' ? 0.6 : 0, windMs: 1.5, still: false });
  decor.flush();
  ants.update({ dt: 0, time: frozenT, alpha: 1, sim, camera, viewportHeightPx: app.renderer.domElement.height, underground: under, possessedPose: null });
  app.setFocus(camera.position.distanceTo(subject), undefined, true);
  app.renderFrame(0);
  const gl = app.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // wait for the GPU (no backlog in scripted runs)
  if (showHud) hudEl.textContent = hudText();
}

function stats() {
  return { frame: app.frameStats(), world: worldRenderer.stats(), decor: decor.stats(), ants: { ...ants.stats } };
}

function hudText(): string {
  const s = app.frameStats();
  return `${worldName} / ${frameId} / ${light} / ${qualityId}   draws ${s.drawCalls}  tris ${s.triangles}  ${s.width}x${s.height}`;
}

async function initRenderers(p: QualityPreset): Promise<void> {
  const ctx = { renderer: app.renderer, scene, camera, quality: p, assets, setExposure: (ev: number) => app.setExposure(ev) };
  await worldRenderer.init(ctx);
  await decor.init(ctx, worldRenderer);
  ants.init(ctx);
}

async function setQuality(id: QualityId): Promise<ReturnType<typeof stats>> {
  qualityId = id;
  const p = presetFor(id);
  app.setQuality(p);
  // Workaround (root cause in src/render/app, reported): postprocessing's EffectComposer sets renderer.autoClear =
  // false and nothing restores it when a switch to a preset without post (Low) disposes the chain, so the direct
  // path drew every new frame over the old colour and depth (near objects of the previous view stayed on screen).
  if (!app.post) app.renderer.autoClear = true;
  if (app.needsRecreate) {
    ants.dispose(); decor.dispose(); worldRenderer.dispose(); app.dispose();
    canvas.remove();
    canvas = makeCanvas();
    app = createRenderApp(canvas, { quality: p, scene, camera });
    app.setOnDemand(true);
    worldRenderer = new WorldRenderer(); decor = new DecorRenderer(); ants = new AntRenderer();
    await initRenderers(p);
    if (world && sim) { await worldRenderer.setWorld(world, sim); decor.setWorld(world, sim); ants.setSim(sim); }
  } else {
    worldRenderer.setQuality(app.quality);
    decor.setQuality(app.quality);
    ants.setQuality(app.quality);
  }
  render();
  await app.ready;
  render();
  return stats();
}

window.__gallery = {
  load,
  frames: () => frames.map((f) => ({ id: f.id, note: f.note })),
  setFrame,
  setLight: (id: LightId) => { light = id; return true; },
  setQuality,
  /** Camera overrides (BU / radians) for wider views; null restores the macro framing. */
  setCamera: (o: Partial<typeof cam> | null) => { Object.assign(cam, o ?? { distBU: 4.5, pitch: 0.3, aheadBU: 1.75, upBU: 1.125, yawOff: 0.35 }); setFrame(frameId); return { ...cam }; },
  render: () => { render(); return stats(); },
  /** Renders n frames and returns the minimum frame time, ms (synchronous, GPU-finished). */
  bench: (n = 3) => {
    let best = Infinity;
    for (let i = 0; i < n; i++) { const t = performance.now(); render(); best = Math.min(best, performance.now() - t); }
    return { ms: Math.round(best), ...stats() };
  },
  stats,
  /** Top-level scene children (probes: nothing of a disposed renderer may stay in the scene). */
  sceneNames: () => scene.children.map((c) => `${c.name || c.type}:${c.children.length}`),
  /** Name of the render target bound after the last frame (null = the screen), for probes. */
  boundTarget: () => { const t = app.renderer.getRenderTarget(); return t ? (t.texture.name || 'unnamed') : null; },
  /** Shows or hides a top-level scene group by name (world, decor, ants), for probes isolating a renderer. */
  setVisible: (name: string, on: boolean) => { for (const c of scene.children) if (c.name === name) c.visible = on; render(); return true; },
  /** Camera, subject and the two ants (for probes comparing runs). */
  pose: () => ({
    camera: camera.position.toArray().map((v) => Math.round(v * 100) / 100), subject: subject.toArray().map((v) => Math.round(v * 100) / 100),
    queen: queen ? { id: queen.id, caste: queen.caste, pos: { ...queen.pos } } : null, worker: worker ? { id: worker.id, caste: worker.caste, pos: { ...worker.pos } } : null,
    ants: sim?.state.ants.map((a) => ({ id: a.id, caste: a.caste, pos: { ...a.pos } })) ?? [],
  }),
  dispose: () => { ants.dispose(); decor.dispose(); worldRenderer.dispose(); app.dispose(); },
};

async function boot(): Promise<void> {
  await assets.init();
  app.setOnDemand(true);
  await initRenderers(app.quality);
  await load(qs.get('arch') ?? 'woodland-edge');
  if (qs.has('frame')) setFrame(qs.get('frame')!);
  render();
  await app.ready;
  render();
  window.__ready = true;
}

boot().catch((e) => console.error('[gallery] boot failed', e));
