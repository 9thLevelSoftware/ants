/**
 * WebGL2 capability probe. Functional tests (render + read back pixels), not just extension flags.
 * Run:  node tools/harness/play.mjs --root spikes/stack/caps
 * Result is in window.__caps (also printed in the page and in play.mjs summary via the script below).
 */
import {
  BoxGeometry, DataTexture, Data3DTexture, DirectionalLight, FloatType, GLSL3, HalfFloatType, InstancedMesh, LinearFilter,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, NoToneMapping, OrthographicCamera, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, RedFormat, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, WebGLRenderer,
  WebGLRenderTarget, BufferGeometry, BufferAttribute, DoubleSide, ClampToEdgeWrapping, AmbientLight, Vector3,
} from 'three';

declare global { interface Window { __ready?: boolean; __caps?: Record<string, unknown> } }

const canvas = document.createElement('canvas');
canvas.width = 256; canvas.height = 256;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = NoToneMapping;
const gl = renderer.getContext() as WebGL2RenderingContext;
const caps: Record<string, unknown> = {};
const dbg = gl.getExtension('WEBGL_debug_renderer_info');

caps.webgl2 = gl instanceof WebGL2RenderingContext;
caps.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
caps.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'n/a';
caps.version = gl.getParameter(gl.VERSION);
caps.MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
caps.MAX_3D_TEXTURE_SIZE = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
caps.MAX_ARRAY_TEXTURE_LAYERS = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
caps.MAX_SAMPLES = gl.getParameter(gl.MAX_SAMPLES);
caps.MAX_TEXTURE_IMAGE_UNITS = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
caps.MAX_VERTEX_TEXTURE_IMAGE_UNITS = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
caps.MAX_VERTEX_ATTRIBS = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
caps.MAX_RENDERBUFFER_SIZE = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
caps.MAX_COLOR_ATTACHMENTS = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS);
caps.contextAntialias = gl.getContextAttributes()?.antialias;
caps.extensions = Object.fromEntries(
  ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear', 'EXT_float_blend', 'EXT_texture_filter_anisotropic',
    'KHR_parallel_shader_compile', 'WEBGL_multi_draw', 'EXT_disjoint_timer_query_webgl2', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_astc',
    'WEBGL_compressed_texture_etc', 'EXT_texture_compression_bptc', 'OVR_multiview2'].map((n) => [n, !!gl.getExtension(n)]),
);

const results: Record<string, { ok: boolean; detail: string }> = {};
const record = (name: string, fn: () => string | true) => {
  try { const r = fn(); results[name] = { ok: true, detail: r === true ? 'ok' : r }; }
  catch (e) { results[name] = { ok: false, detail: String((e as Error).message ?? e) }; }
};
const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new PlaneGeometry(2, 2);

// 1. sampler3D: write a ramp in a 4x4x4 R8 3D texture, sample the 4 depth slices in a fragment shader, read back.
record('sampler3D', () => {
  const data = new Uint8Array(4 * 4 * 4);
  for (let z = 0; z < 4; z++) for (let i = 0; i < 16; i++) data[z * 16 + i] = 40 * (z + 1);
  const tex = new Data3DTexture(data, 4, 4, 4);
  tex.format = RedFormat; tex.type = UnsignedByteType; tex.minFilter = NearestFilter; tex.magFilter = NearestFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;
  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: { t: { value: tex } },
    vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: 'precision highp sampler3D; uniform sampler3D t; in vec2 vUv; out vec4 o; void main(){ o = vec4(texture(t, vec3(vUv, floor(vUv.x*4.)/4.+0.125)).r, 0., 0., 1.); }',
  });
  const rt = new WebGLRenderTarget(4, 1, { type: UnsignedByteType, minFilter: NearestFilter, magFilter: NearestFilter });
  const scene = new Scene(); scene.add(new Mesh(quad, mat));
  renderer.setRenderTarget(rt); renderer.render(scene, ortho); renderer.setRenderTarget(null);
  const px = new Uint8Array(16); renderer.readRenderTargetPixels(rt, 0, 0, 4, 1, px);
  const got = [px[0], px[4], px[8], px[12]];
  assert(got.join() === [40, 80, 120, 160].join(), `got ${got}`);
  return `slices read back ${got}`;
});

// 2. EXT_color_buffer_float: render into RGBA32F and RGBA16F targets, read back values > 1
record('EXT_color_buffer_float render+readback', () => {
  const mat = new ShaderMaterial({ glslVersion: GLSL3, vertexShader: 'void main(){ gl_Position = vec4(position.xy,0.,1.); }', fragmentShader: 'out vec4 o; void main(){ o = vec4(123.5, -7.25, 1000.0, 1.); }' });
  const scene = new Scene(); scene.add(new Mesh(quad, mat));
  const out: string[] = [];
  for (const [name, type, arr] of [['RGBA32F', FloatType, new Float32Array(4)], ['RGBA16F', HalfFloatType, new Uint16Array(4)]] as const) {
    const rt = new WebGLRenderTarget(2, 2, { type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter });
    renderer.setRenderTarget(rt); renderer.render(scene, ortho); renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, arr as Float32Array);
    if (name === 'RGBA32F') assert(Math.abs((arr as Float32Array)[0]! - 123.5) < 1e-3 && Math.abs((arr as Float32Array)[2]! - 1000) < 1e-3, `32F got ${Array.from(arr)}`);
    out.push(`${name}=${Array.from(arr).slice(0, 3).join('/')}`);
  }
  return out.join(' ');
});

