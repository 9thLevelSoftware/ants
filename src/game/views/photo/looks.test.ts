import { describe, expect, it } from 'vitest';
import { GRADE_GAIN_RANGE, GRADE_SAT_RANGE, neutralGrade } from '@/render/app/look';
import { applyLook, isLookId, LOOKS, LOOK_IDS } from './looks';

describe('photo looks multiply the world grade', () => {
  it('natural changes nothing', () => {
    const base = { saturation: 1.05, gain: [1.1, 1, 0.9] as [number, number, number] };
    const out = applyLook(neutralGrade(), base, 'natural');
    expect(out.saturation).toBeCloseTo(1.05, 9);
    expect(out.gain).toEqual([1.1, 1, 0.9]);
  });
  it('plate is desaturated and warm; cool shifts to blue; warm to red', () => {
    const base = neutralGrade();
    const plate = applyLook(neutralGrade(), base, 'plate');
    expect(plate.saturation).toBeLessThan(0.5);
    expect(plate.gain[0]).toBeGreaterThan(plate.gain[2]);
    const cool = applyLook(neutralGrade(), base, 'cool'), warm = applyLook(neutralGrade(), base, 'warm');
    expect(cool.gain[2]).toBeGreaterThan(cool.gain[0]);
    expect(warm.gain[0]).toBeGreaterThan(warm.gain[2]);
  });
  it('results stay inside the grade ranges, whatever the world grade says', () => {
    for (const id of LOOK_IDS) {
      const out = applyLook(neutralGrade(), { saturation: 50, gain: [100, -3, NaN] }, id);
      expect(out.saturation).toBeLessThanOrEqual(GRADE_SAT_RANGE[1]);
      for (const g of out.gain) { expect(g).toBeGreaterThanOrEqual(GRADE_GAIN_RANGE[0]); expect(g).toBeLessThanOrEqual(GRADE_GAIN_RANGE[1]); }
    }
  });
  it('only plate carries a vignette override (0.62, GDD 08 11)', () => {
    expect(LOOKS.plate.vignette?.darkness).toBe(0.62);
    expect(LOOKS.natural.vignette).toBeNull();
    expect(isLookId('plate')).toBe(true);
    expect(isLookId('sepia')).toBe(false);
  });
});
