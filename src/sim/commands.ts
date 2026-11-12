// Command handling: one handler per Command type (the table is checked for completeness by the compiler).
// Commands are queued with sim.enqueue and applied by the first system of the tick (`commandsSystem`), or
// immediately by sim.applyPendingCommands() while paused. Handlers that belong to a module not written yet are
// no-ops annotated with the owning task; the integration pass points them at the module's API.

import { createLogger } from '@/core/log';
import { rngRange } from '@/core/rng';
import type { Ant, Command, CommandOf, CommandType, Sim, SpeedLevel, System } from '@/sim/types';
import { AntFlag, isCheatCommand } from '@/sim/types';
import { CHEAT_SPAWN_SCATTER_BU, MILESTONE_THUMBS_MAX, POSSESS_MAX_SPEED, STAY_IN_DAYS } from '@/sim/balance';
import { inferReleaseTask } from '@/sim/ants';
import { playerColony } from '@/sim/colony';
import {
  killAnt, killBrood, killCreature, placeMarker, removeMarker, spawnAnt, spawnBrood, spawnCreature, spawnSource,
} from '@/sim/entities';
import { daysToTicks, TICKS_PER_DAY, daysPerYear } from '@/sim/time';

type Handler<K extends CommandType> = (sim: Sim, cmd: CommandOf<K>) => void;
type HandlerTable = { [K in CommandType]: Handler<K> };

const noop = (): void => {};
const log = createLogger('commands');

// ---- possession and time ----

function possess(sim: Sim, antId: number, via: CommandOf<'possess'>['via'], dropTo1x: boolean): void {
  const { player } = sim.state;
  const ant = sim.stores.ants.get(antId);
  const col = playerColony(sim);
  if (!ant) return sim.emit({ type: 'possess-rejected', antId, reason: 'dead' });
  if (!col || ant.colony !== col.id) return sim.emit({ type: 'possess-rejected', antId, reason: 'not-colony' });
  if (player.possessedAntId === antId) return;
  const switching = player.possessedAntId !== -1;
  if (switching) releaseCurrent(sim, 'switch');
  player.possessedAntId = antId;
  ant.flags |= AntFlag.POSSESSED;
  ant.suspendedTask = ant.task;
  if (!switching) speedOnPossess(sim, dropTo1x);
  sim.emit({ type: 'possession-started', antId, caste: ant.caste, via });
}

/**
 * Possession start forces 1x, or clamps to 4x when the player turned `dropTo1xOnPossess` off (GDD 01 §8,
 * GDD 06 §4). A pause stays a pause. Releasing never restores the earlier speed, so `requested` follows.
 */
function speedOnPossess(sim: Sim, dropTo1x: boolean): void {
  const time = sim.state.env.time;
  const from = time.speed;
  if (from === 0) return;
  const to: SpeedLevel = dropTo1x ? 1 : from > POSSESS_MAX_SPEED ? POSSESS_MAX_SPEED : from;
  time.requested = to;
  if (from === to) return;
  time.speed = to;
  sim.emit({ type: 'time.speed-changed', from, to, reason: 'possession' });
}

function releaseCurrent(sim: Sim, reason: 'release' | 'switch' | 'afk' | 'colony-view' | 'timelapse'): void {
  const { player } = sim.state;
  const ant = sim.stores.ants.get(player.possessedAntId);
  player.previousAntId = player.possessedAntId;
  player.possessedAntId = -1;
  if (!ant) return;
  ant.flags &= ~AntFlag.POSSESSED;
  const resumed = inferReleaseTask(sim, ant);
  ant.task = resumed;
  ant.taskTick = sim.state.tick;
  ant.suspendedTask = null;
  sim.emit({ type: 'possession-ended', antId: ant.id, reason, resumedTask: resumed });
}

/** First ant of the player colony matching a role (owner of smarter picking: actions / views). */
function antForRole(sim: Sim, role: CommandOf<'possessRole'>['role']): Ant | undefined {
  const col = playerColony(sim);
  if (!col) return undefined;
  if (role === 'queen') return sim.stores.ants.get(col.queenId);
  const task = role === 'forager' ? 'forage' : role === 'digger' ? 'dig' : 'nurse';
  return sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === task);
}

function setSpeed(sim: Sim, level: CommandOf<'setSpeed'>['level']): void {
  const time = sim.state.env.time;
  if (level === 8 && sim.state.player.possessedAntId !== -1) {
    sim.emit({ type: 'speed-refused', level, reason: 'possession' });
    return;
  }
  const from = time.speed;
  time.requested = level;
  time.speed = level;
  time.paused = level === 0;
  if (from !== level) sim.emit({ type: 'time.speed-changed', from, to: level, reason: 'command' });
}

