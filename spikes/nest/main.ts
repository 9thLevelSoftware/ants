/**
 * FOUNDRESS spike: nest / surface walker / camera.
 *
 * Units mm, Y up, BU = 4 mm (voxel 2 mm, chunk 16^3 voxels = 32 mm). Pure logic lives in ./sim (no three).
 *
 * URL flags: ?test=1 (no rAF loop: render only on API calls -> deterministic, no GPU backlog)  ?seed=N  ?ai=N (spawn
 *            N autonomous ants at start)  ?hud=0  ?aa=1 (MSAA)
 * Controls:  WASD move (camera relative), mouse drag orbit (no pointer lock needed), wheel zoom, E dig, Space let go,
 *            C cutaway observer, X x-ray soil (cutaway), [ ] move cut plane, click (cutaway) place dig marker,
 *            1/2/3 navTo C1/C2/C3, 0 navTo surface
 * API:       window.__spike (see bottom), window.__ready
 */
import {
  ACESFilmicToneMapping, Color, DirectionalLight, DoubleSide, Fog, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, Scene, SphereGeometry, Vector2, Vector3,
  WebGLRenderer, type DataTexture, type Object3D,
} from 'three';
import { buildWorld, BU, VOXEL, WORLD_SIZE, type Chamber } from './sim/scene';
import { SurfaceWalker, DEFAULT_WALKER, type WalkerInput } from './sim/walker';
import { CameraRig, DEFAULT_CAM } from './sim/camera-rig';
import { NavField } from './sim/nav';
import { AIColony } from './sim/ai';
import { CarveGrid, type ChangeBox } from './sim/carve';
import { v3, cross, normalize, type Vec3 } from './sim/vec3';
import { makeShared, breachMaterial, cavityMaterial, setCutawayMaterial, capMaterial, MAX_BREACH } from './render/materials';
import { terrainGeometry, primitiveGeometry, PRIM_COLORS, antGeometry, ChunkMeshes, sliceTexture } from './render/meshes';

declare global {
  interface Window { __ready?: boolean; __spike?: unknown }
}

// ------------------------------------------------------------------ config
const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '1';
const SEED = Number(q.get('seed') ?? 7);
const HUD = q.get('hud') !== '0';
const DT = 1 / 60; // player + camera integration step

// ------------------------------------------------------------------ simulation
const t0 = performance.now();
const S = buildWorld(SEED);
const tBuild = performance.now() - t0;
const { world, carve, field, nest } = S;

const chamberSeed = (c: Chamber, s = 0.6) => (x: number, y: number, z: number) =>
  ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 + ((z - c.z) / c.rz) ** 2 < s;
const navs = new Map<string, NavField>();
const bfsTimings: { name: string; ms: number; open: number }[] = [];
function nav(name: string): NavField {
  let n = navs.get(name);
  if (n) return n;
  const c = nest.chambers.find((ch) => ch.name === name);
  n = new NavField(carve, field, c ? chamberSeed(c) : (x, y, z) => world.fSoil(x, y, z) > 0);
  const r = n.rebuild(() => performance.now());
  bfsTimings.push({ name, ms: r.ms, open: r.open });
  navs.set(name, n);
  return n;
}
nav('surface'); nav('C3');
const ai = new AIColony(field, nav('surface'), nav('C3'), SEED + 1);
let aiAcc = 0;

const player = new SurfaceWalker(field, { ...DEFAULT_WALKER, turnRate: 7 });
const rig = new CameraRig({ ...DEFAULT_CAM });
let autopilot: NavField | null = null;
let scriptInput: { forward: number; turn: number; strafe: number; desired: Vec3 | null } = { forward: 0, turn: 0, strafe: 0, desired: null };
const keys = new Set<string>();
let simTime = 0;
let lastDig = -1;
const digLog: { carveMs: number; meshMs: number; chunks: number; navMs: number; changed: number }[] = [];

// ------------------------------------------------------------------ renderer + scene
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: q.get('aa') === '1', stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;

const scene = new Scene();
const SKY = new Color('#d6cdb8');
scene.background = SKY;
scene.fog = new Fog(SKY, 380, 2200);
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 4000);
scene.add(new HemisphereLight(0xe4ecff, 0x8f7458, 1.35));
const sun = new DirectionalLight(0xfff0d8, 2.3);
sun.position.set(0.55, 1, 0.35);
scene.add(sun);
const bounce = new DirectionalLight(0xc09a70, 1.1); // ground bounce: keeps undersides (table top, slab, ceilings in the open) readable
bounce.position.set(-0.2, -1, -0.15);
scene.add(bounce);

