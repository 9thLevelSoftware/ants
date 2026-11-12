/**
 * FOUNDRESS look-dev spike: naturalistic macro photography at ant scale (mm units, Y up, 4 mm ant).
 *
 * URL flags: ?variant=midday|golden|overcast|night|underground  ?quality=low|medium|high|ultra
 *            ?t=SECONDS (freeze animation time; deterministic screenshots)  ?ui=0 (hide buttons)  ?hud=1
 * Globals:   window.__ready, window.__spike = { setVariant, setQuality, renderSync, pause, resume, bench, stageBench, info, dispose }
 */
import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, Group, HemisphereLight, Mesh, NoToneMapping, Object3D, PCFShadowMap,
  PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { Material, MeshStandardMaterial, MeshPhysicalMaterial, Texture } from 'three';
import { loadTextures, type MatName, type TextureSet } from './textures';
import { U } from './shaders';
import { SLAB_TOP, buildTerrain, groundNormal, groundY } from './terrain';
import { buildGrass, type GrassBuild } from './grass';
import { buildClover, buildDandelion, buildDroplets, buildHardscape, buildLeaves, buildPebbles, buildTwig } from './props';
import { buildBackground } from './background';
import { buildAnt } from './ant';
import { Sky } from './sky';
import { buildUnderground } from './underground';
import { buildPost, type PostChain } from './post';
import { QUALITY, type QualityName, type QualityPreset } from './quality';
import { VARIANTS, sunVector, type Variant, type VariantName } from './variants';

declare global { interface Window { __ready?: boolean; __spike?: unknown } }

const qs = new URLSearchParams(location.search);
let FROZEN_T = qs.has('t') ? Number(qs.get('t')) : null;
const SHOW_UI = qs.get('ui') !== '0';
const SHOW_HUD = qs.get('hud') === '1';
let variantName = (qs.get('variant') ?? 'midday') as VariantName;
let qualityName = (qs.get('quality') ?? 'high') as QualityName;

// ------------------------------------------------------------------------------------------------ renderer
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.toneMapping = NoToneMapping;          // ACES happens in the post chain (ToneMappingEffect)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;        // r187: PCFSoft was removed; PCF + shadow.radius = Vogel-disk soft PCF
renderer.info.autoReset = false;
const gl = renderer.getContext();

const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 1, 40000);
const surface = new Scene(); surface.name = 'surface';
const under = new Scene(); under.name = 'underground';

// subject (the controlled ant)
const SUBJECT = new Vector3(0, groundY(0, 0), 0);
const CAM = { yaw: 0.32, pitch: 0.3, dist: 18, look: 4.5 };     // orbit around the subject (drag / wheel)
const subjectFocus = new Vector3();                              // DoF target (centre of the ant body)

const state = {
  tex: null as TextureSet | null, sky: null as Sky | null, post: null as PostChain | null,
  sun: new DirectionalLight(0xffffff, 3), q: QUALITY.high as QualityPreset, v: VARIANTS.midday as Variant,
  quality: {} as Record<string, Object3D | null>, grass: null as GrassBuild | null,
  static: {} as Record<string, Object3D>, mats: {} as Record<string, Material[]>,
  ant: null as ReturnType<typeof buildAnt> | null, ug: null as ReturnType<typeof buildUnderground> | null, ugCell: 0,
  lamps: null as Object3D | null, droplets: null as Object3D | null, ugHemi: new HemisphereLight(0xffffff, 0xffffff, 0),
  envDay: null as Texture | null, frames: 0, running: true, lastMs: 0, t0: performance.now(),
};

