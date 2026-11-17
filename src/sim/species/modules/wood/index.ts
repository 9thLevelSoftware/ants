// Economy module `wood-nesting` (Camponotus, GDD 07 §6.2; task docs/design/tasks/species-carpenter.md). Systems,
// behaviours and command handlers picked up by the composition roots (rulings 9, 13); the module's rules plugged
// into the dig-bite and founding-depth hooks (hooks.ts). Every system is inert unless a colony nests in wood.

import type { Behaviour, CommandHandlerMap, SimInvariant, System } from '@/sim/types';
import {
  FRASS_FALL_TICKS, WOOD_BROOD_TICKS, WOOD_CASTE_TICKS, WOOD_DIAG_TICKS, WOOD_SHUTTLE_TICKS, WOOD_UPDATE_TICKS,
} from '@/sim/balance/species-carpenter';
import { assignShuttles } from './satellites';
import { assignReturns } from './returns';
import { installWoodHooks } from './hooks';
import { playedWoodParams, woodColonies, colonyWoodParams } from './params';
import { ensureWoodStates, woodOf } from './woodState';
import { setWood, stepAllWood } from './moisture';
import { assignCastes, naniticLifespans } from './castes';
import { broodMoisturePass } from './broodMoisture';
import { colonyHourly } from './colonyPass';
import { frassFallPass } from './frassFall';
import { woodInvariants } from './invariants';
import { woodBehaviours } from './behaviours';

installWoodHooks();

/** Systems of this module (each with a `phase`). */
export const systems: readonly System[] = [
  {
    name: 'wood-state', phase: 'environment', every: WOOD_UPDATE_TICKS, offset: 7,
    run(sim) {
      const p = playedWoodParams(sim);
      if (!p) return;
      stepAllWood(sim, ensureWoodStates(sim), p);
    },
  },
  {
    name: 'wood-castes', phase: 'brood', every: WOOD_CASTE_TICKS, offset: 3,
    run(sim) {
      for (const col of woodColonies(sim)) {
        const def = sim.getSpecies(col.species);
        const p = colonyWoodParams(sim, col);
        if (!def || !p) continue;
        // castes already announced are persisted on the colony's wood record (a second game reuses colony ids)
        const seen = new Set(col.wood?.castesAnnounced ?? []);
        const fresh = assignCastes(sim, def, col, p, seen);
        if (fresh.length > 0 && col.wood) col.wood.castesAnnounced = [...seen];
        for (const caste of fresh) sim.emit({ type: 'caste-unlocked', colonyId: col.id, caste });
        naniticLifespans(sim, col);
      }
    },
  },
  {
    name: 'wood-brood', phase: 'brood', every: WOOD_BROOD_TICKS, offset: 5,
    run(sim) {
      for (const col of woodColonies(sim)) {
        const def = sim.getSpecies(col.species);
        const p = colonyWoodParams(sim, col);
        if (def && p) broodMoisturePass(sim, def, col, p);
      }
    },
  },
  {
    name: 'wood-shuttle', phase: 'colony-allocation', every: WOOD_SHUTTLE_TICKS, offset: 9,
    run(sim) {
      for (const col of woodColonies(sim)) {
        const def = sim.getSpecies(col.species);
        const p = colonyWoodParams(sim, col);
        if (!def || !p || !col.wood || !col.wood.sites.some((s) => s.role === 'satellite')) continue;
        assignReturns(sim, def, col, p); // young brood back to the parent first (priority, §6.2.6)
        assignShuttles(sim, def, col, p);
      }
    },
  },
  {
    // frass dropped at an opening rolls off the wood and falls to the foot of it (GDD 07 §6.2.3)
    name: 'wood-frass-fall', phase: 'nest', every: FRASS_FALL_TICKS, offset: 4,
    run(sim) {
      if (woodColonies(sim).length > 0) frassFallPass(sim);
    },
  },
  {
    name: 'wood-colony', phase: 'colony-economy', every: WOOD_DIAG_TICKS, offset: 11,
    run(sim) {
      for (const col of woodColonies(sim)) colonyHourly(sim, col);
    },
  },
];

/** Species-specific behaviours (set `species` on each). */
export const behaviours: readonly Behaviour[] = woodBehaviours;

/** Command handlers this module owns. */
export const commandHandlers: Partial<CommandHandlerMap> = {
  // moisture and decay of one wood primitive (GDD 07 App. B); the values hold (they become the wood's placement value)
  'cheat.setWood': (sim, c) => {
    const w = woodOf(sim, c.primId);
    if (!w) {
      sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'no-target', detail: `primitive ${c.primId} is not nest wood` });
      return;
    }
    setWood(w, Number(c.mc), Number(c.decay));
  },
};

/** Soak invariants of the module (collected through SIM_MODULES by src/sim/testing/invariants.ts). */
export const invariants: readonly SimInvariant[] = woodInvariants;
