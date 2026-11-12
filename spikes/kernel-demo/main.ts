/**
 * FOUNDRESS kernel demo: renders the PRODUCTION kernel (src/sim/kernel.ts: world field, carve grid, marching
 * cubes, nest navigation, surface walker) on the nest spike's test scene, reusing the spike's rendering code.
 *
 * URL flags: ?test=1 (no rAF loop; render only on API calls -> deterministic)  ?seed=N  ?ai=N  ?hud=0
 * Controls:  WASD move (camera relative), drag = orbit, Space = let go, 1/2/3 = navTo C1/C2/C3, 0 = navTo exit
 * API:       window.__spike (teleport, setInput, step, walkerState, navTo, spawnAI, aiState, setCamera, render,
 *            stats, dispose), window.__ready
 */
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { Vec3 } from '@/core/math/vec3';
import { createKernel } from '@/sim/kernel';
import { carveTestNest, emptyCarve, makeSceneWorld } from '@/sim/kernel.testWorld';
import { createWalkerKin, walkerLetGo, walkerPlace, walkerStep, type WalkStatus } from '@/sim/locomotion/walker';
import { makeShared, breachMaterial, cavityMaterial, MAX_BREACH } from './render/materials';
import { antGeometry, ChunkMeshes, primColor, primitiveGeometry, terrainGeometry } from './render/meshes';
import { CameraRig } from './sim/cameraRig';
import { AIColony, steerTowards } from './sim/ai';
import { copy, cross, dot, normalize, projectOnPlane, rotateAxis, rotateMinimal, set, v3 } from './sim/vec';

declare global {
  interface Window { __ready?: boolean; __spike?: unknown }
}

const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '1';
const SEED = Number(q.get('seed') ?? 7);
const HUD = q.get('hud') !== '0';
const DT = 1 / 60;

// ------------------------------------------------------------------ kernel
const t0 = performance.now();
const scene0 = makeSceneWorld(SEED);
const kernel = createKernel(scene0.world, emptyCarve(scene0.world.bu));
carveTestNest(kernel, scene0.nest);
const nest = scene0.nest;
const BU = kernel.bu;
const up2 = (p: Vec3) => v3(p.x, p.y + 2, p.z);
kernel.nav.setTarget('exit', { points: [up2(nest.entrance), up2(nest.slabExit)], radius: 1.5 * BU });
kernel.nav.setTarget('deep', { points: [nest.chambers[2].c], radius: 2.5 * BU });
for (const c of nest.chambers) kernel.nav.setTarget(c.name, { points: [c.c], radius: 2.5 * BU });
kernel.nav.build('exit');
kernel.nav.build('deep');
const buildMs = performance.now() - t0;
const ai = new AIColony(kernel, SEED + 1);
let aiAcc = 0;

// ------------------------------------------------------------------ player
const player = createWalkerKin(kernel.walker.footOffset);
const upVis = v3(0, 1, 0), fwdVis = v3(1, 0, 0);
const rig = new CameraRig();
let input: { forward: number; turn: number; desired: Vec3 | null } = { forward: 0, turn: 0, desired: null };
let autopilot: string | null = null;
let lastStatus: WalkStatus = 'ok';
let simTime = 0;
const keys = new Set<string>();
const SPEED = 9 * BU; // mm/s

function smoothVisual(dt: number): void {
  const target = player.medium === 'air' ? v3(0, 1, 0) : player.up;
  const a = 1 - Math.exp(-dt / 0.07);
  const prev = v3(upVis.x, upVis.y, upVis.z);
  upVis.x += (target.x - upVis.x) * a; upVis.y += (target.y - upVis.y) * a; upVis.z += (target.z - upVis.z) * a;
  if (dot(upVis, upVis) < 1e-6) copy(upVis, target);
  normalize(upVis, upVis);
  rotateMinimal(fwdVis, fwdVis, prev, upVis);
  const b = 1 - Math.exp(-dt / 0.05);
  fwdVis.x += (player.fwd.x - fwdVis.x) * b; fwdVis.y += (player.fwd.y - fwdVis.y) * b; fwdVis.z += (player.fwd.z - fwdVis.z) * b;
  projectOnPlane(fwdVis, fwdVis, upVis);
  if (dot(fwdVis, fwdVis) < 1e-8) projectOnPlane(fwdVis, player.fwd, upVis);
  normalize(fwdVis, fwdVis);
}

