// Economy module `wood-nesting` (Camponotus, GDD 07 §6.2; task docs/design/tasks/species-carpenter.md). Systems,
// behaviours and command handlers picked up by the composition roots (rulings 9, 13); the module's rules plugged
// into the dig-bite and founding-depth hooks (hooks.ts). Every system is inert unless a colony nests in wood.

import type { Behaviour, CommandHandlerMap, SimInvariant, System } from '@/sim/types';
import { WOOD_BROOD_TICKS, WOOD_CASTE_TICKS, WOOD_DIAG_TICKS, WOOD_SHUTTLE_TICKS, WOOD_UPDATE_TICKS } from '@/sim/balance/species-carpenter';
import { assignShuttles } from './satellites';
import { installWoodHooks } from './hooks';
import { playedWoodParams, woodColonies, colonyWoodParams } from './params';
import { ensureWoodStates, woodOf } from './woodState';
import { setWood, stepAllWood } from './moisture';
import { assignCastes } from './castes';
import { broodMoisturePass } from './broodMoisture';
import { colonyHourly } from './colonyPass';
import { woodInvariants } from './invariants';
import { woodBehaviours } from './behaviours';

installWoodHooks();

/** Castes already announced per colony (derived; the event is a journal cue, a repeat after a load is harmless). */
const announced = new Map<number, Set<string>>();

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
        let seen = announced.get(col.id);
        if (!seen) { seen = new Set(); announced.set(col.id, seen); }
        for (const caste of assignCastes(sim, def, col, p, seen)) sim.emit({ type: 'caste-unlocked', colonyId: col.id, caste });
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
        if (def && p && col.wood && col.wood.sites.some((s) => s.role === 'satellite')) assignShuttles(sim, def, col, p);
      }
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
