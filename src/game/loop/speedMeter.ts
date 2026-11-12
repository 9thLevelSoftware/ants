// Honest reporting of the achieved speed (GDD 06 §4.4): effectiveSpeed = EMA (3 real s) of ticks executed per
// real second / 10, and the step-down rule: below 0.85 x the requested speed for 3 s, step the speed down one
// notch (8 -> 4 -> 2 -> 1), with a 10 s grace after the player raises it. At 1x it only reports "below real time".
import type { RunSpeed } from '@/sim/types';
import { EFFECTIVE_SPEED_TAU_S, STEP_DOWN_AFTER_S, STEP_DOWN_GRACE_S, STEP_DOWN_RATIO, TICK_SECONDS } from '../config/loop';

export interface SpeedReport {
  /** Requested running speed (1/2/4/8). */
  requested: RunSpeed;
  /** Achieved game seconds per real second (EMA). */
  effective: number;
  /** effective < STEP_DOWN_RATIO x requested right now. */
  lagging: boolean;
  /** At 1x and lagging: the clock runs slower than real time. */
  belowRealTime: boolean;
}

export class SpeedMeter {
  private rate = NaN; // ticks per real second (EMA)
  private lagS = 0;
  private graceS = 0;
  private lastRequested: RunSpeed = 1;

  /**
   * One real frame in which the sim was running at `requested` and executed `ticks`. Returns the speed to step down
   * to when the rule fires this frame, else null. Frames with the sim not running must not be fed (paused time
   * never counts).
   */
  frame(realDt: number, ticks: number, requested: RunSpeed): RunSpeed | null {
    if (!(realDt > 0)) return null;
    if (requested > this.lastRequested) this.graceS = STEP_DOWN_GRACE_S; // the player raised it again
    if (requested !== this.lastRequested) { this.lagS = 0; this.rate = NaN; }
    this.lastRequested = requested;
    const inst = ticks / realDt;
    const k = 1 - Math.exp(-realDt / EFFECTIVE_SPEED_TAU_S);
    this.rate = Number.isNaN(this.rate) ? requested / TICK_SECONDS : this.rate + (inst - this.rate) * k;
    this.graceS = Math.max(0, this.graceS - realDt);
    const lagging = this.effective < STEP_DOWN_RATIO * requested;
    this.lagS = lagging ? this.lagS + realDt : 0;
    if (requested > 1 && this.graceS <= 0 && this.lagS >= STEP_DOWN_AFTER_S) {
      this.lagS = 0;
      return stepDownSpeed(requested);
    }
    return null;
  }

  /** Achieved speed, game s per real s (NaN before the first running frame). */
  get effective(): number {
    return this.rate * TICK_SECONDS;
  }

  report(requested: RunSpeed): SpeedReport {
    const eff = Number.isNaN(this.rate) ? requested : this.effective;
    const lagging = eff < STEP_DOWN_RATIO * requested;
    return { requested, effective: eff, lagging, belowRealTime: lagging && requested === 1 };
  }

  reset(): void {
    this.rate = NaN;
    this.lagS = 0;
  }
}

/** One notch down: 8 -> 4 -> 2 -> 1 (1 stays 1). */
export function stepDownSpeed(s: RunSpeed): RunSpeed {
  return s === 8 ? 4 : s === 4 ? 2 : 1;
}