const _desired = v3(), _right = v3(), _look = v3();
function playerTick(dt: number): void {
  let forward = input.forward, desired = input.desired;
  const kf = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), kr = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (kf || kr) {
    cross(_right, rig.ref, upVis);
    set(_desired, rig.ref.x * kf + _right.x * kr, rig.ref.y * kf + _right.y * kr, rig.ref.z * kf + _right.z * kr);
    desired = normalize(_desired, _desired); forward = 1; autopilot = null;
  }
  if (autopilot) {
    const d = kernel.nav.lookahead(autopilot, player.pos, 4, _look);
    if (d < Infinity && d > 2 * BU) {
      desired = set(_desired, _look.x - player.pos.x, _look.y - player.pos.y, _look.z - player.pos.z); forward = 1;
    } else autopilot = null;
  }
  if (player.medium !== 'air') {
    if (desired) steerTowards(player, desired, 7 * dt);
    else if (input.turn) rotateAxis(player.fwd, player.fwd, player.up, input.turn * 3.5 * dt);
  }
  lastStatus = walkerStep(kernel.field, player, null, forward * SPEED, dt);
  smoothVisual(dt);
  rig.update(dt, kernel.field, player.pos, upVis, fwdVis);
}

function simStep(dt: number): void {
  playerTick(dt);
  aiAcc += dt;
  while (aiAcc >= ai.tick - 1e-9) { ai.step(() => performance.now()); aiAcc -= ai.tick; }
  simTime += dt;
}

// ------------------------------------------------------------------ renderer + scene
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new Scene();
const SKY = new Color('#d6cdb8');
scene.background = SKY;
scene.fog = new Fog(SKY, 380, 2200);
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 4000);
scene.add(new HemisphereLight(0xe4ecff, 0x8f7458, 1.35));
const sun = new DirectionalLight(0xfff0d8, 2.3);
sun.position.set(0.55, 1, 0.35);
scene.add(sun);
const bounce = new DirectionalLight(0xc09a70, 1.1);
bounce.position.set(-0.2, -1, -0.15);
scene.add(bounce);

const shared = makeShared();
const terrainMat = breachMaterial(shared, { vertexColors: true, roughness: 0.96, metalness: 0 }, true);
scene.add(new Mesh(terrainGeometry(kernel, 4, SEED), terrainMat));
for (const p of kernel.world.prims) {
  const m = breachMaterial(shared, { color: new Color(primColor(p.material)), roughness: p.material === 'plant' ? 0.7 : 0.9 }, false);
  scene.add(new Mesh(primitiveGeometry(p), m));
}
const chunks = new ChunkMeshes(kernel, cavityMaterial(shared));
const m0 = performance.now();
chunks.buildAll();
const meshAllMs = performance.now() - m0;
scene.add(chunks.group);
const antMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, transparent: true });
const antMesh = new Mesh(antGeometry('#ff7a1a'), antMat);
antMesh.matrixAutoUpdate = false;
scene.add(antMesh);
const MAX_AI = 512;
const aiMesh = new InstancedMesh(antGeometry('#9a3a1c'), new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAX_AI);
aiMesh.count = 0;
aiMesh.frustumCulled = false;
scene.add(aiMesh);

function updateBreaches(): void {
  const b = kernel.carve.breaches, n = Math.min(b.length, MAX_BREACH);
  for (let i = 0; i < n; i++) shared.uBreach.value[i].set(b[i].pos.x, b[i].pos.y, b[i].pos.z, b[i].r);
  shared.uBreachCount.value = n;
}
updateBreaches();

const _m4 = new Matrix4(), _vx = new Vector3(), _vy = new Vector3(), _vz = new Vector3();
function antMatrix(m: Matrix4, pos: Vec3, up: Vec3, fwd: Vec3): void {
  _vy.set(up.x, up.y, up.z).normalize();
  _vz.set(fwd.x, fwd.y, fwd.z);
  _vz.addScaledVector(_vy, -_vz.dot(_vy)).normalize();
  _vx.crossVectors(_vy, _vz);
  m.makeBasis(_vx, _vy, _vz).setPosition(pos.x, pos.y, pos.z);
}

let mode: 'third' | 'free' = 'third';
let freeCam: { pos: Vector3; target: Vector3; fov: number } | null = null;
const ip = v3(), iu = v3(), ifw = v3();

