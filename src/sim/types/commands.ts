// Commands: the only way the outside changes the simulation (contracts guidance §8). Queued with
// sim.enqueue(cmd) and applied at the start of the next tick (or immediately via applyPendingCommands while
// paused). `type` is the discriminant. Debug commands are in commandsCheat.ts and need config.cheats.

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, MarkerKind, SpeedLevel } from './ids';
import type { ActionId, AllocationGroup, PossessMethod, PossessRole, ReleaseReason } from './ids/ants';
import type { RallyMode, Stance } from './ids/ecology';
import type { ArchitectMode, ArchitectNeed, ChamberSize, PlanKind, PlanPriority } from './ids/nest';
import type { AlatePolicy, AutoSlowMode, HumanActivityLevel } from './ids/progression';
import type { ProductionMode, StockTarget } from './ids/species';
import type { CustomRules } from './config';
import type { DifficultyId } from './ids';
import type { PlayerIntent } from './intent';
import type { SurfaceRef, TargetRef } from './refs';
import type { CheatCommand } from './commandsCheat';

/** Partial update of colony directives; only present keys change (GDD 02 §12, GDD 07 App. B). */
export interface DirectivesPatch {
  allocation?: 'auto' | Record<AllocationGroup, number>;
  diet?: 'auto' | number;
  production?: ProductionMode;
  architect?: ArchitectMode;
  stockTarget?: StockTarget;
  stayIn?: boolean;
  stance?: Stance;
  sealInCold?: boolean;
  casteEmphasis?: number;
  granaryHygiene?: number;
  leafSelectivity?: number;
  satelliteAuto?: boolean;
  hideFrass?: boolean;
  hitchhikerEscort?: boolean;
  externalHeap?: boolean;
}

/** Dig plan request (GDD 03 App. B `planDig`). Unused geometry fields are null. */
export interface PlanSpec {
  nestId: number;
  kind: PlanKind;
  chamberType: ChamberType | null;
  size: ChamberSize | null;
  anchor: SurfaceRef;
  end: Vec3 | null;
  bend: Vec3 | null;
  /** BU, 0 = default. */
  length: number;
  yawDeg: number;
  surfacePoint: Vec3 | null;
  priority: PlanPriority;
  confirmWarnings: boolean;
}

export type PlayerCommand =
  /**
   * dropTo1x: the player's `dropTo1xOnPossess` setting (GDD 01 §8). Default true = possession start sets 1x;
   * false = clamp to 4x. 8x is never kept while possessing either way.
   */
  | { type: 'possess'; antId: number; via: PossessMethod; dropTo1x?: boolean }
  | { type: 'possessRole'; role: PossessRole; dropTo1x?: boolean }
  | { type: 'release'; reason: ReleaseReason }
  | { type: 'setIntent'; intent: PlayerIntent }
  /** Begin / stop an action primitive for the possessed ant (GDD 01 `act`). */
  | { type: 'action'; action: ActionId; target: TargetRef | null; secondary: boolean; phase: 'start' | 'stop' }
  | { type: 'setTrail'; on: boolean }
  | { type: 'setSpeed'; level: SpeedLevel }
  | { type: 'togglePause' }
  | { type: 'setAutoSlow'; mode: AutoSlowMode }
  | { type: 'skipToNextEvent' };

export type ColonyCommand =
  | { type: 'setDirectives'; colonyId: number; patch: DirectivesPatch }
  | {
    type: 'placeMarker'; kind: MarkerKind; pos: Vec3; radius: number;
    mode: RallyMode | null; chamberType: ChamberType | null; chamberIds: number[];
  }
  | { type: 'removeMarker'; markerId: number }
  | { type: 'acknowledgeAlert'; alertId: number }
  | { type: 'storeThumbnail'; milestoneId: string; dataUrl: string }
  | { type: 'setDifficulty'; preset: DifficultyId | null; rules: Partial<CustomRules> }
  | { type: 'setHumanActivity'; level: HumanActivityLevel }
  | { type: 'retireColony' };

export type NestCommand =
  | { type: 'planDig'; spec: PlanSpec }
  | { type: 'cancelPlan'; planId: number }
  | { type: 'setPlanPriority'; planId: number; priority: PlanPriority }
  | { type: 'pausePlan'; planId: number }
  | { type: 'resumePlan'; planId: number }
  | { type: 'acceptPlan'; planId: number }
  | { type: 'designateChamber'; chamberId: number; chamberType: ChamberType }
  | { type: 'setAutoExpand'; nestId: number; mode: ArchitectMode }
  | { type: 'setArchitectNeed'; nestId: number; need: ArchitectNeed; enabled: boolean }
  | { type: 'sealEntrance'; entranceId: number }
  | { type: 'reopenEntrance'; entranceId: number };

/** Opening, time-lapse, overwintering and reproduction steps (GDD 06 App. B, GDD 08 App. B). */
export type FlowCommand =
  | { type: 'openingSkipIntro' }
  | { type: 'openingSniff'; point: Vec3 }
  | { type: 'openingSeal'; entranceId: number }
  | { type: 'openingPlantFungus' }
  | { type: 'queenLayBatch' }
  | { type: 'openingBeginTimelapse' }
  | { type: 'skipTimelapse' }
  | { type: 'openingInterruptRespond'; hazardId: number; action: string; letItPlay: boolean }
  | { type: 'openingUndo' }
  | { type: 'timelapseStepIn'; interruptId: number }
  | { type: 'overwinterChoice'; choice: 'begin' | 'delay' }
  | { type: 'overwinterSkip' }
  | { type: 'setAlateInvestment'; value: number }
  | { type: 'setGyneShare'; value: number }
  | { type: 'setAlatePolicy'; policy: AlatePolicy }
  | { type: 'flightRelease' }
  | { type: 'flightPossess'; gyneId: number }
  | { type: 'flightControl'; move: Vec3; ascend: boolean; descend: boolean }
  | { type: 'flightLand'; point: Vec3 };

export type Command = PlayerCommand | ColonyCommand | NestCommand | FlowCommand | CheatCommand;
export type CommandType = Command['type'];
export type CommandOf<K extends CommandType> = Extract<Command, { type: K }>;

/**
 * Every command type exactly once. The Record type makes the compiler reject a missing or unknown key, so this
 * list can never drift from the union.
 */
const COMMAND_TYPE_SET: Record<CommandType, true> = {
  possess: true, possessRole: true, release: true, setIntent: true, action: true, setTrail: true, setSpeed: true,
  togglePause: true, setAutoSlow: true, skipToNextEvent: true,
  setDirectives: true, placeMarker: true, removeMarker: true, acknowledgeAlert: true, storeThumbnail: true,
  setDifficulty: true, setHumanActivity: true, retireColony: true,
  planDig: true, cancelPlan: true, setPlanPriority: true, pausePlan: true, resumePlan: true, acceptPlan: true,
  designateChamber: true, setAutoExpand: true, setArchitectNeed: true, sealEntrance: true, reopenEntrance: true,
  openingSkipIntro: true, openingSniff: true, openingSeal: true, openingPlantFungus: true, queenLayBatch: true,
  openingBeginTimelapse: true, skipTimelapse: true, openingInterruptRespond: true, openingUndo: true,
  timelapseStepIn: true, overwinterChoice: true, overwinterSkip: true, setAlateInvestment: true,
  setGyneShare: true, setAlatePolicy: true, flightRelease: true, flightPossess: true, flightControl: true,
  flightLand: true,
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
