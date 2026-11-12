/**
 * FOUNDRESS spike: stack. Proves three r187 + postprocessing + custom shaders in the target pipeline.
 *
 * Units are millimetres, Y up (docs/01-design-seed.md). Terrain 1200 x 1200 mm, ants ~4 mm.
 *
 * URL flags:
 *   ?post=0|1      post-processing chain (DoF + bloom + tone mapping + vignette + SMAA). default 1
 *   ?shadows=0|1   directional light 2048 shadow map. default 1
 *   ?seed=N        seeded RNG for the scene (deterministic). default 7
 *   ?t=SECONDS     freeze animation time (deterministic screenshots). default: animate
 *   ?ants=N        instance count. default 5000
 *   ?msaa=0|1      MSAA on the default framebuffer when post=0. default 1
 *   ?test=1        (accepted, no effect here)   ?hud=1 shows a tiny HUD
 *
 * Globals: window.__ready (true after the first rendered frame, and after SMAA images loaded),
 *          window.__perf() -> average ms per frame over the last 60 frames,
 *          window.__info() -> renderer.info snapshot + config,
 *          window.__bench(n=20, warm=3) -> STOPS the rAF loop, renders warm+n frames synchronously (each ends with a 1px
 *            readPixels so the GPU must finish) and returns the true ms/frame; window.__resume() restarts the loop.
 *          window.__dispose() -> stop the loop and release the GL context (call before navigating away, see tech-stack.md).
 */
import {
  ACESFilmicToneMapping, AmbientLight, BufferAttribute, BufferGeometry, Color, DataTexture, Data3DTexture,
  DirectionalLight, DepthTexture, Fog, HalfFloatType, HemisphereLight, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, LinearFilter, Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, NoToneMapping, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, RedFormat, Quaternion, Scene, SphereGeometry, SRGBColorSpace, UnsignedByteType,
  Vector3, WebGLRenderer, RGBADepthPacking, ClampToEdgeWrapping, ShaderChunk, Uniform,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'; // NOTE: 'three/addons/...' (maps to examples/jsm)
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect,
  ToneMappingMode, VignetteEffect, BlendFunction,
} from 'postprocessing';

declare global {
  interface Window { __ready?: boolean; __perf?: () => number; __info?: () => unknown; __stack?: unknown; __dispose?: () => void; __bench?: (n?: number, warm?: number) => number; __resume?: () => void; }
}

// ---------------------------------------------------------------- config
const q = new URLSearchParams(location.search);
const flag = (k: string, d: boolean) => (q.has(k) ? q.get(k) !== '0' : d);
const POST = flag('post', true);
const SHADOWS = flag('shadows', true);
const SEED = Number(q.get('seed') ?? 7);
const ANTS = Number(q.get('ants') ?? 5000);
const FROZEN_T = q.has('t') ? Number(q.get('t')) : null;
const SHOW_HUD = flag('hud', false);
const MSAA = flag('msaa', true); // only used when post=0: antialias on the default framebuffer

// ---------------------------------------------------------------- seeded rng + noise (no Math.random in sim-like code)
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rng = mulberry32(SEED);
const hash2 = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + SEED * 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x: number, y: number) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };

// ---------------------------------------------------------------- terrain height (mm)
const WORLD = 1200; // mm, X,Z in [-600, 600]
function groundY(x: number, z: number) {
  return (fbm(x / 260 + 11, z / 260 + 3) - 0.5) * 70 + (fbm(x / 40, z / 40) - 0.5) * 6;
}

