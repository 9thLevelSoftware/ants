// Ruling R24 (colony-life round 4): the winter lapse takes at most 15 % of the workers on Naturalist, unless a hazard
// the player was alerted to before winter is the cause; then that cause follows the model in full, as in live play.
// Sweep 3's long runs lost 58-64 % in one lapse (car-park-verge #1 and kitchen-door #1: drowning 5 and disease 2 of
// 11-12 workers: one flood draw takes 0.5 of the cluster, one fungus draw U(0.10, 0.25), GDD 06 §6.3).

import { describe, expect, it } from 'vitest';
import { WINT_LAPSE_LOSS_CAP_FRAC } from '@/sim/balance/lifecycle';
import { colonyOf, makeLifeSim, send } from '../succession/testLife';
import { lifecycleOf } from '../succession/lifecycleState';
import { rngSeed } from '@/core/rng';
import { capLapseLosses, runWinterModel, sparedWorkersFood, type WinterInput, type WinterParams } from './model';

describe('lapse loss cap (R24)', () => {
  it('trims the causes nobody was alerted to, old age first, and keeps alerted causes in full', () => {
    const drawn = { 'old-age': 1, drowning: 5, disease: 2 };
    const cap = WINT_LAPSE_LOSS_CAP_FRAC * 11; // 1.65 of 11 workers: one worker
    expect(capLapseLosses(drawn, cap, new Set())).toEqual({ 'old-age': 1 });
    expect(capLapseLosses(drawn, cap, new Set(['drowning']))).toEqual({ 'old-age': 1, drowning: 5 });
    expect(capLapseLosses({ cold: 1, disease: 2 }, 2.4, new Set())).toEqual({ cold: 1, disease: 1 });
    expect(capLapseLosses({}, 3, new Set())).toEqual({});
  });

  // Restated in round 8 (direction 15: "against R24 unless they were alerted before choosing"): the flood alert counts
  // when it stood at the choice, from the winter notice to Begin; one from an earlier autumn flood does not.
  it('in a flood-prone nest, floods take more than the cap only when a flood alert stood at the winter choice', () => {
    const outcome = (seed: number, alerted: boolean | 'earlier'): { lost: number; drowned: number } => {
      const sim = makeLifeSim({ chamberC: 4, workers: 20, c: 20, p: 6, seed });
      const col = colonyOf(sim);
      for (const ch of sim.state.nests[0].chambers) ch.floodRisk = 1; // every rain end may flood the cluster
      const life = lifecycleOf(col);
      if (alerted === true) { life.noticeTick = sim.state.tick; life.hazardAlertTicks = { 'nest-flooding': sim.state.tick }; }
      if (alerted === 'earlier') { life.hazardAlertTicks = { 'nest-flooding': sim.state.tick - 3000 }; life.noticeTick = sim.state.tick; }
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
      expect(outcome(seed, 'earlier').lost, `seed ${seed} (alert before the notice)`).toBeLessThanOrEqual(cap);
      if (outcome(seed, true).drowned > cap) floodedSeeds++;
    }
    expect(floodedSeeds).toBeGreaterThan(0); // the model's floods still happen; with the alert they cost what they cost
  }, 120_000);

  it('the workers the cap keeps eat their winter food (round 5): spared from a flood, the colony eats as if none drowned', () => {
    // a winter with rain on every day and a cluster that always floods, against the same winter with no floods. The
    // model draws its flood roll on every rainy day either way, so both runs see the same random draws.
    const days = 7;
    const input: WinterInput = {
      workers: 20, oldWorkers: 0, larvae: 0, pupae: 0, c: 30, p: 5, queenAlive: true,
      tMean: Array(days).fill(4), tMin: Array(days).fill(2), frost: Array(days).fill(false), rainMm: Array(days).fill(20),
      floodSafety: 0, humidity: 0.3,
    };
    const params: WinterParams = { tColdStress: 0, baseLoss: 0, metBase: 0.35, q10: 2, lossMult: 1, queenDeathP: 0, pFungus: 0 };
    const flooded = runWinterModel(input, { ...params, floodK: 1 }, rngSeed(3));
    const dry = runWinterModel(input, { ...params, floodK: 0 }, rngSeed(3));
    const modelLost = Object.values(flooded.losses).reduce((a, b) => a + b, 0);
    expect(modelLost).toBeGreaterThan(5);
    const extra = sparedWorkersFood(flooded, input.workers, params, modelLost, 0); // the cap keeps them all
    expect(flooded.c1 - extra[days - 1]).toBeCloseTo(dry.c1, 0); // the day series is in whole ants: about one worker-day
    expect(Math.abs(flooded.c1 - extra[days - 1] - dry.c1)).toBeLessThan(0.1 * (input.c - dry.c1));
    // keeping only some of them charges a share
    const half = sparedWorkersFood(flooded, input.workers, params, modelLost, Math.floor(modelLost / 2));
    expect(half[days - 1]).toBeLessThan(extra[days - 1]);
    expect(half[days - 1]).toBeGreaterThan(0);
  });
});
