// gate-sim-2 review (integrator ruling 1): the report says the Tier 1 rules behind ECOLOGY_TIER = 2 "cannot be reached
// by a game or a test". Several of them already take the tier as an argument; these cases reach them with tier 1
// explicitly, the way ruling 1 asks the 12 red tests of this folder to.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { createSource } from './spawn';
import { availableAtTier, sourceDef } from './def';
import { centre, makeSourceSim } from './testkit';

describe('reviewer: Tier 1 source rules are reachable through their tier argument', () => {
  it('a T1 indoor spill made with tier 1 is static (no evaporation) at creation', () => {
    const sim = makeSourceSim();
    sim.world.zones[0].type = 'interior';
    const t1 = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 1, spillMm: 50 });
    const t2 = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 2, spillMm: 50 });
    expect(t1.decayPerGd).toBe(0);
    expect(t2.decayPerGd).toBeGreaterThan(0);
  });

  it('the catalogue answers per tier (sourceDef / availableAtTier take the tier)', () => {
    // at least one variant's definition differs between the tiers, so the T1 table is reachable by argument
    const variants = ['sugary-spill', 'carrion-small', 'carrion-medium', 'crumb'] as const;
    const differs = variants.some((v) => {
      try {
        return JSON.stringify(sourceDef(v as never, 1)) !== JSON.stringify(sourceDef(v as never, 2))
          || availableAtTier(v as never, 1) !== availableAtTier(v as never, 2);
      } catch { return false; }
    });
    expect(differs).toBe(true);
  });

  it('a tier-1 spill keeps its amount over a game day indoors only if the tick rule also takes the tier', () => {
    // documents the remaining seam: lifecycle.ts reads ECOLOGY_TIER for the running rule (ruling 1's argument)
    const sim = makeSourceSim();
    sim.world.zones[0].type = 'interior';
    const s = createSource(sim, { variant: 'sugary-spill', pos: centre(sim), tier: 1, spillMm: 50 });
    const u0 = s.units;
    for (let i = 0; i < TICKS_PER_DAY; i++) { sim.tick(); sim.events.flush(); }
    expect(s.units).toBe(u0);
  });
});