// ---------------------------------------------------------------- renderer
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new WebGLRenderer({
  canvas,
  // With the pmndrs composer the scene renders into a HalfFloat target; MSAA/antialias on the
  // default framebuffer would be wasted, so it is off when POST is on (SMAA is used instead).
  antialias: !POST && MSAA,
  stencil: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace; // (default in r187; set explicitly for documentation)
// IMPORTANT: three only applies renderer.toneMapping when rendering to the screen. With the composer the
// scene is rendered to a render target, so tone mapping must be a ToneMappingEffect and renderer.toneMapping = None.
renderer.toneMapping = POST ? NoToneMapping : ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = PCFSoftShadowMap;

const scene = new Scene();
const FOG_COLOR = new Color('#d9c8a6');
scene.background = FOG_COLOR;
scene.fog = new Fog(FOG_COLOR, 120, 1250);

const camera = new PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.5, 4000); // near 0.5 mm: ~ant-scale
camera.position.set(-70, groundY(-70, 75) + 20, 75);
camera.lookAt(20, groundY(20, -5) + 3, -5);

// ---------------------------------------------------------------- lights
scene.add(new HemisphereLight(0xcfe2ff, 0x6b4a2b, 0.55));
scene.add(new AmbientLight(0xffffff, 0.15));
const sun = new DirectionalLight(0xfff0d0, 2.6);
sun.position.set(-260, 330, 120);
sun.target.position.set(0, 0, 40);
sun.castShadow = SHADOWS;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -330; sc.right = 330; sc.top = 330; sc.bottom = -330; sc.near = 50; sc.far = 900;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.25; // world units = mm here
scene.add(sun, sun.target);

// ---------------------------------------------------------------- 3D data texture (scent / density field)
const TW = 64, TH = 32, TD = 64;
const TEX_EXTENT = new Vector3(WORLD, 64, WORLD); // world extent covered, origin at (-600, 0, -600)
const trailAt = (t: number) => new Vector3(-520 + 1040 * t, 0, 60 * Math.sin(t * 6.0) - 10 * Math.cos(t * 13));
function buildScentTexture() {
  const data = new Uint8Array(TW * TH * TD);
  const pts: Vector3[] = [];
  for (let i = 0; i <= 60; i++) { const p = trailAt(i / 60); pts.push(p); }
  for (let z = 0; z < TD; z++) for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const wx = (x + 0.5) / TW * TEX_EXTENT.x - WORLD / 2, wy = (y + 0.5) / TH * TEX_EXTENT.y, wz = (z + 0.5) / TD * TEX_EXTENT.z - WORLD / 2;
    let d = 0;
    for (const p of pts) { const dx = wx - p.x, dz = wz - p.z, dy = wy - (groundY(p.x, p.z) + 6); d += Math.exp(-(dx * dx + dz * dz) / (2 * 26 * 26) - (dy * dy) / (2 * 16 * 16)); }
    d = Math.min(1, d * 0.1) * (0.75 + 0.25 * vnoise(wx / 18, wz / 18 + wy / 9));
    data[x + TW * (y + TH * z)] = Math.round(d * 255);
  }
  const tex = new Data3DTexture(data, TW, TH, TD);
  tex.format = RedFormat;
  tex.type = UnsignedByteType; // R8: linear-filterable everywhere. (R32F also works here, see docs)
  tex.minFilter = LinearFilter; tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
const scentTex = buildScentTexture();
const uScent = new Uniform(scentTex);
const uTime = new Uniform(0);
const uExtent = new Uniform(TEX_EXTENT);
const uOrigin = new Uniform(new Vector3(-WORLD / 2, 0, -WORLD / 2));

const SCENT_FN = /* glsl */ `
  uniform highp sampler3D uScent;
  uniform vec3 uExtent;
  uniform vec3 uOrigin;
  float scentAt(vec3 wp) { return texture(uScent, (wp - uOrigin) / uExtent).r; }
`;

// ---------------------------------------------------------------- terrain (~80k triangles)
const SEG = 200;
const tg = new PlaneGeometry(WORLD, WORLD, SEG, SEG);
tg.rotateX(-Math.PI / 2);
{
  const pos = tg.attributes.position as BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const soil = new Color('#3d2b1b'), dry = new Color('#7a6240'), moss = new Color('#3b4a22'), tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = groundY(x, z);
    pos.setY(i, y);
    const n = fbm(x / 90 + 40, z / 90), m = fbm(x / 14, z / 14), g = fbm(x / 400 + 5, z / 400);
    tmp.copy(soil).lerp(dry, Math.min(1, Math.max(0, (n - 0.35) * 2.2))).lerp(moss, Math.min(1, Math.max(0, (g - 0.55) * 3.0)));
    tmp.multiplyScalar(0.8 + 0.4 * m);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; // vertex colours are authored in linear sRGB-managed Color
  }
  tg.setAttribute('color', new BufferAttribute(col, 3));
  tg.computeVertexNormals();
}
const terrainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
terrainMat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
  Object.assign(shader.uniforms, { uScent, uExtent, uOrigin });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + SCENT_FN)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float sc = scentAt(vWPos + vec3(0.0, 4.0, 0.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.42, 0.75), sc * 0.22);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.10, 0.25, 0.55) * sc * sc * 0.55;`);
};
const terrain = new Mesh(tg, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

// ---------------------------------------------------------------- rocks (~20k triangles)
const rockMat = new MeshStandardMaterial({ color: '#8a8378', roughness: 0.8, metalness: 0.05 });
for (let i = 0; i < 28; i++) {
  const g = new IcosahedronGeometry(1, 5);
  const p = g.attributes.position as BufferAttribute;
  for (let j = 0; j < p.count; j++) {
    const v = new Vector3().fromBufferAttribute(p, j);
    const n = 0.75 + 0.5 * vnoise(v.x * 2.1 + i * 7, v.y * 2.1 + v.z * 1.7);
    v.multiplyScalar(n); p.setXYZ(j, v.x, v.y * 0.6, v.z);
  }
  g.computeVertexNormals();
  const m = new Mesh(g, rockMat);
  const r = 4 + rng() * 14, rx = (rng() - 0.5) * 900, rz = (rng() - 0.5) * 900;
  m.scale.setScalar(r); m.position.set(rx, groundY(rx, rz) + r * 0.25, rz);
  m.rotation.y = rng() * 6.28;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
}
// a few glowing "dew drops" (emissive > 1 so bloom has something to catch)
const dewMat = new MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.05, metalness: 0.0, emissive: '#9fd0ff', emissiveIntensity: 3.0 });
for (let i = 0; i < 24; i++) {
  const t = rng(); const tp = trailAt(t); const x = tp.x + (rng() - 0.5) * 120, z = tp.z + (rng() - 0.5) * 120;
  const d = new Mesh(new SphereGeometry(1.4 + rng() * 1.6, 16, 10), dewMat);
  d.position.set(x, groundY(x, z) + 1.5, z); d.castShadow = true; scene.add(d);
}

// ---------------------------------------------------------------- ants: InstancedMesh + per-instance attribute animated in the vertex shader
function antGeometry() {
  const parts: BufferGeometry[] = [];
  const add = (cx: number, sx: number, sy: number, sz: number) => {
    const g = new SphereGeometry(1, 7, 5).toNonIndexed(); // non-indexed so every part has the same attribute layout
    g.scale(sx, sy, sz); g.translate(cx, 0, 0); parts.push(g);
  };
  add(-1.55, 1.05, 0.8, 0.8); // gaster
  add(0.0, 0.8, 0.5, 0.5);    // mesosoma
  add(1.55, 0.55, 0.5, 0.5);  // head
  const g = mergeGeometries(parts, false)!;
  g.translate(0, 0.75, 0); // feet on y = 0
  return g;
}
const antGeo = antGeometry();
const aAnim = new Float32Array(ANTS * 4);
const antMesh = new InstancedMesh(antGeo, undefined, ANTS);
{
  const m = new Matrix4(), q0 = new Quaternion(), one = new Vector3(1, 1, 1), p = new Vector3();
  for (let i = 0; i < ANTS; i++) {
    let x: number, z: number;
    if (i < ANTS * 0.7) { const t = rng(); const tp = trailAt(t); x = tp.x + (rng() - 0.5) * 70; z = tp.z + (rng() - 0.5) * 70; }
    else { x = (rng() - 0.5) * 900; z = (rng() - 0.5) * 900; }
    const s = 0.85 + rng() * 0.4;
    p.set(x, groundY(x, z) + 0.05, z);
    m.compose(p, q0, one.set(s, s, s));
    antMesh.setMatrixAt(i, m);
    aAnim[i * 4] = rng() * Math.PI * 2;        // phase
    aAnim[i * 4 + 1] = 0.4 + rng() * 0.9;      // angular speed rad/s
    aAnim[i * 4 + 2] = 3 + rng() * 9;          // path radius mm
    aAnim[i * 4 + 3] = rng();                  // per-ant random
  }
  antMesh.instanceMatrix.needsUpdate = true;
  antGeo.setAttribute('aAnim', new InstancedBufferAttribute(aAnim, 4));
}
const ANT_COMMON = /* glsl */ `
  attribute vec4 aAnim;
  uniform float uTime;
  // NOTE: three's #include <common> already #defines PI; redeclaring it is a GLSL syntax error
  float antAng() { return uTime * aAnim.y + aAnim.x; }
  float antHeading() { return -(antAng() + PI * 0.5); }
  vec3 rotY(vec3 v, float t) { float c = cos(t), s = sin(t); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
`;
// local pose: heading rotation, circular path offset, gait bob + lateral sway along the body (cheap "leg" wiggle)
const ANT_BEGIN_VERTEX = /* glsl */ `
  float aAng = antAng();
  vec3 transformed = position;
  transformed.z += sin(uTime * aAnim.y * 14.0 + aAnim.x * 3.0) * 0.10 * transformed.x;
  transformed.y += abs(sin(uTime * aAnim.y * 14.0 + aAnim.x)) * 0.18;
  transformed = rotY(transformed, antHeading());
  vec3 antOffs = vec3(cos(aAng), 0.0, sin(aAng)) * aAnim.z;
  transformed += antOffs;
`;
const antMat = new MeshStandardMaterial({ color: '#2a1d16', roughness: 0.35, metalness: 0.1 });
antMat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
  Object.assign(shader.uniforms, { uTime, uScent, uExtent, uOrigin });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + ANT_COMMON + '\nuniform highp sampler3D uScent; uniform vec3 uExtent; uniform vec3 uOrigin; varying float vScent;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = rotY(objectNormal, antHeading());')
    .replace('#include <begin_vertex>', ANT_BEGIN_VERTEX + `
      // 3D texture sampled in the VERTEX shader: ants on a dense scent trail glow
      vScent = texture(uScent, (instanceMatrix[3].xyz + antOffs - uOrigin) / uExtent).r;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vScent;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.5, 0.55, 0.12) * vScent * vScent * 0.45;');
};
// Shadow casting for vertex-animated instances needs a matching depth material (otherwise shadows show the un-animated pose).
const antDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
antDepth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
  Object.assign(shader.uniforms, { uTime });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + ANT_COMMON)
    .replace('#include <begin_vertex>', ANT_BEGIN_VERTEX);
};
antMesh.material = antMat;
antMesh.customDepthMaterial = antDepth;
antMesh.castShadow = true;
antMesh.receiveShadow = true;
antMesh.frustumCulled = false; // vertex shader moves instances outside their static bounding sphere
scene.add(antMesh);