// 3. OES_texture_float_linear: bilinear sample of an R32F... (RGBA32F) texture at the midpoint must be 0.5
record('OES_texture_float_linear (bilinear RGBA32F)', () => {
  const t = new DataTexture(new Float32Array([0, 0, 0, 1, 1, 1, 1, 1]), 2, 1, RGBAFormat, FloatType);
  t.minFilter = LinearFilter; t.magFilter = LinearFilter; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.needsUpdate = true;
  const mat = new ShaderMaterial({ glslVersion: GLSL3, uniforms: { t: { value: t } }, vertexShader: 'void main(){ gl_Position = vec4(position.xy,0.,1.); }',
    fragmentShader: 'uniform sampler2D t; out vec4 o; void main(){ o = vec4(texture(t, vec2(0.5, 0.5)).r, 0., 0., 1.); }' });
  const scene = new Scene(); scene.add(new Mesh(quad, mat));
  const rt = new WebGLRenderTarget(1, 1, { type: FloatType, format: RGBAFormat });
  renderer.setRenderTarget(rt); renderer.render(scene, ortho); renderer.setRenderTarget(null);
  const px = new Float32Array(4); renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
  assert(Math.abs(px[0]! - 0.5) < 0.01, `midpoint sample ${px[0]} (expected 0.5)`);
  return `midpoint=${px[0]!.toFixed(3)}`;
});

// 4. Instancing 20000
record('instancing 20000', () => {
  const N = 20000;
  const mesh = new InstancedMesh(new BoxGeometry(0.03, 0.03, 0.03), new MeshBasicMaterial({ color: 0xffffff }), N);
  const m = new Matrix4();
  for (let i = 0; i < N; i++) { m.makeTranslation(((i % 200) / 200 - 0.5) * 1.8, (Math.floor(i / 200) / 100 - 0.5) * 1.8, -0.5); mesh.setMatrixAt(i, m); }
  const scene = new Scene(); scene.background = null; scene.add(mesh);
  const rt = new WebGLRenderTarget(64, 64, { type: UnsignedByteType });
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.info.reset();
  const t0 = performance.now(); renderer.render(scene, ortho); gl.finish(); const ms = performance.now() - t0;
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  const px = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, px); renderer.setRenderTarget(null);
  let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i]! > 0) lit++;
  assert(calls === 1 && tris === N * 12, `calls=${calls} tris=${tris}`);
  assert(lit > 100, `only ${lit} lit pixels`);
  return `1 draw call, ${tris} tris, ${lit} lit px, ${ms.toFixed(1)} ms`;
});

// 5. Shadow maps: a box shadows the floor; floor pixel inside the shadow must be darker than outside
record('shadow maps (2048 PCFSoft)', () => {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  const floor = new Mesh(new PlaneGeometry(10, 10).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xffffff })); floor.receiveShadow = true; scene.add(floor);
  const box = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial({ color: 0xffffff })); box.position.y = 1; box.castShadow = true; scene.add(box);
  const light = new DirectionalLight(0xffffff, 3); light.position.set(4, 6, 0); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -8; light.shadow.camera.right = 8; light.shadow.camera.top = 8; light.shadow.camera.bottom = -8; scene.add(light, new AmbientLight(0xffffff, 0.1));
  const cam = new PerspectiveCamera(40, 1, 0.1, 100); cam.position.set(0, 14, 0.01); cam.lookAt(0, 0, 0);
  const rt = new WebGLRenderTarget(128, 128, { type: UnsignedByteType });
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
  const px = new Uint8Array(128 * 128 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 128, 128, px);
  // light from +x: shadow falls toward -x. Sample a pixel on the -x side (left) vs +x far side... compare min and max of luminance on floor row
  let min = 255, max = 0; const y = 64 * 128 * 4;
  for (let x = 0; x < 128; x++) { const v = px[y + x * 4]!; min = Math.min(min, v); max = Math.max(max, v); }
  assert(max - min > 60, `no shadow contrast: min=${min} max=${max}`);
  renderer.shadowMap.enabled = false;
  return `row luminance min=${min} max=${max}; shadow map allocated: ${!!light.shadow.map}, size ${light.shadow.map?.width}x${light.shadow.map?.height}`;
});

// 5b. MSAA: render a diagonal triangle into a samples:4 render target, expect intermediate edge values
record('MSAA render target (samples 4)', () => {
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0]), 3));
  const mk = (samples: number) => {
    const scene = new Scene(); scene.add(new Mesh(g, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide })));
    const rt = new WebGLRenderTarget(32, 32, { type: UnsignedByteType, samples });
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, ortho); renderer.setRenderTarget(null);
    const px = new Uint8Array(32 * 32 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 32, 32, px);
    let mid = 0; for (let i = 0; i < px.length; i += 4) if (px[i]! > 8 && px[i]! < 247) mid++;
    return mid;
  };
  const m0 = mk(0), m4 = mk(4);
  assert(m4 > m0 + 10, `edge pixels no AA: samples0=${m0}, samples4=${m4}`);
  return `intermediate edge pixels: samples=0 -> ${m0}, samples=4 -> ${m4}`;
});

// 6. 3D texture limits really usable: allocate a 256^3 R8 (16 MB)
record('3D texture 256^3 R8 allocate', () => {
  const t = new Data3DTexture(new Uint8Array(256 * 256 * 256), 256, 256, 256); t.format = RedFormat; t.type = UnsignedByteType; t.unpackAlignment = 1; t.needsUpdate = true;
  renderer.initTexture(t);
  assert(gl.getError() === 0, 'GL error after upload');
  return 'ok';
});

caps.tests = results;
caps.allOk = Object.values(results).every((r) => r.ok);
window.__caps = caps;
document.getElementById('out')!.textContent = JSON.stringify(caps, null, 2);
void Vector3;
window.__ready = true;