// ------------------------------------------------------------------------------------------------ build
async function init() {
  const names: MatName[] = ['soil_garden', 'humus_forest', 'sand_playground', 'gravel_fine', 'bark_oak', 'asphalt', 'brick', 'leaf_atlas_maple', 'leaf_atlas_oak_dry', 'grass_blades_atlas'];
  state.tex = await loadTextures(names, 8);
  const tex = state.tex;
  state.sky = new Sky(renderer);
  surface.add(state.sky.mesh);
  // sun / moon
  const sun = state.sun; sun.castShadow = true; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.12;
  surface.add(sun, sun.target);
  // static content (quality independent)
  const bg = buildBackground(tex); state.lamps = bg.lamps;
  const twig = buildTwig(tex), clover = buildClover(), dand = buildDandelion();
  const ant = buildAnt(); state.ant = ant;
  surface.add(bg.group, twig.mesh, clover.mesh, dand.group, ant.group);
  state.static = { background: bg.group, twig: twig.mesh, clover: clover.mesh, dandelion: dand.group };
  state.mats = { leafy: [clover.mat, ...dand.mats], twig: [twig.mat], bg: bg.mats };
  (state as unknown as { cloverTops: unknown }).cloverTops = clover.tops;
  (state as unknown as { twigTops: unknown }).twigTops = twig.tops;
  placeAnt();
  // underground scene skeleton
  under.add(state.ugHemi);
  under.fog = new FogExp2(0x000000, 0.01);
  surface.fog = new FogExp2(0xffffff, 0.0001);
  applyQuality(QUALITY[qualityName] ?? QUALITY.high);
  applyVariant(VARIANTS[variantName] ?? VARIANTS.midday);
  await state.post!.ready;
  renderFrame();
  finish();
  requestAnimationFrame(loop);
  setupUI();
  window.__ready = true;
}

function placeAnt() {
  const a = state.ant!; const n = groundNormal(SUBJECT.x, SUBJECT.z);
  a.group.position.copy(SUBJECT);
  a.group.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), n).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -1.15));
  subjectFocus.copy(SUBJECT).add(new Vector3(0, 0.9, 0));
}

function disposeObject(o: Object3D | null | undefined) {
  if (!o) return;
  o.parent?.remove(o);
  o.traverse((c) => { const m = c as Mesh; if (m.geometry) m.geometry.dispose(); });
}

function applyQuality(q: QualityPreset) {
  state.q = q; qualityName = q.name;
  const tex = state.tex!;
  for (const k of Object.keys(state.quality)) disposeObject(state.quality[k]);
  const terrain = buildTerrain(tex, q.terrainSegs, { layers: q.terrainLayers, dual: q.dualScale, triplanar: q.triplanar });
  const grass = buildGrass({ count: q.grass.count, rows: q.grass.rows, folded: q.grass.folded, strip: tex.grassStrip });
  const pebbles = buildPebbles(tex, q.pebbles, { triplanar: q.triplanar });
  const leaves = buildLeaves(tex, q.leaves);
  const spots = [...leaves.tops, ...pebbles.tops, ...((state as unknown as { cloverTops: { p: Vector3; n: Vector3; r: number }[] }).cloverTops), ...(state as unknown as { twigTops: { p: Vector3; n: Vector3; r: number }[] }).twigTops];
  for (let i = 0; i < 6; i++) spots.push({ p: new Vector3(-12 + i * 9, groundY(-12 + i * 9, -14 - (i % 3) * 9) + 0.2, -14 - (i % 3) * 9), n: groundNormal(-12 + i * 9, -14 - (i % 3) * 9), r: 6 });
  const drops = buildDroplets(spots, grass.blades, q.droplets);
  const hard = buildHardscape(tex, { triplanar: true, dual: q.dualScale }); // vertical faces always need triplanar
  state.grass = grass; state.droplets = drops.mesh;
  const tg = new Group(); tg.add(terrain.mesh, terrain.far); tg.name = 'terrainGroup';
  state.quality = { terrain: tg, grass: grass.group, pebbles: pebbles.group, leaves: leaves.group, droplets: drops.mesh, hardscape: hard.group };
  surface.add(tg, grass.group, pebbles.group, leaves.group, drops.mesh, hard.group);
  state.mats.leaves = leaves.mats; state.mats.grass = [grass.material]; state.mats.pebbles = [pebbles.mat]; state.mats.drops = [drops.mat];
  // shadows
  const sun = state.sun; const s = q.shadow;
  renderer.shadowMap.enabled = s.enabled; sun.castShadow = s.enabled;
  sun.shadow.mapSize.set(s.size, s.size);
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  const cam = sun.shadow.camera; cam.left = -s.half; cam.right = s.half; cam.top = s.half; cam.bottom = -s.half; cam.near = 1; cam.far = 4000; cam.updateProjectionMatrix();
  for (const sc of [surface, under]) sc.traverse((o) => { const m = (o as Mesh).material as Material | Material[] | undefined; if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true; });
  // underground mesh resolution follows quality (built lazily)
  if (state.ug && state.ugCell !== q.ugCell) { disposeObject(state.ug.group); state.ug = null; }
  // resolution + post
  renderer.setPixelRatio(q.resScale);
  renderer.setSize(innerWidth, innerHeight, false);
  state.post?.composer.dispose();
  state.post = buildPost(renderer, variantScene(), camera, q, subjectFocus);
  state.post.composer.setSize(innerWidth, innerHeight, false);
  if (state.v) applyVariant(state.v);
}

