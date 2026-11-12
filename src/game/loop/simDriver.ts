// Drives one Sim from real time: the fixed-timestep accumulator at the sim's own speed and pause flag, game-level
// freezes (photo mode, pause menu), the achieved-speed meter with its step-down rule, zero-time command
// application while paused (GDD 06 §4.7), and synchronous stepping for tests. No DOM, no three: Node-testable.
import type { Command, RunSpeed, Sim, SpeedLevel } from '@/sim/types';
import { SPEED_LIMITED_EVENT_MIN_INTERVAL_S, TICK_SECONDS } from '../config/loop';
import { SpeedMeter, type SpeedReport } from './speedMeter';
import { TickClock, type TickRunResult } from './tickClock';

/** EMA weight of one tick in the tick-time average. */
const TICK_MS_EMA = 0.02;

export interface FrameOptions {
  /** The game does not let time pass (photo mode, pause menu, not playing). */
  frozen: boolean;
  /** Real-time ticking is on (off in ?test=1: only step() advances the sim). */
  realtime: boolean;
  /** Millisecond clock for the frame budget, null when none. */
  now: (() => number) | null;
}

export interface DriverFrame extends TickRunResult {
  /** Interpolation alpha after this frame. */
  alpha: number;
  /** The sim was allowed to run (not paused, not frozen, realtime on). */
  running: boolean;
  /** A step-down to this speed was requested this frame. */
  steppedDownTo: RunSpeed | null;
  /**
   * Game seconds the drawn time (tick - 1 + alpha) advanced this frame: what actually passed, which is less than
   * real dt x speed when the tick budget limits the sim. The possessed-ant predictor integrates this.
   */
  advancedS: number;
}

export class SimDriver {
  readonly clock = new TickClock();
  readonly meter = new SpeedMeter();
  /** Called before every tick (set the player intent). */
  beforeTick: (() => void) | null = null;
  /** Ticks executed since creation (debug). */
  ticksRun = 0;
  /** Millisecond clock for perf numbers (performance.now); null = no timing. */
  timer: (() => number) | null = null;
  /** Mean simulation time per tick, ms (EMA over about 50 ticks; NaN before the first timed tick). */
  tickMs = NaN;
  /**
   * Bumped whenever the sim changes without real time passing (step(), commands applied at once). A per-frame
   * prediction made before such a change is stale.
   */
  zeroTimeRev = 0;
  private timedTicks = 0;
  private queued = 0;
  /** Dropped ticks not yet reported by a time.speed-limited event, and real s since the last one. */
  private unreportedDrops = 0;
  private sinceLimitedS = Infinity;
  private lastFrame: DriverFrame = { ran: 0, dropped: 0, budgetHit: false, alpha: 0, running: false, steppedDownTo: null, advancedS: 0 };

  constructor(readonly sim: Sim) {}

  get paused(): boolean { return this.sim.state.env.time.paused; }
  get speed(): RunSpeed { return this.sim.state.env.time.speed; }
  /** 0 when paused, else the running speed. */
  get level(): SpeedLevel { return this.paused ? 0 : this.speed; }

  enqueue(cmd: Command): void {
    this.queued++;
    this.sim.enqueue(cmd);
  }

  /** Applies queued commands without advancing time and delivers their events (paused / frozen / step 0). */
  applyCommandsNow(): void {
    if (this.queued > 0) this.zeroTimeRev++;
    this.queued = 0;
    this.sim.applyPendingCommands();
    this.sim.events.flush();
  }

  private tickOnce = (): void => {
    this.beforeTick?.();
    this.queued = 0; // the tick applies whatever is queued
    const t0 = this.timer ? this.timer() : 0;
    this.sim.tick();
    if (this.timer) {
      const ms = this.timer() - t0;
      // running mean for the first ticks (the very first one carries JIT warm-up), then an EMA
      this.timedTicks++;
      const w = Math.max(TICK_MS_EMA, 1 / this.timedTicks);
      this.tickMs = Number.isNaN(this.tickMs) ? ms : this.tickMs + (ms - this.tickMs) * w;
    }
    this.ticksRun++;
  };

  /** One real frame. */
  frame(realDt: number, opts: FrameOptions): DriverFrame {
    const running = opts.realtime && !opts.frozen && !this.paused;
    const f = this.lastFrame;
    f.running = running;
    f.steppedDownTo = null;
    f.advancedS = 0;
    if (!running) {
      this.applyCommandsNow();
      // time stands still: the drawn pose stays put (alpha kept) and nothing is caught up on resume
      this.clock.hold();
      f.ran = 0; f.dropped = 0; f.budgetHit = false; f.alpha = this.clock.alpha;
      return f;
    }
    const alpha0 = this.clock.alpha;
    this.clock.accumulate(realDt, this.speed);
    // Queued commands wait for the next tick, which applies them at its start (at most 0.1 game s later).
    const r = this.clock.run(this.tickOnce, opts.now);
    f.ran = r.ran; f.dropped = r.dropped; f.budgetHit = r.budgetHit; f.alpha = this.clock.alpha;
    f.advancedS = Math.max(0, r.ran + f.alpha - alpha0) * TICK_SECONDS;
    const down = this.meter.frame(realDt, r.ran, this.speed);
    if (down !== null) {
      this.sim.enqueue({ type: 'setSpeed', speed: down });
      f.steppedDownTo = down;
    }
    this.reportLimits(realDt, r.dropped, down !== null);
    return f;
  }

  /**
   * GDD 06 §4.4: `time.speed-limited` when owed ticks were dropped or the speed had to step down. Under sustained
   * overload ticks drop every frame, so events are spaced SPEED_LIMITED_EVENT_MIN_INTERVAL_S apart and carry the
   * sum of the drops since the previous one.
   */
  private reportLimits(realDt: number, dropped: number, steppedDown: boolean): void {
    this.unreportedDrops += dropped;
    this.sinceLimitedS += realDt;
    const due = this.unreportedDrops > 0 && this.sinceLimitedS >= SPEED_LIMITED_EVENT_MIN_INTERVAL_S;
    if (!due && !steppedDown) return;
    this.sim.emit({ type: 'time.speed-limited', requested: this.speed, effective: this.meter.report(this.speed).effective, droppedTicks: this.unreportedDrops });
    this.sim.events.flush();
    this.unreportedDrops = 0;
    this.sinceLimitedS = 0;
  }

  /** Advances exactly n ticks now, whatever the pause and freeze state (debug API / tests). */
  step(n: number): number {
    const count = Math.max(0, Math.floor(n));
    if (count === 0) { this.applyCommandsNow(); return 0; }
    for (let i = 0; i < count; i++) this.tickOnce();
    this.zeroTimeRev++;
    this.clock.atLatestTick(); // draw the stepped state, not the tick before it
    return count;
  }

  speedReport(): SpeedReport {
    return this.meter.report(this.speed);
  }

  /** Result of the last frame (shared object). */
  get last(): DriverFrame {
    return this.lastFrame;
  }
}
