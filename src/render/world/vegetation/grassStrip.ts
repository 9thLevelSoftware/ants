// Straightens the CC0 grass atlas (7 slightly curved horizontal blades, with an opacity map) into GRASS.strips strips
// of 256 x 16 texels (u = base -> tip, v = edge -> edge), so the procedural blade samples real blade colour with a
// trivial (h, s) mapping (spike-look 2.8). Browser only (2D canvas); returns null where no canvas exists or the
// images are placeholders, and the blade shader falls back to a procedural gradient.
import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace, type Texture } from 'three';
import { GRASS } from '../decor/tuning';

const S = 1024, W = 256, HS = 16;

function readPixels(img: CanvasImageSource): Uint8ClampedArray | null {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, S, S);
  return g.getImageData(0, 0, S, S).data;
}

export function straightenGrassAtlas(albedo: unknown, opacity: unknown): Texture | null {
  if (typeof document === 'undefined' || !albedo || !opacity) return null;
  const a = albedo as { width?: number }, o = opacity as { width?: number };
  if (!a.width || a.width < 256 || !o.width || o.width < 256) return null; // placeholder (8 x 8) or not decoded
  const A = readPixels(albedo as CanvasImageSource), O = readPixels(opacity as CanvasImageSource);
  if (!A || !O) return null;
  const n = GRASS.strips, out = document.createElement('canvas');
  out.width = W; out.height = HS * n;
  const og = out.getContext('2d');
  if (!og) return null;
  const od = og.createImageData(W, HS * n);
  let found = 0;
  for (let b = 0; b < n; b++) {
    const y0 = Math.floor((b * S) / n), y1 = Math.floor(((b + 1) * S) / n);
    const top = new Int32Array(S).fill(-1), bot = new Int32Array(S).fill(-1);
    let xmin = S, xmax = -1;
    for (let x = 0; x < S; x++) {
      for (let y = y0; y < y1; y++) if (O[(y * S + x) * 4] > 140) { if (top[x] < 0) top[x] = y; bot[x] = y; }
      if (top[x] >= 0 && bot[x] - top[x] >= 1) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); } else top[x] = -1;
    }
    if (xmax < 0) continue;
    found++;
    let last = -1;
    for (let x = xmin; x <= xmax; x++) { if (top[x] >= 0) last = x; else if (last >= 0) { top[x] = top[last]; bot[x] = bot[last]; } }
    for (let i = 0; i < W; i++) {
      const x = Math.round(xmin + ((i + 0.5) / W) * (xmax - xmin));
      for (let j = 0; j < HS; j++) {
        const y = Math.round(top[x] + ((j + 0.5) / HS) * (bot[x] - top[x]));
        const si = (y * S + x) * 4, di = ((b * HS + j) * W + i) * 4;
        od.data[di] = A[si]; od.data[di + 1] = A[si + 1]; od.data[di + 2] = A[si + 2]; od.data[di + 3] = 255;
      }
    }
  }
  if (found < n - 1) return null;
  og.putImageData(od, 0, 0);
  const t = new CanvasTexture(out);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
