// GDD 02 §15 worked example: one summer day of a 60-worker Lasius colony, rebuilt with scripted behaviour
// (task mix with the chapter's time-weighted metabolic classes, nursing, queen feeding, laying) and scripted intake
// (the chapter's 12.10 C + 12.95 P per gd delivered evenly). Compared with the chapter: need rates (C 10.71, P 12.90)
// within 5 %, and the stock changes (+1.39 C, +0.05 P) within 5 % of the day's need (interpretation in the report:
// 5 % of a change of +0.05 loads would be below the brood model's own randomness). The §15 table holds the workforce
// at 60, so ready pupae are not helped to eclose during the day (no callow upkeep or reserve refills).
// The components are checked one by one too, so a match of the totals cannot come from offsetting errors:
// worker upkeep, larval C and P, laying P (E25 egg range), and (separate test) the spoilage formula on the chapter's
// start-of-day pile (P 1.0 above the stomach).
//
// gate-sim-2 restatement (red since colony-life round 8): the chapter's larval terms follow from 1.2 P per larva and a
// 0.5 gd larval stage at 25 C (r(25) = 1.2). Today's constants give 0.8 P (R43) and r(25) = 1.364 (the species'
// devRate curve), a 0.44 gd stage: per larva 0.909 C and 1.819 P per gd (chapter 0.80 / 2.40). The expectations below
// derive the larval terms, the totals and the stock changes from those constants with the chapter's other terms
// (upkeep 6.42 C, queen 0.30 C, eggs 12 x 0.04 P, spoilage 0.33 P, intake 12.10 C / 12.95 P) and its 5 larvae; old ->
// new in DEVIATIONS R43. The larval components are checked per larva (the fixture's base brood mortality leaves a
// mean of about 4.7 of the 5 larvae over the day). With the need lower than the scripted intake, the pile P grows and
// the day's mean spoilage is above the chapter's static 0.33 (its own formula is case 2).

import { describe, expect, it } from 'vitest';
import type { Ant, Sim, System, Task } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim } from './testkit';
import { depositFood } from './index';
import { requireSpecies } from '@/sim/species';
import { devRate, larvaFood, stageDu } from './life';

/** Task, number of ants, share of time active / light (the rest is resting), from the §15 table. */
const MIX: [Task, number, number, number][] = [
  ['forage', 11, 0.6, 0], ['scout', 1, 0.6, 0], ['nurse', 5, 0, 0.8], ['queen-care', 2, 0, 0.5], ['store', 2, 0, 0.5],
  ['dig', 3, 0.7, 0], ['haul', 2, 0.7, 0], ['guard', 1, 0, 0.5], ['patrol', 1, 0.6, 0], ['idle', 32, 0, 0],
];
const ACTIVE: Partial<Record<Task, string>> = { forage: 'forage.outbound', scout: 'scout.explore', dig: 'dig.bite', haul: 'haul.carry', patrol: 'patrol.loop' };
const LIGHT: Partial<Record<Task, string>> = { nurse: 'nurse.feed', 'queen-care': 'queen-care.attend', store: 'store.receive', guard: 'guard.post' };
const PERIOD = 600;

function dutySystem(duty: Map<number, [Task, number, number]>): System {
  return {
    name: 'test-duty', phase: 'behaviours',
    run(sim) {
      for (const a of sim.stores.ants.list) {
        const d = duty.get(a.id);
        if (!a.alive || !d) continue;
        const ph = ((sim.state.tick + a.id * 37) % PERIOD) / PERIOD;
        const [task, act, light] = d;
        a.state = ph < act ? ACTIVE[task]! : ph < act + light ? LIGHT[task]! : 'idle';
      }
    },
  };
}

function intakeSystem(cPerGd: number, pPerGd: number): System {
  return {
    name: 'test-intake', phase: 'behaviours',
    run(sim) { depositFood(sim, colonyOf(sim).id, cPerGd / TICKS_PER_DAY, pPerGd / TICKS_PER_DAY); },
  };
}

interface DayResult { deaths: number; upkeep: number; larvaC: number; larvaP: number; larvae: number; spoilP: number; layP: number; needC: number; needP: number; dC: number; dP: number; eggs: number; intakeC: number; intakeP: number }