function variantScene() { return state.v?.underground ? under : surface; }

function ensureUnderground() {
  if (state.ug) return state.ug;
  const ug = buildUnderground(state.tex!, state.q.ugCell);
  state.ug = ug; state.ugCell = state.q.ugCell;
  under.add(ug.group);
  console.info('[look] underground mesh', JSON.stringify(ug.stats));
  return ug;
}

function applyVariant(v: Variant) {
  state.v = v; variantName = v.name;
  const sky = state.sky!; const post = state.post!; const ant = state.ant!;
  const sunDir = sunVector(v.sun.elev, v.sun.azim, CAM.yaw);
  sky.set({ zenith: v.sky.zenith, horizon: v.sky.horizon, ground: v.sky.ground, sunDir, sunColor: v.sun.color.clone().multiplyScalar(v.sun.intensity / 3), sunDisc: v.sky.sunDisc, sunGlow: v.sky.sunGlow, discSize: v.sky.discSize, overcast: v.sky.overcast, stars: v.sky.stars });
  const env = sky.bakeEnvironment();
  if (v.underground) {
    const ug = ensureUnderground();
    // the ant + sky move to the underground scene; the daylight IBL is attenuated with path length from the entrance
    under.add(ant.group, sky.mesh);
    under.environment = env; under.environmentIntensity = 6.0; // daylight at the entrance is many stops brighter than the chamber
    (under.fog as FogExp2).color.copy(v.fog.color); (under.fog as FogExp2).density = v.fog.density;
    state.ugHemi.color.setRGB(0.6, 0.36, 0.17); state.ugHemi.groundColor.setRGB(0.3, 0.16, 0.07); state.ugHemi.intensity = 0.6;
    ant.group.position.copy(ug.antPos);
    const dir = ug.tunnelMouth.clone().sub(ug.antPos).setY(0).normalize();
    ant.group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-dir.x, -dir.z));
    subjectFocus.copy(ug.antPos).add(new Vector3(0, 0.9, 0));
    ant.halo.visible = true; ant.glow.visible = true; ant.glow.intensity = 7; ant.contact.visible = false; ant.rim.value.setRGB(0.06, 0.03, 0.01);
    camera.near = 0.5;
  } else {
    surface.add(ant.group, sky.mesh);
    surface.environment = env; surface.environmentIntensity = v.envIntensity;
    placeAnt();
    ant.halo.visible = false; ant.glow.visible = false; ant.contact.visible = true; ant.rim.value.setRGB(0, 0, 0);
    camera.near = 1;
  }
  camera.updateProjectionMatrix();
  // the DoF CoC shader caches camera near/far at construction: re-sync after changing them (else focus is wrong)
  if (post.dof) post.dof.cocMaterial.adoptCameraSettings(camera);
  post.renderPass.mainScene = variantScene();
  (post.composer as unknown as { passes: { mainScene?: Scene }[] }).passes.forEach((p) => { if ('mainScene' in p) p.mainScene = variantScene(); });
  // sun
  const sun = state.sun;
  sun.color.copy(v.sun.color); sun.intensity = v.sun.intensity; sun.visible = v.sun.intensity > 0;
  sun.shadow.radius = state.q.shadow.radius * v.sun.shadowSoft;
  sun.userData.dir = sunDir;
  // fog / exposure / post
  if (!v.underground) { (surface.fog as FogExp2).color.copy(v.fog.color); (surface.fog as FogExp2).density = v.fog.density; }
  renderer.toneMappingExposure = v.exposure;
  if (post.bloom) { post.bloom.intensity = v.bloom.intensity; post.bloom.luminanceMaterial.threshold = v.bloom.threshold; }
  post.grade.set(v.grade.saturation, v.grade.lift, v.grade.gain, v.grade.contrast);
  post.vignette.darkness = v.vignette;
  if (post.dof) { post.setDofParams(v.dof.dead, v.dof.range); post.dof.bokehScale = state.q.post.bokehFrac * renderer.domElement.height * state.q.post.dofRes * v.dof.bokeh; }
  // surface wetness and per-material tweaks
  U.uWet.value = v.wet; U.uWind.value = v.wind; U.uTransl.value = v.transl;
  const wet = v.wet;
  for (const m of state.mats.leaves ?? []) { const s = m as MeshStandardMaterial; s.roughness = 1 - 0.4 * wet; s.color.setScalar(1 - 0.35 * wet); }
  for (const m of [...(state.mats.leafy ?? []), ...(state.mats.grass ?? [])]) { const s = m as MeshStandardMaterial; s.roughness = (s.userData.r0 ??= s.roughness) * (1 - 0.6 * wet); }
  for (const m of state.mats.twig ?? []) { const s = m as MeshStandardMaterial; s.roughness = 1 - 0.35 * wet; s.color.setRGB(1.2, 1.12, 1.02).multiplyScalar(1 - 0.35 * wet); }
  // NOTE three r187: with scene.environment, material.envMapIntensity is IGNORED (scene.environmentIntensity wins);
  // materials that need their own IBL strength get the env assigned explicitly.
  const am = ant.mat as MeshPhysicalMaterial; am.envMap = env; am.envMapIntensity = v.underground ? 0.06 : v.envIntensity; am.clearcoat = 0.45 + 0.5 * wet;
  for (const m of state.mats.drops ?? []) { (m as MeshStandardMaterial).envMap = env; }
  if (v.underground) for (const m of state.ug!.mats.slice(1)) { (m as MeshStandardMaterial).envMap = env; (m as MeshStandardMaterial).envMapIntensity = 0.05; }
  if (state.droplets) state.droplets.visible = wet > 0.5;
  if (state.lamps) state.lamps.visible = v.lamps;
  updateCamera();
}

