/**
 * App-shell demo (task F3a): render app + quality presets + post chain + asset loader + input + camera rigs, without
 * any simulation. A stand-in ant walks a scripted path over a wall and through a 2 BU corridor; the rigs collide
 * with the same analytic field the scene is built from.
 *
 * URL flags: ?test=1  &quality=test|low|medium|high|ultra|auto  &post=0|1  &rig=third|observer|colony|photo
 *            &t=SECONDS (freeze the path time)  &hud=0  &missing=1 (also request a texture that does not exist)
 * Keys (raw, demo only): 1-4 rigs, Q cycle quality, P toggle post, F8 pointer lock on/off; plus the real bindings
 * (RMB/MMB drag orbit, arrows, wheel, [ ], Z recentre, WASD in observer/colony/photo, ...).
 * Globals: window.__ready, window.__demo (see the bottom of this file).
 */
import { PerspectiveCamera } from 'three';
import { vec3 } from '@/core';
import { attachDomInput, InputState, type DomInput } from '@/input';
import {
  applyOverrides, createRenderApp, getPreset, parseRenderFlags, pickQuality, QUALITY_IDS, runStartupBenchmark, configureSunShadow,
  type QualityId, type QualityPreset, type RenderApp,
} from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { applyPose, makeSphereTracer } from '@/render/camera';
import { DEMO_BU, demoField, demoPathAt, demoTimeAtX, demoTimeOnWall, makeTargetObj } from '@/render/camera/testing/demoField';
import { renderOverlay } from './overlay';
import { DemoRigs, RIG_NAMES, type RigName } from './rigs';
import { buildScene } from './scene';

declare global {
  interface Window { __ready?: boolean; __demo?: unknown }
}

const params = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const frozenT = params.has('t') ? Number(params.get('t')) : null;
const showHud = params.get('hud') !== '0';

const hud = document.getElementById('hud')!;
const fadeEl = document.getElementById('fade')!;
const warnings: string[] = [];
const assets = createBrowserAssetLoader({ warn: (m) => { warnings.push(m); console.warn('[assets]', m); } });
const input = new InputState();
const trace = makeSphereTracer(demoField);
const rigs = new DemoRigs(input, trace);
const target = makeTargetObj();
let time = frozenT ?? 0;
let postOverride = flags.post;
let qualityId: QualityId = 'test';
let app: RenderApp;
let dom: DomInput;
let canvas: HTMLCanvasElement;
let frameCount = 0;
let lastPos = vec3();
const camera = new PerspectiveCamera(60, 16 / 9, 0.2, 32000);

function presetFor(id: QualityId): QualityPreset {
  const p = getPreset(id);
  if (postOverride !== null) {
    p.post.enabled = postOverride;
    if (postOverride && !p.post.dof.enabled) { p.post = getPreset('high').post; } // test/low have no post params of their own
  }
  return applyOverrides(p, {});
}

const demo = buildScene(assets);

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.tabIndex = 0;
  document.body.prepend(c);
  return c;
}

/** (Re)create the renderer. Needed when the antialias choice changes (post on <-> off). */
function createApp(id: QualityId): void {
  qualityId = id;
  if (app) { app.dispose(); dom.detach(); canvas.remove(); }
  canvas = makeCanvas();
  app = createRenderApp(canvas, {
    quality: presetFor(id), scene: demo.scene, camera,
    onContextLost: () => console.info('[demo] context lost: rendering paused'),
    onContextRestored: () => console.info('[demo] context restored'),
  });
  dom = attachDomInput(input, { canvas });
  assets.setAnisotropy(app.quality.anisotropy);
  configureSunShadow(demo.sun, app.quality, DEMO_BU);
  // A frozen clock (?t=) renders only when something changes: software GL must not build a GPU backlog.
  if (frozenT !== null) app.setOnDemand(true);
  app.start(onFrame);
}

function setQuality(id: QualityId): void {
  qualityId = id;
  app.setQuality(presetFor(id));
  if (app.needsRecreate) createApp(id);
  configureSunShadow(demo.sun, app.quality, DEMO_BU);
  assets.setAnisotropy(app.quality.anisotropy);
  app.requestRender();
}

function step(dt: number): void {
  if (frozenT === null) time += dt;
  demoPathAt(time, target);
  if (Math.hypot(target.pos.x - lastPos.x, target.pos.y - lastPos.y) > 20) rigs.third.snap(); // path looped
  lastPos = vec3(target.pos.x, target.pos.y, target.pos.z);
  const f = rigs.update(dt, target);
  applyPose(camera, f.pose, canvas.clientWidth / Math.max(1, canvas.clientHeight));
  app.setFocus(f.focus, f.focusRange, dt === 0); // settle() ends with dt 0: snap the focus for screenshots
  app.post?.setHooks({ bokehOverride: f.bokeh });
  // stand-in ant: orient by (fwd, up), fade per the rig's visibility rule
  const side = vec3(target.fwd.y * target.up.z - target.fwd.z * target.up.y, target.fwd.z * target.up.x - target.fwd.x * target.up.z, target.fwd.x * target.up.y - target.fwd.y * target.up.x);
  demo.ant.matrixAutoUpdate = false;
  demo.ant.matrix.set(target.fwd.x, target.up.x, side.x, target.pos.x, target.fwd.y, target.up.y, side.y, target.pos.y, target.fwd.z, target.up.z, side.z, target.pos.z, 0, 0, 0, 1);
  demo.ant.matrixWorldNeedsUpdate = true;
  demo.antMaterial.opacity = rigs.active === 'third' ? f.antOpacity : 1;
  demo.antMaterial.depthWrite = demo.antMaterial.opacity > 0.99;
  // sun follows the focus so the shadow frustum covers what we see
  demo.sun.position.set(target.pos.x - 160, 260, target.pos.z + 90);
  demo.sun.target.position.set(target.pos.x, 0, target.pos.z);
  fadeEl.style.opacity = String(f.dip);
  if (showHud && (frameCount % 10 === 0 || frozenT !== null || app.quality.renderOnDemand)) {
    hud.textContent = renderOverlay({ rig: rigs.active, quality: qualityId, post: !!app.post, stats: app.frameStats(), input: input.debugSummary(), info: f.info, t: time, warnings: warnings.length });
  }
}