// ---- colony ----

function setDirectives(sim: Sim, cmd: CommandOf<'setDirectives'>): void {
  const col = sim.stores.colonies.get(cmd.colonyId);
  if (!col) return;
  const d = col.directives;
  const p = cmd.patch;
  if (p.allocation !== undefined) d.allocation = p.allocation === 'auto' ? 'auto' : { ...p.allocation };
  if (p.diet !== undefined) d.diet = p.diet;
  if (p.production !== undefined) d.production = p.production;
  if (p.architect !== undefined) d.architect = p.architect;
  if (p.stockTarget !== undefined) d.stockTarget = p.stockTarget;
  if (p.stayIn !== undefined) {
    d.stayIn = p.stayIn;
    d.stayInUntil = p.stayIn ? sim.state.tick + daysToTicks(STAY_IN_DAYS) : -1;
  }
  if (p.stance !== undefined) d.stance = p.stance;
  if (p.sealInCold !== undefined) d.sealInCold = p.sealInCold;
  if (p.casteEmphasis !== undefined) d.casteEmphasis = p.casteEmphasis;
  if (p.granaryHygiene !== undefined) d.granaryHygiene = p.granaryHygiene;
  if (p.leafSelectivity !== undefined) d.leafSelectivity = p.leafSelectivity;
  if (p.satelliteAuto !== undefined) d.satelliteAuto = p.satelliteAuto;
  if (p.hideFrass !== undefined) d.hideFrass = p.hideFrass;
  if (p.hitchhikerEscort !== undefined) d.hitchhikerEscort = p.hitchhikerEscort;
  if (p.externalHeap !== undefined) d.externalHeap = p.externalHeap;
}

function addMarker(sim: Sim, cmd: CommandOf<'placeMarker'>): void {
  const col = playerColony(sim);
  if (!col) return; // caps and validity rules: colony-core
  placeMarker(sim, {
    kind: cmd.kind, colony: col.id, pos: cmd.pos, radius: cmd.radius,
    params: {
      mode: cmd.mode, chamberType: cmd.chamberType,
      targetChamberId: cmd.chamberIds.length > 0 ? cmd.chamberIds[0] : -1,
      sourceChamberId: cmd.chamberIds.length > 1 ? cmd.chamberIds[1] : -1,
    },
  });
}

// ---- cheats ----

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
  for (let i = 0; i < cmd.n; i++) {
    spawnBrood(sim, {
      colony: col.id, stage: cmd.stage, destined: cmd.destined ?? 'worker', pos, nestId, chamberId: cmd.chamberId,
      init: { progress: cmd.progress },
    });
  }
}

function cheatKill(sim: Sim, id: number, cause: string): void {
  if (sim.stores.ants.has(id)) killAnt(sim, id, cause === 'old-age' ? 'old-age' : 'unknown');
  else if (sim.stores.creatures.has(id)) killCreature(sim, id, cause);
  else if (sim.stores.brood.has(id)) killBrood(sim, id, 'base');
}