const shared = makeShared();
const clipPlane = new Plane(new Vector3(0, 0, 1), -330);
const clipList = [clipPlane];

const terrainMat = breachMaterial(shared, { vertexColors: true, roughness: 0.96, metalness: 0 }, true);
const terrain = new Mesh(terrainGeometry(world, WORLD_SIZE, 4, SEED), terrainMat);
scene.add(terrain);
const primMats: MeshStandardMaterial[] = [terrainMat];
for (const p of world.prims) {
  const m = breachMaterial(shared, { color: new Color(PRIM_COLORS[p.material]), roughness: p.material === 'plant' ? 0.7 : 0.9 }, p.diggable);
  primMats.push(m);
  scene.add(new Mesh(primitiveGeometry(p), m));
}
const cavMat = cavityMaterial(shared);
const chunks = new ChunkMeshes(carve, field, cavMat);
const meshT0 = performance.now();
const initialMesh = chunks.update();
const initialMeshMs = performance.now() - meshT0;
scene.add(chunks.group);

const antMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, transparent: true });
const antMesh = new Mesh(antGeometry('#ff7a1a'), antMat);
antMesh.matrixAutoUpdate = false;
scene.add(antMesh);
const aiMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
const MAX_AI = 512;
let aiScale = 1;
const aiMesh = new InstancedMesh(antGeometry('#9a3a1c'), aiMat, MAX_AI);
aiMesh.count = 0;
aiMesh.frustumCulled = false;
scene.add(aiMesh);

const markerGeo = new SphereGeometry(2.4, 16, 12);
const markerMat = new MeshStandardMaterial({ color: '#33d6ff', emissive: new Color('#1080c0'), emissiveIntensity: 0.8 });
const markers: Mesh[] = [];

// cutaway cap
const CAP = { x0: 0, x1: WORLD_SIZE, y0: -260, y1: 40, res: 1 };
let capTex: DataTexture | null = null;
let capMesh: Mesh | null = null;
const cut = { on: false, z: 330, xray: false, yaw: 0.0, pitch: 0.18, dist: 330, target: new Vector3(300, -55, 330) };
let capDirtyVersion = -1;

function updateBreaches(): void {
  const b = carve.breaches, n = Math.min(b.length, MAX_BREACH);
  for (let i = 0; i < n; i++) shared.uBreach.value[i].set(b[i].x, b[i].y, b[i].z, b[i].r);
  shared.uBreachCount.value = n;
  if (b.length > MAX_BREACH) console.warn(`breach spheres ${b.length} > ${MAX_BREACH}`);
}
updateBreaches();

function rebuildCap(): void {
  capTex = sliceTexture(field, cut.z, CAP.x0, CAP.x1, CAP.y0, CAP.y1, CAP.res, SEED, capTex ?? undefined);
  if (!capMesh) {
    const m = capMaterial(capTex);
    m.side = DoubleSide;
    capMesh = new Mesh(new PlaneGeometry(CAP.x1 - CAP.x0, CAP.y1 - CAP.y0), m);
    scene.add(capMesh);
  }
  (capMesh.material as ReturnType<typeof capMaterial>).uniforms.uTex.value = capTex;
  capMesh.position.set((CAP.x0 + CAP.x1) / 2, (CAP.y0 + CAP.y1) / 2, cut.z);
  capDirtyVersion = carve.version;
}

function setCutaway(on: boolean): void {
  cut.on = on;
  clipPlane.constant = -cut.z;
  shared.uCutaway.value = on ? 1 : 0;
  setCutawayMaterial(cavMat, on, clipList);
  for (const m of primMats) { m.clippingPlanes = on ? clipList : null; m.needsUpdate = true; }
  antMat.clippingPlanes = on ? clipList : null; antMat.needsUpdate = true;
  aiMat.clippingPlanes = on ? clipList : null; aiMat.needsUpdate = true;
  if (on) rebuildCap();
  // x-ray observer aid: AI ants drawn on top of the soil/cast and enlarged so the traffic is readable from afar
  const xr = on && cut.xray;
  aiMat.depthTest = !xr; aiMesh.renderOrder = xr ? 10 : 0; aiScale = xr ? 2.5 : 1;
  if (capMesh) {
    capMesh.visible = on;
    const m = capMesh.material as ReturnType<typeof capMaterial>;
    m.uniforms.uOpacity.value = cut.xray ? 0.3 : 1;
    m.depthWrite = !cut.xray;
  }
}