function render(): void {
  if (chunks.update() > 0) updateBreaches();
  antMatrix(antMesh.matrix, player.pos, upVis, fwdVis);
  antMesh.matrixWorldNeedsUpdate = true;
  const a = Math.min(1, aiAcc / ai.tick);
  aiMesh.count = Math.min(MAX_AI, ai.ants.length);
  for (let i = 0; i < aiMesh.count; i++) {
    const w = ai.ants[i].w;
    ip.x = w.prevPos.x + (w.pos.x - w.prevPos.x) * a; ip.y = w.prevPos.y + (w.pos.y - w.prevPos.y) * a; ip.z = w.prevPos.z + (w.pos.z - w.prevPos.z) * a;
    iu.x = w.prevUp.x + (w.up.x - w.prevUp.x) * a; iu.y = w.prevUp.y + (w.up.y - w.prevUp.y) * a; iu.z = w.prevUp.z + (w.up.z - w.prevUp.z) * a;
    ifw.x = w.prevFwd.x + (w.fwd.x - w.prevFwd.x) * a; ifw.y = w.prevFwd.y + (w.fwd.y - w.prevFwd.y) * a; ifw.z = w.prevFwd.z + (w.fwd.z - w.prevFwd.z) * a;
    antMatrix(_m4, ip, iu, ifw);
    aiMesh.setMatrixAt(i, _m4);
  }
  aiMesh.instanceMatrix.needsUpdate = true;
  if (mode === 'third') {
    const o = rig.out;
    camera.position.set(o.pos.x, o.pos.y, o.pos.z);
    camera.up.set(o.up.x, o.up.y, o.up.z);
    camera.lookAt(o.target.x, o.target.y, o.target.z);
    camera.fov = o.fov; camera.near = o.near; camera.far = o.far;
    antMat.opacity = o.antOpacity; antMat.depthWrite = o.antOpacity > 0.99;
  } else if (freeCam) {
    camera.position.copy(freeCam.pos); camera.up.set(0, 1, 0); camera.lookAt(freeCam.target);
    camera.fov = freeCam.fov; camera.near = 0.05; camera.far = 4000;
    antMat.opacity = 1; antMat.depthWrite = true;
  }
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  if (mode === 'free' && freeCam) _vx.copy(freeCam.target).lerp(freeCam.pos, 0.35);
  else _vx.set(player.pos.x + upVis.x * 1.5, player.pos.y + upVis.y * 1.5, player.pos.z + upVis.z * 1.5);
  _vx.applyMatrix4(camera.matrixWorldInverse);
  shared.uAntPosView.value.copy(_vx);
  renderer.render(scene, camera);
  if (HUD) hud();
}

const hudEl = document.getElementById('hud')!;
function hud(): void {
  const p = player.pos, u = player.up, o = rig.out;
  hudEl.textContent =
    `FOUNDRESS kernel demo (production kernel)  mode ${mode}  t ${simTime.toFixed(2)} s  status ${lastStatus}  medium ${player.medium}\n` +
    `ant (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) up (${u.x.toFixed(2)}, ${u.y.toFixed(2)}, ${u.z.toFixed(2)}) f-foot ${(kernel.field.sample(p) - player.footOffset).toFixed(3)} mm\n` +
    `cam ${o.dist.toFixed(1)} mm fov ${o.fov.toFixed(0)} tunnel ${o.tunnel.toFixed(2)}  chunks ${chunks.meshes.size} tris ${chunks.tris} breaches ${kernel.carve.breaches.length}  AI ${ai.ants.length}\n` +
    `WASD move  drag orbit  Space let go  1-3 navTo chamber  0 navTo exit`;
}

// ------------------------------------------------------------------ input (no pointer lock needed)
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { walkerLetGo(kernel.field, player); e.preventDefault(); }
  if (e.code === 'Digit1') api.navTo('C1');
  if (e.code === 'Digit2') api.navTo('C2');
  if (e.code === 'Digit3') api.navTo('C3');
  if (e.code === 'Digit0') api.navTo('exit');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  rig.orbit(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.005);
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight, false));

// ------------------------------------------------------------------ API
const vec = (a: Vec3) => [+a.x.toFixed(4), +a.y.toFixed(4), +a.z.toFixed(4)];
function walkerState() {
  const p = player.pos;
  return {
    pos: vec(p), up: vec(player.up), fwd: vec(player.fwd), upVis: vec(upVis), medium: player.medium, status: lastStatus,
    f: +kernel.field.sample(p).toFixed(4), foot: player.footOffset, simTime: +simTime.toFixed(3), autopilot,
    camera: { dist: +rig.out.dist.toFixed(2), fov: +rig.out.fov.toFixed(1), near: +rig.out.near.toFixed(3), tunnel: +rig.out.tunnel.toFixed(2) },
  };
}

