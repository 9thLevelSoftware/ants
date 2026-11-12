/**
 * FOUNDRESS spike: ants. Procedural, instanced, vertex-animated ants + brood/items.
 * Units mm, Y up (docs/01-design-seed.md). See docs/research/spike-ants.md.
 *
 * URL flags: ?scene=hero|lineup|scale|items|crowd|lod|poses  ?variant=worker|queen|gyne|male|major|media|minim
 *            ?n=2000 (crowd count)  ?post=0|1 (default 1)  ?msaa=0|1 (composer MSAA, default 1)  ?shadows=0|1 (default 1)
 *            ?live=1 (animate in real time; default: render on demand, time advances only through __spike.step)
 * window.__ready: true after the first frame (and SMAA assets) are done.
 * window.__spike: setScene, setCamera, setCount, setPose, setAnt, step, render, setPost, setLod, bench, info, footSlide, dispose.
 */
import {
  ACESFilmicToneMapping, AmbientLight, BackSide, Color, DirectionalLight, Fog, HalfFloatType, HemisphereLight, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoToneMapping, Object3D, PCFSoftShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Quaternion, Scene, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer, ShaderMaterial,
} from 'three';
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { PRESETS, type PresetName } from './params';
import { buildAnt, type AntVariant } from './ant-geometry';
import { uTime, makeAntMaterial } from './ant-shader';
import { buildItems, ITEM_KINDS, type ItemKind } from './items';
import { AntRenderer, makeAnt, mulberry32, stepAnts, type AntState, type AntPose } from './crowd';

declare global { interface Window { __ready?: boolean; __spike?: unknown; __dispose?: () => void } }

const q = new URLSearchParams(location.search);
const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) !== '0' : d);
const POST = flag('post', true), MSAA = flag('msaa', true), SHADOWS = flag('shadows', true), LIVE = flag('live', false);

// ------------------------------------------------------------------------------------------------ renderer
const canvas = document.createElement('canvas'); document.body.prepend(canvas);
const renderer = new WebGLRenderer({ canvas, antialias: !POST && MSAA, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = POST ? NoToneMapping : ACESFilmicToneMapping;
renderer.shadowMap.enabled = SHADOWS; renderer.shadowMap.type = PCFSoftShadowMap;
renderer.info.autoReset = false;

const scene = new Scene();
const SKY = new Color('#cdd3d6');
scene.background = SKY;
scene.fog = new Fog(SKY, 200, 2000);
const camera = new PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 4000);

// environment (reflections on the glossy cuticle): a simple sky/ground gradient dome with a sun spot, prefiltered
{
  const envScene = new Scene();
  const dome = new Mesh(new SphereGeometry(10, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y; vec3 sky = mix(vec3(0.62,0.72,0.86), vec3(0.32,0.48,0.75), clamp(y,0.0,1.0));
      vec3 ground = mix(vec3(0.32,0.25,0.18), vec3(0.16,0.12,0.09), clamp(-y*2.0,0.0,1.0));
      vec3 c = y > 0.0 ? sky : ground; c = mix(ground, c, smoothstep(-0.05, 0.05, y));
      float sun = pow(max(dot(vD, normalize(vec3(-0.5,0.62,0.35))), 0.0), 400.0) * 40.0;
      gl_FragColor = vec4(c * 1.2 + vec3(1.0,0.92,0.8) * sun, 1.0); }`,
  }));
  envScene.add(dome);
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environmentIntensity = 0.75;
  pm.dispose();
}

// lights
scene.add(new HemisphereLight(0xc4d6f0, 0x5a4530, 0.65));
scene.add(new AmbientLight(0xffffff, 0.08));
const sun = new DirectionalLight(0xfff0d8, 3.2);
const SUN_DIR = new Vector3(-0.5, 0.62, 0.35).normalize();
sun.castShadow = SHADOWS; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ------------------------------------------------------------------------------------------------ ground
const groundMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
groundMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float gfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * gn(p); p *= 2.03; a *= 0.5; } return s; }
float soilH(vec2 p){ return gfbm(p * 0.35) * 0.25 + gn(p * 3.1) * 0.06 + gn(p * 8.3) * 0.025; }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  { vec2 p = vGW.xz;
    float big = gfbm(p * 0.012), mid = gfbm(p * 0.18), g1 = gn(p * 3.1), g2 = gn(p * 8.3);
    vec3 dark = vec3(0.16, 0.115, 0.08), light = vec3(0.42, 0.33, 0.24);
    vec3 c = mix(dark, light, clamp(big * 0.7 + mid * 0.5 - 0.15, 0.0, 1.0));
    c *= 0.72 + 0.45 * g1 * (0.7 + 0.3 * g2);
    float sand = smoothstep(0.86, 0.95, gn(p * 11.0 + 7.0)) * smoothstep(0.3, 0.7, gn(p * 0.9));
    c = mix(c, vec3(0.5, 0.44, 0.37), sand * 0.45);
    diffuseColor.rgb = c; }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float h = soilH(vGW.xz) * smoothstep(400.0, 40.0, length(vViewPosition));
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); vec2 dH = vec2(dFdx(h), dFdy(h));
    vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx); float det = dot(dpx, R1);
    normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2)); }`);
};
const ground = new Mesh(new PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), groundMat);
ground.receiveShadow = true; scene.add(ground);

