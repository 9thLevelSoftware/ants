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

/** Weight 0..1 of a class given its blurred share: a short ramp about one half, so a border is a clean smooth line about a pixel or two wide. */
const sharpen = (w: number): number => {
  const t = Math.min(1, Math.max(0, (w - 0.5) * 6 + 0.5));
  return t * t * (3 - 2 * t);
};

/** Cubic B-spline weights of the four cells round a sample at fraction f (0..1) between the two middle cells. */
function bspline(f: number, out: number[]): void {
  const f2 = f * f, f3 = f2 * f;
  out[0] = (1 - 3 * f + 3 * f2 - f3) / 6;
  out[1] = (4 - 6 * f2 + 3 * f3) / 6;
  out[2] = (1 + 3 * f + 3 * f2 - 3 * f3) / 6;
  out[3] = f3 / 6;
}

/**
 * Fills RGBA `px` (size x size) with the zone plate under the window; returns it. Each pixel reads the 4 x 4 zone cells round it
 * and weights every class with a cubic B-spline (the blurred class indicator), sharpens the weights around one half and blends
 * the tints: class borders are smooth curves at the plate's own pixel resolution, not the zone map's cell staircase (look pass 4:
 * a plain bilinear blend still left the cell steps). Pixels whose 16 cells are all one class (nearly all of them) take the tint at once.
 */
export function paintPlate(px: Uint8ClampedArray, size: number, plate: MinimapPlate, f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>): Uint8ClampedArray {
  const { map, typeById } = plate;
  const x0 = f.cx - f.windowMm / 2, z0 = f.cz - f.windowMm / 2, step = f.windowMm / size;
  const tints = typeById.map((t) => tintOfZone(t));
  const classAt = (ix: number, iz: number): number => (ix >= 0 && iz >= 0 && ix < map.nx && iz < map.nz ? map.data[iz * map.nx + ix] : -1);
  const wx = [0, 0, 0, 0], wz = [0, 0, 0, 0];
  const cls = new Array<number>(16), wt = new Array<number>(16);
  let i = 0;
  for (let py = 0; py < size; py++) {
    const gz = (z0 + (py + 0.5) * step) / map.cell - 0.5, iz = Math.floor(gz);
    for (let pxl = 0; pxl < size; pxl++, i += 4) {
      const gx = (x0 + (pxl + 0.5) * step) / map.cell - 0.5, ix = Math.floor(gx);
      let same = true;
      const c0 = classAt(ix, iz);
      for (let k = 0; k < 4 && same; k++) for (let m = 0; m < 4; m++) {
        const c = classAt(ix - 1 + m, iz - 1 + k);
        cls[k * 4 + m] = c;
        if (c !== c0) { same = false; if (m === 3 && k === 3) break; }
      }
      if (same) { // away from a border: one class, no blending
        const t = c0 < 0 ? VOID_TINT : (tints[c0] ?? UNKNOWN_TINT);
        px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255;
        continue;
      }
      // the loop above stops filling at the first mismatch: fill the rest
      for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) cls[k * 4 + m] = classAt(ix - 1 + m, iz - 1 + k);
      bspline(gx - ix, wx); bspline(gz - iz, wz);
      for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) wt[k * 4 + m] = wz[k] * wx[m];
      let r = 0, g = 0, b = 0, sum = 0;
      for (let a = 0; a < 16; a++) {
        if (wt[a] <= 0) continue;
        let w = wt[a];
        for (let m = a + 1; m < 16; m++) if (cls[m] === cls[a]) { w += wt[m]; wt[m] = 0; }
        const s = sharpen(w);
        const t = cls[a] < 0 ? VOID_TINT : (tints[cls[a]] ?? UNKNOWN_TINT);
        r += t[0] * s; g += t[1] * s; b += t[2] * s; sum += s;
      }
      if (sum <= 0) { const t = c0 < 0 ? VOID_TINT : (tints[c0] ?? UNKNOWN_TINT); r = t[0]; g = t[1]; b = t[2]; sum = 1; }
      px[i] = r / sum; px[i + 1] = g / sum; px[i + 2] = b / sum; px[i + 3] = 255;
    }
  }
  return px;
}
