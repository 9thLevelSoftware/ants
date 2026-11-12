/**
 * FOUNDRESS render-ants demo: the production AntRenderer (src/render/ants) driven by a scripted stand-in sim.
 *
 * URL flags: ?scene=hero|queen|founding|poly|carry|wall|crowd|brood|poses|items|lineup|gait  &species=<id>  &caste=<caste>
 *            &n=2000 (crowd)  &quality=test|low|medium|high|ultra (default high; test=1 -> test)  &seed=N  &t=SECONDS
 *            &live=1 (animate in real time; default: deterministic, time advances only through __demo.step)
 * window.__ready after the first rendered frame; window.__demo = { setScene, setCamera, step, render, info, bench,
 * footSlide, setLod, setHover, possess, dispose }.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId } from '@/render/app';
import { AntRenderer } from '@/render/ants';
import { DemoSim } from './demoSim';
import { buildScene, CASTES, SPECIES, type CamSpec, type SceneSetup } from './scenes';
import { createStage, fitSun } from './stage';

declare global { interface Window { __ready?: boolean; __demo?: unknown; __dispose?: () => void } }

const q = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const qid: QualityId = isQualityId(flags.quality) ? flags.quality : 'high';
const quality = getPreset(qid);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 4000);
const app = createRenderApp(canvas, { quality, camera });
const stage = createStage(app.renderer, quality.shadows.enabled);
app.setView(stage.scene, camera);
app.setOnDemand(true);

const ants = new AntRenderer();
ants.init({ scene: stage.scene, camera, quality, renderer: app.renderer });
const sim = new DemoSim(Number(q.get('seed') ?? 7));
ants.setSim(sim);

let clock = Number(q.get('t') ?? 0);
let setup: SceneSetup | null = null;
const camState = { target: new Vector3(), dist: 20 };
let follow: { id: number; off: Vector3; tOff: Vector3 } | null = null;
const labelRoot = document.getElementById('labels')!;
let labels: { el: HTMLDivElement; p: Vector3 }[] = [];

function setScene(name: string, params: Record<string, string> = {}) {
  const merged: Record<string, string> = Object.fromEntries(q.entries());
  Object.assign(merged, params);
  setup = buildScene(sim, name, merged);
  stage.wall.visible = !!setup.stage.wall;
  stage.grains.visible = !!setup.stage.grains;
  stage.fog.far = setup.stage.fogFar ?? 2000; stage.fog.near = setup.stage.fogFar ? 350 : 200;
  for (const l of labels) l.el.remove();
  labels = (q.get('labels') === '0' ? [] : setup.labels).map((l) => {
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = l.text; labelRoot.appendChild(el);
    return { el, p: new Vector3(...l.at) };
  });
  follow = null;
  setCamera(setup.cam);
  // the first update snaps every ant to its pose; a second one settles smoothing
  update(0); update(0);
  return render();
}

function setCamera(c: Partial<CamSpec> & { pos?: [number, number, number] }) {
  if (c.fov) camera.fov = c.fov;
  if (c.target) camState.target.fromArray(c.target);
  if (c.dist !== undefined) camState.dist = c.dist;
  if (c.pos) { camera.position.fromArray(c.pos); camState.dist = camera.position.distanceTo(camState.target); }
  else {
    const az = ((c.az ?? 40) * Math.PI) / 180, el = (Math.min(c.el ?? 25, 89.9) * Math.PI) / 180;
    camera.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(camState.dist).add(camState.target);
  }
  camera.up.set(0, 1, 0);
  camera.lookAt(camState.target);
  camera.near = Math.max(0.02, camState.dist * 0.008); camera.far = Math.max(500, camState.dist * 40);
  camera.updateProjectionMatrix();
  const a = c.follow !== undefined ? sim.state.ants[c.follow] : undefined;
  follow = a ? { id: a.id, off: camera.position.clone().sub(v3(a.pos)), tOff: camState.target.clone().sub(v3(a.pos)) } : c.follow === -1 ? null : follow;
  return { pos: camera.position.toArray(), target: camState.target.toArray() };
}
const v3 = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);

function update(dt: number) {
  if (follow) {
    const a = sim.state.ants.find((x) => x.id === follow!.id);
    if (a) {
      const al = sim.alpha; const p = new Vector3(a.prevPos.x + (a.pos.x - a.prevPos.x) * al, a.prevPos.y + (a.pos.y - a.prevPos.y) * al, a.prevPos.z + (a.pos.z - a.prevPos.z) * al);
      camState.target.copy(p).add(follow.tOff); camera.position.copy(p).add(follow.off); camera.lookAt(camState.target);
    }
  }
  camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight); camera.updateProjectionMatrix();
  ants.update({ dt, time: clock, alpha: sim.alpha, camera, viewportHeightPx: app.renderer.domElement.height });
}

function render() {
  fitSun(stage.sun, camState.target, camState.dist);
  app.setFocus(camState.dist, camState.dist * 0.35, true);
  app.requestRender();
  app.renderFrame(1 / 60);
  const w = innerWidth, h = innerHeight; const v = new Vector3();
  for (const l of labels) { v.copy(l.p).project(camera); l.el.style.left = `${((v.x + 1) / 2) * w}px`; l.el.style.top = `${((1 - v.y) / 2) * h}px`; l.el.style.display = v.z < 1 ? 'block' : 'none'; }
  return info();
}

/** Advances the scripted sim and the renderer in substeps (gait, pose smoothing), then renders once. */
function step(seconds: number, dt = 1 / 60) {
  let left = seconds;
  while (left > 1e-9) { const d = Math.min(dt, left); sim.advance(d); clock += d; left -= d; update(d); }
  return render();
}

