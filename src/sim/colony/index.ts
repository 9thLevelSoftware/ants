// Colony module API: allocation, queen, brood, economy, stats, diagnostics, directives, markers (colony-core,
// implemented in this folder), founding (colony/founding) and overwintering / reproduction / succession
// (overwinter-repro, in their own folders). Signatures of the F1c stub are kept;
// additions are optional trailing parameters and new exports.

import { ti } from './taskIdx';
import { rngRange } from '@/core/rng';
import type {
  Ant, BroodCaste, BroodDeathCause, Colony, CommandHandlerMap, CommandOf, FoodAmount, ReasonCode, Sim, System, Task,
} from '@/sim/types';
import { BROOD_CASTES, DEATH_CAUSES, isOneOf } from '@/sim/types';
import { CHEAT_SPAWN_LIFT_BU, CHEAT_SPAWN_SCATTER_BU, LARVA_C_REQ, LARVA_P_REQ } from '@/sim/balance';
import { killAnt, removeMarker, spawnAnt, spawnBrood } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { daysPerYear, daysToTicks, TICKS_PER_DAY } from '@/sim/time';
import { book, coreOf } from './core';
import { deposit, feedFromCrop, refusedIntoLarder, withdraw, type DepositSource, type WithdrawPurpose } from './stores';
import { feetOf, layEgg as queenLayEgg, queenRationPShare } from './queen';
import { requestTask as allocRequestTask } from './allocation';
import { injectReturn } from './activation';
import { addToxinDose } from './physiology';
import { broodDies } from './brood';
import { applyDirectives, placePlayerMarker } from './directives';

import { foundingCommandHandlers, foundingSystem } from './founding';
import { overwinterCommandHandlers, overwinterSystem } from './overwinter';
import { reproductionCommandHandlers, reproductionSystem } from './reproduction';
import { successionCommandHandlers, successionSystem } from './succession';
import {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
} from './colonySystems';

export {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
};
/** Founding sequence (opening phases, founding model, time-lapse): src/sim/colony/founding (owner: founding). */
export { foundingSystem };
/** Overwintering, reproduction, succession (owner: overwinter-repro, src/sim/colony/{overwinter,reproduction,succession}). */
export { overwinterSystem, reproductionSystem, successionSystem };

export const systems: readonly System[] = [
  allocationSystem, taskReevalSystem, queenSystem, foundingSystem, broodSystem, economySystem, colonyStatsSystem,
  colonyDiagnosticsSystem, overwinterSystem, reproductionSystem, successionSystem,
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
  // R21 (b): a delivery the full stores refuse while the nest has only its larder makes the first food chamber a
  // planning need (nest/architect/needs.ts reads the tick)
  if (source === 'delivery' && refusedIntoLarder(col, { c, p }, got)) coreOf(col).larderRefusedTick = sim.state.tick;
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

/** Whether requestTask would give her this task now (caste weight, age band, health; no side effects). */
export { mayTakeTask } from './allocation';

/** Current demand for a task in worker-equivalents (GDD 02 §6.2), from the last allocation pass. */
export function colonyDemand(sim: Sim, colonyId: number, task: Task): number {
  const c = sim.stores.colonies.get(colonyId);
  return c ? c.alloc.demand[ti(task)] : 0;
}

// Further colony API for behaviours, actions, UI and debug (see each file's header).
export { taskCycleDone } from './allocation';
export {
  recordDelivery, recordDeliveryCount, recordForagerReturn, shouldDepart, departureDue, commitDeparture, curfew, fEnv, isWaitingForager, injectReturn,
} from './activation';
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
export { typicalForager, unitsPerTripOf } from './tripLoad';
export { devRate, stageDu } from './life';

/** Kills a brood item with the colony's bookkeeping (death counters by cause, brood-corpse waste). */
export function killColonyBrood(sim: Sim, broodId: number, cause: BroodDeathCause): boolean {
  const b = sim.stores.brood.get(broodId);
  if (!b) return false;
  broodDies(sim, b, cause);
  return !b.alive;
}
export { setClimateOverride, type ClimateOverride } from './envAdapter';
export { censusOf } from './census';
export { isMiddenBlocked, reportMiddenBlocked } from './midden';

/**
 * The mix of a nurse crop load of `load` loads (GDD 02 §5.4.2): P share P_req / (P_req + C_req); if the pool is
 * short of P she takes what exists, and C only up to its own share (econ-growth deviation from §5.4.2 "fills with
 * C": a larva fed C without P does not grow and burns half its C need, GDD 02 §2.4, so topping crops up with C moved
 * the carbohydrate a first-year colony needed for the winter into guts that could not use it). Pass the result to
 * withdrawFood.
 */
export function nurseLoadMix(sim: Sim, colonyId: number, load: number): FoodAmount {
  const col = sim.stores.colonies.get(colonyId);
  const share = LARVA_P_REQ / (LARVA_P_REQ + LARVA_C_REQ);
  if (!col) return { c: 0, p: 0 };
  const p = Math.min(share * load, col.stores.p);
  return { c: Math.min((1 - share) * load, col.stores.c), p };
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
  const s = col.stores;
  const c0 = s.c;
  const p0 = s.p;
  // Non-finite inputs leave a nutrient unchanged; the stock never goes below 0.
  const target = (cur: number, v: number): number => (Number.isFinite(v) ? Math.max(0, set ? v : cur + v) : cur);
  s.c = target(c0, c);
  s.p = target(p0, p);
  if (!set && toxin > 0 && Number.isFinite(toxin)) s.toxin += toxin;
  // Book the change actually applied, so the ledger stays exact when a negative amount is clamped at 0.
  book(col, 'inDeliveryC', s.c - c0);
  book(col, 'inDeliveryP', s.p - p0);
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
    const ant = spawnAnt(sim, { colony: col.id, caste: cmd.caste, pos, task: cmd.task ?? 'idle', ageGd: cmd.ageGd });
    // onto the kernel's level set f = footOffset (the ground height alone can be inside a stone or a primitive):
    // from above the ground, sphere-traced down onto whatever top is there
    walkerPlace(sim.field, ant, { x, y: pos.y + CHEAT_SPAWN_LIFT_BU * sim.world.bu, z }, {}, sim.kernel.walker);
  }
}

