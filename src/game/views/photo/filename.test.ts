import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { filenamePartsOf, photoFilename } from './filename';

describe('capture file name (GDD 08 7.9)', () => {
  it('foundress-<seed>-y<year>-<season>-d<day>-<hhmm>.png', () => {
    expect(photoFilename({ seed: 12345, year: 1, season: 'Summer', day: 3, hour: 7.6667 })).toBe('foundress-12345-y1-summer-d3-0740.png');
    expect(photoFilename({ seed: 7, year: 2, season: 'winter', day: 12, hour: 23.999 })).toBe('foundress-7-y2-winter-d12-2359.png');
  });
  it('is safe for odd input', () => {
    const n = photoFilename({ seed: -1, year: 0, season: '../x y', day: NaN as unknown as number, hour: 99 });
    expect(n).toMatch(/^foundress-\d+-y1-[a-z]+-d\d+-\d{4}\.png$/);
    expect(n).not.toContain('/');
  });
  it('reads the parts from a sim', () => {
    const sim = makeTestSim({ seed: 9 });
    const p = filenamePartsOf(sim);
    expect(p.seed).toBe(9);
    expect(photoFilename(p)).toMatch(/^foundress-9-y\d+-(spring|summer|autumn|winter)-d\d+-\d{4}\.png$/);
  });
});
