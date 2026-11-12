// Shapes exchanged between simulation modules through their index.ts functions (not persisted).

import type { Ant } from './ant';
import type { Task } from './ids';
import type { ActionFailReason } from './ids/ants';
import type { PlanValidationCode } from './ids/nest';
import type { SiteFactor, SiteWord } from './ids/progression';
import type { Sim } from './services';

/** A task behaviour (state machine) registered in the behaviour table keyed by task (contracts guidance §5). */
export interface Behaviour {
  task: Task;
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

/** Food actually moved by a colony store operation, loads. */
export interface FoodAmount {
  c: number;
  p: number;
}
