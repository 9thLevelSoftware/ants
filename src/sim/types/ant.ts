// The ant entity (contracts guidance §5) with the additive fields named by GDD 01, 02, 05, 06 and 07.
// Plain data only. Typed arrays are allowed; their sizes come from src/sim/balance (memory.ts, colony.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { Caste, Task } from './ids';
import type {
  ActionFailReason, ActionId, ActionPhase, QueenMode, ThermalState,
} from './ids/ants';
import type { AlateState, FlightPhase } from './ids/progression';
import type { AntSizeClass } from './ids/species';
import type { CarryRef, TargetRef } from './refs';
import type { Walker } from './walker';

/** Bit flags in `Ant.flags`. Append only. */
export const AntFlag = {
  /** Controlled by the player (GDD 01 `ant.controlled`). Allocation never reassigns it. */
  POSSESSED: 1 << 0,
  /** Lays trail pheromone while walking (GDD 01 `ant.trailOn`). */
  TRAIL_ON: 1 << 1,
  ALARMED: 1 << 2,
  WINGED: 1 << 3,
  /** Founding queen (claustral phase). */
  FOUNDING: 1 << 4,
  NANITIC: 1 << 5,
  MINIM: 1 << 6,
  CALLOW: 1 << 7,
  /** Ignores trails this bout (GDD 02 `trail-ignorer`). */
  TRAIL_IGNORER: 1 << 8,
  /** Overwintering / chill dormancy. */
  DORMANT: 1 << 9,
  /** Atta refuse worker (GDD 07). */
  REFUSE: 1 << 10,
  /** Riding on a leaf fragment (Atta minim, GDD 07). */
  HITCHHIKING: 1 << 11,
  /** Belongs to a rival colony and was fielded from its abstract population (GDD 05). */
  FIELDED: 1 << 12,
  /** Injured below INJURED_HEALTH: no outside tasks (GDD 02). */
  INJURED: 1 << 13,
} as const;

/** An action primitive in progress (GDD 01 §7). */
export interface ActionInProgress {
  id: ActionId;
  phase: ActionPhase;
  /** Tick the action started (entered windup). */
  startTick: number;
  /** Total duration in ticks after work-rate scaling; 0 for continuous actions. */
  durationTicks: number;
  target: TargetRef;
  /** Repeat automatically on completion (held input / AI loop). */
  repeat: boolean;
  /** Secondary variant (e.g. interact hold). */
  secondary: boolean;
  /** Why it failed or was cancelled; null while running or after success. */
  reason: ActionFailReason | null;
}

/** One learned route to a food source (GDD 02 §9). */
export interface RouteMemory {
  /** -1 = empty slot. */
  sourceId: number;
  /** Waypoints x,y,z (mm) packed; capacity ROUTE_WAYPOINTS_MAX * 3. */
  wp: Float32Array;
  /** Number of waypoints used. */
  n: number;
  visits: number;
  /** Tick last used. */
  lastUsed: number;
}

/** Navigation memory (GDD 02 §9). */
export interface AntMemory {
  /** Breadcrumb ring x,y,z (mm) packed; capacity CRUMB_CAP * 3. */
  crumbs: Float32Array;
  crumbHead: number;
  crumbLen: number;
  /** Path-integration home vector (from the ant to its home entrance), mm. */
  homeVec: Vec3;
  /** Accumulated path-integration error, mm. */
  homeVecErr: number;
  /** Food source the ant currently knows / works, -1 none. */
  knownSourceId: number;
  /** Home entrance id, -1 none. */
  homeEntranceId: number;
  /** Completed round trips. */
  trips: number;
  /** Tick of the last successful delivery, -1 never. */
  lastSuccessTick: number;
  routes: RouteMemory[];
  /** Recently depleted sources to avoid. */
  depleted: { sourceId: number; untilTick: number }[];
  /** Recruitment lead passed on by a nestmate (GDD 02 §6.7); sourceId -1 when none. */
  lead: { sourceId: number; pos: Vec3; tick: number };
  /** Last decisions for the inspect card: reason code index (REASON_CODES) + detail number. */
  decisions: { tick: number; code: number; detail: number }[];
}

/** A grapple lock held by an ant (GDD 05 §4.3). */
export interface GrappleLock {
  targetKind: 'ant' | 'creature';
  targetId: number;
  /** Slot index on the target (legs, petiole ...). */
  slot: number;
}

/** Fight-time state (GDD 05 §4, D2.12); null outside fights. Cooldowns are absolute ticks (0 = ready). */
export interface CombatState {
  /** Lock held by this ant; null when not holding. */
  lock: GrappleLock | null;
  /** Ids of ants holding this one. */
  heldBy: number[];
  pinned: boolean;
  /** Creature id seizing this ant, -1 none. */
  seizedBy: number;
  /** Struggle meter 0..1 while seized. */
  escape: number;
  paralysedUntilTick: number;
  stuckSinceTick: number;
  disorientedUntilTick: number;
  dodgeUntilTick: number;
  /** Damage dealt in this fight, damage points. */
  fightDamage: number;
  recentHitters: { id: number; tick: number }[];
  /** Next tick a bite / species special / dodge is allowed. */
  biteCdTick: number;
  specialCdTick: number;
  dodgeCdTick: number;
}