const api = {
  BU, nest, ids: scene0.ids, prims: kernel.world.prims,
  height: (x: number, z: number) => kernel.field.height(x, z),
  f: (x: number, y: number, z: number) => kernel.field.sampleXYZ(x, y, z),
  teleport(x: number, y: number, z: number, opts: { heading?: number; dir?: [number, number, number] } = {}) {
    const h = opts.heading ?? 0;
    const ok = walkerPlace(kernel.field, player, v3(x, y, z), { heading: v3(Math.cos(h), 0, -Math.sin(h)), dir: opts.dir ? v3(...opts.dir) : undefined });
    copy(upVis, player.up); copy(fwdVis, player.fwd);
    rig.reset(player.up, player.fwd);
    rig.update(DT, kernel.field, player.pos, upVis, fwdVis);
    autopilot = null;
    if (TEST) render();
    return { ok, ...walkerState() };
  },
  setInput(i: { forward?: number; turn?: number; desired?: [number, number, number] }) {
    input = { forward: i.forward ?? 0, turn: i.turn ?? 0, desired: i.desired ? v3(...i.desired) : null };
  },
  step(seconds: number, opts: { render?: boolean } = {}) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) simStep(DT);
    if (opts.render !== false) render();
    return walkerState();
  },
  letGo() { walkerLetGo(kernel.field, player); },
  walkerState,
  navTo(target: string) { autopilot = kernel.nav.hasTarget(target) ? target : null; return { dist: kernel.nav.distanceAt(target, player.pos) }; },
  spawnAI(n: number) { const made = ai.spawn(n); if (TEST) render(); return made; },
  aiState() {
    let minF = Infinity, air = 0, cavity = 0;
    for (const A of ai.ants) { minF = Math.min(minF, kernel.field.sample(A.w.pos) / A.w.footOffset); if (A.w.medium === 'air') air++; if (A.w.medium === 'cavity') cavity++; }
    return { n: ai.ants.length, trips: ai.ants.reduce((s, A) => s + A.trips, 0), minFoverFoot: minF, air, cavity, usPerAntTick: (ai.stats.ms * 1000) / Math.max(1, ai.stats.steps) };
  },
  setCamera(m: 'third' | 'free', opts: { pos?: number[]; target?: number[]; fov?: number; yaw?: number; pitch?: number; zoom?: number } = {}) {
    mode = m;
    if (m === 'free') {
      const p = opts.pos ?? [0, 100, 0], t = opts.target ?? [0, 0, 0];
      freeCam = { pos: new Vector3(p[0], p[1], p[2]), target: new Vector3(t[0], t[1], t[2]), fov: opts.fov ?? 50 };
    } else {
      if (typeof opts.yaw === 'number') rig.orbit(opts.yaw, 0);
      if (typeof opts.pitch === 'number') rig.pitchOffset = opts.pitch;
      if (typeof opts.zoom === 'number') rig.zoom = opts.zoom;
      rig.update(0.5, kernel.field, player.pos, upVis, fwdVis);
    }
    if (TEST) render();
    return { mode };
  },
  render() { render(); },
  stats() {
    return {
      buildMs, meshAllMs, carveChunks: kernel.carve.data.keys.length, meshedChunks: chunks.meshes.size, tris: chunks.tris,
      breaches: kernel.carve.breaches.length, openVolumeMm3: Math.round(kernel.carve.openVolume()), nav: kernel.nav.stats(),
      renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    };
  },
  dispose() { running = false; renderer.dispose(); renderer.forceContextLoss(); },
};
window.__spike = api;

// ------------------------------------------------------------------ start
const startHeading = Math.atan2(-(nest.entrance.z - 236), nest.entrance.x - 228);
api.teleport(228, 20, 236, { heading: startHeading });
const aiN = Number(q.get('ai') ?? 0);
if (aiN > 0) ai.spawn(aiN);

let running = true;
let lastT = performance.now(), acc = 0;
function frame(): void {
  if (!running) return;
  const now = performance.now();
  acc += Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  let n = 0;
  while (acc >= DT && n < 6) { simStep(DT); acc -= DT; n++; }
  render();
  requestAnimationFrame(frame);
}
render();
if (!TEST) requestAnimationFrame(frame);
requestAnimationFrame(() => { window.__ready = true; });
