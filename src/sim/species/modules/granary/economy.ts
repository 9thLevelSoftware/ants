// The granary step (every GRANARY_STEP_TICKS, colony-economy phase): granary records follow the chambers, seed
// cohorts take up chamber humidity and germinate or rot, paste spoils, the animal share of the pool's protein is
// carried along, larvae short of animal protein are slowed, and the pool is topped up from the paste stock.

import type { Colony, Sim, System } from '@/sim/types';
import { GRANARY_STEP_TICKS } from '@/sim/balance/species-harvester';
import { TICKS_PER_DAY } from '@/sim/time';
import { paramsOfColony, type GranaryParams } from './params';
import { stepCohorts } from './cohorts';
import { decayPaste, releasePaste, rescaleAnimalP } from './paste';
import { stepLarvae } from './protein';
import { refreshGranary, syncGranaries } from './state';
import { rollDayCounters } from './counters';
import { emitGranaryStates } from './events';

/** Living full-fidelity colonies with a granary module, with their parameters. */
export function granaryColonies(sim: Sim): { col: Colony; g: GranaryParams }[] {
  const out: { col: Colony; g: GranaryParams }[] = [];
  for (const col of sim.state.colonies) {
    if (!col.alive || !col.granary || col.fidelity !== 'full') continue;
    const g = paramsOfColony(sim, col);
    if (g) out.push({ col, g });
  }
  return out;
}

/** One granary step of a colony over dtGd game days. */
export function stepColonyGranary(sim: Sim, col: Colony, g: GranaryParams, dtGd: number): void {
  const mod = col.granary!;
  const def = sim.getSpecies(col.species);
  rollDayCounters(sim, mod);
  mod.pasteHalfLifeTicks = Math.round(g.pasteHalfLifeGd * TICKS_PER_DAY);
  mod.rottenPending = (mod.rottenPending ?? 0) + syncGranaries(sim, mod, g);
  for (const gr of mod.granaries) {
    refreshGranary(sim, gr, g);
    const r = stepCohorts(gr, g, gr.humidity ?? 0, gr.tempC ?? 20, dtGd);
    if (r.rotten > 0) mod.rottenPending = (mod.rottenPending ?? 0) + r.rotten;
  }
  emitGranaryStates(sim, mod);
  decayPaste(mod, g, dtGd);
  rescaleAnimalP(col, mod);
  stepLarvae(sim, col, mod, g, def?.life.animalProteinMinFrac ?? 0);
  releasePaste(col, mod, g);
  mod.poolPLast = col.stores.p;
  mod.lastStepTick = sim.state.tick;
}

export const granaryEconomySystem: System = {
  name: 'granary-economy', phase: 'colony-economy', every: GRANARY_STEP_TICKS,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) {
      const last = col.granary!.lastStepTick ?? -1;
      const dt = last >= 0 ? sim.state.tick - last : GRANARY_STEP_TICKS;
      stepColonyGranary(sim, col, g, dt / TICKS_PER_DAY);
    }
  },
};