// ------------------------------------------------------------------ simulation steps
const _desired = v3(), _right = v3();
function playerTick(dt: number): void {
  const input: WalkerInput = { forward: scriptInput.forward, turn: scriptInput.turn, desired: scriptInput.desired };
  const kf = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const kr = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + scriptInput.strafe;
  if (kf || kr) {
    // camera-relative: the rig's reference heading is the camera forward in the ant's tangent plane
    cross(_right, rig.ref, player.upVis);
    _desired.x = rig.ref.x * kf + _right.x * kr; _desired.y = rig.ref.y * kf + _right.y * kr; _desired.z = rig.ref.z * kf + _right.z * kr;
    normalize(_desired, _desired);
    input.desired = _desired; input.forward = 1; autopilot = null;
  }
  if (autopilot) {
    const d0 = autopilot.lookahead(player.pos, 4, _desired);
    if (d0 >= 0 && d0 > 9) {
      _desired.x -= player.pos.x; _desired.y -= player.pos.y; _desired.z -= player.pos.z;
      input.desired = _desired; input.forward = 1;
    } else autopilot = null;
  }
  if (keys.has('KeyE') && simTime - lastDig > 0.25) { dig(); lastDig = simTime; }
  player.update(dt, input);
  rig.update(dt, field, player.pos, player.upVis, player.fwdVis, input.forward !== 0 && !player.blocked);
}

function simStep(dt: number): void {
  playerTick(dt);
  aiAcc += dt;
  while (aiAcc >= ai.tick - 1e-9) { ai.step(() => performance.now()); aiAcc -= ai.tick; }
  simTime += dt;
}

function applyCarve(box: ChangeBox, carveMs: number): void {
  const m = chunks.update();
  const n0 = performance.now();
  for (const n of navs.values()) n.update(box);
  const navMs = performance.now() - n0;
  updateBreaches();
  digLog.push({ carveMs, meshMs: m.ms, chunks: m.chunks, navMs, changed: box.changed });
  if (cut.on) rebuildCap();
}

let DIG_AHEAD = 0.95, DIG_DOWN = 0.4;
let DIG_SLOPE = 0.52; // rad (30 degrees) below horizontal, world-relative
const _h = v3();
/**
 * Player dig action (E). Two brushes:
 *  'ramp' (default): a capsule of the tunnel radius whose FLOOR starts at the ant's feet and runs `len` mm along the
 *         horizontal heading tilted DIG_SLOPE below the horizon (world-relative, so the slope does not compound when
 *         the body tilts on the ramp it just dug). Repeated dig + walk = a straight descending tunnel. Breach spheres
 *         are recorded because the capsule is carved as a chain of spheres.
 *  'body': one sphere at fwd * a - up * b in the body frame (kept >= r + 0.4 mm from the body). Unstable for
 *         entrances: the ant tips over the rim onto the near wall and the frame-relative direction curls (see doc).
 */
