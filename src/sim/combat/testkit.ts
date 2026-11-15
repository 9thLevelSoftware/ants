// Test support for the combat module (used by *.test.ts only): a small flat-world sim running the systems a fight
// needs (commands, behaviours with only `fight` / `patrol` registered, player control, actions, locomotion,
// combat, lifecycle), a rival colony, ants placed face to face, event capture and a state hash.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Caste, ColonySpeciesId, Sim, System } from '@/sim/types';
import { createColony, spawnAnt } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing/testWorld';
import { actionSystem, behaviourSystem, lifecycleSystem, playerControlSystem } from '@/sim/ants';
import { fightBehaviour } from '@/sim/ants/behaviours/outdoor/fight';
import { patrolBehaviour } from '@/sim/ants/behaviours/outdoor/patrol';
import { locomotionSystem } from '@/sim/locomotion';
import { combatSystem } from './index';
import { combatFlags, setCombatFlags, type CombatFlags } from './state';

export const COMBAT_TEST_SYSTEMS: readonly System[] = [
  commandsSystem, behaviourSystem, playerControlSystem, actionSystem, locomotionSystem, combatSystem, lifecycleSystem,
];
/** A task whose behaviour does nothing (so scripted walks are not stopped by the idle default). */
export const MANUAL_TASK = 'scout' as const;
const manualBehaviour: Behaviour = { task: MANUAL_TASK, enter: () => {}, update: () => {}, exit: () => {} };
export const COMBAT_TEST_BEHAVIOURS: readonly Behaviour[] = [fightBehaviour, patrolBehaviour, manualBehaviour];

/** Body temperature giving temperature factor 1 for Lasius (so strike durations are their base values). */
export const COMFORT_TB = 25;

export interface ArenaOptions {
  seed?: number;
  species?: ColonySpeciesId;
  systems?: readonly System[];
  behaviours?: readonly Behaviour[];
  flags?: Partial<CombatFlags>;
  /** No recruitment / encounter scans (scripted fights only). */
  manual?: boolean;
  /** The standard small test nest for the player colony (entrance near x 14 BU east of the world centre). */
  nest?: boolean;
  sizeBu?: number;
}

export interface Arena {
  sim: Sim;
  /** Player colony id and a rival colony id. */
  home: number;
  rival: number;
}

/** A 96 BU flat test world with the player colony and one rival colony of `species` (default Lasius). */
export function arena(o: ArenaOptions = {}): Arena {
  const sim = makeTestSim({
    seed: o.seed ?? 1, sizeBu: o.sizeBu ?? 96, nest: o.nest ? 'small' : 'none', systems: [...(o.systems ?? COMBAT_TEST_SYSTEMS)],
    behaviours: [...(o.behaviours ?? COMBAT_TEST_BEHAVIOURS)],
  });
  const rival = createColony(sim, { species: o.species ?? 'lasius-niger', isPlayer: false });
  if (o.flags) setCombatFlags(sim, { noRetreat: false, noInjury: false, noRng: false, ...o.flags });
  if (o.manual) setCombatFlags(sim, { noRetreat: false, noInjury: false, noRng: false, ...o.flags, noScan: true });
  return { sim, home: sim.state.colonies[0].id, rival: rival.id };
}

/** An ant of `colony` at (x, z) BU on the flat ground, facing +X (or `facing`), comfortable body temperature. */
export function ant(sim: Sim, colony: number, xBu: number, zBu: number, caste: Caste = 'worker', facing?: Vec3, lengthBu?: number): Ant {
  const bu = sim.world.bu;
  const fwd = facing ?? { x: 1, y: 0, z: 0 };
  const a = spawnAnt(sim, { colony, caste, pos: { x: xBu * bu, y: 0, z: zBu * bu }, fwd: { ...fwd }, lengthBu: lengthBu ?? (caste === 'worker' ? 1 : undefined), task: 'idle' });
  a.tb = COMFORT_TB;
  return a;
}

/** Two ants of different colonies face to face, `gapL` body lengths between their centres along X. */
export function faceToFace(a: Arena, gapL = 0.9, casteA: Caste = 'worker', casteB: Caste = 'worker'): [Ant, Ant] {
  const x0 = 40, z0 = 40;
  const p = ant(a.sim, a.home, x0, z0, casteA, { x: 1, y: 0, z: 0 });
  const len = p.lengthBu;
  const q = ant(a.sim, a.rival, x0 + gapL * len, z0, casteB, { x: -1, y: 0, z: 0 });
  a.sim.index.refresh();
  return [p, q];
}

export function step(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** Steps until `done()` or `max` ticks; returns the ticks stepped. */
export function stepUntil(sim: Sim, done: () => boolean, max: number): number {
  let n = 0;
  while (n < max && !done()) { sim.tick(); n++; }
  return n;
}

/** Collects events of the given types (all when omitted) while the sim runs; returns the live list. */
export function record(sim: Sim, types?: readonly string[]): { type: string; [k: string]: unknown }[] {
  const got: { type: string; [k: string]: unknown }[] = [];
  const ev = sim.events as unknown as { on(t: string, f: (e: unknown) => void): void; onAny?(f: (e: unknown) => void): void };
  const push = (e: unknown): void => { got.push(e as { type: string }); };
  for (const t of types ?? []) ev.on(t, push);
  return got;
}

/** A cheap deterministic hash of the plain state (typed arrays included). */
export function stateHash(sim: Sim): string {
  let h = 2166136261 >>> 0;
  const s = JSON.stringify(sim.state, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v));
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

/** Merges combat debug flags into the current ones. */
export function setFlags(sim: Sim, f: Partial<CombatFlags>): void {
  setCombatFlags(sim, { ...combatFlags(sim), ...f });
}
