// Colony module API: allocation, queen, brood, economy, stats, diagnostics, directives, markers (colony-core,
// implemented in this folder), founding (colony/founding) and overwintering / reproduction / succession
// (overwinter-repro; their systems and handlers below are still stubs). Signatures of the F1c stub are kept;
// additions are optional trailing parameters and new exports.

import { ti } from './taskIdx';
import { rngRange } from '@/core/rng';
import type {
  Ant, BroodCaste, Colony, CommandHandlerMap, CommandOf, FoodAmount, ReasonCode, Sim, System, Task,
} from '@/sim/types';
import { BROOD_CASTES, DEATH_CAUSES, isOneOf } from '@/sim/types';
import { CHEAT_SPAWN_SCATTER_BU, LARVA_C_REQ, LARVA_P_REQ } from '@/sim/balance';
import { killAnt, removeMarker, spawnAnt, spawnBrood } from '@/sim/entities';
import { daysPerYear, daysToTicks, TICKS_PER_DAY } from '@/sim/time';
import { book } from './core';
import { deposit, feedFromCrop, withdraw, type DepositSource, type WithdrawPurpose } from './stores';
import { layEgg as queenLayEgg, queenRationPShare } from './queen';
import { requestTask as allocRequestTask } from './allocation';
import { injectReturn } from './activation';
import { addToxinDose } from './physiology';
import { applyDirectives, placePlayerMarker } from './directives';

import {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
} from './colonySystems';

export {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
};
/** Founding sequence (opening phases, founding model, time-lapse). Stub: founding. */
export const foundingSystem: System = { name: 'founding', phase: 'queen', run: () => {} };
/** Overwintering notice/banner/lapse/report. Stub: overwinter-repro. */
export const overwinterSystem: System = { name: 'overwinter', phase: 'colony-economy', run: () => {} };
/** Alate rearing, nuptial flights, queen death and orphaning. Stub: overwinter-repro. */
export const reproductionSystem: System = { name: 'reproduction', phase: 'colony-economy', run: () => {} };

export const systems: readonly System[] = [
  allocationSystem, taskReevalSystem, queenSystem, foundingSystem, broodSystem, economySystem, colonyStatsSystem,
  colonyDiagnosticsSystem, overwinterSystem, reproductionSystem,
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
  return c ? c.alloc.actual[ti(task)] : 0;
}

// ---- food, brood, tasks (owner: colony-core) ----

/**
 * Adds food to the colony pool; returns what was accepted (capacity limits; nothing while the colony has no
 * worker). `source` selects the ledger key: a delivery (default), recycled brood, or a nurse's crop going back.
 */
export function depositFood(sim: Sim, colonyId: number, c: number, p: number, toxin = 0, source: DepositSource = 'delivery'): FoodAmount {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return { c: 0, p: 0 };
  const got = deposit(col, c, p, toxin, source);
  return { c: got.c, p: got.p };
}

/**
 * Takes food from the colony pool; returns what was taken. `purpose` selects the ledger key (default `transit`:
 * a nurse's or carer's crop load, later booked as larval or queen food when fed). The pool's toxin share goes
 * to `ant` when given.
 */
export function withdrawFood(sim: Sim, colonyId: number, c: number, p: number, purpose: WithdrawPurpose = 'transit', ant?: Ant): FoodAmount {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return { c: 0, p: 0 };
  const got = withdraw(col, c, p, purpose);
  if (ant) addToxinDose(ant, got.toxin);
  return { c: got.c, p: got.p };
}

/** An ant feeds a larva (or the queen when broodId is -1) from its crop; returns what was transferred. */
export function feedBrood(sim: Sim, giver: Ant, broodId: number, c: number, p: number): FoodAmount {
  return feedFromCrop(sim, giver, broodId, c, p);
}

/** The queen lays one egg (or one egg of the founding clutch); returns the brood id, -1 if she cannot. */
export function layEgg(sim: Sim, queen: Ant, destined: BroodCaste = 'worker'): number {
  return queenLayEgg(sim, queen, destined);
}

/** Asks the allocator to switch an ant to a task (markers, jobs, release); false if refused. */
export function requestTask(sim: Sim, ant: Ant, task: Task, reason: ReasonCode): boolean {
  return allocRequestTask(sim, ant, task, reason);
}

/** Current demand for a task in worker-equivalents (GDD 02 §6.2), from the last allocation pass. */
export function colonyDemand(sim: Sim, colonyId: number, task: Task): number {
  const c = sim.stores.colonies.get(colonyId);
  return c ? c.alloc.demand[ti(task)] : 0;
}

