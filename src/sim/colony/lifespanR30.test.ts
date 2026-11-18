// Ruling R30 (Nov 18; replaces R11, GDD 02 §1.3 deviation): workers live 42 gd (sd 8; 30 at N >= 250), first workers
// 34 gd (sd 8, clamp floor 16), and age x1.5 outside the nest (was x3). Queens, gynes and males are unchanged.
import { describe, expect, it } from 'vitest';
import { BroodFlag } from '@/sim/types';
import { getSpecies } from '@/sim/species';
import { NANITIC_LIFESPAN_MEAN_GD, LIFESPAN_CLAMP_GD } from '@/sim/balance/colony';
import { addBrood, addChamber, establishQueen, makeColonySim, step } from './testkit';
import { ecloseBrood } from './brood';

/** Ecloses n ready pupae (nanitic or not) and returns the drawn lifespans. */
function ecloseMany(n: number, nanitic: boolean): number[] {
  const sim = makeColonySim({ noAllocation: true });
  const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  addBrood(sim, 'pupa', n, ch, 0.999);
  for (const b of sim.stores.brood.list) {
    if (nanitic) b.flags |= BroodFlag.NANITIC;
    else b.flags &= ~BroodFlag.NANITIC;
  }
  step(sim, 40);
  const out: number[] = [];
  for (const b of [...sim.stores.brood.list]) {
    if (!b.alive || (b.flags & BroodFlag.READY) === 0) continue;
    const ant = ecloseBrood(sim, b.id, -1);
    if (ant) out.push(ant.lifespanGd);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('R30 worker lifespans', () => {
  it('the reference species: workers 42 gd (sd 8), 30 at N >= 250, ageing outside x1.5, dormant 0.15; queen unchanged', () => {
    const def = getSpecies('lasius-niger')!;
    const worker = def.castes.find((c) => c.caste === 'worker')!;
    expect(worker.lifespanGd).toEqual({ mean: 42, sd: 8 });
    expect(worker.lifespanBySize).toEqual([[100, 42], [250, 30]]);
    expect(worker.ageRateOutside).toBe(1.5);
    expect(worker.ageRateDormant).toBe(0.15);
    expect(def.castes.find((c) => c.caste === 'queen')!.lifespanGd).toEqual({ mean: 560, sd: 60 });
  });

  it('a first worker draws about 34 gd and never less than 16 (200 eclosions)', () => {
    const spans = ecloseMany(200, true);
    expect(spans.length).toBe(200);
    expect(NANITIC_LIFESPAN_MEAN_GD).toBe(34);
    expect(LIFESPAN_CLAMP_GD[0]).toBe(16);
    expect(Math.abs(mean(spans) - 34)).toBeLessThan(1.5);
    expect(Math.min(...spans)).toBeGreaterThanOrEqual(16);
  });

  it('a regular worker of a colony under 100 draws about 42 gd (80 eclosions; the mean falls above N = 100)', () => {
    const spans = ecloseMany(80, false);
    expect(spans.length).toBe(80);
    expect(Math.abs(mean(spans) - 42)).toBeLessThan(2.5);
  });

  it('arithmetic of the ruling: a first worker that spends half her time outside lives a whole first season', () => {
    // 34 gd of physiological age at 0.5 x 1 + 0.5 x 1.5 = 1.25 per gd = 27 gd of game time; the first year after an R20
    // hand-over is about 12 gd, so the mean first worker reaches winter (with the old 24 gd and x3 she had 12 gd).
    const def = getSpecies('lasius-niger')!;
    const rate = 0.5 * 1 + 0.5 * def.castes.find((c) => c.caste === 'worker')!.ageRateOutside;
    expect(NANITIC_LIFESPAN_MEAN_GD / rate).toBeGreaterThan(24);
  });
});