/** Founding reserves of a claustral queen (GDD 06 §5.5). Founding health is the ant's hp / maxHp. */
export interface FoundingReserves {
  /** Remaining single C+P reserve pool, loads. */
  reserveLoads: number;
  /** Initial reserve, loads (`FOUND_R0`, species `opening.R0`). */
  R0: number;
  /** Desiccation 0..1 (death at 1). */
  desiccation: number;
  /** Wings still attached. */
  wings: boolean;
  eggsLaid: number;
}

/**
 * Extra state of a queen (GDD 02 §3, GDD 06 §5; D1.18). Her age derives from `Ant.bornTick`; her drawn lifespan is
 * in `Colony.queens`.
 */
export interface QueenState {
  mode: QueenMode;
  /** Gut contents, loads. */
  gut: { c: number; p: number };
  /** Fat-body reserve, C loads. */
  reserve: number;
  /** Protein reserve, P loads. */
  reserveP: number;
  /** Individual fecundity multiplier (~N(1, 0.15)). */
  fecundity: number;
  /** Eggs she may lay now (budget accumulates up to EGG_BUDGET_CAP). */
  eggBudget: number;
  /** Eggs laid per day of the year; length = days per year of this game's season length. */
  layingLog: Int16Array;
  /** Eggs of the founding clutch laid so far. */
  clutchLaid: number;
  /** Founding reserves; null once established. */
  founding: FoundingReserves | null;
}

/** Alate (gyne/male) reproduction state (GDD 06 §11). */
export interface AlateInfo {
  state: AlateState;
  /** Flight phase while flying, null otherwise. */
  flightPhase: FlightPhase | null;
  /** Flight energy 0..1. */
  flightEnergy: number;
  /** Mating progress 0..1. */
  mating: number;
}

export interface Ant extends Walker {
  id: number;
  alive: boolean;
  /** Colony id. */
  colony: number;
  caste: Caste;
  /** Tick of eclosion (or spawn). */
  bornTick: number;
  /** Intrinsic lifespan on the physiological scale, game days (GDD 02 §1.3). */
  lifespanGd: number;
  /** Physiological age, game days (accrues at AGE_RATE_* per location; death when >= lifespanGd). */
  physioAgeGd: number;
  /** Health in damage points; health 0..1 = hp / maxHp. */
  hp: number;
  maxHp: number;
  /** Loads carried in the crop. */
  cropC: number;
  cropP: number;
  /** Crop capacity, loads. */
  cropCap: number;
  /** Carry capacity, loads of item bulk. */
  carryCap: number;
  /** Personal fat-body reserve, C loads (0..RESERVE_CAP of the age band, GDD 02 §1.4); starvation damage at 0. */
  energy: number;
  /** Fatigue 0..1 (rest at REST_ENTER). */
  fatigue: number;
  /** Body length, BU (continuous, drawn at eclosion; GDD 07 §2.3). */
  lengthBu: number;
  /** Body mass, mg. */
  massMg: number;
  sizeClass: AntSizeClass | null;
  carry: CarryRef;
  task: Task;
  /** Tick the task was assigned. */
  taskTick: number;
  /** Task suspended while possessed, restored on release; null when none. */
  suspendedTask: Task | null;
  /** Behaviour FSM state ('<task>.<state>', see BEHAVIOUR_STATES). */
  state: string;
  stateTick: number;
  target: TargetRef;
  action: ActionInProgress | null;
  mem: AntMemory;
  /** Nest the ant is in, -1 outside. */
  nestId: number;
  /** Chamber the ant is in, -1 none. */
  chamberId: number;
  combat: CombatState | null;
  /** AntFlag bits. */
  flags: number;
  /** Render pose hint: index into POSES. */
  pose: number;
  /** Next tick the behaviour runs (staggering). */
  thinkTick: number;
  /** Behaviour scratch values (numbers only). */
  bb: Record<string, number>;
  /** Response thresholds per task (index = TASKS order), GDD 02 §6.4. */
  thresholds: Float32Array;
  /** Forager activation level (GDD 02 §6.6). */
  activation: number;
  /** Body temperature °C, heat and cold dose 0..1 (GDD 06 §2.6). */
  tb: number;
  heatLoad: number;
  coldLoad: number;
  thermalState: ThermalState;
  /** Acid charges (formicines), 0..ACID_MAX. */
  acid: number;
  /** Tick of the next acid charge regeneration (absolute). */
  acidRegenTick: number;
  /** Queen: next tick a player `lay-egg` is allowed (GDD 01 cooldown, absolute). */
  layCooldownUntilTick: number;
  /** INJURIES bits. */
  injuries: number;
  /** Alarm level 0.. (half-life 10 s, GDD 05). */
  alarmLevel: number;
  /** Dirt 0..1 (grooming, hygiene). */
  dirt: number;
  /** Queen extras; null for other castes. */
  queen: QueenState | null;
  /** Alate extras; null unless gyne/male. */
  alate: AlateInfo | null;
}
