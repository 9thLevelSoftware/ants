// The minimap's pure parts (GDD 08 3.4): which tint each zone gets, how a world point maps into the 176 dp square, how a
// click maps back, and the zone plate's pixels. The component (Minimap.tsx) only draws what these return.
import type { MinimapFrame, MinimapPlate } from '@/game/uiBridge/minimap';

/** Box edge in dp (GDD 08 3.4: 176 x 176). */
export const MINIMAP_SIZE_DP = 176;
/** Wall time of the whole canvas repaint (plate, water, structures, trail, food), ms: the last one and the least so far (read by the verification hook). */
export const minimapPaintStats = { last: 0, min: Infinity, count: 0 };
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
const SHARPEN_GAIN = 6;
const sharpen = (w: number): number => {
  const t = Math.min(1, Math.max(0, (w - 0.5) * SHARPEN_GAIN + 0.5));
  return t * t * (3 - 2 * t);
};
/** A share from which `sharpen` is 1 (and every other class's share, at most 1 - this, gives 0). */
const PURE_SHARE = 0.5 + 0.5 / SHARPEN_GAIN + 0.002;

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
 * Thin classes (a path, a verge, a one-block zone) keep a smaller blurred share than the border blur leaves a wide one, and would be
 * cut away at one half. Each class's field is lifted where its own nearby peak is under PEAK_TARGET (never above GAIN_MAX), so a class
 * that is present stays present, a little wider than it was; wide classes (peak 1) are untouched and borders between them are exactly
 * the plain blur. Shares are then renormalised to sum to one.
 */
const PEAK_TARGET = 1.25;
const GAIN_MAX = 8;
const FIELD_EPS = 0.003;
/** A class whose peak share is at or under this is fully lifted. */
const THIN_PEAK = 0.3;

/**
 * Fills RGBA `px` (size x size) with the zone plate under the window; returns it. A window of one class (nearly always) is one fill.
 * Otherwise the cells under the window (plus the blur margin) are split into one indicator field per class, each blurred (BLUR_PX) and
 * lifted where the class is thin (PEAK_TARGET); every pixel reads the fields bilinearly, sharpens the shares around one half and blends the
 * tints: class borders are smooth curves at the plate's own pixel resolution, not the zone map's cell and block staircase (look pass 4).
 * Quads of four cells that are plainly one class are filled as spans, so only the pixels near a border pay for the blend and the cost stays
 * close to a nearest-cell fill (the repaint cost the task asked to keep).
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
  const K = present.length, n = w * h;
  const tmp = new Float32Array(n);
  const fields = present.map((c) => {
    const a = new Float32Array(n);
    for (let j = 0; j < n; j++) a[j] = cls[j] === c ? 1 : 0;
    blurField(a, tmp, w, h, r);
    return a;
  });
  liftThinClasses(fields, w, h, r);
  const sum = tmp;
  sum.fill(0);
  for (const a of fields) for (let j = 0; j < n; j++) sum[j] += a[j];
  for (const a of fields) for (let j = 0; j < n; j++) a[j] /= sum[j];
  // Quads (a cell and its right and lower neighbours) whose four corners all give one class at least PURE_SHARE: every pixel inside reads
  // that share or more (bilinear is a mix of the corners), which `sharpen` already turns into the plain tint, so they are filled as is.
  const pure = new Int8Array(n).fill(-1);
  for (let k = 0; k < h - 1; k++) for (let i = 0; i < w - 1; i++) {
    const a = k * w + i;
    for (let q = 0; q < K; q++) {
      const fq = fields[q];
      if (fq[a] >= PURE_SHARE && fq[a + 1] >= PURE_SHARE && fq[a + w] >= PURE_SHARE && fq[a + w + 1] >= PURE_SHARE) { pure[a] = q; break; }
    }
  }
  const tint = new Uint8Array(K * 3);
  for (let q = 0; q < K; q++) { const t = tintOf(present[q]); tint[q * 3] = t[0]; tint[q * 3 + 1] = t[1]; tint[q * 3 + 2] = t[2]; }
  const kxOf = new Int32Array(size), fxOf = new Float32Array(size);
  for (let pxl = 0; pxl < size; pxl++) {
    const gx = (x0 + (pxl + 0.5) * step) / map.cell - 0.5 - i0, kx = Math.floor(gx);
    kxOf[pxl] = kx; fxOf[pxl] = gx - kx;
  }
  const wts = new Float32Array(K);
  let o = 0;
  for (let py = 0; py < size; py++) {
    const gz = (z0 + (py + 0.5) * step) / map.cell - 0.5 - k0, kz = Math.floor(gz), fz = gz - kz;
    for (let pxl = 0; pxl < size; pxl++, o += 4) {
      const kx = kxOf[pxl], a = kz * w + kx;
      const pq = pure[a];
      if (pq >= 0) { px[o] = tint[pq * 3]; px[o + 1] = tint[pq * 3 + 1]; px[o + 2] = tint[pq * 3 + 2]; px[o + 3] = 255; continue; }
      const fx = fxOf[pxl], b = a + w;
      let best = 0, bestW = -1, rr = 0, gg = 0, bb = 0, tot = 0;
      for (let q = 0; q < K; q++) {
        const fq = fields[q];
        const v = (fq[a] * (1 - fx) + fq[a + 1] * fx) * (1 - fz) + (fq[b] * (1 - fx) + fq[b + 1] * fx) * fz;
        wts[q] = v;
        if (v > bestW) { bestW = v; best = q; }
      }
      for (let q = 0; q < K; q++) {
        const sh = sharpen(wts[q]);
        if (sh <= 0) continue;
        rr += tint[q * 3] * sh; gg += tint[q * 3 + 1] * sh; bb += tint[q * 3 + 2] * sh; tot += sh;
      }
      if (tot <= 0) { rr = tint[best * 3]; gg = tint[best * 3 + 1]; bb = tint[best * 3 + 2]; tot = 1; }
      px[o] = rr / tot; px[o + 1] = gg / tot; px[o + 2] = bb / tot; px[o + 3] = 255;
    }
  }
  return px;
}

/**
 * Multiplies each field, cell by cell, by how far its own peak nearby is under PEAK_TARGET (see there). In place. The peak is the
 * largest share in the 3 x 3 blocks of 2 r cells around the cell (at least the blur's reach): one pass over the cells to fill the blocks,
 * a handful of reads for the cells near a border.
 */
