// Which capture size the GPU allows (GDD 08 7.9: "PNG at render size or 2x (2x only if within MAX_TEXTURE_SIZE)").
// Pure: the limits are read by the caller.
import { PHOTO_CAPTURE_MAX_PIXELS, PHOTO_CAPTURE_SCALES, type CaptureScale } from './constants';

export interface GpuLimits {
  maxTextureSize: number;
  maxRenderbufferSize: number;
  /** MAX_VIEWPORT_DIMS (width, height). */
  maxViewport: readonly [number, number];
}

export interface CapturePlan {
  scale: CaptureScale;
  width: number;
  height: number;
  /** The scale that was asked for was not allowed (so the plan is a smaller one). */
  reduced: boolean;
}

/** True when `scale` times the canvas fits the GPU limits and the pixel budget. */
export function scaleFits(width: number, height: number, scale: number, lim: GpuLimits, maxPixels = PHOTO_CAPTURE_MAX_PIXELS): boolean {
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const side = Math.min(lim.maxTextureSize, lim.maxRenderbufferSize);
  return w <= side && h <= side && w <= lim.maxViewport[0] && h <= lim.maxViewport[1] && w * h <= maxPixels;
}

/** The largest allowed scale not above `wanted`. */
export function planCapture(width: number, height: number, wanted: number, lim: GpuLimits, maxPixels = PHOTO_CAPTURE_MAX_PIXELS): CapturePlan {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  let scale: CaptureScale = 1;
  for (const s of PHOTO_CAPTURE_SCALES) if (s <= wanted && scaleFits(w, h, s, lim, maxPixels)) scale = s;
  return { scale, width: Math.round(w * scale), height: Math.round(h * scale), reduced: scale < wanted };
}

/** The biggest scale of the offered ones this GPU allows for a canvas of this size. */
export function maxCaptureScale(width: number, height: number, lim: GpuLimits, maxPixels = PHOTO_CAPTURE_MAX_PIXELS): CaptureScale {
  return planCapture(width, height, PHOTO_CAPTURE_SCALES[PHOTO_CAPTURE_SCALES.length - 1], lim, maxPixels).scale;
}

/**
 * The size a 1x capture has: the canvas as laid out on the page times the device pixel ratio (capped by the quality
 * preset), whatever the drawing buffer is right now. The buffer follows the quality's resolution scale and dynamic
 * resolution, so reading it would give smaller photos on Low and different sizes for two shots of the same frame.
 * Without a layout (hidden canvas) the current buffer size is the best there is.
 */
export function nativeCaptureSize(
  cssWidth: number, cssHeight: number, devicePixelRatio: number, maxPixelRatio: number, bufferWidth: number, bufferHeight: number,
): { width: number; height: number } {
  if (!(cssWidth > 0 && cssHeight > 0)) return { width: Math.max(1, Math.round(bufferWidth)), height: Math.max(1, Math.round(bufferHeight)) };
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const ratio = Math.min(dpr, Number.isFinite(maxPixelRatio) && maxPixelRatio > 0 ? maxPixelRatio : 1);
  return { width: Math.max(1, Math.round(cssWidth * ratio)), height: Math.max(1, Math.round(cssHeight * ratio)) };
}
