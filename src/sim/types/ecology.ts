// Ecology and rival-colony world state not held in an entity array (GDD 05 App. A).
// Lives in SimState.ecology and SimState.rivals (D1.15, D1.16). The player's danger grid is Colony.danger.

import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind } from './ids';
import type { CreatureVariant, HazardKind, RelationState } from './ids/ecology';
import type { Herd } from './plant';
import type { RivalsModuleState } from './rivalsModule';

export interface PreyPatch {
  id: number;
  center: Vec3;
  /** mm */
  radius: number;
  kind: CreatureKind;
  /** Abstract prey count and carrying capacity. */
  count: number;
  k: number;
  /**
   * Bitmask of colony slots that know the patch (an ant of theirs met its prey; colony-life round 2, R18 hunting).
   * Optional and additive: absent = known by none.
   */
  knownBy?: number;
}

export interface Hazard {
  id: number;
  kind: HazardKind;
  pos: Vec3;
  /** mm */
  radius: number;
  depth: number;
  state: string;
  /** Bitmask of colony slots that know it. */
  knownBy: number;
  /** Additive (creatures): tick it disappears (slime trails), absent = permanent. */
  untilTick?: number;
}

export interface CreatureTerritory {
  kind: CreatureKind;
  center: Vec3;
  /** mm */
  radius: number;
  /** Creature id occupying it, -1 vacant. */
  occupantId: number;
  vacantUntilTick: number;
}

export interface CreatureDirector {
  lastRunTick: number;
  perKindCounts: Record<string, number>;
  territories: CreatureTerritory[];
  /** Additive (creatures): carrion source ids already seeded with fly larvae (GDD 05 §1.6), ascending. */
  seededSources?: number[];
  /** Additive (creatures): last hourly sub-step run, tick (-1 none). */
  lastHourlyTick?: number;
  /** Additive (creatures): 1 when it rained at the last director run (rain-event start detection). */
  wasRaining?: number;
  /** Additive (creatures): nest id with an active `nest-attacked` alert from an invader, -1 none. */
  nestAttackedNest?: number;
  /** Additive (creatures): tick that alert clears (30 s after the last invader left), -1 not pending. */
  nestAttackedUntil?: number;
}

export interface BirdEvent {
  variant: CreatureVariant;
  pos: Vec3;
  phase: 'approach' | 'landed' | 'leaving';
  startTick: number;
  kills: number;
  carves: number;
  /** Additive (creatures): targeted colony, landing / end ticks, the pending peck (head-cock aim), next carve. */
  colonyId?: number;
  landTick?: number;
  endTick?: number;
  nextPeckTick?: number;
  peckTargetId?: number;
  peckAim?: Vec3 | null;
  nextCarveTick?: number;
}

/** 2D grid over the world in TERR_CELL cells (GDD 05 §3.5 territory). */
export interface CellGrid {
  /** Cell edge, mm. */
  cell: number;
  w: number;
  h: number;
}

export interface TerritoryGrid extends CellGrid {
  /** Colony slots per cell (TERR_COLONY_SLOTS; slot 0 = player). */
  slots: number;
  /** Marks, length w * h * slots; empty (length 0) until the rivals module allocates it. */
  marks: Float32Array;
  /** Colony id per slot, -1 free. */
  slotColony: number[];
}

export interface EcologyState {
  herds: Herd[];
  preyPatches: PreyPatch[];
  hazards: Hazard[];
  director: CreatureDirector;
  /** Active bird event, null none. */
  birdEvent: BirdEvent | null;
  /** Last bird event per colony id. */
  lastBirdTick: Record<string, number>;
  /** Carrion drop accumulators (variant x zone), GDD 05 §1.6. */
  carrionAcc: Float32Array;
}

export interface RivalRelation {
  /** Colony ids, a < b. */
  a: number;
  b: number;
  state: RelationState;
  /** Escalation score. */
  e: number;
  stateSinceTick: number;
  /** Contested cell indices on the territory grid. */
  warFront: number[];
}

export interface ThreatDirector {
  /** Kind of the active major threat, null none. */
  activeKind: string | null;
  activeSinceTick: number;
  lastEndTick: number;
  /** Additive (creatures): quiet-share bookkeeping of invariant I11 (GDD 05 §6); absent until first used. */
  quiet?: QuietTracker;
}

/**
 * Hourly quiet-share record (GDD 05 §6 I11). `hours` is a ring of the last QUIET_WINDOW_GD x 24 clock hours:
 * -1 not counted (night, founding, winter), 0 loud, 1 quiet. The current hour accumulates in the cur* fields.
 */
export interface QuietTracker {
  hours: number[];
  /** Next write index in `hours`. */
  head: number;
  /** Clock hour index (calendar tick / ticks per hour) being accumulated, -1 none. */
  curHour: number;
  /** 1 when a major threat was active at any time in the current hour. */
  curThreat: number;
  /** Alert samples taken / samples with a warning or critical player-colony alert, current hour. */
  curSamples: number;
  curAlertSamples: number;
  /** 1 when the current hour counts (day phase, not founding, not winter), sampled at its start. */
  curCounted: number;
  /** Hours closed so far (all, counted, quiet), for reports. */
  total: number;
  counted: number;
  quiet: number;
  /** Major threats started so far, for reports. */
  threats: number;
}

export interface RivalsState {
  relations: RivalRelation[];
  territory: TerritoryGrid;
  threatDirector: ThreatDirector;
  /** Additive (rivals): the rivals module's bookkeeping, created on first use. */
  module?: RivalsModuleState;
}
