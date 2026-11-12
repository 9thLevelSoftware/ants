// Command handling (ruling 9). Each module index.ts exports `commandHandlers: Partial<CommandHandlerMap>`; this
// file merges them in the fixed module order of systems.ts. COMMAND_OWNERS assigns every command type to exactly
// one module: its Record type keeps the compile-time completeness check, and buildCommandTable() reports any type
// with no handler, claimed twice, or handled by a module that does not own it (commands.test.ts asserts none).
//
// Commands are queued with sim.enqueue and applied by the first system of the tick (`commandsSystem`), or
// immediately by sim.applyPendingCommands() while paused.

import { createLogger } from '@/core/log';
import type { Command, CommandHandler, CommandHandlerMap, CommandOf, CommandType, Sim } from '@/sim/types';
import { COMMAND_TYPES, DIFFICULTY_IDS, isCheatCommand, isOneOf, isSpeedLevel } from '@/sim/types';
import { invalidCustomRules } from '@/sim/balance';
import { SIM_MODULES, type SimModule, type SimModuleKey } from '@/sim/systems';

const log = createLogger('commands');

/** The module that handles each command type (owner task in brackets where it differs from the module). */
export const COMMAND_OWNERS: Record<CommandType, SimModuleKey> = {
  possess: 'ants', release: 'ants', setIntent: 'ants', action: 'ants', setTrail: 'ants', // [actions]
  setSpeed: 'environment', togglePause: 'environment', setAutoSlow: 'environment', skipToNextEvent: 'environment', // [env-core]
  setDirectives: 'colony', placeMarker: 'colony', removeMarker: 'colony', // [colony-core]
  acknowledgeAlert: 'progression', storeThumbnail: 'progression', setDifficulty: 'progression',
  retireColony: 'colony', // [overwinter-repro]
  planDig: 'nest', cancelPlan: 'nest', setPlanPriority: 'nest', pausePlan: 'nest', resumePlan: 'nest',
  acceptPlan: 'nest', designateChamber: 'nest', setAutoExpand: 'nest', setArchitectNeed: 'nest', // [nestops, architect]
  sealEntrance: 'nest', reopenEntrance: 'nest',
  openingSkipIntro: 'colony', openingBeginTimelapse: 'colony', skipTimelapse: 'colony', timelapseRespond: 'colony',
  openingUndo: 'colony', // [founding]
  overwinterChoice: 'colony', flightRelease: 'colony', flightPossess: 'colony', flightLand: 'colony', // [overwinter-repro]
  'cheat.addFood': 'colony', 'cheat.setStores': 'colony', 'cheat.spawnAnts': 'colony', 'cheat.spawnBrood': 'colony',
  'cheat.setChamberClimate': 'nest', 'cheat.setQueen': 'colony', 'cheat.injectReturn': 'colony',
  'cheat.kill': 'ants', 'cheat.killAll': 'colony', 'cheat.killQueen': 'colony', 'cheat.teleport': 'locomotion',
  'cheat.carveSphere': 'nest', 'cheat.carveEllipsoid': 'nest', 'cheat.fillSphere': 'nest', 'cheat.instantPlan': 'nest',
  'cheat.setSoilMoisture': 'environment', 'cheat.setRain': 'environment', 'cheat.setDrainScale': 'environment',
  'cheat.spawnPellets': 'nest', 'cheat.completeFounding': 'colony', 'cheat.setFoundingState': 'colony',
  'cheat.humanEvent': 'environment', 'cheat.setGrass': 'environment', 'cheat.setWater': 'environment',
  'cheat.revealMicro': 'world', 'cheat.spawnCreature': 'ecology', 'cheat.spawnFood': 'ecology',
  'cheat.setHerd': 'ecology', 'cheat.spawnHerd': 'ecology', 'cheat.freezeGrowth': 'ecology',
  'cheat.setRival': 'rivals', 'cheat.setRelation': 'rivals', 'cheat.triggerRaid': 'rivals',
  'cheat.triggerBird': 'ecology', 'cheat.triggerNestInvasion': 'ecology', 'cheat.combatFlags': 'combat',
  'cheat.setTime': 'environment', 'cheat.setWeather': 'environment', 'cheat.setWind': 'environment',
  'cheat.setAnomaly': 'environment', 'cheat.noLag': 'environment', 'cheat.setQueenAge': 'colony',
  'cheat.forceFlight': 'colony', 'cheat.unlockCodex': 'progression', 'cheat.triggerWinter': 'colony',
  'cheat.setWood': 'species-wood', 'cheat.addSeeds': 'species-granary', 'cheat.setGarden': 'species-fungus',
  'cheat.supplySubstrate': 'species-fungus', 'cheat.infectGarden': 'species-fungus', 'cheat.setColonyAge': 'colony',
};

