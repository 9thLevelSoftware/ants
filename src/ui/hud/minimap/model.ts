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

/** Weight 0..1 of a class given its bilinear share: a short ramp about one half, so a border is a clean smooth line (about a pixel wide), not a blur. */
const sharpen = (w: number): number => {
  const t = Math.min(1, Math.max(0, (w - 0.5) * 2.2 + 0.5));
  return t * t * (3 - 2 * t);
};

/**
 * Fills RGBA `px` (size x size) with the zone plate under the window; returns it. Each pixel reads the four zone cells round
 * it, weights every class bilinearly (the cell centres are the samples), sharpens the weights and blends the tints: class
 * borders are smooth curves at the plate's own pixel resolution instead of the zone map's cell staircase (look pass 4).
 * The cell grid itself is only a few pixels wide per cell at 256 BU, so the curve is mild but never stepped.
 */
export function paintPlate(px: Uint8ClampedArray, size: number, plate: MinimapPlate, f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>): Uint8ClampedArray {
  const { map, typeById } = plate;
  const x0 = f.cx - f.windowMm / 2, z0 = f.cz - f.windowMm / 2, step = f.windowMm / size;
  const tints = typeById.map((t) => tintOfZone(t));
  const cls = [0, 0, 0, 0], wt = [0, 0, 0, 0];
  const classAt = (ix: number, iz: number): number => (ix >= 0 && iz >= 0 && ix < map.nx && iz < map.nz ? map.data[iz * map.nx + ix] : -1);
  let i = 0;
  for (let py = 0; py < size; py++) {
    const gz = (z0 + (py + 0.5) * step) / map.cell - 0.5, iz = Math.floor(gz), fz = gz - iz;
    for (let pxl = 0; pxl < size; pxl++, i += 4) {
      const gx = (x0 + (pxl + 0.5) * step) / map.cell - 0.5, ix = Math.floor(gx), fx = gx - ix;
      cls[0] = classAt(ix, iz); cls[1] = classAt(ix + 1, iz); cls[2] = classAt(ix, iz + 1); cls[3] = classAt(ix + 1, iz + 1);
      if (cls[0] === cls[1] && cls[0] === cls[2] && cls[0] === cls[3]) { // the common case, away from a border: one class, no blending
        const t = cls[0] < 0 ? VOID_TINT : (tints[cls[0]] ?? UNKNOWN_TINT);
        px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255;
        continue;
      }
      wt[0] = (1 - fx) * (1 - fz); wt[1] = fx * (1 - fz); wt[2] = (1 - fx) * fz; wt[3] = fx * fz;
      // total weight of each distinct class among the four, sharpened, then the tints blended by it
      let r = 0, g = 0, b = 0, sum = 0;
      for (let k = 0; k < 4; k++) {
        if (wt[k] <= 0) continue; // zero, or already merged into an earlier cell of the same class
        let w = wt[k];
        for (let m = k + 1; m < 4; m++) if (cls[m] === cls[k]) { w += wt[m]; wt[m] = 0; }
        const s = sharpen(w);
        const t = cls[k] < 0 ? VOID_TINT : (tints[cls[k]] ?? UNKNOWN_TINT);
        r += t[0] * s; g += t[1] * s; b += t[2] * s; sum += s;
      }
      if (sum <= 0) { const t = tints[cls[0]] ?? UNKNOWN_TINT; r = t[0]; g = t[1]; b = t[2]; sum = 1; }
      px[i] = r / sum; px[i + 1] = g / sum; px[i + 2] = b / sum; px[i + 3] = 255;
    }
  }
  return px;
}
