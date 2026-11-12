import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { getAntStats } from './antStats';

describe('getAntStats (one lookup for playable and rival species, ruling 5)', () => {
  const sim = makeTestSim();

  it('derives Lasius worker stats from the GDD 05 mass formula (10 HP, bite 1.0 at 1 mg)', () => {
    const w = getAntStats(sim, 'lasius-niger', 'worker');
    expect(w.maxHp).toBeCloseTo(10);
    expect(w.bite).toBeCloseTo(1.0);
    expect(w.lengthBu).toBeCloseTo(1);
    expect(w.cruiseMmS).toBeCloseTo(6 * 4);
    const nanitic = getAntStats(sim, 'lasius-niger', 'worker', 0.85);
    expect(nanitic.maxHp).toBeGreaterThan(6.5);
    expect(nanitic.maxHp).toBeLessThan(7.5);
  });

  it('uses the GDD 05 table for queens, gynes and males', () => {
    expect(getAntStats(sim, 'lasius-niger', 'queen', undefined, true).maxHp).toBe(40);
    expect(getAntStats(sim, 'lasius-niger', 'queen').maxHp).toBe(50);
    expect(getAntStats(sim, 'lasius-niger', 'gyne').maxHp).toBe(35);
    const male = getAntStats(sim, 'lasius-niger', 'male');
    expect(male.maxHp).toBe(6);
    expect(male.bite).toBe(0.2);
  });

  it('reads rival-only species from their light definition, lengths in world BU', () => {
    const t = getAntStats(sim, 'tetramorium-immigrans', 'worker');
    expect(t.maxHp).toBe(7);
    expect(t.bite).toBe(0.7);
    expect(t.lengthBu).toBeCloseTo(3.2 / sim.world.bu);
    expect(getAntStats(sim, 'formica-rufa', 'queen').maxHp).toBe(61);
  });

  it('spawnAnt takes its stats and reserve from it', () => {
    const s = makeTestSim();
    s.enqueue({ type: 'cheat.spawnAnts', colonyId: s.state.colonies[0].id, n: 1, caste: 'worker', ageGd: 0, task: null, pos: null });
    s.tick();
    const a = s.state.ants.find((x) => x.caste === 'worker')!;
    expect(a.maxHp).toBeGreaterThan(8);
    expect(a.energy).toBeCloseTo(0.4); // callow reserve cap (GDD 02 §1.4)
  });
});
