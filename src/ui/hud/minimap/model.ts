// The minimap's pure parts (GDD 08 3.4): which tint each zone gets, how a world point maps into the 176 dp square, how a
// click maps back, and the zone plate's pixels. The component (Minimap.tsx) only draws what these return.
import type { MinimapFrame, MinimapPlate } from '@/game/uiBridge/minimap';

/** Box edge in dp (GDD 08 3.4: 176 x 176). */
export const MINIMAP_SIZE_DP = 176;
/** Real ms between repaints (the minimap needs no more than a few frames a second). */
export const MINIMAP_REFRESH_MS = 200;

/** Flat tints per zone type, dark enough for the white icons and the amber trail to read on them. */
export const ZONE_TINTS: Readonly<Record<string, readonly [number, number, number]>> = {
  forest: [58, 82, 52],
  lawn: [88, 116, 60],
  'garden-bed': [92, 70, 48],
  pavement: [132, 130, 122],
  asphalt: [66, 68, 72],
  sand: [166, 146, 98],
  rubber: [118, 62, 56],
  interior: [150, 126, 100],
};
/** Outside the locality (the window reaches past the edge). */
export const VOID_TINT: readonly [number, number, number] = [18, 20, 22];
const UNKNOWN_TINT: readonly [number, number, number] = [96, 96, 96];

export function tintOfZone(type: string | undefined): readonly [number, number, number] {
  return (type !== undefined && ZONE_TINTS[type]) || UNKNOWN_TINT;
}

/** Position in the box as fractions 0..1 (x right, y down; north is up) of a world point; may lie outside 0..1. */
export function toBox(f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>, x: number, z: number): { u: number; v: number } {
  return { u: (x - f.cx) / f.windowMm + 0.5, v: (z - f.cz) / f.windowMm + 0.5 };
}

/** The world point (mm) under a box position given as fractions 0..1. */
export function fromBox(f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>, u: number, v: number): { x: number; z: number } {
  return { x: f.cx + (u - 0.5) * f.windowMm, z: f.cz + (v - 0.5) * f.windowMm };
}

/** Weight 0..1 of a class given its blurred share: a short ramp about one half, so a border is a clean smooth line a few pixels wide. */
const sharpen = (w: number): number => {
  const t = Math.min(1, Math.max(0, (w - 0.5) * 6 + 0.5));
  return t * t * (3 - 2 * t);
};

/**
 * How far a class border is blurred, in plate pixels, before it is cut at one half. The zone map is made of blocks a few cells wide
 * (worldgen paints it at 4 cells), so at 2.75 px a cell the blocks are 11 px steps: the blur has to cover a block to turn the steps into
 * a curve. Where cells are large on the plate (a close window) the radius shrinks to whole cells, down to one.
 */
const BLUR_PX = 10;
const BLUR_MAX_CELLS = 5;

/** In-place triangle blur (two box passes of radius r) of a w x h field along x, then y, through `tmp`. */
function blurField(a: Float32Array, tmp: Float32Array, w: number, h: number, r: number): void {
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) { // along x: a -> tmp
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / n;
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) { // along y: tmp -> a
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / n;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/**
 * Fills RGBA `px` (size x size) with the zone plate under the window; returns it. A window of one class (nearly always) is one fill.
 * Otherwise the cells under the window (plus the blur margin) are split into one indicator field per class, each blurred (BLUR_PX), and
 * every pixel reads the fields bilinearly, sharpens the weights around one half and blends the tints: class borders are smooth curves
 * at the plate's own pixel resolution, not the zone map's cell and block staircase (look pass 4). Cost follows the window's cell
 * count and the classes in it, not the pixels times a kernel.
 */
export function paintPlate(px: Uint8ClampedArray, size: number, plate: MinimapPlate, f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>): Uint8ClampedArray {
  const { map, typeById } = plate;
  const x0 = f.cx - f.windowMm / 2, z0 = f.cz - f.windowMm / 2, step = f.windowMm / size;
  const tints = typeById.map((t) => tintOfZone(t));
  const tintOf = (c: number): readonly [number, number, number] => (c < 0 ? VOID_TINT : (tints[c] ?? UNKNOWN_TINT));
  const pxPerCell = size * map.cell / f.windowMm;
  const r = Math.min(BLUR_MAX_CELLS, Math.max(1, Math.round(BLUR_PX / pxPerCell)));
  const i0 = Math.floor(x0 / map.cell) - r - 1, k0 = Math.floor(z0 / map.cell) - r - 1;
  const w = Math.ceil((x0 + f.windowMm) / map.cell) + r + 2 - i0, h = Math.ceil((z0 + f.windowMm) / map.cell) + r + 2 - k0;
  const cls = new Int16Array(w * h);
  const present: number[] = [];
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
    const ix = i0 + i, iz = k0 + k;
    const c = ix >= 0 && iz >= 0 && ix < map.nx && iz < map.nz ? map.data[iz * map.nx + ix] : -1;
    cls[k * w + i] = c;
    if (!present.includes(c)) present.push(c);
  }
  if (present.length === 1) {
    const t = tintOf(present[0]);
    for (let i = 0; i < size * size * 4; i += 4) { px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255; }
    return px;
  }
  const tmp = new Float32Array(w * h);
  const fields = present.map((c) => {
    const a = new Float32Array(w * h);
    for (let j = 0; j < w * h; j++) a[j] = cls[j] === c ? 1 : 0;
    blurField(a, tmp, w, h, r);
    return a;
  });
  const wts = new Float32Array(present.length);
  let o = 0;
  for (let py = 0; py < size; py++) {
    const gz = (z0 + (py + 0.5) * step) / map.cell - 0.5 - k0, kz = Math.floor(gz), fz = gz - kz;
    for (let pxl = 0; pxl < size; pxl++, o += 4) {
      const gx = (x0 + (pxl + 0.5) * step) / map.cell - 0.5 - i0, kx = Math.floor(gx), fx = gx - kx;
      const a = kz * w + kx, b = a + w;
      let best = 0, bestW = -1, rr = 0, gg = 0, bb = 0, sum = 0;
      for (let q = 0; q < present.length; q++) {
        const fq = fields[q];
        const v = (fq[a] * (1 - fx) + fq[a + 1] * fx) * (1 - fz) + (fq[b] * (1 - fx) + fq[b + 1] * fx) * fz;
        wts[q] = v;
        if (v > bestW) { bestW = v; best = q; }
      }
      if (bestW >= 0.999) { const t = tintOf(present[best]); px[o] = t[0]; px[o + 1] = t[1]; px[o + 2] = t[2]; px[o + 3] = 255; continue; }
      for (let q = 0; q < present.length; q++) {
        const s = sharpen(wts[q]);
        if (s <= 0) continue;
        const t = tintOf(present[q]);
        rr += t[0] * s; gg += t[1] * s; bb += t[2] * s; sum += s;
      }
      if (sum <= 0) { const t = tintOf(present[best]); rr = t[0]; gg = t[1]; bb = t[2]; sum = 1; }
      px[o] = rr / sum; px[o + 1] = gg / sum; px[o + 2] = bb / sum; px[o + 3] = 255;
    }
  }
  return px;
}
