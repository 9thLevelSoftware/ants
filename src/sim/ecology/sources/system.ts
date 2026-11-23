// The hourly sources system (GDD 05 §0 cadence: every ECO_HOURLY_EVERY = 250 ticks, dt = 1/24 gd).

import type { Sim, System } from '@/sim/types';
import { HOURLY_EVERY, SOURCES_OFFSET } from '@/sim/balance';
import { ECOLOGY_TIER } from '@/sim/balance/ecology';
import { colonySlotBit } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { isAvoidedBy } from './discovery';
import { isCrumbHour, replaceCrumbs, runCarrionDrops } from './drops';
import { updateSource } from './lifecycle';

/**
 * One hourly step of every source, the carrion drops and the T1 crumb rule, under the rules of `tier`. The game runs
 * ECOLOGY_TIER (R1); tests of the Tier 1 rules pass 1 (gate-sim-2, integrator ruling 1).
 */
export function runSources(sim: Sim, dtGd: number, tier: number = ECOLOGY_TIER): void {
  const list = sim.stores.sources.list;
  const n = list.length; // sources created during the step wait for the next one
  for (let i = 0; i < n; i++) updateSource(sim, list[i], dtGd, tier);
  runCarrionDrops(sim, dtGd, tier);
  if (tier === 1 && isCrumbHour(sim)) replaceCrumbs(sim, tier);
  syncAvoidBits(sim);
}

/** Refreshes FoodSource.avoidBy from the colonies' avoid markers (GDD 05 §1.8). */
export function syncAvoidBits(sim: Sim): void {
  const colonies = sim.stores.colonies.list;
  for (const s of sim.stores.sources.list) {
    if (!s.alive) continue;
    let bits = 0;
    for (const c of colonies) if (c.alive && isAvoidedBy(sim, s, c.id)) bits |= colonySlotBit(sim, c.id);
    s.avoidBy = bits;
  }
}

/** The sources system under the rules of `tier` (same name, cadence and offset at every tier). */
export function makeSourcesSystem(tier: number = ECOLOGY_TIER): System {
  return {
    name: 'sources', phase: 'ecology', every: HOURLY_EVERY, offset: SOURCES_OFFSET,
    run: (sim) => runSources(sim, HOURLY_EVERY / TICKS_PER_DAY, tier),
  };
}

/** Source renewal, decay, carrion stages, drops and the T1 crumb rule, at the game's tier. */
export const sourcesSystem: System = makeSourcesSystem();
