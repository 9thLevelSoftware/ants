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

/** Fills RGBA `px` (size x size) with the zone plate under the window; returns it. */
export function paintPlate(px: Uint8ClampedArray, size: number, plate: MinimapPlate, f: Pick<MinimapFrame, 'cx' | 'cz' | 'windowMm'>): Uint8ClampedArray {
  const { map, typeById } = plate;
  const x0 = f.cx - f.windowMm / 2, z0 = f.cz - f.windowMm / 2, step = f.windowMm / size;
  const tints = typeById.map((t) => tintOfZone(t));
  let i = 0;
  for (let py = 0; py < size; py++) {
    const wz = z0 + (py + 0.5) * step;
    const iz = Math.floor(wz / map.cell);
    for (let pxl = 0; pxl < size; pxl++, i += 4) {
      const ix = Math.floor((x0 + (pxl + 0.5) * step) / map.cell);
      const inWorld = ix >= 0 && iz >= 0 && ix < map.nx && iz < map.nz;
      const t = inWorld ? (tints[map.data[iz * map.nx + ix]] ?? UNKNOWN_TINT) : VOID_TINT;
      px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255;
    }
  }
  return px;
}