function cheatSpawnBrood(sim: Sim, cmd: CommandOf<'cheat.spawnBrood'>): void {
  const col = sim.stores.colonies.get(cmd.colonyId);
  if (!col) return;
  const queen = sim.stores.ants.get(col.queenId);
  let pos = queen ? feetOf(queen) : sim.world.queenStart.pos;
  // chamberId -1: beside the queen, in her chamber (brood left loose outside any chamber is never nursed)
  let nestId = cmd.chamberId < 0 && queen ? queen.nestId : -1;
  let chamberId = cmd.chamberId < 0 && queen ? queen.chamberId : cmd.chamberId;
  for (const n of sim.stores.nests.list) {
    const ch = n.alive ? n.chambers.find((c) => c.id === cmd.chamberId) : undefined;
    if (ch) { pos = ch.center; nestId = n.id; chamberId = ch.id; }
  }
  // `destined` arrives as untyped JSON: null means worker, anything that is not a brood caste is refused.
  const destined = cmd.destined ?? 'worker';
  if (!isOneOf(BROOD_CASTES, String(destined))) {
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: 'invalid-caste', detail: String(destined) });
    return;
  }
  for (let i = 0; i < cmd.n; i++) {
    spawnBrood(sim, {
      colony: col.id, stage: cmd.stage, destined, pos, nestId, chamberId,
      init: { progress: cmd.progress },
    });
  }
}

export const commandHandlers: Partial<CommandHandlerMap> = {
  setDirectives,
  placeMarker: addMarker,
  removeMarker: (sim, c) => {
    removeMarker(sim, c.markerId, 'player');
  },
  // founding (owner: founding; skipTimelapse leaves the winter lapse to overwinter-repro)
  ...foundingCommandHandlers,
  // overwintering, reproduction, succession (owner: overwinter-repro)
  ...overwinterCommandHandlers,
  ...reproductionCommandHandlers,
  ...successionCommandHandlers,
  // colony-core cheats
  'cheat.addFood': (sim, c) => cheatStock(sim, c.colonyId, c.c, c.p, c.toxin, false),
  'cheat.setStores': (sim, c) => cheatStock(sim, c.colonyId, c.c, c.p, 0, true),
  'cheat.spawnAnts': cheatSpawnAnts,
  'cheat.spawnBrood': cheatSpawnBrood,
  'cheat.setQueen': cheatSetQueen,
  'cheat.injectReturn': (sim, c) => { injectReturn(sim, c.entranceId, c.success, c.sourceId); },
  'cheat.killAll': (sim, c) => {
    // an optional real cause (the epitaph screen names it; direction 17), else 'unknown' as before
    const cause = String(c.cause ?? 'unknown');
    const death = isOneOf(DEATH_CAUSES, cause) ? cause : 'unknown';
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === c.colonyId) killAnt(sim, a.id, death);
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
