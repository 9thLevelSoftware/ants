// Fixed-timestep accumulator (GDD 06 §4.3): real time owed at the current speed becomes whole 0.1 s ticks, run
// within a per-frame tick count and millisecond budget. Owed ticks beyond MAX_CATCHUP_TICKS are dropped (time
// simply does not pass for that interval). Pure: the caller passes the tick function and a clock.
import {
  MAX_CATCHUP_TICKS, MAX_FRAME_DT_S, MAX_TICKS_PER_FRAME, MAX_TICKS_PER_FRAME_NO_CLOCK, SIM_FRAME_BUDGET_MS, TICK_SECONDS,
} from '../config/loop';

export interface TickClockConfig {
  tickSeconds: number;
  maxFrameDtS: number;
  maxTicksPerFrame: number;
  frameBudgetMs: number;
  maxCatchupTicks: number;
}

export const DEFAULT_TICK_CLOCK: TickClockConfig = {
  tickSeconds: TICK_SECONDS, maxFrameDtS: MAX_FRAME_DT_S, maxTicksPerFrame: MAX_TICKS_PER_FRAME,
  frameBudgetMs: SIM_FRAME_BUDGET_MS, maxCatchupTicks: MAX_CATCHUP_TICKS,
};

export interface TickRunResult {
  /** Ticks executed this frame. */
  ran: number;
  /** Ticks dropped this frame because the backlog exceeded maxCatchupTicks. */
  dropped: number;
  /** The frame stopped because of the millisecond budget (not the tick cap). */
  budgetHit: boolean;
}

export class TickClock {
  /** Ticks owed (fractional). */
  acc = 0;
  /** Total ticks dropped since creation. */
  droppedTotal = 0;
  /** Set when ticks were dropped in the last frame (HUD "behind" hint). */
  behind = false;
  readonly cfg: TickClockConfig;

  constructor(cfg: Partial<TickClockConfig> = {}) {
    this.cfg = { ...DEFAULT_TICK_CLOCK, ...cfg };
  }

  /** Adds the ticks owed for `realDt` seconds at `speed` (game s per real s). Negative or NaN dt adds nothing. */
  accumulate(realDt: number, speed: number): void {
    if (!(realDt > 0) || !(speed > 0)) return;
    const dt = Math.min(realDt, this.cfg.maxFrameDtS);
    this.acc += (dt * speed) / this.cfg.tickSeconds;
  }

  /**
   * Runs owed ticks. `now` returns milliseconds (performance.now); pass null when no clock exists, which caps the
   * frame at MAX_TICKS_PER_FRAME_NO_CLOCK ticks instead of the budget.
   */
  run(tick: () => void, now: (() => number) | null): TickRunResult {
    const cap = now ? this.cfg.maxTicksPerFrame : Math.min(this.cfg.maxTicksPerFrame, MAX_TICKS_PER_FRAME_NO_CLOCK);
    const start = now ? now() : 0;
    let ran = 0;
    let budgetHit = false;
    while (this.acc >= 1 && ran < cap) {
      if (now && ran > 0 && now() - start >= this.cfg.frameBudgetMs) { budgetHit = true; break; }
      tick();
      this.acc -= 1;
      ran++;
    }
    let dropped = 0;
    if (this.acc > this.cfg.maxCatchupTicks) {
      dropped = Math.floor(this.acc);
      this.acc -= dropped;
      this.droppedTotal += dropped;
    }
    this.behind = dropped > 0;
    return { ran, dropped, budgetHit };
  }

  /** Interpolation alpha between the previous and the current tick pose (0..1). */
  get alpha(): number {
    return this.acc >= 1 ? 1 : this.acc <= 0 ? 0 : this.acc;
  }

  /**
   * Time stops (pause, freeze): keep the fractional part so the drawn pose (prev + (cur - prev) * alpha) stays where
   * it was, but forget whole owed ticks so nothing is caught up on resume (GDD 06 §4.3).
   */
  hold(): void {
    if (this.acc > 1) this.acc = 1;
    this.behind = false;
  }

  /**
   * The sim was just advanced by hand (debug step): the latest tick is what should be drawn (alpha 1). Real time
   * continues from there; the next running frame computes the following tick and interpolates towards it.
   */
  atLatestTick(): void {
    this.acc = 1;
    this.behind = false;
  }

  /** Forget owed time completely (new game, load). */
  reset(): void {
    this.acc = 0;
    this.behind = false;
  }
}
