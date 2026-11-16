import { describe, expect, it } from 'vitest';
import { maxCaptureScale, nativeCaptureSize, planCapture, scaleFits, type GpuLimits } from './captureSize';

const BIG: GpuLimits = { maxTextureSize: 16384, maxRenderbufferSize: 16384, maxViewport: [16384, 16384] };
const SW: GpuLimits = { maxTextureSize: 8192, maxRenderbufferSize: 8192, maxViewport: [8192, 8192] };
const SMALL: GpuLimits = { maxTextureSize: 2048, maxRenderbufferSize: 2048, maxViewport: [2048, 2048] };

describe('capture size', () => {
  it('2x when it fits the texture size, the viewport and the pixel budget', () => {
    expect(planCapture(1280, 720, 2, SW)).toEqual({ scale: 2, width: 2560, height: 1440, reduced: false });
    expect(maxCaptureScale(1920, 1080, BIG)).toBe(2);
  });
  it('falls back to the canvas size when the GPU is too small, and says so', () => {
    expect(planCapture(1280, 720, 2, SMALL)).toEqual({ scale: 1, width: 1280, height: 720, reduced: true });
  });
  it('a 4K canvas stays within the pixel budget', () => {
    expect(scaleFits(3840, 2160, 2, BIG)).toBe(false);
    expect(planCapture(3840, 2160, 2, BIG).scale).toBe(1);
  });
  it('scale 1 is asked for and given even on a tiny GPU', () => {
    expect(planCapture(1000, 600, 1, SMALL)).toEqual({ scale: 1, width: 1000, height: 600, reduced: false });
  });
});

describe('native 1x size', () => {
  it('is the canvas as laid out times the (capped) pixel ratio, not the drawing buffer of this frame', () => {
    // Low: buffer at 0.85 of the page and dynamic resolution further down; the photo is still the page size
    expect(nativeCaptureSize(1280, 720, 1, 1, 650, 366)).toEqual({ width: 1280, height: 720 });
    expect(nativeCaptureSize(1280, 720, 2, 1.5, 1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(nativeCaptureSize(1280, 720, 1, 2, 1088, 612)).toEqual({ width: 1280, height: 720 });
  });
  it('two shots of one frame get one size, whatever the dynamic resolution did between them', () => {
    expect(nativeCaptureSize(1000, 500, 1, 1, 600, 300)).toEqual(nativeCaptureSize(1000, 500, 1, 1, 1000, 500));
  });
  it('a canvas without layout (hidden) or nonsense ratios fall back to the buffer or 1', () => {
    expect(nativeCaptureSize(0, 0, 2, 2, 800, 450)).toEqual({ width: 800, height: 450 });
    expect(nativeCaptureSize(640, 360, NaN, NaN, 10, 10)).toEqual({ width: 640, height: 360 });
    expect(nativeCaptureSize(0, 0, 1, 1, 0, 0)).toEqual({ width: 1, height: 1 });
  });
});
