// Sim events: entity lifecycle, possession, actions, colony and brood (GDD 01 App. C, GDD 02 App. C).

import type { Vec3 } from '@/core/math/vec3';
import type { BroodCaste, BroodStage, Caste, SpeedLevel, Task } from './ids';
import type {
  ActionFailReason, ActionId, BroodDeathCause, DeathCause, PossessMethod, PossessRejectReason,
  PossessionEndReason, StarvationStage,
} from './ids/ants';
import type { EntityKind, TargetRef } from './refs';

export type LifecycleEvent =
  | { type: 'entity-created'; entity: EntityKind; id: number }
  | { type: 'entity-removed'; entity: EntityKind; id: number; cause: string };

export type PossessionEvent =
  | { type: 'possession-started'; antId: number; caste: Caste; via: PossessMethod }
  | { type: 'possession-ended'; antId: number; reason: PossessionEndReason; resumedTask: Task | null }
  | { type: 'possess-rejected'; antId: number; reason: PossessRejectReason }
  | { type: 'possessed-ant-died'; antId: number; cause: DeathCause }
  | { type: 'action-started'; antId: number; action: ActionId; target: TargetRef | null }
  | { type: 'action-completed'; antId: number; action: ActionId; target: TargetRef | null; result: number }
  | { type: 'action-failed'; antId: number; action: ActionId; reason: ActionFailReason }
  | { type: 'action-cancelled'; antId: number; action: ActionId; reason: ActionFailReason | null }
  | { type: 'trail-toggled'; antId: number; on: boolean }
  // GDD 01 `speed-changed` is the same event as GDD 06 `time.speed-changed` (eventsWorld.ts), emitted once.
  | { type: 'speed-refused'; speed: SpeedLevel; reason: 'possession' | 'opening' }
  | { type: 'ant-unstuck'; antId: number; from: Vec3; to: Vec3 };

export type ColonyEvent =
  | { type: 'ant-eclosed'; antId: number; colonyId: number; caste: Caste; nanitic: boolean; minim: boolean }
  | { type: 'ant-died'; antId: number; colonyId: number; cause: DeathCause; pos: Vec3; task: Task; caste: Caste }
  | { type: 'egg-laid'; broodId: number; queenId: number; destined: BroodCaste }
  | { type: 'brood-stage'; broodId: number; from: BroodStage; to: BroodStage }
  | { type: 'brood-died'; broodId: number; stage: BroodStage; cause: BroodDeathCause; /** Owner colony (Stage 1A gate, additive). */ colonyId?: number }
  | { type: 'brood-moved'; broodId: number; fromChamber: number; toChamber: number; reason: string }
  | { type: 'feed'; giverId: number; receiverId: number; broodId: number; c: number; p: number }
  | { type: 'trophallaxis'; donorId: number; receiverId: number; amount: number; ambient: boolean }
  | { type: 'delivery'; antId: number; colonyId: number; sourceId: number; kind: string; c: number; p: number; toxin: number }
  | { type: 'recruit'; fromId: number; toId: number; sourceId: number }
  | { type: 'forager-departed'; antId: number; reason: 'recruited' | 'spontaneous' }
  | { type: 'trail-established'; colonyId: number; sourceId: number; lengthBu: number }
  | { type: 'trail-lost'; colonyId: number; sourceId: number; pos: Vec3 }
  | { type: 'route-learned'; antId: number; sourceId: number }
  | { type: 'task-changed'; antId: number; from: Task; to: Task; reason: string }
  | { type: 'stores-full'; colonyId: number }
  /** GDD 02 §10.8 flag (sim-fix-colony): the colony's midden is unreachable (no open entrance, no midden chamber). */
  | { type: 'midden-blocked'; colonyId: number; blocked: boolean }
  | { type: 'starvation-stage'; colonyId: number; stage: StarvationStage }
  | { type: 'cannibalism'; colonyId: number; broodId: number }
  | { type: 'corpse-removed'; antId: number; itemId: number; to: 'midden' | 'mound' }
  | { type: 'waste-dumped'; antId: number; itemId: number; to: 'midden' | 'mound' }
  /** D5.8: `source` names what raised it (ant id as text, 'creature', 'human' ...). */
  | { type: 'alarm-raised'; colonyId: number; pos: Vec3; strength: number; source: string }
  /** D5.7: one event for the whole cooperative transport; `bulk` in loads of carry capacity. */
  | {
    type: 'coop-transport'; itemId: number; carriers: number[]; bulk: number;
    phase: 'start' | 'stalled' | 'cut' | 'delivered' | 'abandoned';
  }
  | { type: 'marker-response'; markerId: number; antsResponding: number };
