import { describe, expect, it } from 'vitest';
import type { MinimapPlate } from '@/game/uiBridge/minimap';
import { fromBox, paintPlate, tintOfZone, toBox, VOID_TINT, ZONE_TINTS } from './model';

const frame = { cx: 100, cz: 100, windowMm: 200 };

describe('minimap geometry', () => {
  it('the centre maps to the middle of the box; north (smaller z) is up', () => {
    expect(toBox(frame, 100, 100)).toEqual({ u: 0.5, v: 0.5 });
    expect(toBox(frame, 100, 0).v).toBeCloseTo(0);
    expect(toBox(frame, 200, 100).u).toBeCloseTo(1);
  });
  it('fromBox is the inverse of toBox', () => {
    const b = toBox(frame, 123, 77);
    const w = fromBox(frame, b.u, b.v);
    expect(w.x).toBeCloseTo(123);
    expect(w.z).toBeCloseTo(77);
  });
});

/** A zone grid of `n` x `n` cells where each quadrant of the 2 x 2 layout in `q` (row-major) is one block of n / 2 cells. */
function quadrants(q: number[], n: number, cell: number) {
  const data = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) data[z * n + x] = q[(z < n / 2 ? 0 : 2) + (x < n / 2 ? 0 : 1)];
  return { cell, nx: n, nz: n, data };
}

describe('zone plate', () => {
  // a 200 mm world of 24 x 24 cells, four zones in quadrants: forest | lawn / pavement | forest. Outside is the void.
  const plate: MinimapPlate = { map: quadrants([1, 2, 3, 1], 24, 200 / 24), typeById: ['', 'forest', 'lawn', 'pavement'], size: 200, structures: [], water: [] };
  const at = (px: Uint8ClampedArray, size: number, x: number, y: number) => Array.from(px.slice((y * size + x) * 4, (y * size + x) * 4 + 3));

  it('paints each zone its flat tint and the area outside the world the void colour', () => {
    const size = 64;
    // window = the whole world: centre (100, 100), 200 mm
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 100, cz: 100, windowMm: 200 });
    expect(at(px, size, 16, 16)).toEqual([...ZONE_TINTS.forest]);
    expect(at(px, size, 48, 16)).toEqual([...ZONE_TINTS.lawn]);
    expect(at(px, size, 16, 48)).toEqual([...ZONE_TINTS.pavement]);
    // window shifted left by half a window: the left half is outside the world
    const sh = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 0, cz: 100, windowMm: 200 });
    expect(at(sh, size, 8, 20)).toEqual([...VOID_TINT]);
    expect(at(sh, size, 48, 16)).toEqual([...ZONE_TINTS.forest]);
  });
  it('every zone type has a tint and they are all different', () => {
    const seen = new Set(Object.values(ZONE_TINTS).map((t) => t.join(',')));
    expect(seen.size).toBe(Object.keys(ZONE_TINTS).length);
    expect(tintOfZone('nonsense')).toBeDefined();
  });
});

describe('paintPlate smooths the class borders (look pass 4)', () => {
  it('a diagonal border is a line at the pixel resolution, not the zone cells\' staircase', () => {
    const nx = 8, nz = 8, cell = 1000;
    const data = new Uint8Array(nx * nz);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) data[z * nx + x] = x >= z ? 1 : 2; // lawn above the diagonal, asphalt below
    const plate = { map: { cell, nx, nz, data }, typeById: ['', 'lawn', 'asphalt'], size: 8000, structures: [], water: [] };
    const size = 128;
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 4000, cz: 4000, windowMm: 8000 });
    // the first pixel of each row that is closer to lawn than to asphalt
    const lawn = ZONE_TINTS.lawn, asph = ZONE_TINTS.asphalt;
    const edge: number[] = [];
    for (let y = 0; y < size; y++) {
      let e = size;
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (Math.abs(px[i] - lawn[0]) < Math.abs(px[i] - asph[0])) { e = x; break; }
      }
      edge.push(e);
    }
    const distinct = new Set(edge.slice(16, 112)).size;
    expect(distinct).toBeGreaterThan(60); // a staircase of 8 cells would give 8 values; a line gives about one per row
    for (let y = 17; y < 112; y++) expect(Math.abs(edge[y] - edge[y - 1])).toBeLessThanOrEqual(2);
  });
});

describe('paintPlate smooths blocky borders at the real zone resolution (look pass 4)', () => {
  it('a diagonal made of 4-cell blocks at 2.75 px a cell (the live plate) is a line, not 11 px steps', () => {
    const nx = 64, nz = 64, cell = 16, data = new Uint8Array(nx * nz); // the window of the live game: 64 cells over 176 px
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) data[z * nx + x] = Math.floor(x / 4) >= Math.floor(z / 4) ? 1 : 2;
    const plate = { map: { cell, nx, nz, data }, typeById: ['', 'lawn', 'asphalt'], size: 1024, structures: [], water: [] };
    const size = 176;
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 512, cz: 512, windowMm: 1024 });
    const lawn = ZONE_TINTS.lawn, asph = ZONE_TINTS.asphalt;
    const edge: number[] = [];
    for (let y = 20; y < 156; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (Math.abs(px[i] - lawn[0]) < Math.abs(px[i] - asph[0])) { edge.push(x); break; }
      }
    }
    let maxJump = 0;
    for (let k = 1; k < edge.length; k++) maxJump = Math.max(maxJump, Math.abs(edge[k] - edge[k - 1]));
    expect(maxJump).toBeLessThanOrEqual(3); // 4-cell blocks would jump 11 px at every block row
  });
});

describe('paintPlate smooths a curved border made of cell steps (look pass 4)', () => {
  it('a disc of zone cells has an outline that moves about once per pixel row, not once per cell row', () => {
    const nx = 24, nz = 24, cell = 1000, data = new Uint8Array(nx * nz);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) data[z * nx + x] = Math.hypot(x + 0.5 - 12, z + 0.5 - 12) < 9 ? 1 : 2;
    const plate = { map: { cell, nx, nz, data }, typeById: ['', 'lawn', 'asphalt'], size: 24000, structures: [], water: [] };
    const size = 192; // 8 pixels per cell
    const px = paintPlate(new Uint8ClampedArray(size * size * 4), size, plate, { cx: 12000, cz: 12000, windowMm: 24000 });
    const lawn = ZONE_TINTS.lawn, asph = ZONE_TINTS.asphalt;
    const edge: number[] = [];
    for (let y = 30; y < 162; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (Math.abs(px[i] - lawn[0]) < Math.abs(px[i] - asph[0])) { edge.push(x); break; }
      }
    }
    expect(new Set(edge).size).toBeGreaterThan(30); // cell steps would give about 12 values over these rows
    let big = 0;
    for (let k = 1; k < edge.length; k++) if (Math.abs(edge[k] - edge[k - 1]) > 3) big++;
    expect(big).toBeLessThan(6); // only the top and bottom of the disc, where the outline is almost flat, may jump
  });
});
