// Colony module API: allocation, queen, brood, economy, stats, directives, markers, founding, overwintering,
// reproduction. STUB written by F1b/F1c with final signatures. Owners: colony-core (allocation, queen, brood,
// economy, stats, markers/directives), founding (colony/founding), overwinter-repro (colony/overwinter,
// reproduction, succession).

import { rngRange } from '@/core/rng';
import type {
  Ant, BroodCaste, Colony, CommandHandlerMap, CommandOf, FoodAmount, ReasonCode, Sim, System, Task,
} from '@/sim/types';
import { BROOD_CASTES, DEATH_CAUSES, isOneOf, taskIndex } from '@/sim/types';
import {
  ALLOC_EVERY, ALLOC_OFFSET, CHEAT_SPAWN_SCATTER_BU, COLONY_STATS_OFFSET, HOURLY_EVERY, MARKER_DEFAULT_RADIUS_BU,
  STAY_IN_DAYS,
} from '@/sim/balance';
import { killAnt, placeMarker, removeMarker, spawnAnt, spawnBrood } from '@/sim/entities';
import { daysPerYear, daysToTicks, TICKS_PER_DAY } from '@/sim/time';

/** Task allocation (thresholds, demand, targets). Stub: colony-core. */
export const allocationSystem: System = {
  name: 'allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET, run: () => {},
};
/** Queen egg laying, queen nutrition. Stub: colony-core. */
export const queenSystem: System = { name: 'queen', phase: 'queen', run: () => {} };
/** Founding sequence (opening phases, founding model, time-lapse). Stub: founding. */
export const foundingSystem: System = { name: 'founding', phase: 'queen', run: () => {} };
/** Brood development, feeding requests, hazards, eclosion. Stub: colony-core. */
export const broodSystem: System = { name: 'brood', phase: 'brood', run: () => {} };
/** Food pool, upkeep, spoilage, starvation stages, needs. Stub: colony-core. */
export const economySystem: System = { name: 'economy', phase: 'colony-economy', run: () => {} };
/** Counters and hourly/daily statistics series. Stub: colony-core. */
export const colonyStatsSystem: System = {
  name: 'colony-stats', phase: 'colony-economy', every: HOURLY_EVERY, offset: COLONY_STATS_OFFSET, run: () => {},
};
/** Overwintering notice/banner/lapse/report. Stub: overwinter-repro. */
export const overwinterSystem: System = { name: 'overwinter', phase: 'colony-economy', run: () => {} };
/** Alate rearing, nuptial flights, queen death and orphaning. Stub: overwinter-repro. */
export const reproductionSystem: System = { name: 'reproduction', phase: 'colony-economy', run: () => {} };

export const systems: readonly System[] = [
  allocationSystem, queenSystem, foundingSystem, broodSystem, economySystem, colonyStatsSystem, overwinterSystem,
  reproductionSystem,
];

// ---- queries ----

/** The player's colony (colonies[0]), if alive. */
export function playerColony(sim: Sim): Colony | undefined {
  const c = sim.state.colonies[0];
  return c && c.alive ? c : undefined;
}

export function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

/** Current headcount of a task (allocation cache). */
export function taskHeadcount(sim: Sim, colonyId: number, task: Task): number {
  const c = sim.stores.colonies.get(colonyId);
  return c ? c.alloc.actual[taskIndex(task)] : 0;
}

// ---- food, brood, tasks (owner: colony-core) ----

/** Adds food to the colony pool; returns what was accepted (capacity limits). Stub: accepts nothing. */
export function depositFood(_sim: Sim, _colonyId: number, _c: number, _p: number, _toxin = 0): FoodAmount {
  return { c: 0, p: 0 };
}

/** Takes food from the colony pool; returns what was taken. Stub: nothing. */
export function withdrawFood(_sim: Sim, _colonyId: number, _c: number, _p: number): FoodAmount {
  return { c: 0, p: 0 };
}

/** An ant feeds a larva (or the queen when broodId is -1) from its crop; returns what was transferred. Stub: nothing. */
export function feedBrood(_sim: Sim, _giver: Ant, _broodId: number, _c: number, _p: number): FoodAmount {
  return { c: 0, p: 0 };
}

/** The queen lays one egg (or one opening batch); returns the brood id, -1 if she cannot. Stub: -1. */
export function layEgg(_sim: Sim, _queen: Ant, _destined: BroodCaste = 'worker'): number {
  return -1;
}

/** Asks the allocator to switch an ant to a task (markers, jobs, release); false if refused. Stub: false. */
export function requestTask(_sim: Sim, _ant: Ant, _task: Task, _reason: ReasonCode): boolean {
  return false;
}

/** Current demand for a task in worker-equivalents (GDD 02 §6.2). Stub: 0. */
export function colonyDemand(_sim: Sim, _colonyId: number, _task: Task): number {
  return 0;
}

// ---- commands owned by this module ----

function setDirectives(sim: Sim, cmd: CommandOf<'setDirectives'>): void {
  const col = cmd.colonyId !== undefined ? sim.stores.colonies.get(cmd.colonyId) : playerColony(sim);
  if (!col) return;
  // Only known directive keys are copied (commands may arrive as untyped JSON); validation ranges: colony-core.
  const d = col.directives as unknown as Record<string, unknown>;
  const patch = cmd as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    const v = patch[k];
    if (v === undefined || k === 'stayInUntil') continue;
    d[k] = typeof v === 'object' && v !== null ? { ...v } : v;
  }
  if (cmd.stayIn !== undefined) {
    col.directives.stayInUntil = cmd.stayIn ? sim.state.tick + daysToTicks(STAY_IN_DAYS) : -1;
  }
}

