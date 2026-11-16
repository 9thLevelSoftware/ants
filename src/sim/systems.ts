// Composition root of the simulation modules (rulings 9, 13). Every module's index.ts exports `systems`,
// optionally `behaviours`, and `commandHandlers`; this file lists the modules ONCE in a fixed order and derives:
//   SYSTEMS     - all systems sorted by tick-order phase (SYSTEM_PHASES), stable by module then array order;
//   BEHAVIOURS  - all behaviours, looked up through createBehaviourTable (species-specific first);
//   SIM_MODULES - read by commands.ts to merge the command handlers.
// Module owners never edit this file: they add entries to their own module's arrays.

import type { Behaviour, BehaviourTable, ColonySpeciesId, CommandHandlerMap, System, Task } from '@/sim/types';
import { SYSTEM_PHASES } from '@/sim/types';
import * as world from '@/sim/world';
import * as environment from '@/sim/environment';
import * as ecology from '@/sim/ecology';
import * as colony from '@/sim/colony';
import * as ants from '@/sim/ants';
import * as locomotion from '@/sim/locomotion';
import * as combat from '@/sim/combat';
import * as nest from '@/sim/nest';
import * as pheromones from '@/sim/pheromones';
import * as rivals from '@/sim/rivals';
import * as progression from '@/sim/progression';
import { SPECIES_MODULES } from '@/sim/species/modules';

/** What a module index contributes. */
export interface SimModule {
  systems: readonly System[];
  behaviours?: readonly Behaviour[];
  commandHandlers: Partial<CommandHandlerMap>;
}

/** Module keys, in merge order. */
export type SimModuleKey =
  | 'world' | 'environment' | 'ecology' | 'colony' | 'ants' | 'locomotion' | 'combat' | 'nest' | 'pheromones'
  | 'rivals' | 'progression' | (typeof SPECIES_MODULES)[number]['key'];

export const SIM_MODULES: readonly { key: SimModuleKey; mod: SimModule }[] = [
  { key: 'world', mod: world },
  { key: 'environment', mod: environment },
  { key: 'ecology', mod: ecology },
  { key: 'colony', mod: colony },
  { key: 'ants', mod: ants },
  { key: 'locomotion', mod: locomotion },
  { key: 'combat', mod: combat },
  { key: 'nest', mod: nest },
  { key: 'pheromones', mod: pheromones },
  { key: 'rivals', mod: rivals },
  { key: 'progression', mod: progression },
  ...SPECIES_MODULES,
];

/** First system of every tick: applies the commands queued since the previous tick. */
export const commandsSystem: System = { name: 'commands', phase: 'commands', run: (sim) => sim.applyPendingCommands() };

/** Systems of the given modules in tick order. Systems without a phase are rejected (listed in `unphased`). */
export function assembleSystems(modules: readonly { mod: SimModule }[]): { systems: System[]; unphased: string[] } {
  const all: System[] = [commandsSystem];
  for (const m of modules) all.push(...m.mod.systems);
  const unphased = all.filter((s) => s.phase === undefined).map((s) => s.name);
  const rank = (s: System): number => SYSTEM_PHASES.indexOf(s.phase ?? 'lifecycle');
  const systems = all
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map((x) => x.s);
  return { systems, unphased };
}

/**
 * An array that is filled on first use. The module lists below are built from every module's index, and those
 * indexes import each other in cycles: when a test enters through a deep module (say ecology/sources), this file can
 * be evaluated while some module is only half loaded and its `systems` still holds undefined entries. Building the
 * lists on first use, after every module has finished loading, makes the result independent of the import order.
 */
function lazyList<T>(build: () => readonly T[]): readonly T[] {
  const target: T[] = [];
  let filled = false;
  const fill = (): void => {
    if (filled) return;
    filled = true;
    target.push(...build());
  };
  return new Proxy(target, {
    get: (t, k, r) => { fill(); return Reflect.get(t, k, r); },
    has: (t, k) => { fill(); return Reflect.has(t, k); },
    ownKeys: (t) => { fill(); return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor: (t, k) => { fill(); return Reflect.getOwnPropertyDescriptor(t, k); },
  });
}

export const SYSTEMS: readonly System[] = lazyList(() => assembleSystems(SIM_MODULES).systems);

export const BEHAVIOURS: readonly Behaviour[] = lazyList(() => SIM_MODULES.flatMap((m) => m.mod.behaviours ?? []));

/** Behaviour lookup: a behaviour listing the colony's species wins over the generic one for the same task. */
export function createBehaviourTable(list: readonly Behaviour[]): BehaviourTable {
  const generic = new Map<Task, Behaviour>();
  const specific = new Map<string, Behaviour>();
  for (const b of list) {
    if (!b.species) generic.set(b.task, b);
    else for (const sp of b.species) specific.set(`${b.task}|${sp}`, b);
  }
  return {
    get: (task: Task, species: ColonySpeciesId) => specific.get(`${task}|${species}`) ?? generic.get(task),
  };
}

/** Behaviours claimed twice for the same task and species (the completeness test asserts none). */
export function duplicateBehaviours(list: readonly Behaviour[]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const b of list) {
    for (const k of b.species ? b.species.map((sp) => `${b.task}|${sp}`) : [`${b.task}|*`]) {
      if (seen.has(k)) dup.push(k);
      seen.add(k);
    }
  }
  return dup;
}