function updateCamera() {
  if (state.v?.underground && state.ug) {
    const ug = state.ug; const dir = ug.tunnelMouth.clone().sub(ug.antPos).setY(0).normalize();
    const side = new Vector3(-dir.z, 0, dir.x);
    camera.position.copy(ug.antPos).addScaledVector(dir, -14).addScaledVector(side, -3).add(new Vector3(0, 5.0, 0));
    camera.lookAt(ug.antPos.clone().addScaledVector(dir, 12).add(new Vector3(0, 3.5, 0)));
  } else {
    const d = new Vector3(Math.sin(CAM.yaw), 0, -Math.cos(CAM.yaw));
    camera.position.copy(SUBJECT).addScaledVector(d, -CAM.dist * Math.cos(CAM.pitch)).add(new Vector3(0, CAM.dist * Math.sin(CAM.pitch) + 1, 0));
    camera.lookAt(SUBJECT.clone().addScaledVector(d, 7).add(new Vector3(0, CAM.look, 0)));
  }
  // shadow frustum follows the subject (texel density where the eye is)
  const sun = state.sun; const dir = (sun.userData.dir as Vector3 | undefined) ?? new Vector3(0, 1, 0);
  const c = state.v?.underground ? state.ug!.antPos : SUBJECT;
  const ahead = new Vector3(Math.sin(CAM.yaw), 0, -Math.cos(CAM.yaw)).multiplyScalar(state.q.shadow.half * 0.55);
  sun.target.position.copy(c).add(ahead); sun.position.copy(sun.target.position).addScaledVector(dir, 2000);
  sun.target.updateMatrixWorld();
}