function liftThinClasses(fields: Float32Array[], w: number, h: number, r: number): void {
  const bs = 2 * r, bw = Math.ceil(w / bs), bh = Math.ceil(h / bs);
  const blocks = new Float32Array(bw * bh);
  for (const a of fields) {
    blocks.fill(0);
    for (let k = 0; k < h; k++) {
      const row = ((k / bs) | 0) * bw;
      for (let i = 0; i < w; i++) {
        const b = row + ((i / bs) | 0), v = a[k * w + i];
        if (v > blocks[b]) blocks[b] = v;
      }
    }
    const gain = new Float32Array(w * h).fill(1);
    let any = false;
    for (let k = 0; k < h; k++) {
      const by = (k / bs) | 0, by0 = Math.max(0, by - 1), by1 = Math.min(bh - 1, by + 1);
      for (let i = 0; i < w; i++) {
        const v = a[k * w + i];
        if (v < FIELD_EPS || v >= 1 / PEAK_TARGET) continue; // absent, or already as strong as a wide class (its peak is no lower)
        const bx = (i / bs) | 0, bx0 = Math.max(0, bx - 1), bx1 = Math.min(bw - 1, bx + 1);
        let peak = v;
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const p = blocks[y * bw + x]; if (p > peak) peak = p; }
        if (peak < 1 / PEAK_TARGET) { // eased in from a peak of 0.8 down to 0.3, so a border between two wide classes does not move
          const t = Math.min(1, (1 / PEAK_TARGET - peak) / (1 / PEAK_TARGET - THIN_PEAK));
          gain[k * w + i] = 1 + t * t * (Math.min(GAIN_MAX, PEAK_TARGET / peak) - 1); any = true;
        }
      }
    }
    if (any) for (let j = 0; j < a.length; j++) a[j] *= gain[j];
  }
}