// ---------------------------------------------------------------- post-processing chain (pmndrs/postprocessing)
let composer: EffectComposer | null = null;
let smaaLoaded = !POST;
if (POST) {
  composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 125, focusRange: 70, bokehScale: 3.2, resolutionScale: 0.5 });
  const bloom = new BloomEffect({ intensity: 0.85, luminanceThreshold: 0.9, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.75, levels: 7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
  const smaa = new SMAAEffect();
  // typing quirk: SMAAEffect's EventDispatcher type only declares 'change', but it really dispatches 'load' when its LUT images are ready
  (smaa as unknown as { addEventListener(t: string, f: () => void): void }).addEventListener('load', () => { smaaLoaded = true; });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, dof, bloom, tone, vignette));
  composer.addPass(new EffectPass(camera, smaa));
}

// ---------------------------------------------------------------- resize
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer?.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- loop + perf
const frameTimes: number[] = [];
let last = performance.now();
let rendered = 0;
const t0 = performance.now();
const hud = document.getElementById('hud')!;
renderer.info.autoReset = false; // we reset once per frame so info.render covers ALL passes (shadow + scene + post)
function frame(now: number) {
  const dt = now - last; last = now;
  renderer.info.reset();
  if (rendered > 0) { frameTimes.push(dt); if (frameTimes.length > 60) frameTimes.shift(); }
  uTime.value = FROZEN_T ?? (now - t0) / 1000;
  if (composer) composer.render(dt / 1000); else renderer.render(scene, camera);
  rendered++;
  if (rendered === 3 && smaaLoaded) window.__ready = true; // after the first frames are really on screen
  if (SHOW_HUD && rendered % 15 === 0) hud.textContent = `${window.__perf!().toFixed(1)} ms  post=${+POST} shadows=${+SHADOWS}`;
}
const loop = (now: number) => {
  frame(now);
  if (!window.__ready && rendered > 3 && smaaLoaded) window.__ready = true;
};
renderer.setAnimationLoop(loop);
window.__resume = () => { last = performance.now(); renderer.setAnimationLoop(loop); };
const gl2 = renderer.getContext();
const px1 = new Uint8Array(4);
window.__bench = (n = 20, warm = 3) => {
  renderer.setAnimationLoop(null);
  const run = () => {
    renderer.info.reset();
    uTime.value = FROZEN_T ?? (performance.now() - t0) / 1000;
    if (composer) composer.render(1 / 60); else renderer.render(scene, camera);
    gl2.readPixels(0, 0, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px1); // sync point: waits for the GPU
  };
  for (let i = 0; i < warm; i++) run();
  const a = performance.now();
  for (let i = 0; i < n; i++) run();
  return (performance.now() - a) / n;
};

window.__perf = () => (frameTimes.length ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : NaN);
window.__info = () => ({
  post: POST, shadows: SHADOWS, ants: ANTS, seed: SEED, frames: rendered,
  triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
  geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
  size: [window.innerWidth, window.innerHeight],
});
window.__dispose = () => {
  renderer.setAnimationLoop(null);
  composer?.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
};
window.__stack = { renderer, scene, camera, composer };
// reference to silence "unused" for symbols kept for documentation of the import paths
void ShaderChunk; void DataTexture; void DepthTexture; void Quaternion; void BlendFunction;