// ------------------------------------------------------------------------------------------------ frame
function renderFrame(dt = 1 / 60) {
  const t = FROZEN_T ?? (performance.now() - state.t0) / 1000;
  U.uTime.value = t; U.uCamPos.value.copy(camera.position); U.uSubject.value.copy(state.v?.underground ? state.ug!.antPos : SUBJECT);
  state.sky!.mesh.position.copy(camera.position);
  renderer.info.reset();
  state.post!.composer.render(dt);
  state.frames++;
}
const px = new Uint8Array(4);
function finish() { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
let last = performance.now();
function loop() {
  if (!state.running) return;
  const now = performance.now(); state.lastMs = now - last; last = now;
  renderFrame(Math.min(0.1, state.lastMs / 1000));
  if (SHOW_HUD) hud();
  requestAnimationFrame(loop);
}
function hud() {
  const i = renderer.info;
  (document.getElementById('hud') as HTMLElement).textContent =
    `${variantName} / ${qualityName}  ${state.lastMs.toFixed(0)} ms\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k  grass ${state.grass?.count}\nmanifest ${state.tex?.manifestFound}`;
}

// ------------------------------------------------------------------------------------------------ benchmarking
/** median of n individually timed, GPU-finished frames (after `warm` untimed frames: shader compiles, uploads) */
function timeFrames(n: number, warm: number) {
  for (let i = 0; i < warm; i++) { renderFrame(); finish(); }
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); renderFrame(); finish(); t.push(performance.now() - t0); }
  t.sort((x, y) => x - y);
  return t[Math.floor(t.length / 2)]!;
}
function frameStats() {
  renderFrame(); finish();
  return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
}
/**
 * Delta method: full frame, then the same frame with one stage removed. ms/frame, synchronous (GPU finished).
 * Every configuration is measured `rounds` times in interleaved order and the minimum mean is kept: SwiftShader
 * timings are noisy (thread scheduling), the minimum is the most repeatable statistic.
 */
function stageBench(n = 4, warm = 2, rounds = 2) {
  const was = state.running; state.running = false;
  const post = state.post!;
  const st = frameStats();
  const scene = variantScene();
  const hide = (objs: Object3D[]) => { const vis = objs.map((o) => o.visible); objs.forEach((o) => (o.visible = false)); return () => objs.forEach((o, i) => (o.visible = vis[i]!)); };
  const configs: [string, () => () => void][] = [['full', () => () => {}]];
  if (post.dof) configs.push(['noDof', () => { post.configure({ dof: false, bloom: true, aa: true }); return () => post.configure({ dof: true, bloom: true, aa: true }); }]);
  if (post.bloom) configs.push(['noBloom', () => { post.configure({ dof: true, bloom: false, aa: true }); return () => post.configure({ dof: true, bloom: true, aa: true }); }]);
  if (post.aa) configs.push(['noAA', () => { post.configure({ dof: true, bloom: true, aa: false }); return () => post.configure({ dof: true, bloom: true, aa: true }); }]);
  configs.push(['postMinimal', () => { post.configure({ dof: false, bloom: false, aa: false }); return () => post.configure({ dof: true, bloom: true, aa: true }); }]);
  if (renderer.shadowMap.enabled && state.sun.visible && !state.v.underground) configs.push(['noShadowPass', () => { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; return () => { renderer.shadowMap.autoUpdate = true; }; }]);
  const groups: Record<string, Object3D[]> = state.v.underground
    ? { noNestWalls: [state.ug!.walls], noMotes: [state.ug!.motes] }
    : {
      noGrass: [state.quality.grass!], noTerrain: [state.quality.terrain!],
      noSmallProps: [state.quality.pebbles!, state.quality.leaves!, state.static.twig!, state.static.clover!, state.static.dandelion!, state.quality.droplets!],
      noHardscape: [state.quality.hardscape!], noBackground: [state.static.background!],
    };
  for (const [k, objs] of Object.entries(groups)) configs.push([k, () => hide(objs)]);
  const r: Record<string, number> = {};
  for (let round = 0; round < rounds; round++) {
    for (const [k, apply] of configs) {
      const undo = apply();
      const ms = timeFrames(n, warm);
      undo();
      r[k] = Math.min(r[k] ?? Infinity, ms);
    }
  }
  // no post at all: direct render to the canvas with renderer tone mapping (the "post off" path)
  renderer.toneMapping = ACESFilmicToneMapping;
  const directRender = () => { renderer.info.reset(); U.uCamPos.value.copy(camera.position); renderer.render(scene, camera); };
  let best = Infinity;
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < warm; i++) { directRender(); finish(); }
    const t: number[] = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); directRender(); finish(); t.push(performance.now() - t0); }
    t.sort((x, y) => x - y); best = Math.min(best, t[Math.floor(t.length / 2)]!);
  }
  r.noPostDirect = best;
  renderer.toneMapping = NoToneMapping;
  scene.traverse((o) => { const m = (o as Mesh).material as Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
  timeFrames(1, 1);
  state.running = was; if (was) requestAnimationFrame(loop);
  for (const k of Object.keys(r)) r[k] = Math.round(r[k]! * 10) / 10;
  return { quality: qualityName, variant: variantName, size: [renderer.domElement.width, renderer.domElement.height], ...st, grass: state.grass?.count, ms: r };
}

// ------------------------------------------------------------------------------------------------ UI
function setupUI() {
  const ui = document.getElementById('ui')!;
  if (!SHOW_UI) { ui.style.display = 'none'; return; }
  const mk = (label: string, fn: () => void, group: string) => { const b = document.createElement('button'); b.textContent = label; b.dataset.g = group; b.onclick = () => { fn(); refresh(); }; ui.appendChild(b); return b; };
  const refresh = () => ui.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === variantName || b.textContent === qualityName));
  for (const v of Object.keys(VARIANTS)) mk(v, () => api.setVariant(v), 'v');
  for (const q of Object.keys(QUALITY)) mk(q, () => void api.setQuality(q), 'q');
  refresh();
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointermove', (e) => {
    if (!drag || state.v.underground) return;
    CAM.yaw += (e.clientX - drag.x) * 0.005; CAM.pitch = Math.min(1.2, Math.max(0.02, CAM.pitch + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; updateCamera();
  });
  canvas.addEventListener('wheel', (e) => { CAM.dist = Math.min(400, Math.max(8, CAM.dist * (1 + Math.sign(e.deltaY) * 0.1))); updateCamera(); }, { passive: true });
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); state.post?.composer.setSize(innerWidth, innerHeight, false);
});