function runDay(seed: number): DayResult {
  const duty = new Map<number, [Task, number, number]>();
  const sim: Sim = makeColonySim({
    seed, summerDay: 2, noAllocation: true,
    extra: [dutySystem(duty), intakeSystem(12.10, 12.95), careSystem({ feedLarvae: true, tend: true, assist: false, lay: true, queenPPerGd: 0.58, queenCPerGd: 0.3 })],
  });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 0);
  addChamber(sim, 'food', { x: 140, y: -40, z: 100 }, 30);
  const q = establishQueen(sim, ch);
  q.queen!.gut = { c: 0.3, p: 0.1 };
  for (const [task, n, act, light] of MIX) {
    for (const a of addWorkers(sim, n, { chamber: ch, task, ageGd: 3 }) as Ant[]) duty.set(a.id, [task, act, light]);
  }
  // Standing brood of the chapter, spread over each stage.
  for (let i = 0; i < 12; i++) addBrood(sim, 'egg', 1, ch, i / 12);
  for (let i = 0; i < 5; i++) addBrood(sim, 'larva', 1, ch, i / 5);
  for (let i = 0; i < 13; i++) addBrood(sim, 'pupa', 1, ch, i / 13);
  const col = colonyOf(sim);
  sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 30, p: 10 });
  sim.tick();
  // §15 is a steady state: the realised-laying EMA starts at the chapter's 12 eggs/gd instead of 0.
  col.core!.layingRate = 12;
  // Let the need EMAs see the colony for a moment, then measure one game day.
  const c0 = col.stores.c, p0 = col.stores.p;
  let sumC = 0, sumP = 0, n = 0, eggs = 0, up = 0, lc = 0, lp = 0, ln = 0, sp = 0, lay = 0;
  sim.events.on('egg-laid', () => eggs++);
  let deaths = 0;
  sim.events.on('brood-died', () => deaths++);
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.tick();
    if (t % 10 === 9) {
      const core = col.core!;
      const acc = (k: string) => core.acc[k] ?? 0;
      sumC += acc('inst.upkeepC') + acc('inst.queenC') + acc('inst.larvaC');
      sumP += acc('inst.queenP') + 0.04 * core.layingRate + acc('inst.larvaP') + acc('inst.spoilP');
      up += acc('inst.upkeepC'); lc += acc('inst.larvaC'); lp += acc('inst.larvaP'); ln += acc('inst.larvae');
      sp += acc('inst.spoilP'); lay += 0.04 * core.layingRate;
      n++;
    }
  }
  return {
    deaths, upkeep: up / n, larvaC: lc / n, larvaP: lp / n, larvae: ln / n, spoilP: sp / n, layP: lay / n,
    needC: sumC / n, needP: sumP / n, dC: col.stores.c - c0, dP: col.stores.p - p0, eggs,
    intakeC: col.counters.intakeTodayC, intakeP: col.counters.intakeTodayP,
  };
}

describe('GDD 02 §15 worked example (AC3, E25)', () => {
  it('reproduces the need rates within 5 % and the stock changes within 5 % of the daily need', { timeout: 120000 }, () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const runs = seeds.map(runDay);
    const mean = (k: keyof DayResult) => runs.reduce((s, r) => s + r[k], 0) / runs.length;
    // eslint-disable-next-line no-console
    console.log('worked example', JSON.stringify({ upkeep: mean('upkeep'), larvaC: mean('larvaC'), larvaP: mean('larvaP'), larvae: mean('larvae'), spoilP: mean('spoilP'), layP: mean('layP'), needC: mean('needC'), needP: mean('needP'), dC: mean('dC'), dP: mean('dP'), eggs: mean('eggs'), runs: runs.map((r) => [r.deaths, r.larvae.toFixed(2), r.needC.toFixed(2), r.needP.toFixed(2), r.dC.toFixed(2), r.dP.toFixed(2)]) }));
    // the chapter's day with today's larval constants (see the header)
    const def = requireSpecies('lasius-niger'), food = larvaFood(def, 'worker', 1);
    const stageGd = stageDu(def, 'larva', 'worker') / devRate(def, 25);
    const rateC = food.c / stageGd, rateP = food.p / stageGd, LARVAE = 5;
    const needC = 6.42 + 0.3 + LARVAE * rateC, needP = LARVAE * rateP + 12 * 0.04 + 0.33;
    // eslint-disable-next-line no-console
    console.log('worked example derived', JSON.stringify({ rateC, rateP, needC, needP, dC: 12.1 - needC, dP: 12.95 - needP }));
    expect(Math.abs(mean('needC') - needC) / needC).toBeLessThan(0.05);
    expect(Math.abs(mean('needP') - needP) / needP).toBeLessThan(0.05);
    expect(Math.abs(mean('dC') - (12.1 - needC))).toBeLessThan(0.05 * needC);
    expect(Math.abs(mean('dP') - (12.95 - needP))).toBeLessThan(0.05 * needP);
    // Components (chapter: upkeep 6.42 C; larvae per larva rateC, rateP; eggs 12 x 0.04 P; spoilage in case 2).
    expect(Math.abs(mean('upkeep') - 6.42) / 6.42).toBeLessThan(0.05);
    expect(mean('larvae')).toBeGreaterThan(0.9 * LARVAE);
    expect(Math.abs(mean('larvaC') / mean('larvae') - rateC) / rateC).toBeLessThan(0.05);
    expect(Math.abs(mean('larvaP') / mean('larvae') - rateP) / rateP).toBeLessThan(0.05);
    expect(mean('layP')).toBeGreaterThanOrEqual(8 * 0.04);
    expect(mean('layP')).toBeLessThanOrEqual(16 * 0.04);
    for (const r of runs) {
      // E25 ranges per run.
      expect(r.eggs).toBeGreaterThanOrEqual(8);
      expect(r.eggs).toBeLessThanOrEqual(16);
      // per run within 3 loads of the day's expected stock change (the chapter's +1.39 / +0.05; see the header)
      expect(Math.abs(r.dC - (12.1 - needC))).toBeLessThan(3);
      expect(Math.abs(r.dP - (12.95 - needP))).toBeLessThan(3);
    }
  });

  it('spoilage of the start-of-day stock: pile P 1.0 at 25 °C spoils at 1.0 x ln 2 / 3 x 2^0.5 = 0.327 P per gd', () => {
    const sim = makeColonySim({ seed: 1, noAllocation: true });
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 }, 0);
    addChamber(sim, 'food', { x: 140, y: -40, z: 100 }, 30);
    addWorkers(sim, 60, { chamber: ch, task: 'idle', state: 'rest' });
    sim.enqueue({ type: 'cheat.killQueen', colonyId: colonyOf(sim).id, cause: 'unknown' });
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 30, p: 10 });
    for (let t = 0; t < 20; t++) sim.tick();
    expect(Math.abs((colonyOf(sim).core!.acc['inst.spoilP'] ?? 0) - 0.327) / 0.327).toBeLessThan(0.05);
  });
});
