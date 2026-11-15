// Rival colonies (GDD 05 §3; owner: rivals): abstract populations (Colony.rival), fielded agents (task `raid`),
// real nests, territory, relations and escalation, raids and brood raids, destruction and new foundations,
// threats to the founding queen. See README.md for the files and the seams.
//
// This index is LIGHT (combat imports relationOf from it): the heavy half is bound late through late.ts /
// wiring.ts, and the `raid` behaviour is registered in src/sim/ants/behaviours/outdoor/index.ts.

import type { CommandHandlerMap, Sim, SimInvariant, System } from '@/sim/types';
import { HOURLY_EVERY, RIVALS_OFFSET } from '@/sim/balance';
import { ANT_TOTAL_CAP } from '@/sim/balance/rivals';
import { rivalsImpl } from './late';
import { rivalColonies, rmod } from './state';
import { rivalProfile } from '@/sim/species/rivals/profiles';

/** Per tick: real nests on the first tick, deaths, territory deposits, fielding and raids, alerts, the ant cap. */
export const rivalsTickSystem: System = { name: 'rivals-agents', phase: 'rivals', run: (sim) => rivalsImpl().tick(sim) };

/** Hourly: abstract model, territory decay and scan, escalation, raid launches, destruction, foundations. */
export const rivalsSystem: System = {
  name: 'rivals', phase: 'rivals', every: HOURLY_EVERY, offset: RIVALS_OFFSET, run: (sim) => rivalsImpl().hourly(sim),
};

export const systems: readonly System[] = [rivalsTickSystem, rivalsSystem];

export { relationOf, isHostile, findRelation, addEscalation } from './relations';
export { initRivals, createRivalColony } from './init';
export { cellAt, claimAt, marksAt, type CellClaim } from './claims';
export { rivalProfile };
export { rivalColonies, rmod, colExt, slotOf, JOB, JOB_NAMES, type RivalColony } from './state';

/** Compact read-out of the rival colonies (debug API `query.rivals`, inspect cards). */
export function rivalSummary(sim: Sim): {
  colonyId: number; species: string; n: number; b: number; cS: number; pS: number; agg: number; fielded: number;
  queens: number; orphaned: boolean; incipient: boolean; claimedCells: number;
}[] {
  const m = rmod(sim.state);
  return rivalColonies(sim).map((c) => ({
    colonyId: c.id, species: c.species, n: Math.round(c.rival.n * 10) / 10, b: Math.round(c.rival.b * 10) / 10,
    cS: Math.round(c.rival.cS * 10) / 10, pS: Math.round(c.rival.pS * 10) / 10, agg: Math.round(c.rival.agg * 100) / 100,
    fielded: c.rival.fieldedIds.length, queens: c.queens.length, orphaned: c.rival.orphaned, incipient: c.rival.incipient,
    claimedCells: m.colonies.find((e) => e.colonyId === c.id)?.claimedCells ?? 0,
  }));
}

/** Invariants (collected by src/sim/testing/invariants.ts): the ant budget and the abstract numbers. */
export const invariants: readonly SimInvariant[] = [
  {
    name: 'rivals-ant-budget',
    check(sim, fail) {
      let total = 0;
      for (const a of sim.stores.ants.list) if (a.alive) total++;
      if (total > ANT_TOTAL_CAP) fail(`${total} simulated ants > ${ANT_TOTAL_CAP}`);
    },
  },
  {
    name: 'rivals-abstract-valid',
    check(sim, fail) {
      for (const c of rivalColonies(sim)) {
        const r = c.rival;
        for (const [k, v] of [['n', r.n], ['b', r.b], ['cS', r.cS], ['pS', r.pS], ['agg', r.agg]] as const) {
          if (!(v >= 0) || !Number.isFinite(v)) fail(`rival ${c.id}: ${k}=${v}`);
        }
        // I6: N <= K_max x rivalKMult
        const k = rivalProfile(c.species).kMax * sim.state.config.difficulty.params.rivalKMult;
        if (r.n > k + 1e-6) fail(`rival ${c.id}: N ${r.n.toFixed(1)} > K_max x rivalKMult ${k}`);
      }
    },
  },
];

/** Debug commands (GDD 05 App. B). */
export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.setRival': (sim, c) => rivalsImpl().handlers['cheat.setRival']?.(sim, c),
  'cheat.setRelation': (sim, c) => rivalsImpl().handlers['cheat.setRelation']?.(sim, c),
  'cheat.triggerRaid': (sim, c) => rivalsImpl().handlers['cheat.triggerRaid']?.(sim, c),
};