function dig(radius = BU, how: 'ramp' | 'body' = 'ramp', len = 3.5): { changed: number } {
  const p = player.pos, f = player.fwd, u = player.up, foot = player.p.footOffset;
  let box: ChangeBox;
  const c0 = performance.now();
  if (how === 'ramp') {
    // horizontal heading (fallback: camera reference when the ant faces straight up/down a wall)
    _h.x = f.x; _h.y = 0; _h.z = f.z;
    if (Math.hypot(_h.x, _h.z) < 0.2) { _h.x = rig.ref.x; _h.z = rig.ref.z; }
    normalize(_h, _h);
    const dx = _h.x * Math.cos(DIG_SLOPE), dy = -Math.sin(DIG_SLOPE), dz = _h.z * Math.cos(DIG_SLOPE);
    // axis start: radius above the feet along the surface normal, so the capsule floor passes through the feet
    const k = radius - foot;
    const ax = p.x + u.x * k, ay = p.y + u.y * k, az = p.z + u.z * k;
    const before = carve.version;
    let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity, changed = 0;
    const n = Math.ceil(len);
    for (let i = 0; i <= n; i++) {
      const t = (len * i) / n;
      const b = carve.carveSphere(ax + dx * t, ay + dy * t, az + dz * t, radius);
      if (!b.changed) continue;
      changed += b.changed;
      bx0 = Math.min(bx0, b.i0); by0 = Math.min(by0, b.j0); bz0 = Math.min(bz0, b.k0);
      bx1 = Math.max(bx1, b.i1); by1 = Math.max(by1, b.j1); bz1 = Math.max(bz1, b.k1);
    }
    void before;
    box = { i0: bx0, j0: by0, k0: bz0, i1: bx1, j1: by1, k1: bz1, changed };
  } else {
    const a = radius * DIG_AHEAD, b = radius * DIG_DOWN;
    let cx = p.x + f.x * a - u.x * b, cy = p.y + f.y * a - u.y * b, cz = p.z + f.z * a - u.z * b;
    const ex = cx - p.x, ey = cy - p.y, ez = cz - p.z, d = Math.hypot(ex, ey, ez), minD = radius + 0.4;
    if (d < minD) { cx = p.x + (ex / d) * minD; cy = p.y + (ey / d) * minD; cz = p.z + (ez / d) * minD; }
    box = carve.carveSphere(cx, cy, cz, radius);
  }
  const carveMs = performance.now() - c0;
  applyCarve(box, carveMs);
  player.surfaceChanged();
  const R = radius + len + 4;
  for (const A of ai.ants) if (Math.abs(A.w.pos.x - p.x) < R && Math.abs(A.w.pos.y - p.y) < R && Math.abs(A.w.pos.z - p.z) < R) A.w.surfaceChanged();
  return { changed: box.changed };
}

// ------------------------------------------------------------------ render
const _m4 = new Matrix4(), _vx = new Vector3(), _vy = new Vector3(), _vz = new Vector3();
function antMatrix(m: Matrix4, pos: Vec3, up: Vec3, fwd: Vec3): void {
  _vy.set(up.x, up.y, up.z).normalize();
  _vz.set(fwd.x, fwd.y, fwd.z);
  _vz.addScaledVector(_vy, -_vz.dot(_vy)).normalize();
  _vx.crossVectors(_vy, _vz);
  m.makeBasis(_vx, _vy, _vz).setPosition(pos.x, pos.y, pos.z);
}

let freeCam: { pos: Vector3; target: Vector3; fov: number } | null = null;
let mode: 'third' | 'cutaway' | 'free' = 'third';
let lastCam = rig.out;