function onFrame(dt: number, now: number): void {
  dom.poll();
  input.update(now);
  for (const e of input.drainEvents()) console.info('[input]', JSON.stringify(e));
  for (let i = 0; i < RIG_NAMES.length; i++) if (input.codePressed(`Digit${i + 1}`)) rigs.set(RIG_NAMES[i], target);
  if (input.codePressed('KeyQ') && rigs.active === 'third') setQuality(QUALITY_IDS[(QUALITY_IDS.indexOf(qualityId) + 1) % QUALITY_IDS.length]);
  if (input.codePressed('KeyP')) { postOverride = !app.post; setQuality(qualityId); }
  if (input.pressed('pointer-lock-toggle')) input.pointer.setPreference(input.pointer.preference === 'locked' ? 'drag' : 'locked');
  const active = frozenT === null || input.anyActivity || input.debugSummary().held.length > 0 || input.frameDt === 0 || rigs.transition.running;
  if (active) { step(dt); app.requestRender(); }
  frameCount++;
}

/** Run the rigs over the last `seconds` of path time so smoothing, breadcrumbs and state hold are settled. */
function settle(seconds = 4): void {
  const end = time;
  rigs.third.snap();
  for (let t = Math.max(0, end - seconds); t < end; t += 1 / 30) { demoPathAt(t, target); rigs.update(1 / 30, target); }
  time = end;
  step(0);
}

async function boot(): Promise<void> {
  await assets.init();
  const ids = [...demo.materialIds.flatMap((m) => assets.materialAssetIds(m))];
  if (params.get('missing') === '1') assets.texture('does_not_exist', 'albedo');
  await assets.preload(ids);
  let id: QualityId;
  if (flags.quality === 'auto') {
    // benchmark on a throwaway renderer, then build the real one
    createApp('test');
    const probe = runStartupBenchmark(app.renderer);
    id = pickQuality(probe).id;
    console.info('[demo] auto quality', pickQuality(probe));
    setQuality(id);
  } else {
    id = flags.quality;
    createApp(id);
  }
  const rig = params.get('rig') as RigName | null;
  if (rig && RIG_NAMES.includes(rig)) { demoPathAt(time, target); rigs.set(rig, target, true); }
  settle();
  app.renderFrame(0);
  await app.ready;
  app.renderFrame(0);
  window.__ready = true;
}

window.__demo = {
  times: { open: 2, wall: demoTimeOnWall(), corridor: demoTimeAtX(215), afterCorridor: demoTimeAtX(300) },
  setRig: (name: RigName, instant = true) => { rigs.set(name, target, instant); settle(); app.renderFrame(0); return rigs.active; },
  setTime: (t: number) => { time = t; settle(); app.renderFrame(0); },
  setQuality: async (id: QualityId) => { setQuality(id); settle(); app.renderFrame(0); await app.ready; app.renderFrame(0); return { quality: qualityId, post: !!app.post }; },
  setPost: async (on: boolean) => { postOverride = on; setQuality(qualityId); settle(); app.renderFrame(0); await app.ready; app.renderFrame(0); return !!app.post; },
  orbit: (yawDeg: number, pitchDeg: number) => { rigs.third.update(0, target, { yawDeg, pitchDeg, zoomLog: 0 }, { trace }); settle(1); app.renderFrame(0); },
  renderFrame: () => app.renderFrame(0),
  stats: () => app.frameStats(),
  camera: () => ({ rig: rigs.active, pose: { pos: { ...camera.position }, fov: camera.fov, near: camera.near, far: camera.far }, clearance: demoField(camera.position.x, camera.position.y, camera.position.z), radius: rigs.third.radiusMm, debug: rigs.third.debug() }),
  input: () => ({ ...input.debugSummary(), lockWasRefused: input.pointer.wasRefused }),
  warnings: () => [...warnings],
  placeholders: () => demo.materialIds.filter((m) => ['albedo', 'normal', 'rough'].some((k) => assets.isPlaceholder(m, k))),
  requestMissing: async () => { await assets.textureAsync('no_such_material', 'albedo'); return assets.isPlaceholder('no_such_material', 'albedo'); },
  // three keeps the WEBGL_lose_context extension object; getExtension() on a lost context would return null
  loseContext: () => { app.renderer.forceContextLoss(); },
  restoreContext: () => { app.renderer.forceContextRestore(); },
  contextLost: () => app.contextLost,
  dispose: () => { app.dispose(); dom.detach(); },
};

boot().catch((e) => { console.error('[demo] boot failed', e); });
