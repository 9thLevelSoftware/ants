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
    expect(at(m, 200, 200)).toBe(0);
    expect(at(m, 1000, 1000 + 900 + 200)).toBeLessThan(0.05); // 200 mm past the end of the body
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

  it('is deterministic', () => {
    const prims = [box(1, 500, 200, 500, 120, 60, 300), box(2, 900, 30, 700, 40, 30, 40)];
    expect(buildSkyOcclusion(prims, flat, 2048).data).toEqual(buildSkyOcclusion(prims, flat, 2048).data);
  });
});
