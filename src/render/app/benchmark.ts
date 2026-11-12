// Startup benchmark for `auto` quality: renders a small instanced scene into an offscreen target a few times and
// waits for the GPU with a 1-pixel readPixels after each frame (tech-stack section 3), then reads the renderer string.
import {
  BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, PerspectiveCamera, DirectionalLight, Scene, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import type { GpuProbe } from './autoDetect';

export const BENCH_SIZE = 256;
export const BENCH_INSTANCES = 4000;
export const BENCH_FRAMES = 6;
export const BENCH_WARMUP = 2;

export function rendererString(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* privacy settings may forbid it */ }
  return String(gl.getParameter(gl.RENDERER));
}

/** Measures ms/frame on a fixed scene; cleans up everything it created. */
export function runStartupBenchmark(renderer: WebGLRenderer, now: () => number = () => performance.now()): GpuProbe {
  const gl = renderer.getContext();
  const scene = new Scene();
  const geo = new BoxGeometry(1, 1, 1, 2, 2, 2);
  const mat = new MeshStandardMaterial({ color: 0x886644, roughness: 0.8 });
  const mesh = new InstancedMesh(geo, mat, BENCH_INSTANCES);
  const m = new Matrix4();
  for (let i = 0; i < BENCH_INSTANCES; i++) {
    m.makeTranslation((i % 64) * 1.5 - 48, Math.floor(i / 4096) * 2, Math.floor(i / 64) * 1.5 - 48);
    mesh.setMatrixAt(i, m);
  }
  scene.add(mesh, new DirectionalLight(0xffffff, 2));
  const cam = new PerspectiveCamera(60, 1, 0.1, 500);
  cam.position.set(0, 40, 70);
  cam.lookAt(0, 0, 0);
  const target = new WebGLRenderTarget(BENCH_SIZE, BENCH_SIZE);
  const px = new Uint8Array(4);
  const prev = renderer.getRenderTarget();
  let ms = NaN;
  try {
    renderer.setRenderTarget(target);
    const frame = () => {
      renderer.render(scene, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    for (let i = 0; i < BENCH_WARMUP; i++) frame();
    const t0 = now();
    for (let i = 0; i < BENCH_FRAMES; i++) frame();
    ms = (now() - t0) / BENCH_FRAMES;
  } catch {
    ms = NaN;
  } finally {
    renderer.setRenderTarget(prev);
    target.dispose();
    geo.dispose();
    mat.dispose();
    mesh.dispose();
  }
  return { renderer: rendererString(renderer), benchMs: ms, maxTextureSize: renderer.capabilities.maxTextureSize };
}
