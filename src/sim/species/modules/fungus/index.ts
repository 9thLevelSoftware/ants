// Economy module `fungus-garden` (Atta texana, GDD 07 §5.4 and §6.4; task species-leafcutter). Contributes its
// systems, behaviours and command handlers through the arrays below (rulings 9, 13); the composition roots pick
// them up.
//
//   params.ts         the species block as a typed record
//   climate.ts        fT, fRH, climate damage (pure)
//   dynamics.ts       one garden over a step: growth, starvation, health, contamination, Escovopsis, yield (pure)
//   states.ts         garden state machine (pure)
//   substrate.ts      the substrate ledger: planted LU, traits, plant shares (pure)
//   cache.ts          leaf cache and pulp: spoilage, drying
//   state.ts          garden records per chamber, Gcap, seeding
//   economy.ts        the garden step: inputs, outbreaks, events, standing staphylae, pool top-up
//   spread.ts         Escovopsis spread between gardens; quarantine.ts the avoid-marker quarantine
//   gardenLess.ts     the colony with no garden left
//   rejection.ts      learned rejection of harmful plants
//   leaves.ts         leaf sites (plants and herbage around the nest), regrowth
//   actions.ts        cut-leaf, process-leaf, tend-fungus, plant (founding)
//   behaviourCut.ts   task `cut`: cut and carry fragments to a garden's cache
//   behaviourGarden.ts task `garden`: weed, process, plant, harvest, fungus pieces, tend
//   behaviourHaul.ts  task `haul` / garden-waste (then the shared haul); refuse.ts refuse workers; wasteDump.ts
//   phorids.ts        hitchhikers and phorid strikes on laden carriers; parasitised deaths
//   allocation.ts     garden and cut labour demand
//   castes.ts         caste destiny (minim / small media / media / major, the major gate on garden yield)
//   chain.ts          processing-chain throughput and the bottleneck detector
//   feedRule.ts       an Atta nurse feeds larvae fungus food from her crop
//   diagnostics.ts    diag-garden, diag-at-chain, diag-at-substrate, diag-at-phorid
//   cheats.ts         cheat.setGarden, cheat.supplySubstrate, cheat.infectGarden
// The Atta founding variation (the fungus pellet) lives in src/sim/colony/founding/species/atta.ts and is
// registered here.

import type { Behaviour, CommandHandlerMap, SimInvariant, System } from '@/sim/types';
import { attaFoundingSystem } from '@/sim/colony/founding/species/atta';
import { registerFungusActions } from './actions';
import { registerFeedRule } from './feedRule';
import { registerDisplayGuard } from './displayGuard';
import { gardenEconomySystem, atColonies } from './economy';
import { leafSiteSystem } from './leaves';
import { fungusAllocationSystem } from './allocation';
import { attaCasteSystem } from './castes';
import { fungusDiagnosticsSystem } from './diagnostics';
import { phoridDeathSystem } from './phorids';
import { holdGardenLessLaying, holdLayingToFungus } from './gardenLess';
import { cutBehaviour } from './behaviourCut';
import { gardenBehaviour } from './behaviourGarden';
import { attaHaulBehaviour } from './behaviourHaul';
import { refuseGuardAfterAllocation, refuseGuardAfterBehaviours } from './refuse';
import { fungusCheats } from './cheats';
import { gardenDisplaySystem } from './display';
import { chamberRhRule } from '@/sim/colony/envAdapter';
import { gardenChamberRh } from './chamberClimate';

registerFungusActions();
registerFeedRule();
registerDisplayGuard();
// chained, not replaced: another species module may own the rule for its own chambers (the slot is single)
const previousRhRule = chamberRhRule.fn;
if (previousRhRule !== gardenChamberRh) {
  chamberRhRule.fn = previousRhRule
    ? (sim, chamberId) => gardenChamberRh(sim, chamberId) ?? previousRhRule(sim, chamberId)
    : gardenChamberRh;
}

/** Every tick: a garden-less colony's queen lays nothing (her slow tick may add to her laying budget). */
const gardenLessLayingSystem: System = {
  name: 'fungus-garden-less-laying', phase: 'behaviours',
  run(sim) {
    for (const { col, P } of atColonies(sim)) { holdGardenLessLaying(sim, col); holdLayingToFungus(sim, col, P); }
  },
};

/** Systems of this module (each with a `phase`). */
export const systems: readonly System[] = [
  attaFoundingSystem, leafSiteSystem, fungusAllocationSystem, refuseGuardAfterAllocation, attaCasteSystem,
  gardenLessLayingSystem, gardenEconomySystem, refuseGuardAfterBehaviours, gardenDisplaySystem, phoridDeathSystem,
  fungusDiagnosticsSystem,
];

/** Species-specific behaviours (set `species` on each). */
export const behaviours: readonly Behaviour[] = [cutBehaviour, gardenBehaviour, attaHaulBehaviour];

/** Command handlers this module owns. */
export const commandHandlers: Partial<CommandHandlerMap> = { ...fungusCheats };

const finite = (x: number | undefined) => x === undefined || Number.isFinite(x);

/** Invariants checked by soaks and tests: garden numbers finite and in range. */
export const invariants: readonly SimInvariant[] = [
  {
    name: 'garden-finite',
    check(sim, fail) {
      for (const col of sim.state.colonies) {
        const m = col.fungus;
        if (!col.alive || !m) continue;
        if (!finite(m.staphylae) || (m.staphylae ?? 0) < 0) fail(`colony ${col.id} staphylae ${m.staphylae}`);
        for (const g of m.gardens) {
          const bad = !Number.isFinite(g.biomass) || g.biomass < 0 || !(g.health >= 0 && g.health <= 1)
            || !(g.infection >= 0 && g.infection <= 1) || !Number.isFinite(g.waste) || g.waste < 0;
          if (bad) fail(`colony ${col.id} garden ${g.chamberId} G ${g.biomass} h ${g.health} i ${g.infection} W ${g.waste} cap ${g.gcap}`);
        }
        for (const s of m.leafSites ?? []) if (!Number.isFinite(s.lu) || s.lu < 0) fail(`colony ${col.id} leaf site ${s.plantId} lu ${s.lu}`);
      }
    },
  },
];