function render(): void {
  // player
  antMatrix(antMesh.matrix, player.pos, player.upVis, player.fwdVis);
  antMesh.matrixWorldNeedsUpdate = true;
  // AI ants (interpolated between 0.1 s ticks)
  const a = Math.min(1, aiAcc / ai.tick);
  const ip = v3(), iu = v3(), ifw = v3();
  aiMesh.count = Math.min(MAX_AI, ai.ants.length);
  for (let i = 0; i < aiMesh.count; i++) {
    const A = ai.ants[i], w = A.w;
    ip.x = A.prevPos.x + (w.pos.x - A.prevPos.x) * a; ip.y = A.prevPos.y + (w.pos.y - A.prevPos.y) * a; ip.z = A.prevPos.z + (w.pos.z - A.prevPos.z) * a;
    iu.x = A.prevUp.x + (w.upVis.x - A.prevUp.x) * a; iu.y = A.prevUp.y + (w.upVis.y - A.prevUp.y) * a; iu.z = A.prevUp.z + (w.upVis.z - A.prevUp.z) * a;
    ifw.x = A.prevFwd.x + (w.fwdVis.x - A.prevFwd.x) * a; ifw.y = A.prevFwd.y + (w.fwdVis.y - A.prevFwd.y) * a; ifw.z = A.prevFwd.z + (w.fwdVis.z - A.prevFwd.z) * a;
    antMatrix(_m4, ip, iu, ifw);
    if (aiScale !== 1) { _m4.elements[0] *= aiScale; _m4.elements[1] *= aiScale; _m4.elements[2] *= aiScale; _m4.elements[4] *= aiScale; _m4.elements[5] *= aiScale; _m4.elements[6] *= aiScale; _m4.elements[8] *= aiScale; _m4.elements[9] *= aiScale; _m4.elements[10] *= aiScale; }
    aiMesh.setMatrixAt(i, _m4);
  }
  aiMesh.instanceMatrix.needsUpdate = true;

  if (mode === 'third') {
    const o = rig.out;
    lastCam = o;
    camera.position.set(o.pos.x, o.pos.y, o.pos.z);
    camera.up.set(o.up.x, o.up.y, o.up.z);
    camera.lookAt(o.target.x, o.target.y, o.target.z);
    camera.fov = o.fov; camera.near = o.near; camera.far = o.far;
    antMat.opacity = o.antOpacity;
    antMat.depthWrite = o.antOpacity > 0.99;
  } else if (mode === 'cutaway') {
    const c = cut;
    camera.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z - Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.target);
    camera.fov = 40; camera.near = 1; camera.far = 4000;
    antMat.opacity = 1; antMat.depthWrite = true;
    if (capDirtyVersion !== carve.version) rebuildCap();
  } else if (freeCam) {
    camera.position.copy(freeCam.pos); camera.up.set(0, 1, 0); camera.lookAt(freeCam.target);
    camera.fov = freeCam.fov; camera.near = 0.05; camera.far = 4000;
    antMat.opacity = 1; antMat.depthWrite = true;
  }
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // lantern follows the player ant (view space)
  if (mode === 'free' && freeCam) _vx.copy(freeCam.target).lerp(freeCam.pos, 0.35); // observer: lantern near the viewer's target
  else _vx.set(player.pos.x + player.upVis.x * 1.5, player.pos.y + player.upVis.y * 1.5, player.pos.z + player.upVis.z * 1.5);
  _vx.applyMatrix4(camera.matrixWorldInverse);
  shared.uAntPosView.value.copy(_vx);
  renderer.render(scene, camera);
  if (HUD) hud();
}

const hudEl = document.getElementById('hud')!;
let fps = 0;
function hud(): void {
  const p = player.pos, u = player.up, o = lastCam;
  hudEl.textContent =
    `FOUNDRESS nest spike  mode ${mode}${cut.on ? ` cut z=${cut.z}${cut.xray ? ' x-ray' : ''}` : ''}  t ${simTime.toFixed(2)} s  ${fps ? fps.toFixed(1) + ' fps' : ''}\n` +
    `ant (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) up (${u.x.toFixed(2)}, ${u.y.toFixed(2)}, ${u.z.toFixed(2)}) f-foot ${(field.f(p.x, p.y, p.z) - player.p.footOffset).toFixed(3)}${player.falling ? ' FALLING' : ''}\n` +
    `cam dist ${o.dist.toFixed(1)}/${o.desired.toFixed(1)} mm  fov ${o.fov.toFixed(0)}  near ${o.near.toFixed(2)}  tunnel ${o.tunnel.toFixed(2)}  ant alpha ${o.antOpacity.toFixed(2)}\n` +
    `chunks ${chunks.meshes.size}  tris ${chunks.tris}  breaches ${carve.breaches.length}  AI ${ai.ants.length}  markers ${markers.length}\n` +
    `WASD move  drag orbit  wheel zoom  E dig  Space let go  C cutaway  X x-ray  [ ] plane  1-3/0 nav`;
}

// ------------------------------------------------------------------ input (works without pointer lock)
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { player.letGo(); e.preventDefault(); }
  if (e.code === 'KeyC') api.setCamera(mode === 'cutaway' ? 'third' : 'cutaway');
  if (e.code === 'KeyX') { cut.xray = !cut.xray; if (cut.on) setCutaway(true); }
  if (e.code === 'BracketLeft') { cut.z -= 8; if (cut.on) setCutaway(true); }
  if (e.code === 'BracketRight') { cut.z += 8; if (cut.on) setCutaway(true); }
  if (e.code === 'Digit1') api.navTo('C1');
  if (e.code === 'Digit2') api.navTo('C2');
  if (e.code === 'Digit3') api.navTo('C3');
  if (e.code === 'Digit0') api.navTo('surface');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let drag: { x: number; y: number; moved: number } | null = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (mode === 'cutaway') { cut.yaw = Math.max(-1.2, Math.min(1.2, cut.yaw - dx * 0.005)); cut.pitch = Math.max(-0.6, Math.min(1.3, cut.pitch + dy * 0.004)); }
  else rig.orbit(-dx * 0.006, dy * 0.005);
  if (TEST) render();
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && drag.moved < 4 && mode === 'cutaway') {
    const r = canvas.getBoundingClientRect();
    api.placeMarker(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (mode === 'cutaway') cut.dist = Math.max(60, Math.min(1500, cut.dist * Math.exp(e.deltaY * 0.001)));
  else rig.zoomBy(Math.exp(e.deltaY * 0.001));
}, { passive: false });
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight, false));

