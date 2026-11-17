// Ruling R24 (colony-life round 4): the winter lapse takes at most 15 % of the workers on Naturalist, unless a hazard
// the player was alerted to before winter is the cause; then that cause follows the model in full, as in live play.
// Sweep 3's long runs lost 58-64 % in one lapse (car-park-verge #1 and kitchen-door #1: drowning 5 and disease 2 of
// 11-12 workers: one flood draw takes 0.5 of the cluster, one fungus draw U(0.10, 0.25), GDD 06 §6.3).

import { describe, expect, it } from 'vitest';
import { WINT_LAPSE_LOSS_CAP_FRAC } from '@/sim/balance/lifecycle';
import { colonyOf, makeLifeSim, send } from '../succession/testLife';
import { lifecycleOf } from '../succession/lifecycleState';
import { capLapseLosses } from './model';

describe('lapse loss cap (R24)', () => {
  it('trims the causes nobody was alerted to, old age first, and keeps alerted causes in full', () => {
    const drawn = { 'old-age': 1, drowning: 5, disease: 2 };
    const cap = WINT_LAPSE_LOSS_CAP_FRAC * 11; // 1.65 of 11 workers: one worker
    expect(capLapseLosses(drawn, cap, new Set())).toEqual({ 'old-age': 1 });
    expect(capLapseLosses(drawn, cap, new Set(['drowning']))).toEqual({ 'old-age': 1, drowning: 5 });
    expect(capLapseLosses({ cold: 1, disease: 2 }, 2.4, new Set())).toEqual({ cold: 1, disease: 1 });
    expect(capLapseLosses({}, 3, new Set())).toEqual({});
  });

  it('in a flood-prone nest, floods take more than the cap only when the player saw a flood alert before winter', () => {
    const outcome = (seed: number, alerted: boolean): { lost: number; drowned: number } => {
      const sim = makeLifeSim({ chamberC: 4, workers: 20, c: 20, p: 6, seed });
      const col = colonyOf(sim);
      for (const ch of sim.state.nests[0].chambers) ch.floodRisk = 1; // every rain end may flood the cluster
      if (alerted) lifecycleOf(col).hazardAlertTicks = { 'nest-flooding': sim.state.tick };
      send(sim, { type: 'cheat.triggerWinter' });
      send(sim, { type: 'overwinterChoice', choice: 'begin' });
      const rec = col.lifecycle!.winters[0];
      const lost = Object.values(rec.losses).reduce((a, b) => a + b, 0);
      return { lost, drowned: rec.losses.drowning ?? 0 };
    };
    const cap = Math.floor(WINT_LAPSE_LOSS_CAP_FRAC * 20);
    let floodedSeeds = 0;
    for (let seed = 1; seed <= 12; seed++) {
      expect(outcome(seed, false).lost, `seed ${seed}`).toBeLessThanOrEqual(cap);
      if (outcome(seed, true).drowned > cap) floodedSeeds++;
    }
    expect(floodedSeeds).toBeGreaterThan(0); // the model's floods still happen; with the alert they cost what they cost
  }, 120_000);
});
