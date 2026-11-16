/**
 * FOUNDRESS render-creatures demo: the production CreatureRenderer (src/render/creatures) beside the production
 * AntRenderer, driven by a scripted stand-in source (plain objects shaped like the sim contracts).
 *
 * URL flags: ?scene=lineup|styles|herd|pit|bird|bird-approach|comfort|crowd  &comfort=off|softened|abstract|marker
 *            &n=300 (crowd)  &ants=0 (crowd)  &quality=test|low|medium|high|ultra (default high; test=1 -> test)
 * window.__ready after the first rendered frame; window.__demo = { setScene, setCamera, view, setComfort, step,
 * setAlpha, render, info, bench, dispose }.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, parseRenderFlags, type QualityId } from '@/render/app';
import { AntRenderer } from '@/render/ants';
import { CreatureRenderer, type ComfortLevel } from '@/render/creatures';
import { DemoSource } from './demoSource';
import { bird, comfort, crowd, herd, lineup, pit, styles, type CamSpec, type SceneSetup } from './scenes';
import { createStage, drawPlants, fitSun, setGround } from './stage';

declare global { interface Window { __ready?: boolean; __demo?: unknown; __dispose?: () => void } }

const q = new URLSearchParams(location.search);
const flags = parseRenderFlags(location.search);
const qid: QualityId = isQualityId(flags.quality) ? flags.quality : 'high';
const quality = getPreset(qid);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 6000);
const app = createRenderApp(canvas, { quality, camera });
const stage = createStage(app.renderer, quality.shadows.enabled);
app.setView(stage.scene, camera);
app.setOnDemand(true);

const src = new DemoSource();
const ants = new AntRenderer();
ants.init({ scene: stage.scene, camera, quality, renderer: app.renderer });
ants.setSim(src);
const creatures = new CreatureRenderer();
creatures.init({ scene: stage.scene, camera, quality, renderer: app.renderer });
creatures.setSim(src);
creatures.setComfort({ spiderComfort: (q.get('comfort') ?? 'off') as ComfortLevel, comfortCentipedes: q.get('centipedes') === '1', comfortMites: q.get('mites') === '1' });

let clock = Number(q.get('t') ?? 0);
let setup: SceneSetup | null = null;
const camState = { target: new Vector3(), dist: 20 };
const labelRoot = document.getElementById('labels')!;
let labels: { el: HTMLDivElement; p: Vector3 }[] = [];

function setScene(name: string, params: Record<string, string> = {}) {
  const p = { ...Object.fromEntries(q.entries()), ...params };
  src.clear();
  setup = name === 'styles' ? styles(src) : name === 'herd' ? herd(src) : name === 'pit' ? pit(src)
    : name === 'bird' ? bird(src, 'landed') : name === 'bird-approach' ? bird(src, 'approach') : name === 'comfort' ? comfort(src)
      : name === 'crowd' ? crowd(src, Number(p.n ?? 300), Number(p.ants ?? 0)) : lineup(src);
  setGround(stage, setup.sand ?? 0);
  drawPlants(stage, setup.prims ?? []);
  for (const l of labels) l.el.remove();
  labels = (p.labels === '0' ? [] : setup.labels).map((l) => {
    const el = document.createElement('div'); el.className = 'lbl'; el.textContent = l.text; labelRoot.appendChild(el);
    return { el, p: new Vector3(...l.at) };
  });
  setCamera(setup.cam);
  update(0); update(0);
  return render();
}

function setCamera(c: Partial<CamSpec>) {
  if (c.fov) camera.fov = c.fov;
  if (c.target) camState.target.fromArray(c.target);
  if (c.dist !== undefined) camState.dist = c.dist;
  const az = ((c.az ?? 30) * Math.PI) / 180, el = (Math.max(-89, Math.min(c.el ?? 25, 89.9)) * Math.PI) / 180;
  camera.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(camState.dist).add(camState.target);
  camera.up.set(0, 1, 0);
  camera.lookAt(camState.target);
  camera.near = Math.max(0.02, camState.dist * 0.006); camera.far = Math.max(800, camState.dist * 40);
  camera.updateProjectionMatrix();
  return { pos: camera.position.toArray(), target: camState.target.toArray() };
}

/** Camera preset `name` of the current scene (setup.items), e.g. a line-up close-up. */
function view(name: string) {
  const c = setup?.items?.[name];
  if (!c) return null;
  setCamera(c); update(0);
  return render();
}