export interface CommandTableReport {
  table: Partial<CommandHandlerMap>;
  /** Command types no module handles. */
  missing: CommandType[];
  /** Command types handled by more than one module. */
  duplicates: { type: CommandType; modules: SimModuleKey[] }[];
  /** Handlers contributed by a module other than the owner in COMMAND_OWNERS. */
  misplaced: { type: CommandType; owner: SimModuleKey; by: SimModuleKey }[];
  /** Handler keys that are not command types. */
  unknown: string[];
}

/** Merges the modules' handlers in order; the first handler of a type wins, problems are reported. */
export function buildCommandTable(modules: readonly { key: SimModuleKey; mod: SimModule }[]): CommandTableReport {
  const table: Record<string, unknown> = {};
  const claimedBy = new Map<string, SimModuleKey[]>();
  const known = new Set<string>(COMMAND_TYPES);
  const report: CommandTableReport = { table: table as Partial<CommandHandlerMap>, missing: [], duplicates: [], misplaced: [], unknown: [] };
  for (const { key, mod } of modules) {
    for (const [type, handler] of Object.entries(mod.commandHandlers)) {
      if (!known.has(type)) { report.unknown.push(type); continue; }
      const by = claimedBy.get(type) ?? [];
      by.push(key);
      claimedBy.set(type, by);
      if (by.length === 1) table[type] = handler;
      const owner = COMMAND_OWNERS[type as CommandType];
      if (owner !== key) report.misplaced.push({ type: type as CommandType, owner, by: key });
    }
  }
  for (const t of COMMAND_TYPES) {
    const by = claimedBy.get(t);
    if (!by) report.missing.push(t);
    else if (by.length > 1) report.duplicates.push({ type: t, modules: by });
  }
  return report;
}

const COMMANDS = buildCommandTable(SIM_MODULES);
const HANDLERS = COMMANDS.table;
for (const t of COMMANDS.missing) log.warn(`no handler for command ${t}`);
for (const d of COMMANDS.duplicates) log.warn(`command ${d.type} claimed by ${d.modules.join(', ')}`);

/** The merged table and its problems (for the completeness test and the debug API). */
export function commandTableReport(): CommandTableReport {
  return COMMANDS;
}

/** Handler of a command type, undefined when no module provides one. */
export function commandHandler(type: CommandType): CommandHandler<CommandType> | undefined {
  return HANDLERS[type] as CommandHandler<CommandType> | undefined;
}

/** Why a command's payload is refused: `command-rejected` reason and detail. */
interface PayloadError { reason: string; detail: string }

/**
 * Payload checks applied before any handler runs, for fields typed by a contract union that persisted state takes
 * as is (commands arrive as untyped JSON from the debug API). A refused command changes nothing. Handlers
 * still validate what only they understand (ids, ranges of their own data).
 */
const PAYLOAD_GUARDS: { [K in CommandType]?: (cmd: CommandOf<K>) => PayloadError | null } = {
  setSpeed: (c) => (isSpeedLevel(c.speed) ? null : { reason: 'invalid-speed', detail: String(c.speed) }),
  setDifficulty: (c) => {
    const bad: string[] = [];
    if (c.preset !== undefined && !isOneOf(DIFFICULTY_IDS, String(c.preset))) bad.push(`preset=${String(c.preset)}`);
    if (c.custom !== undefined) bad.push(...invalidCustomRules(c.custom));
    return bad.length > 0 ? { reason: 'invalid-difficulty', detail: bad.join(',') } : null;
  },
};

function payloadError(cmd: Command): PayloadError | null {
  const guard = PAYLOAD_GUARDS[cmd.type] as ((c: Command) => PayloadError | null) | undefined;
  return guard ? guard(cmd) : null;
}

/** True if `cmd` is an object whose `type` is a command type (commands arrive as untyped JSON from the debug API). */
function isKnownCommand(cmd: unknown): cmd is Command {
  if (typeof cmd !== 'object' || cmd === null) return false;
  const type = (cmd as { type?: unknown }).type;
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(COMMAND_OWNERS, type);
}

/**
 * Applies one command now. Never throws: an unknown command type, a disabled cheat, a type without a handler or a
 * handler that throws becomes a `command-rejected` event, so one bad command cannot stop the simulation.
 */
export function applyCommand(sim: Sim, cmd: Command): void {
  if (!isKnownCommand(cmd)) {
    const type = (cmd as { type?: unknown } | null)?.type;
    sim.emit({ type: 'command-rejected', commandType: typeof type === 'string' ? type : String(type), reason: 'unknown-type' });
    return;
  }
  if (isCheatCommand(cmd) && !sim.state.config.cheats) {
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: 'cheats-disabled' });
    return;
  }
  const bad = payloadError(cmd);
  if (bad) {
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: bad.reason, detail: bad.detail });
    return;
  }
  const handler = commandHandler(cmd.type);
  if (!handler) {
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: 'unhandled' });
    return;
  }
  try {
    handler(sim, cmd);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn(`command ${cmd.type} failed:`, detail);
    sim.emit({ type: 'command-rejected', commandType: cmd.type, reason: 'handler-error', detail });
    return;
  }
  sim.state.env.time.commandSeq++;
}