// sand grains / pebbles near the origin (scale cues for macro shots)
function makePebbles(seed: number, n: number, radius: number, minR: number, maxR: number) {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position'); const r0 = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) { const f = 0.85 + 0.3 * r0(); pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f); }
  g.computeVertexNormals();
  const m = new InstancedMesh(g, new MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), n);
  const rnd = mulberry32(seed + 1); const o = new Object3D(); const col = new Color();
  const palette = ['#8c7a66', '#b8a58b', '#6e5a47', '#d6cbb8', '#9a8a7a', '#5b4a3c'];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = 9 + Math.sqrt(rnd()) * (radius - 9); // keep the hero's footprint clear
    const s = minR + (maxR - minR) * Math.pow(rnd(), 3);
    o.position.set(Math.cos(a) * r, s * 0.25, Math.sin(a) * r);
    o.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); o.scale.set(s * (0.8 + 0.4 * rnd()), s * (0.5 + 0.3 * rnd()), s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, col.set(palette[Math.floor(rnd() * palette.length)]!).multiplyScalar(0.7 + 0.5 * rnd()));
  }
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const pebbles = makePebbles(5, 900, 40, 0.08, 0.7);
scene.add(pebbles);

// ------------------------------------------------------------------------------------------------ post
let composer: EffectComposer | null = null; let dof: DepthOfFieldEffect | null = null; let dofPass: EffectPass | null = null;
let smaaReady: Promise<void> = Promise.resolve();
if (POST) {
  composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: MSAA ? 4 : 0 });
  composer.addPass(new RenderPass(scene, camera));
  dof = new DepthOfFieldEffect(camera, { focusDistance: 20, focusRange: 8, bokehScale: 2.2, resolutionScale: 0.5 });
  dofPass = new EffectPass(camera, dof); dofPass.enabled = false;
  composer.addPass(dofPass);
  composer.addPass(new EffectPass(camera,
    new BloomEffect({ intensity: 0.35, luminanceThreshold: 0.95, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.6, levels: 6 }),
    new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    new VignetteEffect({ offset: 0.32, darkness: 0.5 })));
  if (!MSAA) {
    const smaa = new SMAAEffect();
    smaaReady = new Promise((res) => (smaa as unknown as { addEventListener(t: string, f: () => void): void }).addEventListener('load', () => res()));
    composer.addPass(new EffectPass(camera, smaa));
  }
}

