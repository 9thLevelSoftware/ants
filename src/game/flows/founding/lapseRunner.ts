// Time-lapse playback (GDD 06 §5.11): how many simulation ticks each real frame runs. Watching: the lapse fills
// about TIMELAPSE_TARGET_S real seconds (speed = span x 600 / target, kept to 45-120 s), within a frame budget so a
// slow machine simply takes longer. Skipping: as many ticks as the budget allows. Both call the same sim.tick in
// the same order, so the end state is identical. No DOM, no three: Node-testable.
import { TIMELAPSE_MAX_S, TIMELAPSE_MIN_S, TIMELAPSE_TARGET_S } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';

/** Owed ticks are capped at this many seconds of playback (never a catch-up spiral). */
const MAX_OWED_S = 0.5;

export interface LapseStepper {
  step(n: number): number;
}

export interface LapseFrameOptions {
  /** Lapse span estimate, game days. */
  spanGd: number;
  skipping: boolean;
  /** Real-time budget for this frame, ms. */
  budgetMs: number;
  now: () => number;
  /** Still in the lapse (the flow stops when the phase moves on). */
  running: () => boolean;
}

/** Simulation ticks per real second of watching for a lapse of spanGd game days. */
export function watchTicksPerSecond(spanGd: number): number {
  const ticks = Math.max(1, spanGd) * TICKS_PER_DAY;
  const target = Math.min(TIMELAPSE_MAX_S, Math.max(TIMELAPSE_MIN_S, TIMELAPSE_TARGET_S));
  return ticks / target;
}

export class LapseRunner {
  private owed = 0;

  reset(): void { this.owed = 0; }

  /** Runs this frame's ticks; returns how many ran. */
  frame(stepper: LapseStepper, realDt: number, o: LapseFrameOptions): number {
    const start = o.now();
    let ran = 0;
    // one tick per call: the lapse stops on the very tick it ends, whatever the rate (watch and skip agree)
    if (o.skipping) {
      while (o.running() && o.now() - start < o.budgetMs) ran += stepper.step(1);
      return ran;
    }
    const rate = watchTicksPerSecond(o.spanGd);
    this.owed = Math.min(this.owed + rate * Math.max(0, realDt), rate * MAX_OWED_S);
    while (this.owed >= 1 && o.running() && o.now() - start < o.budgetMs) {
      ran += stepper.step(1);
      this.owed -= 1;
    }
    return ran;
  }
}
