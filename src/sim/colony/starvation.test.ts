import { describe, expect, it } from 'vitest';
import type { StarvationStage } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim } from './testkit';
import { bandOf } from './physiology';
import { stageRank } from './starvation';

describe('starvation sequence (GDD 02 §5.7, E9, AC5)', () => {
  it('with intake cut to zero: eggs before larvae, old workers first, no pupa starves, queen last', { timeout: 120000 }, () => {
    const sim = makeColonySim({ extra: [careSystem({ tend: true, assist: true, feedLarvae: true, cannibalise: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 });
    const q = establishQueen(sim, ch);
    q.queen!.reserve = 3;
    q.queen!.gut.c = 0.3;
    q.queen!.gut.p = 0.4;
    const col = colonyOf(sim);
    for (const [age, callow] of [[0, true], [3, false], [8, false], [14, false]] as const) {
      addWorkers(sim, 5, { chamber: ch, ageGd: age, callow });
    }
    for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') a.energy = { callow: 0.4, young: 0.6, mid: 0.45, old: 0.25 }[bandOf(a)];
    addBrood(sim, 'egg', 20, ch);
    addBrood(sim, 'larva', 10, ch, 0.2);
    addBrood(sim, 'pupa', 10, ch, 0.2);
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0 });
    sim.enqueue({ type: 'setDirectives', stayIn: true });

    const stages: StarvationStage[] = [];
    sim.events.on('starvation-stage', (e) => stages.push(e.stage));
    const cannibalised: string[] = [];
    let eggsLeftAtFirstLarva = -1;
    sim.events.on('brood-died', (e) => {
      if (e.cause === 'cannibalised') {
        cannibalised.push(e.stage);
        if (e.stage === 'larva' && eggsLeftAtFirstLarva < 0) {
          eggsLeftAtFirstLarva = sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length;
        }
      }
      if (e.stage === 'pupa') expect(e.cause).not.toBe('starvation');
    });
    const adultDeaths: { caste: string; cause: string; band: string }[] = [];
    const bandAtDeath = new Map<number, string>();
    sim.events.on('ant-died', (e) => adultDeaths.push({ caste: e.caste, cause: e.cause, band: bandAtDeath.get(e.antId) ?? '?' }));

    for (let t = 0; t < 30 * TICKS_PER_DAY; t++) {
      if (t % TICKS_PER_DAY === 0) sim.enqueue({ type: 'setDirectives', stayIn: true });
      if (t % 10 === 0) for (const a of sim.state.ants) if (a.alive) bandAtDeath.set(a.id, bandOf(a));
      sim.tick();
      if (sim.stores.ants.count === 0) break;
    }
    expect(sim.stores.ants.count).toBe(0);
    expect(eggsLeftAtFirstLarva).toBe(0);
    expect(cannibalised.length).toBeGreaterThanOrEqual(20);
    const firstStarved = adultDeaths.find((d) => d.cause === 'starvation' && d.caste === 'worker')!;
    expect(firstStarved.band).toBe('old');
    expect(adultDeaths[adultDeaths.length - 1].caste).toBe('queen');
    // Stages advance in order (S1 lean may be skipped when the pool starts empty).
    for (let i = 1; i < stages.length; i++) expect(stageRank(stages[i])).toBeGreaterThanOrEqual(stageRank(stages[i - 1]));
    expect(stages).toContain('rationing');
    expect(stages).toContain('brood-sacrifice');
    expect(stages).toContain('adult-starvation');
  });
});
