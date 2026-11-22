// app-seams-2 review: the minimap's pure mapping (north up = -Z at the top of the box, click maps back to the same
// world point) and the zone plate (void tint outside the world, a tint for every zone type).
import { describe, expect, it } from 'vitest';
import { ZONE_TYPES } from '@/sim/types';
import { fromBox, MINIMAP_SIZE_DP, paintPlate, toBox, VOID_TINT, ZONE_TINTS } from './model';

const f = { cx: 2000, cz: 3000, windowMm: 1024 };

describe('minimap mapping (review)', () => {
  it('north (-Z) is at the top, east (+X) on the right, the centre in the middle', () => {
    expect(toBox(f, 2000, 3000)).toEqual({ u: 0.5, v: 0.5 });
    expect(toBox(f, 2000, 3000 - 512).v).toBeCloseTo(0);
    expect(toBox(f, 2000 + 512, 3000).u).toBeCloseTo(1);
  });
  it('fromBox inverts toBox', () => {
    for (const [x, z] of [[1500, 2600], [2400, 3500], [2000, 3000]]) {
      const b = toBox(f, x, z);
      const p = fromBox(f, b.u, b.v);
      expect(p.x).toBeCloseTo(x);
      expect(p.z).toBeCloseTo(z);
    }
  });
  it('every zone type of the sim has its own tint', () => {
    for (const z of ZONE_TYPES) expect(ZONE_TINTS[z], z).toBeDefined();
  });
  it('the plate is void outside the world and the zone tint inside, row 0 = north', () => {
    const nx = 64, nz = 64, cell = 62.5; // 4000 mm square
    const data = new Uint8Array(nx * nz);
    data.fill(1);
    for (let z = 0; z < 16; z++) for (let i = 0; i < nx; i++) data[z * nx + i] = 2; // the northern quarter (z 0..1000) is another zone
    const plate = { map: { cell, nx, nz, data }, typeById: ['', 'lawn', 'asphalt'], size: 4000, structures: [], water: [] };
    const size = 128;
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 2000, cz: 1000, windowMm: 4000 });
    const at = (x: number, y: number) => Array.from(px.slice((y * size + x) * 4, (y * size + x) * 4 + 3));
    expect(at(64, 2)).toEqual([...VOID_TINT]); // z < 0: outside the world
    expect(at(64, 50)).toEqual([...ZONE_TINTS.asphalt]); // z in 0..1000: the northern quarter
    expect(at(64, 100)).toEqual([...ZONE_TINTS.lawn]);
    expect(MINIMAP_SIZE_DP).toBe(176);
  });
});
