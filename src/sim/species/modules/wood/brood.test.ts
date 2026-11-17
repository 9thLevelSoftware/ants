// Brood moisture rule and age-gated polymorphism (GDD 07 §6.2.4, §2.6, §5.2.2; App. E 10 and 14).

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnAnt, spawnBrood } from '@/sim/entities';
import { daysPerYear, TICKS_PER_DAY } from '@/sim/time';
import { WOOD_BROOD_TICKS } from '@/sim/balance/species-carpenter';
import type { Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { woodParamsOf } from './params';
import { setWood } from './moisture';
import { broodHazardPerGd, broodMoisturePass } from './broodMoisture';
import { assignCastes, casteTarget } from './castes';
import { woodOf } from './woodState';
import { carveLogChamber, CP, LOG_ID, woodSim } from './testkit';

function eggs(sim: Sim, n: number, at: { x: number; y: number; z: number }): void {
  const col = sim.state.colonies[0];
  for (let i = 0; i < n; i++) spawnBrood(sim, { colony: col.id, stage: 'egg', destined: 'worker', pos: { ...at } });
}

function survivorsAfterOneDay(mc: number): number {
  const sim = woodSim();
  setWood(woodOf(sim, LOG_ID)!, mc, 2);
  const c = carveLogChamber(sim);
  eggs(sim, 100, { x: c.x, y: c.y - 1.2 * 9, z: c.z });
  const def = sim.species, p = woodParamsOf(def)!, col = sim.state.colonies[0];
  for (let t = 0; t < TICKS_PER_DAY; t += WOOD_BROOD_TICKS) broodMoisturePass(sim, def, col, p);
  return sim.state.brood.filter((b) => b.alive && b.colony === col.id).length;
}

describe('brood moisture rule (GDD 07 §6.2.4, App. E 10)', () => {
  it('hazard: 0 at 15-30 %, 0.4 /GD at <= 8 %, mould 0.01 per % above 30; late brood only the mould term', () => {
    const p = woodParamsOf(woodSim().species)!;
    const egg = { stage: 'egg' as const, progress: 0 }, pupa = { stage: 'pupa' as const, progress: 0 };
    expect(broodHazardPerGd(p, egg, 20)).toBe(0);
    expect(broodHazardPerGd(p, egg, 15)).toBe(0);
    expect(broodHazardPerGd(p, egg, 8)).toBeCloseTo(0.4, 9);
    expect(broodHazardPerGd(p, egg, 10)).toBeCloseTo(0.4 * 5 / 7, 9);
    expect(broodHazardPerGd(p, egg, 40)).toBeCloseTo(0.1, 9);
    expect(broodHazardPerGd(p, pupa, 10)).toBe(0);
    expect(broodHazardPerGd(p, { stage: 'larva', progress: 0.6 }, 10)).toBe(0);
  });

  it('100 eggs in a 10 % nursery: 75 +- 10 survive one GD; at 20 % all survive', () => {
    const at10 = survivorsAfterOneDay(10);
    expect(at10).toBeGreaterThanOrEqual(65);
    expect(at10).toBeLessThanOrEqual(85);
    expect(survivorsAfterOneDay(20)).toBe(100);
  });
});

function cpColony(workers: number, ageYears: number, p = 1000): Sim {
  const sim = makeTestSim({ species: CP, systems: [] });
  const col = sim.state.colonies[0];
  for (let i = 0; i < workers; i++) spawnAnt(sim, { colony: col.id, caste: 'minor', pos: { x: 100 + i, y: 0, z: 100 }, ageGd: 5 });
  col.foundedTick = sim.state.tick - Math.round(ageYears * daysPerYear(sim.state.config) * TICKS_PER_DAY);
  col.stores.p = p;
  return sim;
}

function newLarvae(sim: Sim, n: number): string[] {
  const col = sim.state.colonies[0];
  const list = [];
  for (let i = 0; i < n; i++) list.push(spawnBrood(sim, { colony: col.id, stage: 'larva', destined: 'worker', pos: { x: 50, y: 0, z: 50 } }));
  assignCastes(sim, sim.species, col, woodParamsOf(sim.species)!, new Set());
  return list.map((b) => b.destined);
}

describe('age-gated polymorphism (GDD 07 §5.2.2, App. E 14)', () => {
  it('a colony aged 1.5 years with N = 100: no media or major among 100 new larvae', () => {
    const d = newLarvae(cpColony(100, 1.5), 100);
    expect(d.every((c) => c === 'minor')).toBe(true);
  });

  it('at 2.0 years and N >= 60 media and majors appear among new larvae, with lengths from their castes', () => {
    const sim = cpColony(100, 2.0);
    const d = newLarvae(sim, 100);
    expect(d.filter((c) => c === 'media').length).toBeGreaterThan(0);
    expect(d.filter((c) => c === 'major').length).toBeGreaterThan(0);
    for (const b of sim.state.brood.filter((x) => x.destined === 'major')) {
      expect(b.destinedLengthBu).toBeGreaterThanOrEqual(1.3);
      expect(b.destinedLengthBu).toBeLessThanOrEqual(1.9);
    }
  });

  it('below 60 workers the large castes stay locked whatever the age; the mix ramps toward 50 / 38 / 12', () => {
    expect(newLarvae(cpColony(59, 3), 50).every((c) => c === 'minor')).toBe(true);
    const sim = cpColony(200, 3.5);
    const t = casteTarget(sim, sim.species, sim.state.colonies[0], woodParamsOf(sim.species)!);
    expect(t[0]).toBeCloseTo(0.5, 6);
    expect(t[1]).toBeCloseTo(0.38, 6);
    expect(t[2]).toBeCloseTo(0.12, 6);
  });

  it('no majors when the P store does not cover MAJOR_GATE_GD of larval demand', () => {
    const d = newLarvae(cpColony(300, 3.5, 0), 100);
    expect(d.includes('major')).toBe(false);
    expect(d.includes('media')).toBe(true);
  });

  it('worker eggs become minors; nanitic first brood stays minor and keeps its flag', () => {
    const sim = cpColony(100, 3);
    const col = sim.state.colonies[0];
    const e = spawnBrood(sim, { colony: col.id, stage: 'egg', destined: 'worker', pos: { x: 0, y: 0, z: 0 } });
    const n = spawnBrood(sim, { colony: col.id, stage: 'larva', destined: 'worker', pos: { x: 0, y: 0, z: 0 } });
    n.flags |= BroodFlag.NANITIC;
    assignCastes(sim, sim.species, col, woodParamsOf(sim.species)!, new Set());
    expect(e.destined).toBe('minor');
    expect(n.destined).toBe('minor');
    expect(n.flags & BroodFlag.NANITIC).toBeTruthy();
  });
});