/** Places a player marker (caps and validity rules: colony-core). */
function addMarker(sim: Sim, cmd: CommandOf<'placeMarker'>): void {
  const col = playerColony(sim);
  if (!col) return;
  const ids = cmd.chamberIds ?? [];
  placeMarker(sim, {
    kind: cmd.kind, colony: col.id, pos: cmd.pos, radius: cmd.radius ?? MARKER_DEFAULT_RADIUS_BU[cmd.kind] * sim.world.bu,
    targetChamberId: ids.length > 0 ? ids[0] : -1, sourceChamberId: ids.length > 1 ? ids[1] : -1,
    params: { mode: cmd.params?.mode ?? null, priority: cmd.params?.priority ?? null, chamberType: cmd.params?.chamberType ?? null },
  });
}

function cheatSpawnAnts(sim: Sim, cmd: CommandOf<'cheat.spawnAnts'>): void {
  const col = sim.stores.colonies.get(cmd.colonyId);
  if (!col) return;
  const queen = sim.stores.ants.get(col.queenId);
  const base = cmd.pos ?? queen?.pos ?? sim.world.queenStart.pos;
  const r = CHEAT_SPAWN_SCATTER_BU * sim.world.bu;
  for (let i = 0; i < cmd.n; i++) {
    const x = base.x + rngRange(sim.state.rng, -r, r);
    const z = base.z + rngRange(sim.state.rng, -r, r);
    const pos = { x, y: sim.field.height(x, z), z };
    spawnAnt(sim, { colony: col.id, caste: cmd.caste, pos, task: cmd.task ?? 'idle', ageGd: cmd.ageGd });
  }
}

function cheatSpawnBrood(sim: Sim, cmd: CommandOf<'cheat.spawnBrood'>): void {
  const col = sim.stores.colonies.get(cmd.colonyId);
  if (!col) return;
  let pos = sim.stores.ants.get(col.queenId)?.pos ?? sim.world.queenStart.pos;
  let nestId = -1;
  for (const n of sim.stores.nests.list) {
    const ch = n.alive ? n.chambers.find((c) => c.id === cmd.chamberId) : undefined;
    if (ch) { pos = ch.center; nestId = n.id; }
  }
  // `destined` arrives as untyped JSON: null means worker, anything that is not a brood caste is refused.
  const destined = cmd.destined ?? 'worker';
  if (!isOneOf(BROOD_CASTES, String(destined))) {
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: 'invalid-caste', detail: String(destined) });
    return;
  }
  for (let i = 0; i < cmd.n; i++) {
    spawnBrood(sim, {
      colony: col.id, stage: cmd.stage, destined, pos, nestId, chamberId: cmd.chamberId,
      init: { progress: cmd.progress },
    });
  }
}

const noop = (): void => {};

export const commandHandlers: Partial<CommandHandlerMap> = {
  setDirectives,
  placeMarker: addMarker,
  removeMarker: (sim, c) => {
    removeMarker(sim, c.markerId, 'player');
  },
  // founding (owner: founding)
  openingSkipIntro: noop,
  openingBeginTimelapse: noop,
  skipTimelapse: noop, // founding / overwinter-repro (both time-lapses)
  timelapseRespond: noop,
  openingUndo: noop,
  'cheat.completeFounding': noop,
  'cheat.setFoundingState': noop,
  // overwintering and reproduction (owner: overwinter-repro)
  overwinterChoice: noop,
  flightRelease: noop,
  flightPossess: noop,
  flightLand: noop,
  retireColony: noop,
  'cheat.forceFlight': noop,
  'cheat.triggerWinter': noop,
  // colony-core cheats
  'cheat.addFood': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    if (col) { col.stores.c += c.c; col.stores.p += c.p; col.stores.toxin += c.toxin; }
  },
  'cheat.setStores': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    if (col) { col.stores.c = c.c; col.stores.p = c.p; }
  },
  'cheat.spawnAnts': cheatSpawnAnts,
  'cheat.spawnBrood': cheatSpawnBrood,
  'cheat.setQueen': noop, // owner: colony-core
  'cheat.injectReturn': noop, // owner: colony-core (forager activation)
  'cheat.killAll': (sim, c) => {
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === c.colonyId) killAnt(sim, a.id, 'unknown');
  },
  'cheat.killQueen': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    const cause = String(c.cause);
    if (col) killAnt(sim, col.queenId, isOneOf(DEATH_CAUSES, cause) ? cause : 'unknown');
  },
  /** Queen age derives from bornTick (D1.14): move her birth back. */
  'cheat.setQueenAge': (sim, c) => {
    const q = sim.stores.ants.get(sim.stores.colonies.get(c.colonyId)?.queenId ?? -1);
    if (q) q.bornTick = sim.state.tick - daysToTicks(c.days);
  },
  'cheat.setColonyAge': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    if (col) col.foundedTick = sim.state.tick - Math.round(c.years * daysPerYear(sim.state.config) * TICKS_PER_DAY);
  },
};
