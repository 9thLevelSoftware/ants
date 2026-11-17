// Economy module `granary` (Messor barbarus, GDD 07 §5.3 and §6.3; task species-harvester). Contributes its systems,
// behaviours and command handlers through the arrays below (rulings 9, 13); the composition roots pick them up.
//
//   seeds.ts         seed sites and nodes (grass-seed anchors, ground patches), seed rain
//   delivery.ts      seeds put down in the nest go into a granary cohort; animal protein noted
//   cohorts.ts       moisture, germination, rot, merging, radicle gnawing (pure)
//   state.ts         granary records per chamber, capacity, climate, where seeds go
//   paste.ts         milling, paste spoilage, the pool topped up from paste, animal share of pool P
//   protein.ts       the animal-protein minimum (larvae short of it grow at half rate)
//   economy.ts       the granary step that runs the above
//   actions.ts       mill-seed, gnaw-radicle, cut-seed-head primitives
//   behaviour*.ts    mill, store (granary care), forage and scout (seed selection, heat range, departure gate)
//   rhythm.ts        heat on the trails, summer lull, morning patrol gate
//   allocation.ts    mill / care / patrol labour demand
//   castes.ts        caste destiny of worker larvae (minor / media / major, the major unlock and protein gate)
//   middens.ts       chaff middens and their seedlings
//   trunk.ts         trunk trails: cells walked by seed carriers, kept scented while used, fading when not
//   winter.ts        granary stock into the pool for the overwintering
//   display.ts       a few inert seed items on each granary floor, mirroring the stock (pictures)
//   diagnostics.ts   diag-granary, diag-mb-*
// The Messor founding variation (winter inside the first-brood lapse) lives in src/sim/colony/founding/species/messor.ts
// and is registered here.

import type { Behaviour, CommandHandlerMap, SimInvariant, System } from '@/sim/types';
import { chamberEntry } from '@/sim/colony/census';
import { messorLapseWinterSystem } from '@/sim/colony/founding/species/messor';
import { registerGranaryActions } from './actions';
import { granaryAllocationSystem } from './allocation';
import { casteDestinySystem } from './castes';
import { harvesterForageBehaviour, harvesterScoutBehaviour } from './behaviourForage';
import { granaryStoreBehaviour } from './behaviourCare';
import { millBehaviour } from './behaviourMill';
import { addSeeds } from './cohorts';
import { granaryDeliverySystem } from './delivery';
import { granaryDiagnosticsSystem } from './diagnostics';
import { granaryDisplaySystem } from './display';
import { granaryEconomySystem } from './economy';
import { middenSystem } from './middens';
import { granaryParams } from './params';
import { patrolGateSystem } from './rhythm';
import { seedSourceSystem } from './seeds';
import { ensureGranary } from './state';
import { granaryWinterSystem } from './winter';
import { trunkTrailSystem } from './trunk';

registerGranaryActions();

/** Systems of this module (each with a `phase`). */
export const systems: readonly System[] = [
  messorLapseWinterSystem, seedSourceSystem, patrolGateSystem, granaryAllocationSystem, casteDestinySystem,
  granaryDeliverySystem,
  granaryEconomySystem, middenSystem, granaryWinterSystem, granaryDisplaySystem, granaryDiagnosticsSystem, trunkTrailSystem,
];

/** Species-specific behaviours (set `species` on each). */
export const behaviours: readonly Behaviour[] = [
  millBehaviour, granaryStoreBehaviour, harvesterForageBehaviour, harvesterScoutBehaviour,
];

/** Command handlers this module owns. */
export const commandHandlers: Partial<CommandHandlerMap> = {
  // debug (GDD 07 App. B): seeds straight into the granary record of a chamber
  'cheat.addSeeds': (sim, c) => {
    const e = chamberEntry(sim, c.granaryId);
    const col = e ? sim.stores.colonies.get(e.colony) : undefined;
    const g = col ? granaryParams(sim.getSpecies(col.species)) : null;
    if (!e || !col?.granary || !g) {
      sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'invalid-target', detail: `no granary colony owns chamber ${c.granaryId}` });
      return;
    }
    addSeeds(ensureGranary(sim, col.granary, g, c.granaryId), g, c.seedClass, c.hardness, c.loads, c.u, c.g);
  },
};

/** Invariants checked by soaks and tests: granary numbers finite and non-negative. */
export const invariants: readonly SimInvariant[] = [
  {
    name: 'granary-finite',
    check(sim, fail) {
      for (const col of sim.state.colonies) {
        const m = col.granary;
        if (!col.alive || !m) continue;
        if (!Number.isFinite(m.pasteLoads) || m.pasteLoads < 0) fail(`colony ${col.id} pasteLoads ${m.pasteLoads}`);
        for (const gr of m.granaries) {
          for (const c of gr.cohorts) {
            const bad = !Number.isFinite(c.loads) || c.loads < 0 || !(c.u >= 0 && c.u <= 1) || !(c.g >= 0 && c.g <= 1);
            if (bad) fail(`colony ${col.id} granary ${gr.chamberId} cohort loads ${c.loads} u ${c.u} g ${c.g}`);
          }
        }
      }
    },
  },
];
