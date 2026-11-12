// Population and intake accounting (GDD 02 §13.1-§13.2): cumulative counters by cause, hatched / pupated,
// deliveries by kind and source, unload wait, workers by band and place, the daily recount, deaths-by-cause series.

import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '@/sim/time';
import { sourceIntake } from '@/sim/ecology';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { colonySummary } from './summary';
import { recordDelivery } from './activation';
import { popOf } from './population';
import { encode, decode } from '@/core/serialize';

function setup() {
  const sim = makeColonySim({ extra: [careSystem({ tend: true, feedLarvae: true, assist: true })] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 10, p: 5, toxin: 0 });
  return { sim, ch };
}

describe('population accounting (GDD 02 §13.1)', () => {
  it('counts eggs hatched and larvae pupated as brood changes stage', () => {
    const { sim, ch } = setup();
    addWorkers(sim, 5, { chamber: ch });
    addBrood(sim, 'egg', 10, ch, 1.39);
    addBrood(sim, 'larva', 6, ch, 0.59);
    let hatched = 0, pupated = 0;
    sim.events.on('brood-stage', (e) => { if (e.from === 'egg') hatched++; if (e.from === 'larva' && e.to === 'pupa') pupated++; });
    step(sim, Math.round(0.2 * TICKS_PER_DAY));
    const pop = popOf(colonyOf(sim));
    expect(hatched).toBeGreaterThan(0);
    expect(pop.eggsHatched).toBe(hatched);
    expect(pop.larvaePupated).toBe(pupated);
  });

  it('keeps adult deaths by cause for the whole life (not reset at the day rollover)', () => {
    const { sim, ch } = setup();
    const ws = addWorkers(sim, 4, { chamber: ch });
    sim.enqueue({ type: 'cheat.kill', id: ws[0].id, cause: 'predation' });
    sim.enqueue({ type: 'cheat.kill', id: ws[1].id, cause: 'heat' });
    step(sim, 2);
    step(sim, TICKS_PER_DAY + 10); // past a day rollover
    sim.enqueue({ type: 'cheat.kill', id: ws[2].id, cause: 'predation' });
    step(sim, 2);
    const s = colonySummary(sim, colonyOf(sim).id)!;
    expect(s.population.deathsByCause).toEqual({ predation: 2, heat: 1 });
    expect(colonyOf(sim).core!.deathsToday).toEqual({ predation: 1 });
  });

  it('keeps brood deaths by cause (cannibalised included)', () => {
    const sim = makeColonySim({ climate: { chamberTemp: () => 38 } });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 });
    establishQueen(sim, ch);
    addWorkers(sim, 3, { chamber: ch });
    addBrood(sim, 'pupa', 10, ch, 0.1);
    step(sim, Math.round(0.5 * TICKS_PER_DAY));
    const pop = popOf(colonyOf(sim));
    expect(pop.broodDeathsByCause.temperature ?? 0).toBeGreaterThan(0);
    const total = Object.values(pop.broodDeathsByCause).reduce((a, b) => a + b, 0);
    expect(total).toBe(colonyOf(sim).counters.broodDeaths);
  });

  it('tallies deliveries by food kind and by source, with the mean unload wait, and feeds the ecology ledger', () => {
    const { sim, ch } = setup();
    const [f] = addWorkers(sim, 2, { chamber: ch, task: 'forage' });
    step(sim, 20); // a colony cycle opens the pool (it has workers now)
    recordDelivery(sim, f, 501, 'honeydew', 0.5, 0, 0, 20 * TICKS_PER_SECOND);
    recordDelivery(sim, f, 501, 'honeydew', 0.25, 0, 0, 10 * TICKS_PER_SECOND);
    recordDelivery(sim, f, 777, 'carrion', 0, 0.4);
    const pop = popOf(colonyOf(sim));
    expect(pop.intakeByKind.honeydew).toMatchObject({ n: 2, c: 0.75, p: 0 });
    expect(pop.intakeByKind.carrion).toMatchObject({ n: 1, c: 0, p: 0.4 });
    expect(pop.intakeBySource['501'].c).toBeCloseTo(0.75, 9);
    expect(pop.intakeBySource['777'].p).toBeCloseTo(0.4, 9);
    expect(colonySummary(sim, colonyOf(sim).id)!.population.meanUnloadWaitS).toBeCloseTo(15, 9);
    const eco = sourceIntake(sim, colonyOf(sim).id);
    expect(eco.find((e) => e.sourceId === 501)?.deliveredC).toBeCloseTo(0.75, 9);
  });

  it('counts workers by age band, inside / outside, nanitics, minims and controlled', () => {
    const { sim, ch } = setup();
    addWorkers(sim, 2, { chamber: ch, callow: true, ageGd: 0 });
    addWorkers(sim, 3, { chamber: ch, ageGd: 2 });
    const mid = addWorkers(sim, 4, { chamber: ch, ageGd: 8 });
    addWorkers(sim, 1, { chamber: null, ageGd: 14, task: 'forage' });
    mid[0].flags |= AntFlag.NANITIC;
    mid[1].flags |= AntFlag.MINIM;
    mid[2].flags |= AntFlag.POSSESSED;
    const p = colonySummary(sim, colonyOf(sim).id)!.population;
    expect(p.byBand).toEqual({ callow: 2, young: 3, mid: 4, old: 1 });
    expect(p.inside).toBe(9);
    expect(p.outside).toBe(1);
    expect([p.nanitics, p.minims, p.controlled]).toEqual([1, 1, 1]);
  });

  it('the daily recount corrects a drifted living-adult count and records the fix', () => {
    const { sim, ch } = setup();
    addWorkers(sim, 5, { chamber: ch });
    step(sim, 1);
    const col = colonyOf(sim);
    const truth = col.livingAnts;
    col.livingAnts += 3;
    step(sim, TICKS_PER_DAY);
    expect(col.livingAnts).toBe(truth);
    expect(popOf(col).recountFixes).toBe(1);
    expect(popOf(col).lastRecountTick).toBeGreaterThan(0);
  });
});

describe('time series (GDD 02 §13.2)', () => {
  it('pushes `deaths:<cause>` hourly, filed daily as sums', () => {
    const { sim, ch } = setup();
    const ws = addWorkers(sim, 3, { chamber: ch });
    step(sim, 1);
    sim.enqueue({ type: 'cheat.kill', id: ws[0].id, cause: 'drowning' });
    sim.enqueue({ type: 'cheat.kill', id: ws[1].id, cause: 'drowning' });
    step(sim, TICKS_PER_HOUR + 5);
    const h = sim.state.progression.history;
    expect(h.hourly['deaths:drowning']).toBeDefined();
    step(sim, TICKS_PER_DAY);
    expect(h.daily['deaths:drowning']?.[0]).toBe(2);
  });

  it('population state round-trips through encode / decode', () => {
    const { sim, ch } = setup();
    const [f] = addWorkers(sim, 2, { chamber: ch, task: 'forage' });
    step(sim, 20); // a colony cycle opens the pool (it has workers now)
    recordDelivery(sim, f, 9, 'crumb', 0.2, 0.1, 0, 30);
    const pop = popOf(colonyOf(sim));
    expect(decode(encode(pop))).toEqual(pop);
  });
});
