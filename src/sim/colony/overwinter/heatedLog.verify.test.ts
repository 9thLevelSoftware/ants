// Independent sweep after colony-life round 3 (year-two long runs): woodland-edge #1, viable at winter with 14 workers,
// got no overwintering lapse. Probe (test-output/colony-life/round-3/sweep-review/probe-winter-we1.txt): at Winter 1
// day 1 the colony had had no brood for ~4 gd, its brood chambers read null, but the heated-nest log still held the 48
// hourly samples taken while brood lived (first 21.4 C, last 14.2 C, mean 14.63 >= WINTER_ACTIVE_TMEAN_C 14): the
// sampler keeps the log "fresh" every hour without adding a sample when there is no brood, so samples days old decide.
// heatedNest() said true, the winter was played tick by tick at -1.6..6 C, the workers aged at the active rate
// (14 -> 8 by the end of winter) and the colony had 0 workers by year-2 summer.
//
// GDD 06 §6.1: the heated-nest rule reads the brood-weighted mean chamber temperature over the last
// WINTER_ACTIVE_WINDOW_GD. This test fills the log as the sampler would while brood lived in a 20 C chamber, then lets
// the colony live 3 gd with no brood in a 4 C nest: samples older than the window must not make it a heated nest.

import { describe, expect, it } from 'vitest';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { WINTER_ACTIVE_TMEAN_C, WINTER_ACTIVE_WINDOW_GD } from '@/sim/balance/lifecycle';
import { calendarTick, HOURS_PER_DAY, TICKS_PER_DAY } from '@/sim/time';
import { lifecycleOf } from '../succession/lifecycleState';
import { colonyOf, makeLifeSim, step } from '../succession/testLife';
import { heatedNest } from './begin';

describe('heated-nest log without brood (sweep 3 review, year-two runs)', () => {
  it('samples older than the 2-gd window do not make a cold nest with no brood a heated nest', () => {
    const sim = makeLifeSim({ chamberC: 4, larvae: 0 });
    const col = colonyOf(sim);
    expect(sim.state.brood.filter((b) => b.alive && b.colony === col.id)).toHaveLength(0);
    // the log as sampleBroodTemp leaves it after 2 gd of brood in a 20 C chamber
    const life = lifecycleOf(col);
    life.broodTempLog = Array(Math.round(WINTER_ACTIVE_WINDOW_GD * HOURS_PER_DAY)).fill(20);
    life.broodTempTick = sim.state.tick;
    life.broodTempCal = calendarTick(sim.state);
    step(sim, 3 * TICKS_PER_DAY); // 3 gd with no brood, nest at 4 C (the overwinter system samples hourly)
    const info = JSON.stringify({ n: life.broodTempLog?.length, first: life.broodTempLog?.[0], age: (sim.state.tick - (life.broodTempTick ?? 0)) });
    expect(heatedNest(sim, col, LASIUS_NIGER, WINTER_ACTIVE_TMEAN_C), info).toBe(false);
  }, 120_000);
});