// ------------------------------------------------------------------ API
const raycaster = new Raycaster();
const vec = (a: Vec3) => [+a.x.toFixed(4), +a.y.toFixed(4), +a.z.toFixed(4)];
function walkerState() {
  const p = player.pos;
  return {
    pos: vec(p), up: vec(player.up), forward: vec(player.fwd), upVis: vec(player.upVis), fwdVis: vec(player.fwdVis),
    falling: player.falling, blocked: player.blocked, f: +field.f(p.x, p.y, p.z).toFixed(4),
    ground: +world.height(p.x, p.z).toFixed(3), substeps: player.substeps, rejects: player.rejects, autopilot: !!autopilot,
    camera: { dist: +rig.out.dist.toFixed(3), desired: +rig.out.desired.toFixed(3), fov: +rig.out.fov.toFixed(2), near: +rig.out.near.toFixed(3), tunnel: +rig.out.tunnel.toFixed(3), antOpacity: +rig.out.antOpacity.toFixed(3), pos: vec(rig.out.pos), clearance: +field.f(rig.out.pos.x, rig.out.pos.y, rig.out.pos.z).toFixed(3) },
    simTime: +simTime.toFixed(4),
  };
}

const api = {
  BU, VOXEL, nest, world: { size: WORLD_SIZE },
  height: (x: number, z: number) => world.height(x, z),
  f: (x: number, y: number, z: number) => field.f(x, y, z),
  teleport(x: number, y: number, z: number, opts: { heading?: number; dir?: [number, number, number] } = {}) {
    const d = opts.dir ? v3(...opts.dir) : v3(0, -1, 0);
    const ok = player.place(x, y, z, opts.heading ?? 0, d);
    rig.reset(player.up, player.fwd);
    rig.update(DT, field, player.pos, player.upVis, player.fwdVis, false);
    autopilot = null;
    if (TEST) render();
    return { ok, ...walkerState() };
  },
  /** forward/turn: tank controls (-1..1); strafe: camera-relative like A/D; desired: world direction to steer toward (tangent-projected) */
  setInput(i: { forward?: number; turn?: number; strafe?: number; desired?: [number, number, number] }) {
    scriptInput = { forward: i.forward ?? 0, turn: i.turn ?? 0, strafe: i.strafe ?? 0, desired: i.desired ? v3(...i.desired) : null };
  },
  step(seconds: number, opts: { render?: boolean } = {}) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) simStep(DT);
    if (opts.render !== false) render();
    return walkerState();
  },
  setDigOffset(ahead: number, down: number) { DIG_AHEAD = ahead; DIG_DOWN = down; },
  setDigSlope(rad: number) { DIG_SLOPE = rad; },
  dig(radius?: number, how: 'ramp' | 'body' = 'ramp') { const r = dig(radius, how); if (TEST) render(); return { ...r, last: digLog[digLog.length - 1], breaches: carve.breaches.length }; },
  letGo() { player.letGo(); },
  walkerState,
  navTo(target: string) {
    const n = nav(target);
    const s = n.nearest(player.pos);
    autopilot = s ? n : null;
    return { reachable: !!s, dist: s ? s[3] : -1, bfs: n.lastStats };
  },
  spawnAI(n: number) { const made = ai.spawn(n); if (TEST) render(); return made; },
  aiState() {
    let minF = Infinity, falling = 0;
    for (const A of ai.ants) { minF = Math.min(minF, field.f(A.w.pos.x, A.w.pos.y, A.w.pos.z)); if (A.w.falling) falling++; }
    return { n: ai.ants.length, trips: ai.ants.reduce((s, A) => s + A.trips, 0), minF, falling, usPerAntTick: ai.stats.us / Math.max(1, ai.stats.steps) };
  },
  setCamera(m: 'third' | 'cutaway' | 'free', opts: Record<string, unknown> = {}) {
    mode = m;
    if (m === 'cutaway') {
      if (typeof opts.plane === 'number') cut.z = opts.plane;
      if (typeof opts.xray === 'boolean') cut.xray = opts.xray;
      if (typeof opts.yaw === 'number') cut.yaw = opts.yaw;
      if (typeof opts.pitch === 'number') cut.pitch = opts.pitch;
      if (typeof opts.dist === 'number') cut.dist = opts.dist;
      if (Array.isArray(opts.target)) cut.target.set(...(opts.target as [number, number, number]));
      setCutaway(true);
    } else {
      setCutaway(false);
      if (m === 'free') {
        const p = (opts.pos as number[]) ?? [0, 100, 0], t = (opts.target as number[]) ?? [0, 0, 0];
        freeCam = { pos: new Vector3(p[0], p[1], p[2]), target: new Vector3(t[0], t[1], t[2]), fov: (opts.fov as number) ?? 50 };
      }
      if (m === 'third') {
        if (typeof opts.yaw === 'number') rig.orbit(opts.yaw, 0);
        if (typeof opts.pitch === 'number') rig.pitchOffset = opts.pitch;
        if (typeof opts.zoom === 'number') rig.zoom = opts.zoom;
        rig.sinceOrbit = 0;
        rig.update(0, field, player.pos, player.upVis, player.fwdVis, false);
      }
    }
    if (TEST) render();
    return { mode };
  },
  /** debug: hide/show layers ('terrain' | 'cavity' | 'ants') */
  setVisible(layer: string, on: boolean) {
    if (layer === 'terrain') terrain.visible = on;
    if (layer === 'cavity') chunks.group.visible = on;
    if (layer === 'ants') { antMesh.visible = on; aiMesh.visible = on; }
    if (TEST) render();
  },
  orbit(dYaw: number, dPitch: number) { rig.orbit(dYaw, dPitch); },
  zoom(f: number) { rig.zoomBy(f); },
  render() { render(); },
  /** cutaway: raycast from NDC into cavity walls / the cap and drop a dig marker at the hit */
  placeMarker(ndcX: number, ndcY: number) {
    raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
    const targets: Object3D[] = [...chunks.meshes.values()];
    if (capMesh && capMesh.visible && !cut.xray) targets.push(capMesh);
    const hits = raycaster.intersectObjects(targets, false).filter((h) => {
      const p = h.point;
      if (h.object === capMesh) return capTex ? sampleCapSolid(p.x, p.y) : false;
      return !cut.on || p.z >= cut.z - 0.01; // clipped geometry is not pickable
    });
    const h = hits[0];
    if (!h) { if (TEST) render(); return null; }
    const mk = new Mesh(markerGeo, markerMat);
    mk.position.copy(h.point);
    scene.add(mk); markers.push(mk);
    if (TEST) render();
    return { point: [h.point.x, h.point.y, h.point.z], on: h.object === capMesh ? 'cap' : 'cavity', f: field.f(h.point.x, h.point.y, h.point.z) };
  },
  stats() {
    const t = chunks.timings.slice().sort((a, b) => a - b);
    const avg = t.reduce((s, x) => s + x, 0) / Math.max(1, t.length);
    const navBytes = [...navs.values()].reduce((s, n) => s + n.memoryBytes(), 0);
    return {
      buildWorldMs: tBuild, initialMeshMs, initialMeshChunks: initialMesh.chunks,
      meshMsPerChunk: { avg, median: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1], n: t.length },
      carveChunks: carve.chunks.size, meshedChunks: chunks.meshes.size, tris: chunks.tris,
      bytes: { opennessPerChunk: 4096, openness: carve.memoryBytes(), meshGpu: chunks.gpuBytes(), meshPerChunk: chunks.gpuBytes() / Math.max(1, chunks.meshes.size), nav: navBytes, navFields: navs.size },
      bfs: bfsTimings, digs: digLog.slice(-20), breaches: carve.breaches.length,
      renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length },
    };
  },
  /** micro-benchmarks that do not disturb the scene */
  bench() {
    const out: Record<string, unknown> = {};
    // carve: fresh grid, 300 tunnel-sized spheres along a random walk
    const g = new CarveGrid(VOXEL, 2 * VOXEL);
    let x = 300, y = -60, z = 300, s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let c0 = performance.now();
    for (let i = 0; i < 300; i++) { x += (rnd() - 0.5) * 6; y += (rnd() - 0.5) * 6; z += (rnd() - 0.5) * 6; g.carveSphere(x, y, z, BU); }
    out.carveSphereUs = ((performance.now() - c0) * 1000) / 300;
    c0 = performance.now();
    for (let i = 0; i < 100; i++) g.carveSphere(x + i * 0.3, y, z, 3 * BU);
    out.carveSphereR12Us = ((performance.now() - c0) * 1000) / 100;
    out.benchGridChunks = g.chunks.size;
    // walker step: clone of the player on flat ground
    const w = new SurfaceWalker(field, { ...DEFAULT_WALKER });
    w.place(150, 30, 250, 0);
    const N = 5000;
    field.evals = 0;
    c0 = performance.now();
    for (let i = 0; i < N; i++) w.update(DT, { forward: 1, turn: 0.3 });
    out.walkerUpdateUs = ((performance.now() - c0) * 1000) / N;
    out.walkerEvalsPerUpdate = field.evals / N;
    // walker in a tunnel (C1 -> C2 tunnel)
    const w2 = new SurfaceWalker(field, { ...DEFAULT_WALKER });
    w2.place(316, -52, 316, 0);
    c0 = performance.now();
    for (let i = 0; i < N; i++) w2.update(DT, { forward: 1, turn: 0.6 });
    out.walkerTunnelUpdateUs = ((performance.now() - c0) * 1000) / N;
    // field eval
    c0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 100000; i++) acc += field.f(300 + (i % 100) * 0.3, -40, 280);
    out.fieldEvalNs = ((performance.now() - c0) * 1e6) / 100000;
    out._acc = acc > 0;
    // BFS full rebuild of every live field
    const rb: Record<string, unknown> = {};
    for (const [name, n] of navs) { const r = n.rebuild(() => performance.now()); rb[name] = { ms: +r.ms.toFixed(2), open: r.open }; }
    out.bfsRebuild = rb;
    // camera update cost
    c0 = performance.now();
    for (let i = 0; i < 500; i++) rig.update(DT, field, player.pos, player.upVis, player.fwdVis, false);
    out.cameraUpdateUs = ((performance.now() - c0) * 1000) / 500;
    // remesh every chunk
    const keysAll = [...chunks.meshes.keys()];
    for (const k of keysAll) carve.dirty.add(k);
    c0 = performance.now();
    const r = chunks.update();
    out.remeshAll = { chunks: r.chunks, ms: +(performance.now() - c0).toFixed(2), perChunkMs: +((performance.now() - c0) / r.chunks).toFixed(3) };
    // render
    renderer.render(scene, camera);
    const gl = renderer.getContext(); const px = new Uint8Array(4);
    c0 = performance.now();
    for (let i = 0; i < 3; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    out.renderMs = (performance.now() - c0) / 3;
    return out;
  },
  dispose() { running = false; renderer.dispose(); renderer.forceContextLoss(); },
};

