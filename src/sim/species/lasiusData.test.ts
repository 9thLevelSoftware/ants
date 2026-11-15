// Lasius niger data against the registry (00-index C1, C5; GDD 02 §2.2 and §3.2, GDD 06 §1.6).
import { describe, expect, it } from 'vitest';
import type { Curve } from '@/sim/types';
import { requireSpecies } from '@/sim/species';

/** Piecewise-linear lookup, clamped at both ends. */
function at(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

const life = requireSpecies('lasius-niger').life;

describe('Lasius niger life history and start window', () => {
  it('devRate follows r(T): (T - 10) / 11 to 30 °C, 1.818 to 32, 0.909 at 34, 0 from 36 °C', () => {
    for (const t of [10, 15, 20, 25, 30]) expect(at(life.devRate, t), `${t}`).toBeCloseTo((t - 10) / 11, 2);
    expect(at(life.devRate, 32)).toBeCloseTo(1.818, 3);
    expect(at(life.devRate, 34)).toBeCloseTo(0.909, 3);
    for (const t of [36, 37, 38]) expect(at(life.devRate, t), `${t}`).toBe(0);
  });

  it('fSeason is keyed on the 0-based d28 (GDD 02 §3.2)', () => {
    const cases: [number, number][] = [[0, 0.3], [0.9, 0.3], [2.5, 0.65], [4, 1], [13.9, 1], [15, 0.6], [18, 0.2], [20.5, 0], [27.9, 0]];
    for (const [d28, f] of cases) expect(at(life.fSeason, d28), `d28 ${d28}`).toBeCloseTo(f, 2);
  });

  it('the natural start window is doy 9-12, default 10 (C1)', () => {
    expect(requireSpecies('lasius-niger').opening.startDoy).toEqual({ min: 9, max: 12, default: 9 });
  });
});
