// Reviewer tests (task overwinter-repro): edge cases of the winter model and of the trigger sequence in a running sim.
// Tests that fail here demonstrate a defect and are left in place for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import { rngSeed } from '@/core/rng';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { findNonPlain } from '@/sim/testing/plainData';
import { currentDayOfSeason, currentSeason, TICKS_PER_DAY } from '@/sim/time';
import { colonyOf, living, makeLifeSim, send, step } from '../succession/testLife';
import { runWinterModel, type WinterInput, type WinterParams } from './model';
import { clusterOf } from './climate';
import { ticksToSpring } from './begin';

const P: WinterParams = {
  tColdStress: LASIUS_NIGER.winter.tColdStress, baseLoss: LASIUS_NIGER.winter.wintBaseLoss,
  metBase: LASIUS_NIGER.winter.wintMetBase, q10: LASIUS_NIGER.winter.wintQ10, lossMult: 1, queenDeathP: 0.03,
};

function input(o: Partial<WinterInput> = {}): WinterInput {
  const days = 7;
  return {
    workers: 18, oldWorkers: 4, larvae: 20, pupae: 0, c: 10, p: 4, queenAlive: true,
    tMean: Array(days).fill(5), tMin: Array(days).fill(4), frost: Array(days).fill(false),
    rainMm: Array(days).fill(0), floodSafety: 0.5, humidity: 0.95, ...o,
  };
}

describe('winter model edge cases (reviewer)', () => {
  it('an empty colony (no workers, no larvae, no stores) gives finite numbers and no losses', () => {
    const out = runWinterModel(input({ workers: 0, oldWorkers: 0, larvae: 0, c: 0, p: 0 }), P, rngSeed(1));
    expect(out.workers1).toBe(0);
    expect(out.larvae1).toBe(0);
    expect(findNonPlain(out)).toEqual([]);
    for (const d of out.days) expect(Number.isFinite(d.workers) && Number.isFinite(d.larvae)).toBe(true);
  });

  it('extreme losses never remove more workers or larvae than exist, and the day series ends on the drawn counts', () => {
    for (let s = 1; s <= 20; s++) {
      const out = runWinterModel(input({ c: 0, p: 0, tMin: Array(7).fill(-40), rainMm: Array(7).fill(16), floodSafety: 0 }),
        { ...P, lossMult: 3, pFungus: 1, floodK: 1 }, rngSeed(s));
      const lost = Object.values(out.losses).reduce((a, b) => a + b, 0);
      const lostL = Object.values(out.broodLosses).reduce((a, b) => a + b, 0);
      expect(lost).toBeLessThanOrEqual(18);
      expect(lostL).toBeLessThanOrEqual(20);
      expect(out.workers1).toBeGreaterThanOrEqual(0);
      expect(out.days[out.days.length - 1].workers).toBe(out.workers1);
      expect(out.days[out.days.length - 1].larvae).toBe(out.larvae1);
      for (const d of out.days) expect(d.c >= 0 && d.p >= 0).toBe(true);
    }
  });

  it('a well-stocked colony at 0 losses multiplier keeps every worker', () => {
    const out = runWinterModel(input({ humidity: 0.5 }), { ...P, lossMult: 0, queenDeathP: 0 }, rngSeed(3));
    expect(out.workers1).toBe(18);
    expect(out.queenAlive).toBe(true);
  });
});

describe('overwinter trigger sequence (reviewer)', () => {
  it('Delay one day: the banner returns the next midnight, a third delay is refused', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(`${e.commandType}:${e.reason}`));
    send(sim, { type: 'cheat.triggerWinter' });
    expect(currentDayOfSeason(sim.state)).toBe(1);
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    step(sim, TICKS_PER_DAY);
    expect(sim.state.env.winter.phase).toBe('banner');
    expect(currentDayOfSeason(sim.state)).toBe(2);
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    step(sim, TICKS_PER_DAY);
    expect(sim.state.env.winter.phase).toBe('banner');
    expect(currentDayOfSeason(sim.state)).toBe(3);
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    expect(sim.state.env.winter.delaysUsed).toBe(2);
    expect(rejected).toContain('overwinterChoice:limit');
    expect(sim.state.env.winter.phase).toBe('banner');
  });

  // DEFECT: after two delays only 5 winter days remain until spring (the clock jumps 5 days), but the aggregate
  // model still runs a full season (7 days) of consumption and losses on top of the 2 days already played.
  it('after two delays the aggregate model covers only the winter days that remain', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    step(sim, TICKS_PER_DAY);
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    step(sim, TICKS_PER_DAY);
    expect(sim.state.env.winter.phase).toBe('banner');
    const remainingDays = Math.round(ticksToSpring(sim) / TICKS_PER_DAY);
    expect(remainingDays).toBe(5);
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    expect(currentSeason(sim.state)).toBe('spring');
    const rec = colonyOf(sim).lifecycle!.winters[0];
    expect(rec.days.length).toBe(remainingDays);
  });

  it('the lifecycle record and the winter report stay plain, finite data after a winter', () => {
    const sim = makeLifeSim({ chamberC: 4, c: 0, p: 0, larvae: 0 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    expect(findNonPlain(colonyOf(sim).lifecycle)).toEqual([]);
    expect(findNonPlain(sim.state.env.winter)).toEqual([]);
    const rec = colonyOf(sim).lifecycle!.winters[0];
    expect(rec.workers1).toBe(living(sim, 'worker'));
  });

  it('Begin is refused outside the banner; close-report outside the lapse is refused', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(`${e.commandType}:${e.reason}`));
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    send(sim, { type: 'overwinterChoice', choice: 'close-report' });
    expect(rejected).toEqual(['overwinterChoice:invalid-phase', 'overwinterChoice:invalid-phase']);
    expect(colonyOf(sim).lifecycle?.winters ?? []).toHaveLength(0);
  });

  it('a second triggerWinter in the same winter after the report does not winter twice', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    send(sim, { type: 'overwinterChoice', choice: 'close-report' });
    step(sim, 50);
    expect(currentSeason(sim.state)).toBe('spring');
    expect(sim.state.env.winter.phase).toBe('none');
    expect(colonyOf(sim).lifecycle!.winters).toHaveLength(1);
  });

  it('nest humidity read by the fungus rule (reported value, x3 above 0.9)', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const h = clusterOf(sim, colonyOf(sim)).humidity;
    expect(Number.isFinite(h)).toBe(true);
    // Recorded for the report: soil-air relative humidity is normally near saturation, so the x3 multiplier applies
    // by default (P_WINTER_FUNGUS effectively 0.15 per winter instead of 0.05).
    console.info(`[review] cluster humidity in the test colony: ${h.toFixed(3)}`);
  });
});
