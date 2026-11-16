// Capturing the canvas as a PNG (GDD 08 7.9): the current frame at the drawing buffer's size, or at twice that when the
// GPU allows. The 2x image is a fresh render of the same frame into a bigger drawing buffer (the post chain's bokeh scale
// is multiplied so the blur looks the same), read back in the same task (a WebGL canvas is only readable until the
// browser composites it), then the buffer is put back to its normal size.
import { Vector2 } from 'three';
import type { RenderApp } from '@/render/app';
import type { CaptureScale } from './constants';
import { nativeCaptureSize, planCapture, type GpuLimits } from './captureSize';

export interface CaptureImage {
  blob: Blob;
  width: number;
  height: number;
  scale: CaptureScale;
  /** 2x was asked for and the GPU did not allow it. */
  reduced: boolean;
  method: 'canvas-blob' | 'data-url';
}

/**
 * What the capture asks of its caller around the render. `boost` is the image's width over the drawing buffer's width
 * on screen: photo mode multiplies the bokeh by it so the blur looks the same at any size.
 */
export interface CaptureHooks {
  before?(boost: number): void;
  after?(): void;
}

export function readGpuLimits(gl: WebGL2RenderingContext | WebGLRenderingContext): GpuLimits {
  const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null;
  return {
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048,
    maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 2048,
    maxViewport: [vp?.[0] ?? 4096, vp?.[1] ?? 4096],
  };
}

/** The base64 payload of a data URL as bytes. */
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  try {
    const text = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'image/png' });
  } catch {
    return null;
  }
}

/**
 * Encodes the canvas now. `toBlob` takes its snapshot when it is called, so the caller may resize the canvas straight
 * away. Where `toBlob` is missing or throws, the synchronous data URL is the second route.
 */
export function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; method: CaptureImage['method'] } | null> {
  return new Promise((resolve) => {
    const fromData = () => {
      let url: string | null = null;
      try { url = canvas.toDataURL('image/png'); } catch { url = null; }
      const b = url ? dataUrlToBlob(url) : null;
      resolve(b ? { blob: b, method: 'data-url' } : null);
    };
    if (typeof canvas.toBlob !== 'function') { fromData(); return; }
    try {
      canvas.toBlob((b) => resolve(b ? { blob: b, method: 'canvas-blob' } : null), 'image/png');
    } catch {
      fromData();
    }
  });
}

const _size = new Vector2();

/** The size of a 1x capture of the app's canvas (see `nativeCaptureSize`). */
export function captureBaseSize(app: RenderApp): { width: number; height: number } {
  app.renderer.getDrawingBufferSize(_size);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  return nativeCaptureSize(app.canvas.clientWidth, app.canvas.clientHeight, dpr, app.quality.maxPixelRatio, _size.x, _size.y);
}

/**
 * Renders the current frame and returns it as a PNG. Throws a readable Error when the context is lost or the browser
 * cannot encode the canvas.
 */
export async function captureFrame(app: RenderApp, wanted: number, hooks: CaptureHooks = {}): Promise<CaptureImage> {
  if (app.contextLost) throw new Error('The graphics context was lost; try again in a moment.');
  const renderer = app.renderer, canvas = app.canvas;
  renderer.getDrawingBufferSize(_size);
  const w0 = _size.x, h0 = _size.y;
  const native = captureBaseSize(app);
  const plan = planCapture(native.width, native.height, wanted, readGpuLimits(renderer.getContext()));
  const resized = plan.width !== w0 || plan.height !== h0;
  let pending: ReturnType<typeof encodeCanvas>;
  try {
    if (resized) { renderer.setSize(plan.width, plan.height, false); app.post?.setSize(plan.width, plan.height); }
    hooks.before?.(plan.width / Math.max(1, w0));
    if (!app.renderFrame(0)) throw new Error('The graphics context was lost; try again in a moment.');
    pending = encodeCanvas(canvas); // the snapshot is taken inside this call
  } finally {
    hooks.after?.();
    if (resized) { renderer.setSize(w0, h0, false); app.post?.setSize(w0, h0); }
    app.requestRender();
  }
  const enc = await pending;
  if (!enc) throw new Error('The browser could not encode the image.');
  return { blob: enc.blob, width: plan.width, height: plan.height, scale: plan.scale, reduced: plan.reduced, method: enc.method };
}
