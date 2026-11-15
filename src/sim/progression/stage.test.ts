// Colony stages (GDD 06 §7): thresholds per species and difficulty in simulated workers, the transition table, and
// the in-sim evaluation (journal entry, stage.changed, ms-stage-* milestones, hysteresis, declining flag).

import { describe, expect, it } from 'vitest';
import type { SpeciesId, StageId } from '@/sim/types';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { getSpecies } from '@/sim/species';
import { killAnt } from '@/sim/entities';
import { daysToTicks, ticksPerYear } from '@/sim/time';
import { nextStage, stageThresholds } from './index';
import { addWorkers } from './fixtures';
import { makeProgSim, pollOnce } from './testkit';

/** GDD 06 §7 table (00-index C11): grow / mature / matureAgeYears per species, naturalist. */
const CHAPTER: Record<SpeciesId, [number, number, number]> = {
  'lasius-niger': [75, 700, 2],
  'camponotus-pennsylvanicus': [50, 500, 4],
  'messor-barbarus': [50, 700, 3],
  'atta-texana': [150, 1000, 3],
};

describe('stage thresholds (GDD 06 §7)', () => {
  it.each(Object.keys(CHAPTER) as SpeciesId[])('%s matches the chapter, scaled by matureGateMult', (sp) => {
    const def = getSpecies(sp)!;
    const [grow, mature, age] = CHAPTER[sp];
    for (const preset of ['gentle', 'naturalist', 'harsh'] as const) {
      const mult = DIFFICULTY_PARAMS[preset].matureGateMult;
      const t = stageThresholds(def, preset, mult);
      expect(t.grow).toBeCloseTo(grow * mult);
      expect(t.mature).toBeCloseTo(mature * mult);
      const expectedAge = sp === 'camponotus-pennsylvanicus' ? { gentle: 3, naturalist: 4, harsh: 6 }[preset] : age;
      expect(t.matureAgeYears).toBe(expectedAge);
    }
    expect(DIFFICULTY_PARAMS.gentle.matureGateMult).toBe(0.8);
    expect(DIFFICULTY_PARAMS.harsh.matureGateMult).toBe(1.2);
  });
});

describe('stage transitions (Lasius, naturalist: 75 / 700 / 2 years)', () => {
  const t = { grow: 75, mature: 700, matureAgeYears: 2 };
  const rows: [StageId, number, number, StageId][] = [
    ['founding', 0, 0, 'founding'],
    ['founding', 1, 0, 'first-workers'],
    ['first-workers', 74, 1, 'first-workers'],
    ['first-workers', 75, 1, 'growing'],
    ['growing', 60, 1, 'growing'],
    ['growing', 699, 3, 'growing'],
    ['growing', 700, 1.9, 'growing'],
    ['growing', 700, 2, 'mature'],
    ['first-workers', 800, 2.5, 'mature'],
    ['mature', 500, 5, 'mature'],
    ['mature', 490, 5, 'mature'],
    ['mature', 489, 5, 'growing'],
  ];
  it.each(rows)('%s with N %d at %d years -> %s', (from, n, years, to) => {
    expect(nextStage(from, n, years, t)).toBe(to);
  });
});

describe('stage evaluation in the sim', () => {
  it('walks founding -> first-workers -> growing -> mature -> growing with entries, events and milestones', () => {
    const sim = makeProgSim({ workers: 1 });
    pollOnce(sim);
    expect(sim.state.progression.stage.id).toBe('first-workers');
    addWorkers(sim, 75);
    sim.state.progression.engine!.mem.stageDirty = 1;
    pollOnce(sim);
    expect(sim.state.progression.stage.id).toBe('growing');
    expect(sim.state.progression.milestones['ms-stage-growing']).toBeDefined();
    addWorkers(sim, 700);
    sim.state.env.calendar.foundingTick = 0;
    sim.state.tick += 2 * ticksPerYear(sim.state.config);
    sim.state.progression.engine!.mem.stageDirty = 1;
    pollOnce(sim);
    expect(sim.state.progression.stage.id).toBe('mature');
    expect(sim.state.progression.milestones['ms-stage-mature']).toBeDefined();
    const col = sim.state.colonies[0];
    const workers = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    for (const a of workers.slice(0, workers.length - 480)) killAnt(sim, a.id, 'old-age');
    pollOnce(sim);
    expect(sim.state.progression.stage.id).toBe('growing');
    const stages = sim.state.progression.journal.entries.filter((e) => e.kind === 'stage').map((e) => e.key);
    expect(stages).toEqual(['stage.first-workers', 'stage.growing', 'stage.mature', 'stage.growing']);
    expect(sim.state.progression.journal.entries.filter((e) => e.kind === 'stage').at(-1)!.refs).toEqual(['from:mature']);
  });

  it('flags a colony that lost 20 % of its workers over 3 days outside winter as declining', () => {
    const sim = makeProgSim({ workers: 50 });
    for (let d = 0; d < 3; d++) for (let i = 0; i < daysToTicks(1); i++) sim.tick();
    expect(sim.state.progression.stage.flags.declining).toBe(false);
    const col = sim.state.colonies[0];
    const workers = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    for (const a of workers.slice(0, 11)) killAnt(sim, a.id, 'starvation');
    for (let i = 0; i < daysToTicks(1); i++) sim.tick();
    expect(sim.state.progression.stage.flags.declining).toBe(true);
  });
});
