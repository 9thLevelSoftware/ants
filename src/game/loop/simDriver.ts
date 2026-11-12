// Drives one Sim from real time: the fixed-timestep accumulator at the sim's own speed and pause flag, game-level
// freezes (photo mode, pause menu), the achieved-speed meter with its step-down rule, zero-time command
// application while paused (GDD 06 §4.7), and synchronous stepping for tests. No DOM, no three: Node-testable.
import type { Command, RunSpeed, Sim, SpeedLevel } from '@/sim/types';
import { SpeedMeter, type SpeedReport } from './speedMeter';
import { TickClock, type TickRunResult } from './tickClock';

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
}

export class SimDriver {
  readonly clock = new TickClock();
  readonly meter = new SpeedMeter();
  /** Called before every tick (set the player intent). */
  beforeTick: (() => void) | null = null;
  /** Ticks executed since creation (debug). */
  ticksRun = 0;
  private lastFrame: DriverFrame = { ran: 0, dropped: 0, budgetHit: false, alpha: 0, running: false, steppedDownTo: null };

  constructor(readonly sim: Sim) {}

  get paused(): boolean { return this.sim.state.env.time.paused; }
  get speed(): RunSpeed { return this.sim.state.env.time.speed; }
  /** 0 when paused, else the running speed. */
  get level(): SpeedLevel { return this.paused ? 0 : this.speed; }

  enqueue(cmd: Command): void {
    this.sim.enqueue(cmd);
  }

  /** Applies queued commands without advancing time and delivers their events (paused / frozen / step 0). */
  applyCommandsNow(): void {
    this.sim.applyPendingCommands();
    this.sim.events.flush();
  }

  private tickOnce = (): void => {
    this.beforeTick?.();
    this.sim.tick();
    this.ticksRun++;
  };

  /** One real frame. */
  frame(realDt: number, opts: FrameOptions): DriverFrame {
    const running = opts.realtime && !opts.frozen && !this.paused;
    const f = this.lastFrame;
    f.running = running;
    f.steppedDownTo = null;
    if (!running) {
      this.applyCommandsNow();
      if (opts.frozen || this.paused) this.clock.reset(); // no catch-up after a pause or freeze
      f.ran = 0; f.dropped = 0; f.budgetHit = false; f.alpha = this.clock.alpha;
      return f;
    }
    this.clock.accumulate(realDt, this.speed);
    // Queued commands wait for the next tick, which applies them at its start (at most 0.1 game s later).
    const r = this.clock.run(this.tickOnce, opts.now);
    f.ran = r.ran; f.dropped = r.dropped; f.budgetHit = r.budgetHit; f.alpha = this.clock.alpha;
    const down = this.meter.frame(realDt, r.ran, this.speed);
    if (down !== null) {
      this.sim.enqueue({ type: 'setSpeed', speed: down });
      f.steppedDownTo = down;
    }
    return f;
  }

  /** Advances exactly n ticks now, whatever the pause and freeze state (debug API / tests). */
  step(n: number): number {
    const count = Math.max(0, Math.floor(n));
    if (count === 0) { this.applyCommandsNow(); return 0; }
    for (let i = 0; i < count; i++) this.tickOnce();
    this.clock.reset();
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