const HANDLERS: HandlerTable = {
  possess: (sim, c) => possess(sim, c.antId, c.via, c.dropTo1x !== false),
  possessRole: (sim, c) => {
    const ant = antForRole(sim, c.role);
    if (ant) possess(sim, ant.id, 'role-key', c.dropTo1x !== false);
  },
  release: (sim, c) => {
    if (sim.state.player.possessedAntId !== -1) releaseCurrent(sim, c.reason === 'player' ? 'release' : c.reason);
  },
  setIntent: (sim, c) => sim.setPlayerIntent(c.intent),
  action: noop, // owner: actions (begin/cancel the possessed ant's action primitive)
  setTrail: (sim, c) => {
    const ant = sim.stores.ants.get(sim.state.player.possessedAntId);
    if (!ant) return;
    ant.flags = c.on ? ant.flags | AntFlag.TRAIL_ON : ant.flags & ~AntFlag.TRAIL_ON;
    sim.emit({ type: 'trail-toggled', antId: ant.id, on: c.on });
  },
  setSpeed: (sim, c) => setSpeed(sim, c.level),
  togglePause: (sim) => {
    const t = sim.state.env.time;
    t.paused = !t.paused;
  },
  setAutoSlow: (sim, c) => {
    sim.state.env.time.autoSlow = c.mode;
  },
  skipToNextEvent: noop, // owner: env-core (time controls) / progression
  setDirectives,
  placeMarker: addMarker,
  removeMarker: (sim, c) => {
    removeMarker(sim, c.markerId, 'player');
  },
  acknowledgeAlert: (sim, c) => {
    const a = sim.state.progression.alerts.find((x) => x.id === c.alertId);
    if (a) a.acknowledged = true;
  },
  storeThumbnail: (sim, c) => {
    const list = sim.state.progression.milestoneThumbs.filter((t) => t.milestoneId !== c.milestoneId);
    list.push({ milestoneId: c.milestoneId, dataUrl: c.dataUrl });
    while (list.length > MILESTONE_THUMBS_MAX) list.shift();
    sim.state.progression.milestoneThumbs = list;
  },
  setDifficulty: (sim, c) => {
    const cfg = sim.state.config;
    if (c.preset !== null) cfg.difficulty = c.preset;
    for (const k of Object.keys(c.rules) as (keyof typeof c.rules)[]) {
      const v = c.rules[k];
      if (v !== undefined) (cfg.rules as unknown as Record<string, unknown>)[k] = v;
    }
  },
  setHumanActivity: (sim, c) => {
    sim.state.config.rules.humanActivity = c.level;
  },
  retireColony: noop, // owner: overwinter-repro (epitaph / succession)
  planDig: noop, // owner: nestops
  cancelPlan: noop, // owner: nestops
  setPlanPriority: noop, // owner: nestops
  pausePlan: noop, // owner: nestops
  resumePlan: noop, // owner: nestops
  acceptPlan: noop, // owner: architect
  designateChamber: noop, // owner: nestops
  setAutoExpand: (sim, c) => {
    const nest = sim.stores.nests.get(c.nestId);
    if (nest) nest.architect.mode = c.mode;
  },
  setArchitectNeed: (sim, c) => {
    const nest = sim.stores.nests.get(c.nestId);
    if (nest) nest.architect.needToggles[c.need] = c.enabled;
  },
  sealEntrance: noop, // owner: nestops
  reopenEntrance: noop, // owner: nestops
  openingSkipIntro: noop, // owner: founding
  openingSniff: noop, // owner: founding
  openingSeal: noop, // owner: founding
  openingPlantFungus: noop, // owner: founding (Atta, T3)
  queenLayBatch: noop, // owner: founding
  openingBeginTimelapse: noop, // owner: founding
  skipTimelapse: noop, // owner: founding / overwinter-repro
  openingInterruptRespond: noop, // owner: founding
  openingUndo: noop, // owner: founding
  timelapseStepIn: noop, // owner: founding
  overwinterChoice: noop, // owner: overwinter-repro
  overwinterSkip: noop, // owner: overwinter-repro
  setAlateInvestment: (sim, c) => {
    const col = playerColony(sim);
    if (col) col.directives.alateInvestment = Math.min(1, Math.max(0, c.value));
  },
  setGyneShare: noop, // owner: overwinter-repro (range rules)
  setAlatePolicy: (sim, c) => {
    const col = playerColony(sim);
    if (col) col.directives.alatePolicy = c.policy;
  },
  flightRelease: noop, // owner: overwinter-repro
  flightPossess: noop, // owner: overwinter-repro
  flightControl: noop, // owner: overwinter-repro
  flightLand: noop, // owner: overwinter-repro
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
  'cheat.setChamberClimate': noop, // owner: nestops / env-core
  'cheat.setQueen': noop, // owner: colony-core
  'cheat.injectReturn': noop, // owner: colony-core (forager activation)
  'cheat.kill': (sim, c) => cheatKill(sim, c.id, c.cause),
  'cheat.killAll': (sim, c) => {
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === c.colonyId) killAnt(sim, a.id, 'unknown');
  },
  'cheat.killQueen': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    if (col) killAnt(sim, col.queenId, 'unknown');
  },
  'cheat.teleport': (sim, c) => {
    const ant = sim.stores.ants.get(c.antId);
    if (!ant) return;
    ant.pos = { ...c.pos };
    ant.prevPos = { ...c.pos };
  },
  'cheat.carveSphere': (sim, c) => {
    sim.carve.carveSphere(c.pos, c.r);
  },
  'cheat.carveEllipsoid': (sim, c) => {
    sim.carve.carveEllipsoid(c.center, c.radii); // axis-aligned: yaw is ignored until the kernel supports it
  },
  'cheat.fillSphere': (sim, c) => {
    sim.carve.fillSphere(c.pos, c.r); // LOOSE voxel flags: nestops
  },
  'cheat.instantPlan': noop, // owner: nestops
  'cheat.setSoilMoisture': noop, // owner: weather-effects
  'cheat.setRain': noop, // owner: weather-effects
  'cheat.setDrainScale': noop, // owner: weather-effects
  'cheat.spawnPellets': noop, // owner: nestops
  'cheat.completeFounding': noop, // owner: founding
  'cheat.setFoundingState': noop, // owner: founding
  'cheat.humanEvent': noop, // owner: human-events
  'cheat.setGrass': noop, // owner: human-events
  'cheat.setWater': noop, // owner: weather-effects
  'cheat.revealMicro': (sim) => {
    for (const m of sim.state.worldDelta.microState) { m.discovered = true; m.discoveredTick = sim.state.tick; }
  },
  'cheat.spawnCreature': (sim, c) => {
    spawnCreature(sim, { kind: c.kind, pos: c.pos, init: { variant: c.variant, state: c.state ?? 'idle' } });
  },
  'cheat.spawnFood': (sim, c) => {
    spawnSource(sim, { kind: c.kind, pos: c.pos, amount: c.units, init: { variant: c.variant } });
  },
  'cheat.setHerd': noop, // owner: ecology-plants
  'cheat.spawnHerd': noop, // owner: ecology-plants
  'cheat.freezeGrowth': (sim, c) => {
    const h = sim.stores.herds.get(c.herdId);
    if (h) h.frozen = true;
  },
  'cheat.setRival': noop, // owner: rivals
  'cheat.setRelation': noop, // owner: rivals
  'cheat.triggerRaid': noop, // owner: rivals
  'cheat.triggerBird': noop, // owner: creatures
  'cheat.triggerNestInvasion': noop, // owner: creatures
  'cheat.combatFlags': noop, // owner: combat
  'cheat.setTime': noop, // owner: env-core
  'cheat.setWeather': noop, // owner: env-core
  'cheat.setWind': noop, // owner: env-core
  'cheat.setAnomaly': noop, // owner: env-core
  'cheat.noLag': noop, // owner: env-core (thermal lag)
  'cheat.setQueenAge': (sim, c) => {
    const q = sim.stores.ants.get(sim.stores.colonies.get(c.colonyId)?.queenId ?? -1);
    if (q && q.queen) q.queen.ageDays = c.days;
  },
  'cheat.forceFlight': noop, // owner: overwinter-repro
  'cheat.unlockCodex': (sim, c) => {
    sim.state.progression.codexSeen[c.id] = sim.state.tick;
  },
  'cheat.triggerWinter': noop, // owner: overwinter-repro
  'cheat.setWood': noop, // owner: species-carpenter
  'cheat.addSeeds': noop, // owner: species-harvester
  'cheat.setGarden': noop, // owner: species-leafcutter
  'cheat.supplySubstrate': noop, // owner: species-leafcutter
  'cheat.infectGarden': noop, // owner: species-leafcutter
  'cheat.setColonyAge': (sim, c) => {
    const col = sim.stores.colonies.get(c.colonyId);
    if (col) col.foundedTick = sim.state.tick - Math.round(c.years * daysPerYear(sim.state.config.rules.seasonLengthDays) * TICKS_PER_DAY);
  },
};