function sampleCapSolid(x: number, y: number): boolean {
  if (!capTex) return false;
  const w = capTex.image.width, h = capTex.image.height;
  const i = Math.floor((x - CAP.x0) / CAP.res), j = Math.floor((y - CAP.y0) / CAP.res);
  if (i < 0 || j < 0 || i >= w || j >= h) return false;
  return (capTex.image.data as Uint8Array)[(i + j * w) * 4 + 3] >= 128;
}

window.__spike = api;

// ------------------------------------------------------------------ start
const startHeading = Math.atan2(-(nest.entrance[2] - 236), nest.entrance[0] - 228); // face the entrance
player.place(228, 20, 236, startHeading);
rig.reset(player.up, player.fwd);
rig.update(DT, field, player.pos, player.upVis, player.fwdVis, false);
const aiN = Number(q.get('ai') ?? 0);
if (aiN > 0) ai.spawn(aiN);

let running = true;
let lastT = performance.now(), acc = 0, frames = 0, fpsT = lastT;
function frame(): void {
  if (!running) return;
  const now = performance.now();
  acc += Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  let n = 0;
  while (acc >= DT && n < 6) { simStep(DT); acc -= DT; n++; }
  render();
  frames++;
  if (now - fpsT > 1000) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
render();
if (!TEST) requestAnimationFrame(frame);
requestAnimationFrame(() => { window.__ready = true; });

