// Commands: the only way the outside changes the simulation (contracts guidance §8, registry B9, 00-index §D4).
// Queued with sim.enqueue(cmd) and applied at the start of the next tick (or immediately via
// applyPendingCommands while paused). `type` is the discriminant. Debug commands are in commandsCheat.ts and need
// config.cheats. Optional payload fields are allowed here (commands are messages, not persisted state); handlers
// treat a missing field as its documented default.

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, MarkerKind, SpeedLevel } from './ids';
import type { ActionId, PossessMethod, PossessRole, ReleaseReason } from './ids/ants';
import type { RallyMode } from './ids/ecology';
import type { ArchitectMode, ArchitectNeed, ChamberSize, PlanKind, PlanPriority } from './ids/nest';
import type { AutoSlowMode } from './ids/progression';
import type { CustomRules } from './config';
import type { Directives } from './colony';
import type { DifficultyId } from './ids';
import type { PlayerIntent } from './intent';
import type { SurfaceRef, TargetRef } from './refs';
import type { CheatCommand } from './commandsCheat';

/** Directive keys a `setDirectives` command may carry (D2.16); only present keys change. */
export type DirectivesPatch = Partial<Omit<Directives, 'stayInUntil'>>;

/** Dig plan request (GDD 03 App. B `planDig`, D4.11). Geometry fields depend on `kind`. */
export interface PlanSpec {
  nestId: number;
  kind: PlanKind;
  chamberType?: ChamberType;
  size?: ChamberSize;
  anchor: SurfaceRef;
  /** Tunnel/shaft end point, mm. */
  end?: Vec3;
  /** Bend control point, mm. */
  bend?: Vec3;
  /** BU; default from the species template. */
  length?: number;
  yawDeg?: number;
  /** Entrance plans: where it should reach the surface, mm. */
  surfacePoint?: Vec3;
  priority: PlanPriority;
  /** Create the plan even when validation returned warnings. */
  confirmWarnings: boolean;
}

export type PlayerCommand =
  /**
   * Possess an ant (D4.7): exactly one of `antId` / `role`. A role resolves to the nearest suitable ant of the
   * player colony to `nearPos` (the game fills in the camera target), keeping replays deterministic.
   * `dropTo1x` is the player's `dropTo1xOnPossess` setting (default true = possession start sets 1x; false = clamp
   * to 4x; ruling 11). `via` is informational (default 'command').
   */
  | { type: 'possess'; antId?: number; role?: PossessRole; nearPos?: Vec3; via?: PossessMethod; dropTo1x?: boolean }
  | { type: 'release'; reason: ReleaseReason }
  /** Replay log only; the live path is sim.setPlayerIntent (D4.2). */
  | { type: 'setIntent'; intent: PlayerIntent }
  /** Begin / stop an action primitive for the possessed ant (D4.1). The debug API keeps `__game.act()`. */
  | { type: 'action'; actionId: ActionId; target?: TargetRef; secondary?: boolean; phase: 'start' | 'stop' }
  | { type: 'setTrail'; on: boolean }
  /** 0 pauses (sets `paused`, keeps the running speed); 1/2/4/8 set the speed and unpause (D1.7, D4.4). */
  | { type: 'setSpeed'; speed: SpeedLevel }
  | { type: 'togglePause' }
  | { type: 'setAutoSlow'; mode: AutoSlowMode }
  /** Executed by the game loop (D4.5); the sim only records the target in env.time.skipUntil. */
  | { type: 'skipToNextEvent' };

export type ColonyCommand =
  /** Directives of the player colony (or `colonyId`, debug only); D4.9. */
  | ({ type: 'setDirectives'; colonyId?: number } & DirectivesPatch)
  /** D4.10: `params.mode` for rally markers; `chamberIds` [target, source] for move-brood / move-queen. */
  | {
    type: 'placeMarker'; kind: MarkerKind; pos: Vec3; radius?: number; chamberIds?: number[];
    params?: { mode?: RallyMode; priority?: PlanPriority; chamberType?: ChamberType };
  }
  | { type: 'removeMarker'; markerId: number }
  | { type: 'acknowledgeAlert'; alertId: number }
  | { type: 'storeThumbnail'; milestoneId: string; dataUrl: string }
  /** D4.18: a preset and/or rule overrides (human activity is `custom.humanActivity`). */
  | { type: 'setDifficulty'; preset?: DifficultyId; custom?: Partial<CustomRules> }
  | { type: 'retireColony' };