// ------------------------------------------------------------------------------------------------ content
const VARIANT_NAMES = Object.keys(PRESETS) as PresetName[];
const t0 = performance.now();
const variants: AntVariant[] = VARIANT_NAMES.map((k) => buildAnt(PRESETS[k]));
const buildMs = performance.now() - t0;
const vIndex = (n: string) => Math.max(0, VARIANT_NAMES.indexOf(n as PresetName));
const items = buildItems(variants[0]!);

let ants: AntState[] = [];
let antR: AntRenderer | null = null;
const extras: Object3D[] = [];
let simTime = 0; let rnd = mulberry32(7);
let sceneName = 'hero';
let bound = 60;
let follow: { idx: number; off: Vector3; tOff: Vector3 } | null = null;
const labels: { el: HTMLDivElement; p: Vector3 }[] = [];
const labelRoot = document.getElementById('labels')!;

function clearScene() {
  antR?.dispose(); antR = null; ants = [];
  for (const o of extras) { scene.remove(o); (o as Mesh).geometry?.dispose(); }
  extras.length = 0; follow = null;
  for (const l of labels) l.el.remove(); labels.length = 0;
}
function label(text: string, p: Vector3) { const el = document.createElement('div'); el.className = 'lbl'; el.textContent = text; labelRoot.appendChild(el); labels.push({ el, p }); }

function poseFor(item: ItemKind | null): AntPose {
  if (!item) return { raise: 0, gaster: 0, swell: 0, gape: 0 };
  const c = items[item].carry; return { raise: c.raise, gaster: 0, swell: 0, gape: c.gape };
}

function groundItem(kind: ItemKind, x: number, z: number, rotY = 0) {
  const it = items[kind];
  const mat = makeAntMaterial(variants[0]!.rig, { roughness: 0.6, transparent: it.transparent, opacity: it.transparent ? 0.62 : 1, physical: it.transparent });
  const m = new Mesh(it.geometry, mat);
  // static display: the ant shader with zero instance data would still run; use a plain material copy instead
  const plain = new MeshStandardMaterial({ vertexColors: true, roughness: kind === 'droplet' ? 0.05 : kind === 'cocoon' ? 0.85 : 0.45, transparent: it.transparent, opacity: it.transparent ? 0.6 : 1 });
  m.material = plain; mat.dispose();
  m.position.set(x, it.restY, z); m.rotation.y = rotY; m.castShadow = !it.transparent; m.receiveShadow = true;
  scene.add(m); extras.push(m);
  return m;
}

