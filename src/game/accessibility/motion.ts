// What "reduced motion" and "camera shake and sway" mean in numbers (GDD 08 2.4, 12). Pure.
import { REDUCED_DOF_STRENGTH } from './balance';

export type MotionChoice = 'system' | 'on' | 'off';

/** Reduced motion in effect: the player's choice, or the device's `prefers-reduced-motion` for "system". */
export function resolveReducedMotion(choice: MotionChoice, systemPrefersReduced: boolean): boolean {
  return choice === 'on' ? true : choice === 'off' ? false : systemPrefersReduced;
}

export interface MotionPlan {
  /** Reduced motion in effect. */
  reduced: boolean;
  /** Multiplier of the footstep tremor, 0..1: zero in reduced motion and with the shake setting at 0. */
  shakeScale: number;
  /** Multiplier of camera sway / bob (the rigs have none; the number is reported for the checks and stays zero). */
  swayScale: number;
  /** Multiplier of the depth-of-field blur (post chain `dofStrength`). */
  dofStrength: number;
}

export function motionPlan(reduced: boolean, shakePercent: number): MotionPlan {
  const shake = Number.isFinite(shakePercent) ? Math.min(100, Math.max(0, shakePercent)) / 100 : 1;
  return { reduced, shakeScale: reduced ? 0 : shake, swayScale: 0, dofStrength: reduced ? REDUCED_DOF_STRENGTH : 1 };
}
