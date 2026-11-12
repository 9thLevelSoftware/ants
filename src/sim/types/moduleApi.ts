// Shapes exchanged between simulation modules through their index.ts functions (not persisted).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant } from './ant';
import type { Caste, ColonySpeciesId, Material, Task } from './ids';
import type { ActionFailReason, ActionId } from './ids/ants';
import type { PlanValidationCode } from './ids/nest';
import type { SiteFactor, SiteWord } from './ids/progression';
import type { Nutrients, TargetRef } from './refs';
import type { Sim } from './services';

/**
 * A task behaviour (state machine), exported in a module's `behaviours` array and looked up by task
 * (contracts guidance §5, ruling 13).
 */
export interface Behaviour {
  task: Task;
  /** Species this behaviour is for; omitted = every species (species modules override per task). */
  species?: readonly ColonySpeciesId[];
  enter(sim: Sim, ant: Ant): void;
  update(sim: Sim, ant: Ant): void;
  exit(sim: Sim, ant: Ant): void;
}

/** Result of canDo(): whether an action primitive may start now, and why not. */
export interface ActionCheck {
  ok: boolean;
  reason: ActionFailReason | null;
}

/** Result of validating a dig plan (GDD 03 `validatePlan`). */
export interface PlanValidation {
  ok: boolean;
  codes: PlanValidationCode[];
  warnings: PlanValidationCode[];
  /** BU^3 */
  targetVolume: number;
}

/** Site assessment at a point (GDD 03 `siteAt`, GDD 06 §5.7). */
export interface SiteReport {
  factors: Record<SiteFactor, number>;
  /** Weighted quality 0..1 and its word. */
  q: number;
  word: SiteWord;
}

/** Food actually moved by a store, feeding or harvest operation, loads. */
export type FoodAmount = Nutrients;

/** Outcome of one dig bite with the ramp brush (GDD 03 §2, docs/research/spike-nest.md §5 item 5). */
export interface DigBiteResult {
  ok: boolean;
  reason: ActionFailReason | null;
  /** Voxels opened by this bite. */
  voxels: number;
  /** Soil pellet item created, -1 none. */
  pelletId: number;
  /** Material bitten, null when nothing was dug. */
  material: Material | null;
}

/** The context prompt shown for the possessed ant (GDD 01 §7, GDD 08 §4.3). */
export interface ActionPrompt {
  actionId: ActionId;
  target: TargetRef | null;
  /** Whether the action can start now; when not, why. */
  ok: boolean;
  reason: ActionFailReason | null;
}

/** Read-only summary of one ant for the inspect card and the debug API (GDD 01 §6, GDD 02 §7). */
export interface AntInspect {
  antId: number;
  colonyId: number;
  caste: Caste;
  task: Task;
  state: string;
  /** hp / maxHp, 0..1. */
  health: number;
  crop: Nutrients;
  /** Reserve, C loads. */
  energy: number;
  /** Physiological age, game days. */
  ageGd: number;
  pos: Vec3;
  /** Last decisions, newest first: reason code text and detail. */
  decisions: { tick: number; reason: string; detail: number }[];
}