interface SceneOpts { variant?: string; n?: number; seed?: number }
function setScene(name: string, o: SceneOpts = {}) {
  clearScene(); sceneName = name; rnd = mulberry32(o.seed ?? 7); simTime = 0;
  const N = o.n ?? Number(q.get('n') ?? 2000);
  const need = name === 'crowd' ? N : 64;
  antR = new AntRenderer(scene, variants, items, Math.max(need, 64), SHADOWS);
  pebbles.visible = name !== 'crowd';
  (scene.fog as Fog).near = name === 'crowd' ? 350 : 120; (scene.fog as Fog).far = name === 'crowd' ? 5000 : 900;
  const W = (k: string) => variants[vIndex(k)]!;
  if (name === 'hero') {
    const vi = vIndex(o.variant ?? q.get('variant') ?? 'worker');
    ants.push(makeAnt(vi, variants[vi]!, { seed: 0.37 }));
    setCamera({ target: [0, variants[vi]!.params.bodyLength * 0.12, 0], dist: variants[vi]!.params.bodyLength * 3.4, az: 40, el: 24 });
  } else if (name === 'scale') {
    ants.push(makeAnt(vIndex('queen'), W('queen'), { x: 0, heading: 0.25, seed: 0.2 }));
    ants.push(makeAnt(vIndex('worker'), W('worker'), { x: 8.5, z: 1.5, heading: -0.35, seed: 0.6 }));
    label('queen (dealate) 8.6 mm', new Vector3(0, 3.3, 0)); label('worker 4 mm', new Vector3(8.5, 1.8, 1.5));
    setCamera({ target: [4.2, 1.2, 0.5], dist: 25, az: 30, el: 28 });
  } else if (name === 'lineup') {
    // caste plate: every preset in profile, facing +X, nose to tail; workers in front, sexuals behind
    const rows: [PresetName[], number][] = [[['minim', 'worker', 'media', 'major'], 0], [['male', 'queen', 'gyne'], -16]];
    for (const [order, z] of rows) {
      let x = 0;
      for (const k of order) {
        const v = W(k); const L = v.params.bodyLength;
        x -= L * 0.6;
        ants.push(makeAnt(vIndex(k), v, { x, z, heading: Math.PI / 2, seed: rnd() }));
        label(`${k} ${L} mm`, new Vector3(x, L * 0.45 + 0.9, z));
        x -= L * 0.6 + 1.5;
      }
    }
    setCamera({ target: [-18, 1.5, -7], dist: 50, az: 0, el: 24, fov: 34 });
  } else if (name === 'items') {
    ITEM_KINDS.forEach((k, i) => {
      const x = -i * 7.5; const it = items[k];
      const g = groundItem(k, x - 2.5, 6.5, 0.5);
      if (k === 'larva') { g.rotation.set(0, 0.5, Math.PI / 2); g.position.y = 0.42; }
      if (k === 'pupa') { g.rotation.set(0, 0.5, Math.PI); g.position.y = 1.0; }
      if (k === 'eggs') g.position.y = it.restY - 0.15;
      const a = makeAnt(0, variants[0]!, { x, z: 0, heading: Math.PI / 2 - 0.75, item: k, pose: poseFor(k), seed: rnd() });
      ants.push(a); label(k, new Vector3(x, 3.6, 0));
    });
    setCamera({ target: [-30, 0.8, 2.5], dist: 52, az: 0, el: 28, fov: 36 });
  } else if (name === 'poses') {
    const defs: [string, Partial<AntState>][] = [
      ['walking', { speed: 24, targetSpeed: 24 }],
      ['carrying cocoon', { item: 'cocoon', pose: poseFor('cocoon') }],
      ['alarm: gaster raised', { pose: { raise: 0.45, gaster: 1, swell: 0, gape: 1 } }],
      ['spraying: gaster curled under', { pose: { raise: 0.2, gaster: -1, swell: 0, gape: 0.8 } }],
      ['replete: full crop', { pose: { raise: 0, gaster: 0, swell: 1, gape: 0 } }],
      ['idle fidget (grooming)', { idle: 1 }],
    ];
    defs.forEach(([lbl, s], i) => { const x = -i * 7.5; ants.push(makeAnt(0, variants[0]!, { x, heading: Math.PI / 2 - 0.35, seed: 0.3 + i * 0.1, ...s })); label(lbl, new Vector3(x, 2.8, 0)); });
    setCamera({ target: [-18.75, 0.9, 0], dist: 46, az: 0, el: 16, fov: 32 });
  } else if (name === 'lod') {
    for (let l = 0; l < 4; l++) { const a = makeAnt(0, variants[0]!, { x: -l * 6, heading: 0.6, seed: 0.5, forceLod: l, speed: 24, targetSpeed: 24 }); ants.push(a); label(`LOD${l} ${variants[0]!.tris[l]} tris`, new Vector3(-l * 6, 2.3, 0)); }
    setCamera({ target: [-9, 0.8, 0], dist: 30, az: 35, el: 30 });
  } else if (name === 'crowd') {
    setCount(N);
    setCamera({ target: [0, 1, 30], dist: 80, az: 20, el: 13, fov: 45 });
  }
  return info();
}

