// Minimal boot placeholder (replaced by the app shell task). Proves the page, the @/ alias and src/core load in
// the browser: paints a seeded fbm noise preview on the full-window canvas, then sets window.__ready.

import { FOUNDRESS_VERSION, createLogger, fbm2, rngFork, rngInt } from '@/core';

const log = createLogger('boot');
const PREVIEW_CELLS = 160; // noise preview resolution (scaled up to the window)
const NOISE_SCALE = 1 / 24;

function paintPreview(canvas: HTMLCanvasElement, seed: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = PREVIEW_CELLS;
  canvas.height = Math.max(1, Math.round((PREVIEW_CELLS * window.innerHeight) / Math.max(1, window.innerWidth)));
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const n = fbm2(x * NOISE_SCALE, y * NOISE_SCALE, seed, 5) * 0.5 + 0.5; // [0, 1]
      const o = (y * canvas.width + x) * 4;
      img.data[o] = 60 + 110 * n; // warm soil tones
      img.data[o + 1] = 42 + 80 * n;
      img.data[o + 2] = 24 + 50 * n;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function boot(): void {
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  const ui = document.getElementById('ui');
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? rngInt(rngFork(1, 'boot'), 1, 9999));
  if (canvas) {
    canvas.style.imageRendering = 'pixelated';
    paintPreview(canvas, seed);
  }
  if (ui) {
    const title = document.createElement('div');
    title.style.cssText = 'position:absolute;left:16px;top:12px;text-shadow:0 1px 3px #000';
    title.textContent = `FOUNDRESS ${FOUNDRESS_VERSION} - core loaded (seed ${seed})`;
    ui.appendChild(title);
  }
  log.info(`FOUNDRESS ${FOUNDRESS_VERSION}`);
  (window as unknown as { __ready?: boolean }).__ready = true;
}

boot();