/** Handler of a command type (exported for the completeness test and the debug API). */
export function commandHandler(type: CommandType): Handler<CommandType> | undefined {
  return HANDLERS[type] as Handler<CommandType> | undefined;
}

export function handledCommandTypes(): CommandType[] {
  return Object.keys(HANDLERS) as CommandType[];
}

/** True if `cmd` is an object whose `type` names a handler (commands arrive as untyped JSON from the debug API). */
function isKnownCommand(cmd: unknown): cmd is Command {
  if (typeof cmd !== 'object' || cmd === null) return false;
  const type = (cmd as { type?: unknown }).type;
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, type);
}

/**
 * Applies one command now. Never throws: an unknown command type, a disabled cheat or a handler that throws
 * becomes a `command-rejected` event, so one bad command cannot stop the simulation.
 */
export function applyCommand(sim: Sim, cmd: Command): void {
  if (!isKnownCommand(cmd)) {
    const type = (cmd as { type?: unknown } | null)?.type;
    const name = typeof type === 'string' ? type : String(type);
    sim.emit({ type: 'command-rejected', command: name, reason: 'unknown-type' });
    return;
  }
  if (isCheatCommand(cmd) && !sim.state.config.cheats) {
    sim.emit({ type: 'command-rejected', command: cmd.type, reason: 'cheats-disabled' });
    return;
  }
  try {
    (HANDLERS[cmd.type] as Handler<CommandType>)(sim, cmd);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.warn(`command ${cmd.type} failed:`, detail);
    sim.emit({ type: 'command-rejected', command: cmd.type, reason: 'handler-error', detail });
    return;
  }
  sim.state.env.time.commandSeq++;
}

/** First system of every tick: applies the commands queued since the previous tick. */
export const commandsSystem: System = { name: 'commands', run: (sim) => sim.applyPendingCommands() };