function crowdAnt(i: number): AntState {
  const v = variants[0]!; const r = Math.sqrt(rnd()) * bound, a = rnd() * Math.PI * 2;
  const roll = rnd();
  const s: Partial<AntState> = { x: Math.cos(a) * r, z: Math.sin(a) * r, heading: rnd() * Math.PI * 2, seed: rnd(), scale: 0.88 + 0.27 * rnd(), wander: true };
  const shade = 0.85 + 0.3 * rnd(); s.tint = [shade, shade * (0.97 + 0.06 * rnd()), shade * 0.97];
  const ant = makeAnt(0, v, s);
  if (roll < 0.78) { ant.targetSpeed = ant.cruise * (0.6 + 0.6 * rnd()); ant.speed = ant.targetSpeed; }
  else if (roll < 0.88) { ant.idle = 1; }
  else if (roll < 0.96) { const k = ITEM_KINDS[Math.floor(rnd() * ITEM_KINDS.length)]!; ant.item = k; ant.pose = poseFor(k); ant.targetSpeed = ant.cruise * 0.8; ant.speed = ant.targetSpeed; }
  else if (roll < 0.98) { ant.pose = { raise: 0.4, gaster: 1, swell: 0, gape: 1 }; ant.targetSpeed = ant.cruise; ant.speed = ant.cruise; }
  else { ant.pose = { raise: 0, gaster: 0, swell: 1, gape: 0 }; ant.targetSpeed = ant.cruise * 0.7; ant.speed = ant.targetSpeed; }
  ant.phase = rnd();
  void i;
  return ant;
}

function setCount(n: number) {
  if (sceneName !== 'crowd') return info();
  bound = Math.max(40, Math.sqrt(n) * 6.5);
  if (antR && antR.cap < n) { antR.dispose(); antR = new AntRenderer(scene, variants, items, n, SHADOWS); }
  while (ants.length < n) ants.push(crowdAnt(ants.length));
  ants.length = n;
  return info();
}

interface CamSpec { target?: number[]; dist?: number; az?: number; el?: number; fov?: number; pos?: number[]; follow?: number }
const camState = { target: new Vector3(), dist: 20, az: 40, el: 25 };
function setCamera(c: CamSpec | string) {
  if (typeof c === 'string') c = cameraPreset(c);
  if (c.fov) camera.fov = c.fov;
  if (c.target) camState.target.fromArray(c.target);
  if (c.dist !== undefined) camState.dist = c.dist; if (c.az !== undefined) camState.az = c.az; if (c.el !== undefined) camState.el = c.el;
  if (c.pos) { camera.position.fromArray(c.pos); camState.dist = camera.position.distanceTo(camState.target); }
  else {
    const az = (camState.az * Math.PI) / 180, el = (Math.min(camState.el, 89.9) * Math.PI) / 180;
    camera.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(camState.dist).add(camState.target);
  }
  camera.up.set(0, 1, 0);
  if (camState.el >= 89.9 && !c.pos) camera.up.set(0, 0, 1);
  camera.lookAt(camState.target);
  camera.near = Math.max(0.02, camState.dist * 0.008); camera.far = Math.max(500, camState.dist * 40);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (c.follow !== undefined && c.follow >= 0 && ants[c.follow]) {
    const a = ants[c.follow]!; follow = { idx: c.follow, off: camera.position.clone().sub(new Vector3(a.x, a.y, a.z)), tOff: camState.target.clone().sub(new Vector3(a.x, a.y, a.z)) };
  } else if (c.follow === -1) follow = null;
  // the CoC material only copies near/far when the camera is assigned: refresh it after changing them
  if (dof) { dof.cocMaterial.adoptCameraSettings(camera); dof.cocMaterial.focusDistance = camState.dist; dof.cocMaterial.focusRange = camState.dist * 0.3; }
  return { pos: camera.position.toArray(), target: camState.target.toArray() };
}
function cameraPreset(name: string): CamSpec {
  const a = ants[0]; const L = a ? variants[a.variant]!.params.bodyLength * a.scale : 4;
  const tgt = a ? [a.x, L * 0.12, a.z] : [0, 0.5, 0];
  switch (name) {
    case 'three-quarter': return { target: tgt, dist: L * 2.5, az: 40, el: 24, fov: 30 };
    case 'side': return { target: [tgt[0]!, L * 0.11, tgt[2]!], dist: L * 3.2, az: 90, el: 3, fov: 30 };
    case 'top': return { target: tgt, dist: L * 3.6, az: 0, el: 89.95, fov: 30 };
    case 'front': return { target: tgt, dist: L * 3.0, az: 0, el: 12, fov: 30 };
    default: return { target: tgt, dist: L * 3.3, az: 40, el: 24 };
  }
}