// Further colony API for behaviours, actions, UI and debug (see each file's header).
export { taskCycleDone } from './allocation';
export { recordDelivery, recordForagerReturn, shouldDepart, curfew, fEnv, isWaitingForager, injectReturn } from './activation';
export {
  ecloseBrood, feedUrgency, larvaHunger, larvaRemainingNeed, setBroodDiapause, tendBrood, tendBroodAt, wantsFeed,
} from './brood';
export { cannibaliseBrood, nextCannibalVictim } from './cannibalism';
export {
  canLay, feedQueenFromReserve, layingFactors, layingProteinPermitted, queenRationPShare, queenWantsFood,
} from './queen';
export { daysOfStock, intakeTarget, needRates, nutrientWeights, recruitAcceptance, sourceWeight } from './needs';
export { poolCapacity, poolSpace, type DepositSource, type WithdrawPurpose } from './stores';
export { colonySummary, queryLedger, type ColonySummary } from './summary';
export { bandOf, health, reserveCap } from './physiology';
export { setClimateOverride, type ClimateOverride } from './envAdapter';
export { censusOf } from './census';

/**
 * The mix of a nurse crop load of `load` loads (GDD 02 §5.4.2): P share P_req / (P_req + C_req); if the pool is
 * short of P she takes what exists and fills with C. Pass the result to withdrawFood.
 */
export function nurseLoadMix(sim: Sim, colonyId: number, load: number): FoodAmount {
  const col = sim.stores.colonies.get(colonyId);
  const share = LARVA_P_REQ / (LARVA_P_REQ + LARVA_C_REQ);
  if (!col) return { c: 0, p: 0 };
  const p = Math.min(share * load, col.stores.p);
  return { c: Math.min(load - p, col.stores.c), p };
}

/** The mix of a queen-carer's ration of `load` loads (laying permitted or withheld, GDD 02 §5.4.2). */
export function queenRationMix(sim: Sim, colonyId: number, load: number): FoodAmount {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return { c: 0, p: 0 };
  const p = Math.min(queenRationPShare(sim, col) * load, col.stores.p);
  return { c: Math.min(load - p, col.stores.c), p };
}

// ---- commands owned by this module ----

/** setDirectives (GDD 02 §12.1): validated per key, applied at the start of the next tick (or while paused). */
function setDirectives(sim: Sim, cmd: CommandOf<'setDirectives'>): void {
  const col = cmd.colonyId !== undefined ? sim.stores.colonies.get(cmd.colonyId) : playerColony(sim);
  if (col) applyDirectives(sim, col, cmd);
}

/** Places a player marker (caps and radius ranges, GDD 02 §12.2). */
function addMarker(sim: Sim, cmd: CommandOf<'placeMarker'>): void {
  const col = playerColony(sim);
  if (col) placePlayerMarker(sim, col, cmd);
}

/** cheat.setQueen values: gutC, gutP, reserve, reserveP, health (0..1), eggBudget, fecundity. */
function cheatSetQueen(sim: Sim, cmd: CommandOf<'cheat.setQueen'>): void {
  const col = sim.stores.colonies.get(cmd.colonyId);
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  if (!q || !q.queen) return;
  const v = cmd.values;
  const qs = q.queen;
  if (v.gutC !== undefined) qs.gut.c = v.gutC;
  if (v.gutP !== undefined) qs.gut.p = v.gutP;
  if (v.reserve !== undefined) qs.reserve = v.reserve;
  if (v.reserveP !== undefined) qs.reserveP = v.reserveP;
  if (v.eggBudget !== undefined) qs.eggBudget = v.eggBudget;
  if (v.fecundity !== undefined) qs.fecundity = v.fecundity;
  if (v.health !== undefined) q.hp = v.health * q.maxHp;
}

/** Debug stock changes are booked as deliveries so the ledger stays exact. */
function cheatStock(sim: Sim, colonyId: number, c: number, p: number, toxin: number, set: boolean): void {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return;
  const dc = set ? c - col.stores.c : c;
  const dp = set ? p - col.stores.p : p;
  col.stores.c = Math.max(0, col.stores.c + dc);
  col.stores.p = Math.max(0, col.stores.p + dp);
  col.stores.toxin += set ? 0 : toxin;
  book(col, 'inDeliveryC', dc);
  book(col, 'inDeliveryP', dp);
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
  'cheat.addFood': (sim, c) => cheatStock(sim, c.colonyId, c.c, c.p, c.toxin, false),
  'cheat.setStores': (sim, c) => cheatStock(sim, c.colonyId, c.c, c.p, 0, true),
  'cheat.spawnAnts': cheatSpawnAnts,
  'cheat.spawnBrood': cheatSpawnBrood,
  'cheat.setQueen': cheatSetQueen,
  'cheat.injectReturn': (sim, c) => { injectReturn(sim, c.entranceId, c.success, c.sourceId); },
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