function update(dt: number) {
  camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight); camera.updateProjectionMatrix();
  const h = app.renderer.domElement.height;
  ants.update({ dt, time: clock, alpha: src.alpha, camera, viewportHeightPx: h });
  creatures.update({ dt, time: clock, alpha: src.alpha, camera, viewportHeightPx: h });
}

function render() {
  fitSun(stage.sun, camState.target, camState.dist);
  app.setFocus(camState.dist, camState.dist * 0.45, true);
  app.requestRender();
  app.renderFrame(1 / 60);
  const w = innerWidth, hh = innerHeight; const p = new Vector3();
  for (const l of labels) { p.copy(l.p).project(camera); l.el.style.left = `${((p.x + 1) / 2) * w}px`; l.el.style.top = `${((1 - p.y) / 2) * hh}px`; l.el.style.display = p.z < 1 ? 'block' : 'none'; }
  return info();
}

function step(seconds: number, dt = 1 / 30) {
  let left = seconds;
  while (left > 1e-9) { const d = Math.min(dt, left); src.advance(d); clock += d; left -= d; update(d); }
  return render();
}

function setAlpha(a: number) { src.setAlpha(a); update(0); return render(); }

function setComfort(level: ComfortLevel, opts: { mites?: boolean; centipedes?: boolean } = {}) {
  creatures.setComfort({ spiderComfort: level, comfortMites: opts.mites, comfortCentipedes: opts.centipedes });
  update(0);
  return render();
}

function info() {
  const s = app.frameStats();
  return { quality: qid, creatures: { ...creatures.stats, drawn: [...creatures.stats.drawn] }, ants: { ants: ants.stats.ants, triangles: ants.stats.triangles, cpuMs: ants.stats.cpuMs, drawCalls: ants.stats.drawCalls },
    frame: { calls: s.drawCalls, triangles: s.triangles, ms: s.frameMs }, clock, comfort: creatures.comfortLevel };
}

/** Synchronous benchmark: warm + n frames (advance, update, render), each finished with a 1-pixel readPixels. */
function bench(n = 6, warm = 2) {
  const gl = app.renderer.getContext(); const px = new Uint8Array(4);
  let cpuC = 0, cpuA = 0;
  const frame = () => { src.advance(1 / 30); clock += 1 / 30; update(1 / 30); cpuC += creatures.stats.cpuMs; cpuA += ants.stats.cpuMs; render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  for (let i = 0; i < warm; i++) frame();
  cpuC = 0; cpuA = 0;
  const t = performance.now();
  for (let i = 0; i < n; i++) frame();
  return { ms: +((performance.now() - t) / n).toFixed(1), creatureCpuMs: +(cpuC / n).toFixed(3), antCpuMs: +(cpuA / n).toFixed(3), info: info() };
}

/** CPU only: n x (advance + update of each renderer) without rendering; total time / n (no timer granularity issue). */
function cpuBench(n = 200) {
  for (let i = 0; i < 20; i++) { src.advance(1 / 30); update(1 / 30); }
  const h = app.renderer.domElement.height;
  let t = performance.now();
  for (let i = 0; i < n; i++) { src.advance(1 / 30); creatures.update({ dt: 1 / 30, time: clock, alpha: src.alpha, camera, viewportHeightPx: h }); }
  const c = (performance.now() - t) / n;
  t = performance.now();
  for (let i = 0; i < n; i++) { src.advance(1 / 30); ants.update({ dt: 1 / 30, time: clock, alpha: src.alpha, camera, viewportHeightPx: h }); }
  const a = (performance.now() - t) / n;
  return { creatureMs: +c.toFixed(4), antMs: +a.toFixed(4), creatures: src.state.creatures.length, ants: src.state.ants.length, drawn: [...creatures.stats.drawn] };
}

function dispose() { app.stop(); ants.dispose(); creatures.dispose(); app.dispose(); }
window.__dispose = dispose;
window.__demo = { setScene, setCamera, view, setComfort, step, setAlpha, render, info, bench, cpuBench, dispose, get src() { return src; } };

setScene(q.get('scene') ?? 'lineup');
app.ready.then(() => {
  step(0.25);
  requestAnimationFrame(() => { window.__ready = true; });
});
addEventListener('resize', () => { app.resize(); render(); });