function setPose(which: number | 'all', p: Partial<AntPose> & { item?: ItemKind | null; speed?: number; idle?: number; heading?: number }) {
  const list = which === 'all' ? ants : [ants[which]].filter(Boolean) as AntState[];
  for (const a of list) {
    if (p.item !== undefined) { a.item = p.item; if (p.item) Object.assign(a.pose, poseFor(p.item)); }
    for (const k of ['raise', 'gaster', 'swell', 'gape'] as const) if (p[k] !== undefined) a.pose[k] = p[k]!;
    if (p.speed !== undefined) { a.speed = p.speed; a.targetSpeed = p.speed; }
    if (p.idle !== undefined) a.idle = p.idle;
    if (p.heading !== undefined) a.heading = p.heading;
  }
  return list.length;
}
function setAnt(i: number, s: Partial<AntState>) { if (ants[i]) Object.assign(ants[i]!, s); return !!ants[i]; }

// ------------------------------------------------------------------------------------------------ frame
let lastCpuMs = 0;
function updateShadowCamera() {
  const sz = Math.min(Math.max(camState.dist * 0.55, 6), 260);
  const t = camState.target; const sc = sun.shadow.camera;
  sun.position.copy(SUN_DIR).multiplyScalar(sz * 4).add(t); sun.target.position.copy(t); sun.target.updateMatrixWorld();
  sc.left = -sz; sc.right = sz; sc.top = sz; sc.bottom = -sz; sc.near = sz * 0.5; sc.far = sz * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = sz * 0.0015;
}
function renderFrame() {
  if (follow) {
    const a = ants[follow.idx]!; const p = new Vector3(a.x, a.y, a.z);
    camState.target.copy(p).add(follow.tOff); camera.position.copy(p).add(follow.off); camera.lookAt(camState.target);
  }
  uTime.value = simTime;
  camera.updateMatrixWorld();
  const c0 = performance.now();
  antR?.update(ants, camera, renderer.domElement.height);
  lastCpuMs = performance.now() - c0;
  updateShadowCamera();
  renderer.info.reset();
  if (composer) composer.render(1 / 60); else renderer.render(scene, camera);
  // labels
  const w = innerWidth, h = innerHeight; const v = new Vector3();
  for (const l of labels) { v.copy(l.p).project(camera); l.el.style.left = `${((v.x + 1) / 2) * w}px`; l.el.style.top = `${((1 - v.y) / 2) * h}px`; l.el.style.display = v.z < 1 ? 'block' : 'none'; }
}
function step(seconds: number, dt = 1 / 60) {
  let left = seconds;
  while (left > 1e-9) { const d = Math.min(dt, left); stepAnts(ants, variants, d, rnd, bound); simTime += d; left -= d; }
  renderFrame();
  return { t: simTime, phase: ants[0]?.phase ?? 0 };
}

function info() {
  return {
    scene: sceneName, ants: ants.length, simTime, buildMs: +buildMs.toFixed(1), cpuMs: +lastCpuMs.toFixed(2),
    lod: antR?.stats, submittedTris: antR?.submittedTris(), calls: renderer.info.render.calls, frameTris: renderer.info.render.triangles,
    variants: variants.map((v) => ({ name: v.params.name, bodyLength: v.params.bodyLength, tris: v.tris, wingTris: v.wingTris, verts: v.lods.map((g) => g.getAttribute('position').count) })),
    items: Object.fromEntries(ITEM_KINDS.map((k) => [k, items[k].tris])),
    camera: { pos: camera.position.toArray().map((x) => +x.toFixed(2)), target: camState.target.toArray() },
  };
}