// ------------------------------------------------------------------------------------------------ API
const api = {
  variants: Object.keys(VARIANTS), qualities: Object.keys(QUALITY),
  setVariant(name: string) { const v = VARIANTS[name as VariantName]; if (!v) throw new Error('unknown variant ' + name); applyVariant(v); return name; },
  async setQuality(name: string) { const q = QUALITY[name as QualityName]; if (!q) throw new Error('unknown quality ' + name); applyQuality(q); await state.post!.ready; return name; },
  /** render one frame synchronously (waits for the GPU); returns ms */
  renderSync() { const t0 = performance.now(); renderFrame(); finish(); return performance.now() - t0; },
  pause() { state.running = false; }, resume() { if (!state.running) { state.running = true; requestAnimationFrame(loop); } },
  bench(n = 6, warm = 2) { const was = state.running; state.running = false; const ms = timeFrames(n, warm); state.running = was; if (was) requestAnimationFrame(loop); return ms; },
  stageBench,
  /** debug access (not part of the contract) */
  _scene: () => variantScene(), _state: state,
  setGrassParting(on: boolean) { U.uPart.value = on ? 1 : 0; },
  /** freeze the animation clock at t seconds (null = real time) */
  setTime(t: number | null) { FROZEN_T = t; },
  setCamera(yaw: number, pitch: number, dist: number, look?: number) { CAM.yaw = yaw; CAM.pitch = pitch; CAM.dist = dist; if (look !== undefined) CAM.look = look; updateCamera(); },
  /** debug: free camera (position + look-at, mm) */
  setCameraRaw(p: [number, number, number], l: [number, number, number], fov = 50) { camera.position.set(...p); camera.lookAt(new Vector3(...l)); camera.fov = fov; camera.updateProjectionMatrix(); },
  info() {
    const s = frameStats();
    return { slabTop: SLAB_TOP, variant: variantName, quality: qualityName, ...s, grass: state.grass?.count, manifest: state.tex?.manifestFound, realTextures: Object.fromEntries(Object.entries(state.tex?.mats ?? {}).map(([k, v]) => [k, v.real])), ug: state.ug?.stats ?? null, canvas: [canvas.width, canvas.height], exposure: renderer.toneMappingExposure };
  },
  dispose() { state.running = false; state.post?.composer.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
};
window.__spike = api;
void Color;

init().catch((e) => { console.error('[look] init failed', e); throw e; });
