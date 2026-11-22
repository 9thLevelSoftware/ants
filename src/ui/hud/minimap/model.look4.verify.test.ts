// Review of look-pass-4 item 4 (the minimap plate). The spec: draw the ground classes at the plate's pixel resolution
// with smoothed borders, and "keep the cost of a repaint as it is now". These tests check that small zones survive the
// smoothing at the live resolution (64 zone cells of 16 mm over 176 px, zones painted in 4-cell blocks by worldgen), the
// edge cases of the window, and the repaint cost against the nearest-cell painter that was there before the task.
import { describe, expect, it } from 'vitest';
import { paintPlate, VOID_TINT, ZONE_TINTS, tintOfZone } from './model';
import type { MinimapPlate } from '@/game/uiBridge/minimap';

const SIZE = 176, CELL = 16, N = 64, WIN = N * CELL; // the live window: 256 BU at BU 4
/** A world twice the window on each side, so the window never sees the world edge (the void blurs in from there). */
const W = 2 * N, MID = (W * CELL) / 2;

function plateOf(data: Uint8Array, nx = W, nz = W, cell = CELL): MinimapPlate {
  return { map: { cell, nx, nz, data }, typeById: ['', 'lawn', 'asphalt'], size: nx * cell, structures: [], water: [] };
}

/** Share of plate pixels closer to the asphalt tint than to the lawn tint. */
function asphaltShare(px: Uint8ClampedArray): number {
  const l = ZONE_TINTS.lawn, a = ZONE_TINTS.asphalt;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const dl = Math.abs(px[i] - l[0]) + Math.abs(px[i + 1] - l[1]) + Math.abs(px[i + 2] - l[2]);
    const da = Math.abs(px[i] - a[0]) + Math.abs(px[i + 1] - a[1]) + Math.abs(px[i + 2] - a[2]);
    if (da < dl) n++;
  }
  return n / (px.length / 4);
}

/** The painter before look pass 4 (git 19a5875 model.ts): nearest zone cell per pixel. */
function nearestPainter(px: Uint8ClampedArray, size: number, plate: MinimapPlate, f: { cx: number; cz: number; windowMm: number }): Uint8ClampedArray {
  const { map, typeById } = plate;
  const x0 = f.cx - f.windowMm / 2, z0 = f.cz - f.windowMm / 2, step = f.windowMm / size;
  const tints = typeById.map((t) => tintOfZone(t));
  let i = 0;
  for (let py = 0; py < size; py++) {
    const iz = Math.floor((z0 + (py + 0.5) * step) / map.cell);
    for (let pxl = 0; pxl < size; pxl++, i += 4) {
      const ix = Math.floor((x0 + (pxl + 0.5) * step) / map.cell);
      const inWorld = ix >= 0 && iz >= 0 && ix < map.nx && iz < map.nz;
      const t = inWorld ? (tints[map.data[iz * map.nx + ix]] ?? VOID_TINT) : VOID_TINT;
      px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = 255;
    }
  }
  return px;
}

describe('minimap plate after look pass 4 (review)', () => {
  it('a window wholly outside the world is the void colour', () => {
    const px = paintPlate(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, plateOf(new Uint8Array(W * W).fill(1)), { cx: -5000, cz: -5000, windowMm: WIN });
    for (let i = 0; i < px.length; i += 4) expect([px[i], px[i + 1], px[i + 2]]).toEqual([...VOID_TINT]);
  });

  it('every pixel is a finite opaque colour when the window straddles the world corner with three classes', () => {
    const data = new Uint8Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) data[z * W + x] = x < 32 ? 1 : 2;
    const px = paintPlate(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, plateOf(data), { cx: 0, cz: 0, windowMm: WIN });
    for (let i = 0; i < px.length; i += 4) expect(px[i + 3]).toBe(255);
  });

  it('a one-block zone (4 x 4 cells, 16 BU square: the smallest zone worldgen paints) stays on the map', () => {
    const data = new Uint8Array(W * W).fill(1);
    for (let z = 62; z < 66; z++) for (let x = 62; x < 66; x++) data[z * W + x] = 2;
    const px = paintPlate(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, plateOf(data), { cx: MID, cz: MID, windowMm: WIN });
    // 16 cells of 2.75 px = 121 px of 30976; the nearest-cell painter shows them all
    expect(asphaltShare(px) * SIZE * SIZE, 'the block is erased by the border blur').toBeGreaterThan(40);
  });

  it('a two-block-wide strip (8 cells, 32 BU) stays on the map', () => {
    const data = new Uint8Array(W * W).fill(1);
    for (let z = 0; z < W; z++) for (let x = 60; x < 68; x++) data[z * W + x] = 2;
    const px = paintPlate(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, plateOf(data), { cx: MID, cz: MID, windowMm: WIN });
    expect(asphaltShare(px)).toBeGreaterThan(0.08); // nearest-cell: 12.5 %
  });

  it('a one-block-wide strip (4 cells, 16 BU: a path or verge) stays on the map', () => {
    const data = new Uint8Array(W * W).fill(1);
    for (let z = 0; z < W; z++) for (let x = 62; x < 66; x++) data[z * W + x] = 2;
    const px = paintPlate(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, plateOf(data), { cx: MID, cz: MID, windowMm: WIN });
    // nearest-cell: 4 / 64 of the plate = 6.25 %
    expect(asphaltShare(px), 'the strip is erased by the border blur').toBeGreaterThan(0.03);
  });

  it('repaint cost with a border in the window stays near the cost before the task (spec: "keep the cost of a repaint as it is now")', () => {
    const data = new Uint8Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) data[z * W + x] = Math.floor(x / 4) >= Math.floor(z / 4) ? 1 : 2;
    const plate = plateOf(data), f = { cx: MID, cz: MID, windowMm: WIN };
    const buf = new Uint8ClampedArray(SIZE * SIZE * 4);
    const best = (fn: () => void): number => {
      let m = Infinity;
      for (let k = 0; k < 25; k++) { const t0 = performance.now(); fn(); m = Math.min(m, performance.now() - t0); }
      return m;
    };
    best(() => paintPlate(buf, SIZE, plate, f)); best(() => nearestPainter(buf, SIZE, plate, f)); // warm the JIT
    const now = best(() => paintPlate(buf, SIZE, plate, f)), before = best(() => nearestPainter(buf, SIZE, plate, f));
    console.log(`[look4 review] paintPlate 176 px with a border: ${now.toFixed(3)} ms, nearest-cell painter ${before.toFixed(3)} ms (x${(now / before).toFixed(1)})`);
    // generous: three times the old painter (same process, so machine load mostly cancels out)
    expect(now).toBeLessThan(3 * before);
  });
});