/** synchronous render benchmark: warm + n frames, each finished with a 1-pixel readPixels */
function bench(n = 8, warm = 2, advance = true) {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  const frame = () => { if (advance) { stepAnts(ants, variants, 1 / 30, rnd, bound); simTime += 1 / 30; } renderFrame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  for (let i = 0; i < warm; i++) frame();
  let cpu = 0; const t = performance.now();
  for (let i = 0; i < n; i++) { frame(); cpu += lastCpuMs; }
  const ms = (performance.now() - t) / n;
  return { ms: +ms.toFixed(1), cpuMs: +(cpu / n).toFixed(2), info: info() };
}

/**
 * CPU replica of the shader's foot target (leg L1 by default): returns the max world-space drift of a planted
 * foot while the ant walks straight. Proves no foot sliding (should be ~0).
 */
function footSlide(seconds = 1, legIndex = 0, speed = 24) {
  const a = makeAnt(0, variants[0]!, { speed, targetSpeed: speed, phase: 0.01 }); const rig = variants[0]!.rig;
  const pair = legIndex % 3, s = legIndex < 3 ? 1 : -1; const tripodB = (s > 0) === (pair === 1);
  const L = rig.gait[0], duty = rig.gait[2]; const F = rig.foot[pair]!;
  let maxDrift = 0, anchor: number | null = null, stances = 0; const dt = 1 / 240;
  for (let t = 0; t < seconds; t += dt) {
    stepAnts([a], variants, dt, rnd, 1e9);
    const lp = ((a.phase + (tripodB ? 0.5 : 0) + pair * 0.03) % 1 + 1) % 1;
    if (lp < duty) {
      const u = lp / duty; const dz = L * duty * (0.5 - u);
      const worldZ = a.z + (F[2] + dz) * Math.cos(a.heading); // heading 0: straight along +Z
      if (anchor === null) { anchor = worldZ; stances++; } else maxDrift = Math.max(maxDrift, Math.abs(worldZ - anchor));
    } else anchor = null;
  }
  return { maxDriftMm: maxDrift, stances, strideMm: L, bodyLengthMm: variants[0]!.params.bodyLength };
}

// ------------------------------------------------------------------------------------------------ boot
function dispose() { renderer.setAnimationLoop(null); clearScene(); composer?.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
window.__dispose = dispose;
window.__spike = {
  setScene, setCamera, setCount, setPose, setAnt, step, render: () => { renderFrame(); return info(); }, info, bench, footSlide, dispose,
  setPost: (o: { dof?: boolean; focus?: number; range?: number }) => {
    if (dofPass && o.dof !== undefined) dofPass.enabled = o.dof;
    if (dof && o.focus !== undefined) dof.cocMaterial.focusDistance = o.focus;
    if (dof && o.range !== undefined) dof.cocMaterial.focusRange = o.range;
    return !!dofPass;
  },
  setLod: (o: Partial<AntRenderer['lodCfg']> & { force?: number | null }) => {
    if (o.force !== undefined) for (const a of ants) { if (o.force === null) delete a.forceLod; else a.forceLod = o.force; }
    const { force: _f, ...rest } = o; void _f;
    if (antR) Object.assign(antR.lodCfg, rest); return antR?.lodCfg;
  },
  setTime: (t: number) => { simTime = t; renderFrame(); },
  get ants() { return ants; },
  debug: { variants, items },
};
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); composer?.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

setScene(q.get('scene') ?? 'hero');
void Quaternion; void Matrix4; void MeshBasicMaterial;
await smaaReady;
renderFrame();
requestAnimationFrame(() => { window.__ready = true; });
if (LIVE) { let last = performance.now(); renderer.setAnimationLoop(() => { const now = performance.now(); step(Math.min(0.05, (now - last) / 1000)); last = now; }); }
