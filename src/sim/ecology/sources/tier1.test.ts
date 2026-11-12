// sim-fix-colony item 6: Tier 1 food sources against GDD 05 §0 and §1.2. The T1 indoor spill is static (no
// evaporation, no residue: only drinking empties it); event-driven T2 spills still evaporate. T1 carrion keeps
// its 3 gd lifetime (GDD 05 §1.2 "T1: no decay, removed after 3 gd"), tested in lifecycle.test.ts.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { createSource } from './spawn';
import { centre, makeSourceSim } from './testkit';

function run(sim: ReturnType<typeof makeSourceSim>, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    sim.events.flush();
  }
}

describe('T1 static spill (GDD 05 §0 "one static indoor spill allowed")', () => {
  it('keeps its amount for days indoors and never turns to residue', () => {
    const sim = makeSourceSim();
    sim.world.zones[0].type = 'interior';
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), spillMm: 50 }); // default tier: T1
    expect(s.decayPerGd).toBe(0);
    run(sim, 4 * TICKS_PER_DAY);
    expect(s.alive).toBe(true);
    expect(s.variant).toBe('sugary-spill');
    expect(s.units).toBe(40);
  });

  it('only drinking empties it (below 30 % it stays a spill)', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), spillMm: 20 });
    s.units = 0.2 * s.capacity; // drunk down
    s.pool = s.units;
    run(sim, TICKS_PER_DAY);
    expect(s.variant).toBe('sugary-spill');
    expect(s.units).toBeCloseTo(0.2 * s.capacity, 9);
  });

  it('an event-driven (T2) spill still evaporates from its first hour', () => {
    const sim = makeSourceSim();
    sim.world.zones[0].type = 'interior';
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 2, spillMm: 50 });
    expect(s.decayPerGd).toBeGreaterThan(0);
    run(sim, TICKS_PER_DAY);
    expect(s.units).toBeCloseTo(20, 6);
  });
});
