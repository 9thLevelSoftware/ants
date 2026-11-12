// The shape of one action primitive's definition (GDD 01 §7.1). The runner owns the lifecycle; a definition says
// what the primitive needs, how long it takes and what it does.

import type { ActionFailReason, ActionId, Ant, CueId, PoseId, Sim, TargetKind, TargetRef } from '@/sim/types';

/**
 * timed: windup 20 % / active 70 % / recovery 10 %, effect at the end of active.
 * continuous: no sim-time windup/recovery, `tick` applies a rate from the first tick until it reports done.
 * instant: effect applied inside begin(), no ant.action is kept.
 */
export type ActionKind = 'timed' | 'continuous' | 'instant';

/** What a continuous primitive's tick reports. */
export type TickOutcome = 'continue' | 'done' | ActionFailReason;

export interface ActionDef {
  id: ActionId;
  kind: ActionKind;
  /** Target kinds accepted ('none' = the ant itself). */
  targets: readonly TargetKind[];
  /** Picks a target when the caller gives none (AI shortcut, debug `act()` without target); null = none fits. */
  autoTarget?(sim: Sim, ant: Ant): TargetRef | null;
  /** Preconditions beyond caste permission, target existence and reach; returns why not, or null. */
  check(sim: Sim, ant: Ant, target: TargetRef): ActionFailReason | null;
  /** Reach test; omitted = contact reach (REACH_L, cone) for entity targets, always true for 'none'. */
  reachable?(sim: Sim, ant: Ant, target: TargetRef): boolean;
  /** Base duration, game s at workRate 1 (timed), or the maximum running time for continuous (0 = unbounded). */
  durationS(sim: Sim, ant: Ant, target: TargetRef): number;
  /** Fraction of a timed duration spent in windup (default ACTION_WINDUP_FRAC). */
  windupFrac?: number;
  /** Interrupts (movement input, damage, possession) may cancel it. */
  cancellable: boolean;
  /** Once past windup it cannot be interrupted (lay-egg). */
  lockedAfterWindup?: boolean;
  /** Restarts on completion while its input is held (or the AI asked for repeat). */
  repeatable?: boolean;
  /** Damage does not interrupt it (bite-hold, grip). */
  ignoresDamage?: boolean;
  /** May start while another primitive runs (toggles, `move`). Default false. */
  concurrent?: boolean;
  /** Starting it cancels a running cancellable primitive first (drop, let-go, bite, release-alarm). */
  preempts?: boolean;
  /** Continuous rate scales with workRate (default true). */
  scalesWithWork?: boolean;
  /** Runs at begin, after validation (e.g. auto-drop a carried pellet). */
  onBegin?(sim: Sim, ant: Ant, target: TargetRef): void;
  /**
   * Timed: the effect at the end of active. Instant: the effect. Returns the result number for action-completed,
   * or a failure reason when the effect could not happen after all (nothing left to dig, egg budget gone ...).
   */
  effect?(sim: Sim, ant: Ant, target: TargetRef): number | ActionFailReason;
  /** Continuous: one tick of effect (dt game s, already x workRate where the primitive scales with it). */
  tick?(sim: Sim, ant: Ant, target: TargetRef, dt: number): TickOutcome;
  /** Cleanup when the action ends for any reason (grapple release, drag release ...). */
  onEnd?(sim: Sim, ant: Ant, target: TargetRef): void;
  pose: PoseId;
  /** Cue event emitted with the effect (audio / visual), null none. */
  cue: CueId | null;
}
