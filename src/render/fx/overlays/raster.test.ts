import { describe, expect, it } from 'vitest';
import { FieldRaster, isothermSpots, regionFor, sameRegion, texelAt } from './raster';
import { countdownText, decodeTemp, encodeTemp } from './samplers';
import { TEMP_MAX_C, TEMP_MIN_C } from './tuning';

describe('ground field raster', () => {
  it('fills the back buffer a few rows per step and swaps whole images only', () => {
    const r = new FieldRaster(8);
    r.start({ x0: 0, z0: 0, size: 80 }, { sample: (x, _z, out) => { out[0] = x / 80; out[1] = 1; } });
    expect(r.step(3)).toBe(false);
    expect(r.frontRegion).toBeNull(); // nothing shown until the pass completes
    expect(r.step(3)).toBe(false);
    expect(r.step(3)).toBe(true);
    expect(r.frontRegion).toEqual({ x0: 0, z0: 0, size: 80 });
    expect(r.texel(0, 0, 0)).toBeCloseTo(5 / 80, 2); // texel centres
    expect(r.texel(7, 3, 0)).toBeCloseTo(75 / 80, 2);
    expect(r.version).toBe(1);
  });

  it('a new pass replaces an unfinished one', () => {
    const r = new FieldRaster(4);
    r.start({ x0: 0, z0: 0, size: 4 }, { sample: (_x, _z, out) => { out[0] = 0.2; } });
    r.step(2);
    r.start({ x0: 10, z0: 0, size: 4 }, { sample: (_x, _z, out) => { out[0] = 0.8; } });
    r.step(Infinity);
    expect(r.frontRegion!.x0).toBe(10);
    expect(r.texel(0, 0, 0)).toBeCloseTo(0.8, 2);
  });

  it('region follows the camera height on a fixed ladder and snaps so small moves keep it', () => {
    const bu = 4;
    const a = regionFor(1000, 1000, 100, bu, 7, 120, 900, 16);
    const b = regionFor(1003, 998, 104, bu, 7, 120, 900, 16);
    expect(sameRegion(a, b)).toBe(true);
    const hi = regionFor(1000, 1000, 4000, bu, 7, 120, 900, 16);
    expect(hi.size).toBeGreaterThan(a.size);
    expect(hi.size).toBeLessThanOrEqual(900 * bu);
    expect(regionFor(0, 0, 1, bu, 7, 120, 900, 16).size).toBe(120 * bu);
  });

  it('temperature encoding round-trips over the legend scale; labels sit where an isotherm crosses', () => {
    for (const c of [TEMP_MIN_C, 0, 12.5, 30, TEMP_MAX_C]) expect(decodeTemp(encodeTemp(c))).toBeCloseTo(c, 6);
    const r = new FieldRaster(32);
    // a west-east gradient from 5 to 35 C: the 10, 20 and 30 C isotherms are crossed
    r.start({ x0: 0, z0: 0, size: 32 }, { sample: (x, _z, out) => { out[0] = encodeTemp(5 + (30 * x) / 32); out[1] = 1; } });
    r.step(Infinity);
    const spots = isothermSpots(r, decodeTemp, 10, 8, 6);
    const values = new Set(spots.map((s) => s.c));
    expect([...values].sort()).toEqual([10, 20, 30]);
    for (const s of spots) expect(Math.abs(decodeTemp(r.texel(s.i, s.j, 0)) - s.c)).toBeLessThan(1.5);
  });

  it('countdown words in game time', () => {
    expect(countdownText(500)).toBe('in 2 h');
    expect(countdownText(125)).toBe('in 30 min');
    expect(countdownText(1)).toBe('in 1 min');
  });
});

describe('texelAt', () => {
  const r = { x0: 100, z0: 200, size: 80 };
  it('finds the texel under a world point and nothing outside the region', () => {
    expect(texelAt(r, 8, 100, 200)).toEqual({ i: 0, j: 0 });
    expect(texelAt(r, 8, 145, 275)).toEqual({ i: 4, j: 7 });
    expect(texelAt(r, 8, 180, 210)).toBeNull();
    expect(texelAt(r, 8, 99, 210)).toBeNull();
    expect(texelAt(r, 8, 120, 280)).toBeNull();
  });
});
