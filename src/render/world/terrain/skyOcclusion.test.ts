// Static sky occlusion of the ground: dark under a raised box (a car body), a soft ring of contact darkening round a
// footprint resting on the ground, open sky elsewhere; tall overhangs occlude less; huge spans (a ceiling) and lying
// primitives are skipped.
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { buildSkyOcclusion } from './skyOcclusion';
import { SKY_OCCLUSION } from './terrainQuality';

const box = (id: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = { x: 0, y: 0, z: 0, w: 1 }): Primitive =>
  ({ id, shape: 'box', pos: { x, y, z }, rot, size: { x: sx, y: sy, z: sz }, round: 0, material: 'metal', flags: 0, objectId: -1 });
const flat = () => 0;
const at = (m: ReturnType<typeof buildSkyOcclusion>, x: number, z: number) => m.data[Math.floor(z / m.cell) * m.nx + Math.floor(x / m.cell)] / 255;

describe('buildSkyOcclusion', () => {
  it('darkens the ground under a raised body and leaves open ground open', () => {
    const m = buildSkyOcclusion([box(1, 1000, 400, 1000, 400, 150, 900)], flat, 4096);
    expect(at(m, 1000, 1000)).toBeGreaterThan(0.5);
    expect(at(m, 3500, 3500)).toBe(0);
    // beside it only the raised flank (250..550 mm up) hides some sky: far less than under it, nothing past the skirt
    expect(at(m, 1000, 1000 + 900 + 200)).toBeLessThan(0.5 * at(m, 1000, 1000));
    expect(at(m, 1000, 1000 + 900 + SKY_OCCLUSION.skirtK * 550 + 8 * SKY_OCCLUSION.cellMm)).toBe(0);
  });

  it('a higher overhang of the same width occludes less', () => {
    const low = buildSkyOcclusion([box(1, 1000, 400, 1000, 400, 150, 400)], flat, 2048);
    const high = buildSkyOcclusion([box(1, 1000, 900, 1000, 400, 150, 400)], flat, 2048);
    expect(at(high, 1000, 1000)).toBeLessThan(at(low, 1000, 1000));
    expect(at(high, 1000, 1000)).toBeGreaterThanOrEqual(SKY_OCCLUSION.under * SKY_OCCLUSION.highFloor * 0.9);
  });

  it('rings a footprint that rests on the ground with soft contact darkening', () => {
    const m = buildSkyOcclusion([box(1, 1000, 100, 1000, 100, 100, 100)], flat, 2048);
    const edge = at(m, 1000 + 100 + SKY_OCCLUSION.cellMm, 1000);
    expect(edge).toBeGreaterThan(0.05);
    expect(edge).toBeLessThan(at(m, 1000, 1000));
  });

  it('skips lying primitives and spans bigger than the cell cap', () => {
    const lying = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    expect(Math.max(...buildSkyOcclusion([box(1, 1000, 300, 1000, 50, 300, 50, lying)], flat, 2048).data)).toBe(0);
    const ceiling = box(2, 2000, 2400, 2000, 2000, 10, 2000);
    expect(Math.max(...buildSkyOcclusion([ceiling], flat, 4096).data)).toBe(0);
  });

  it('caps on the footprint area, not its bounding square: a long thin wall gets its contact ring', () => {
    // 4 m x 100 mm: bounding square of the circumradius ~ 250 x 250 cells, footprint only ~1600 cells
    const m = buildSkyOcclusion([box(1, 2048, 1000, 2048, 50, 1000, 2000)], flat, 4096);
    expect(at(m, 2048 + 50 + SKY_OCCLUSION.cellMm, 2048)).toBeGreaterThan(0.05);
  });

  it('bounds a rotated footprint by its oriented extent (45 degrees: the corners of its square stay open)', () => {
    const s = Math.sin(Math.PI / 8), c = Math.cos(Math.PI / 8);
    // a low slab (35 mm tall: no skirt), so only the footprint itself is occluded
    const m = buildSkyOcclusion([box(1, 1024, 25, 1024, 300, 10, 300, { x: 0, y: s, z: 0, w: c })], flat, 2048);
    expect(at(m, 1024, 1024)).toBeGreaterThan(0.5);
    expect(at(m, 1024 + 340, 1024)).toBeGreaterThan(0.3); // the diamond reaches 424 mm along x (past hx = 300)
    expect(at(m, 1024 + 330, 1024 + 330)).toBeLessThan(0.05); // outside the diamond, inside its axis-aligned square
  });

  it('shades the ground beside a tall body, fading with distance (the flank of a parked car)', () => {
    // a car-like body 900 mm tall standing on the ground, 1800 x 4300
    const m = buildSkyOcclusion([box(1, 3000, 450, 3000, 900, 450, 2150)], flat, 6000);
    const near = at(m, 3000 + 900 + 150, 3000), mid = at(m, 3000 + 900 + 600, 3000), far = at(m, 3000 + 900 + 1500, 3000);
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeLessThan(0.55);
    expect(mid).toBeLessThan(near);
    expect(mid).toBeGreaterThan(0.1);
    expect(far).toBeLessThan(0.02);
    // a thin post of the same height hides far less sky than the long flank at the same distance
    const post = buildSkyOcclusion([{ ...box(1, 3000, 450, 3000, 40, 450, 40), shape: 'cylinder' }], flat, 6000);
    expect(at(post, 3000 + 40 + 150, 3000)).toBeLessThan(near * 0.5);
  });

  it('is deterministic', () => {
    const prims = [box(1, 500, 200, 500, 120, 60, 300), box(2, 900, 30, 700, 40, 30, 40)];
    expect(buildSkyOcclusion(prims, flat, 2048).data).toEqual(buildSkyOcclusion(prims, flat, 2048).data);
  });
});
