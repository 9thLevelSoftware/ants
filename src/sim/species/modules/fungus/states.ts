// Garden states (GDD 07 §6.4.3): the transitions after each step. Pure; returns the new state (or the same).
//   seeded -> establishing (G >= 1) -> healthy (G >= 3); healthy <-> stressed (h 0.6); stressed -> collapsing (h < 0.2);
//   collapsing -> stressed (h >= 0.3) or dead (G < 0.1 or h <= 0.05); any live state -> infected while i > 0, back to
//   the state before once i < 0.01 (i set to 0), dead at i >= 0.8. A dead garden's mass is all waste.

import type { GardenRecord, GardenState } from '@/sim/types';
import type { FungusParams } from './params';

/** The state a live, uninfected garden should be in by its mass and health (the "previous state" after an infection). */
function byMassAndHealth(P: FungusParams, g: GardenRecord, from: GardenState): GardenState {
  const h = g.health;
  if (from === 'collapsing') {
    if (g.biomass < P.deadG || h <= P.deadH) return 'dead';
    return h >= P.collapseRecoverH ? 'stressed' : 'collapsing';
  }
  if (h < P.collapseH) return 'collapsing';
  if (from === 'seeded') return g.biomass >= P.establishingG ? 'establishing' : 'seeded';
  if (from === 'establishing') return g.biomass >= P.healthyG ? (h >= P.healthyH ? 'healthy' : 'stressed') : 'establishing';
  // healthy / stressed
  return h >= P.healthyH ? 'healthy' : 'stressed';
}

/** Next state of a garden after a step. */
export function nextState(P: FungusParams, g: GardenRecord): GardenState {
  const s = g.state;
  if (s === 'dead') return 'dead';
  if (g.biomass < P.deadG && s !== 'seeded') return 'dead';
  if (s === 'infected') {
    if (g.infection >= P.escDeadI) return 'dead';
    if (g.infection < P.escClearI) {
      g.infection = 0;
      return byMassAndHealth(P, g, g.preInfectState ?? 'stressed');
    }
    // an infected garden can still collapse under it
    if (g.health <= P.deadH) return 'dead';
    return 'infected';
  }
  if (g.infection > 0) {
    g.preInfectState = s;
    return 'infected';
  }
  return byMassAndHealth(P, g, s);
}

/** Kills a garden: all its mass becomes waste to remove (GDD 07 §6.4.3 `dead`). */
export function killGarden(g: GardenRecord, tick: number): void {
  g.waste += g.biomass;
  g.biomass = 0;
  g.infection = 0;
  g.state = 'dead';
  g.diedTick = tick;
  g.yieldStanding = 0;
}