export type NestCommand =
  | ({ type: 'planDig' } & PlanSpec)
  | { type: 'cancelPlan'; planId: number }
  | { type: 'setPlanPriority'; planId: number; priority: PlanPriority }
  | { type: 'pausePlan'; planId: number }
  | { type: 'resumePlan'; planId: number }
  | { type: 'acceptPlan'; planId: number }
  /** GDD 03 names the field `type`, which is the discriminant here, hence `chamberType`. */
  | { type: 'designateChamber'; chamberId: number; chamberType: ChamberType }
  | { type: 'setAutoExpand'; nestId: number; mode: ArchitectMode }
  | { type: 'setArchitectNeed'; nestId: number; need: ArchitectNeed; enabled: boolean }
  | { type: 'sealEntrance'; entranceId: number }
  | { type: 'reopenEntrance'; entranceId: number };

/**
 * Opening, time-lapse, overwintering and reproduction steps (D4.13-D4.17). Opening actions (sniff, seal, plant,
 * lay) are `action` commands; flight steering is `PlayerIntent.flight`.
 */
export type FlowCommand =
  | { type: 'openingSkipIntro' }
  | { type: 'openingBeginTimelapse' }
  /** Skips the running time-lapse (founding or winter). */
  | { type: 'skipTimelapse' }
  | { type: 'timelapseRespond'; interruptId: number; response: 'step-in' | 'let-it-play' }
  | { type: 'openingUndo' }
  | { type: 'overwinterChoice'; choice: 'begin' | 'delay' | 'close-report' }
  | { type: 'flightRelease' }
  | { type: 'flightPossess'; gyneId: number }
  | { type: 'flightLand'; point: Vec3 };

export type Command = PlayerCommand | ColonyCommand | NestCommand | FlowCommand | CheatCommand;
export type CommandType = Command['type'];
export type CommandOf<K extends CommandType> = Extract<Command, { type: K }>;

/**
 * Every command type exactly once. The Record type makes the compiler reject a missing or unknown key, so this
 * list can never drift from the union.
 */
const COMMAND_TYPE_SET: Record<CommandType, true> = {
  possess: true, release: true, setIntent: true, action: true, setTrail: true, setSpeed: true, togglePause: true,
  setAutoSlow: true, skipToNextEvent: true,
  setDirectives: true, placeMarker: true, removeMarker: true, acknowledgeAlert: true, storeThumbnail: true,
  setDifficulty: true, retireColony: true,
  planDig: true, cancelPlan: true, setPlanPriority: true, pausePlan: true, resumePlan: true, acceptPlan: true,
  designateChamber: true, setAutoExpand: true, setArchitectNeed: true, sealEntrance: true, reopenEntrance: true,
  openingSkipIntro: true, openingBeginTimelapse: true, skipTimelapse: true, timelapseRespond: true,
  openingUndo: true, overwinterChoice: true, flightRelease: true, flightPossess: true, flightLand: true,
  'cheat.addFood': true, 'cheat.setStores': true, 'cheat.spawnAnts': true, 'cheat.spawnBrood': true,
  'cheat.setChamberClimate': true, 'cheat.setQueen': true, 'cheat.injectReturn': true, 'cheat.kill': true,
  'cheat.killAll': true, 'cheat.killQueen': true, 'cheat.teleport': true, 'cheat.carveSphere': true,
  'cheat.carveEllipsoid': true, 'cheat.fillSphere': true, 'cheat.instantPlan': true, 'cheat.setSoilMoisture': true,
  'cheat.setRain': true, 'cheat.setDrainScale': true, 'cheat.spawnPellets': true, 'cheat.completeFounding': true,
  'cheat.setFoundingState': true, 'cheat.humanEvent': true, 'cheat.setGrass': true, 'cheat.setWater': true,
  'cheat.revealMicro': true, 'cheat.spawnCreature': true, 'cheat.spawnFood': true, 'cheat.setHerd': true,
  'cheat.spawnHerd': true, 'cheat.freezeGrowth': true, 'cheat.setRival': true, 'cheat.setRelation': true,
  'cheat.triggerRaid': true, 'cheat.triggerBird': true, 'cheat.triggerNestInvasion': true, 'cheat.combatFlags': true,
  'cheat.setTime': true, 'cheat.setWeather': true, 'cheat.setWind': true, 'cheat.setAnomaly': true,
  'cheat.noLag': true, 'cheat.setQueenAge': true, 'cheat.forceFlight': true, 'cheat.unlockCodex': true,
  'cheat.triggerWinter': true, 'cheat.setWood': true, 'cheat.addSeeds': true, 'cheat.setGarden': true,
  'cheat.supplySubstrate': true, 'cheat.infectGarden': true, 'cheat.setColonyAge': true,
};

export const COMMAND_TYPES = Object.keys(COMMAND_TYPE_SET) as CommandType[];

/** True for debug commands (rejected unless config.cheats). */
export function isCheatCommand(cmd: Command): cmd is CheatCommand {
  return cmd.type.startsWith('cheat.');
}