function info() {
  const s = app.frameStats();
  return { scene: setup ? true : false, quality: qid, ants: ants.stats, frame: { calls: s.drawCalls, triangles: s.triangles, ms: s.frameMs }, clock, alpha: sim.alpha, camera: camera.position.toArray().map((x) => +x.toFixed(2)) };
}

/** Synchronous benchmark: warm + n frames (sim advance, ant update, render), each finished with a 1-pixel readPixels. */
function bench(n = 6, warm = 2, advance = true) {
  const gl = app.renderer.getContext(); const px = new Uint8Array(4);
  let cpu = 0;
  const frame = () => { if (advance) { sim.advance(1 / 30); clock += 1 / 30; } update(1 / 30); cpu += ants.stats.cpuMs; render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  for (let i = 0; i < warm; i++) frame();
  cpu = 0;
  const t = performance.now();
  for (let i = 0; i < n; i++) frame();
  return { ms: +((performance.now() - t) / n).toFixed(1), cpuMs: +(cpu / n).toFixed(3), info: info() };
}

/** CPU only: n x (sim advance + ant update) without rendering; mean ms of the whole update and of its two passes. */
function cpuBench(n = 60) {
  let cpu = 0, sample = 0, upload = 0;
  for (let i = 0; i < n + 10; i++) {
    sim.advance(1 / 30); clock += 1 / 30; update(1 / 30);
    if (i >= 10) { cpu += ants.stats.cpuMs; sample += ants.stats.sampleMs; upload += ants.stats.uploadMs; }
  }
  return { frames: n, cpuMs: +(cpu / n).toFixed(3), sampleMs: +(sample / n).toFixed(3), uploadMs: +(upload / n).toFixed(3), ants: ants.stats };
}

/**
 * Foot sliding: steps `frames` frames of `frameDt` and records the world and screen positions of the six feet of the
 * followed/first ant; returns the largest movement of a foot that stayed in stance between consecutive frames.
 */
function footSlide(frames = 3, frameDt = 1 / 30, antIndex = 0) {
  const a = sim.state.ants[antIndex]; if (!a) return null;
  const rec: { world: { x: number; y: number; z: number; stance: boolean }[]; screen: number[][] }[] = [];
  const W = app.renderer.domElement.width, H = app.renderer.domElement.height; const v = new Vector3();
  for (let f = 0; f < frames; f++) {
    if (f > 0) step(frameDt, frameDt / 4); else render();
    const feet = ants.debugFeet(a.id);
    if (!feet) break; // left the view
    rec.push({ world: feet, screen: feet.map((p) => { v.set(p.x, p.y, p.z).project(camera); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; }) });
  }
  let mm = 0, px = 0, pairs = 0;
  for (let f = 1; f < rec.length; f++) for (let leg = 0; leg < 6; leg++) {
    const A = rec[f - 1]!.world[leg]!, B = rec[f]!.world[leg]!;
    if (!A.stance || !B.stance) continue;
    pairs++;
    mm = Math.max(mm, Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z));
    // with a fixed camera a planted foot must also stay on the same pixel
    const sa = rec[f - 1]!.screen[leg]!, sb = rec[f]!.screen[leg]!; px = Math.max(px, Math.hypot(sa[0]! - sb[0]!, sa[1]! - sb[1]!));
  }
  return { frames, stancePairs: pairs, maxStanceFootMoveMm: mm, maxStanceFootMoveScreenPx: px, feet: rec.map((r) => r.world.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4), stance: p.stance }))) };
}

function dispose() { app.stop(); ants.dispose(); app.dispose(); }
window.__dispose = dispose;
window.__demo = {
  setScene, setCamera, step, render, info, bench, cpuBench, footSlide, dispose,
  setLod: (o: Record<string, unknown>) => {
    if ('debugTint' in o) ants.debugLodTint = !!o.debugTint;
    if ('force' in o) ants.forceLod = (o.force as number | null) ?? null;
    const { debugTint: _d, force: _f, ...rest } = o; void _d; void _f;
    const r = ants.setLod(rest); update(0);
    return r;
  },
  setHover: (id: number | null) => { ants.setHover(id === null ? null : { kind: 'ant', id }); update(0); return render(); },
  possess: (id: number) => { sim.state.player.possessedAntId = id; update(0); return render(); },
  setFrozen: (t: number) => { clock = t; update(0); return render(); },
  prebuildAll: () => { const t0 = performance.now(); for (const sp of SPECIES) ants.prebuild(sp, CASTES[sp]!.map((c) => (c === 'small-media' ? { caste: 'media', sizeClass: 'small-media' } : { caste: c }))); return { ms: performance.now() - t0, variants: ants.stats.variants }; },
  get sim() { return sim; },
};

setScene(q.get('scene') ?? 'hero');
app.ready.then(() => {
  render();
  requestAnimationFrame(() => { window.__ready = true; });
  if (q.get('live') === '1') { let last = performance.now(); app.start(() => { const now = performance.now(); step(Math.min(0.05, (now - last) / 1000)); last = now; }); }
});
addEventListener('resize', () => { app.resize(); render(); });
