// Ecology and rival-colony world state not held in an entity array (GDD 05 App. A).
// Lives in SimState.ecology and SimState.rivals (additive root fields, see contracts map).

import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind } from './ids';
import type { CreatureVariant, HazardKind, RelationState } from './ids/ecology';
import type { Herd } from './plant';

export interface PreyPatch {
  id: number;
  center: Vec3;
  /** mm */
  radius: number;
  kind: CreatureKind;
  /** Abstract prey count and carrying capacity. */
  count: number;
  k: number;
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
}

export interface BirdEvent {
  variant: CreatureVariant;
  pos: Vec3;
  phase: 'approach' | 'landed' | 'leaving';
  startTick: number;
  kills: number;
  carves: number;
}

/** 2D grid over the world in TERR_CELL cells (GDD 05 §3.5 territory, danger grid). */
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
  bird: BirdEvent | null;
  /** Last bird event per colony id. */
  lastBirdTick: Record<string, number>;
  /** Carrion drop accumulators (variant x zone), GDD 05 §1.6. */
  carrionAcc: Float32Array;
  /** Player colony's danger grid (GDD 05 §2.5), length w * h; empty until the creatures module allocates it. */
  danger: CellGrid & { data: Float32Array };
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
}

export interface RivalsState {
  relations: RivalRelation[];
  territory: TerritoryGrid;
  threat: ThreatDirector;
}
