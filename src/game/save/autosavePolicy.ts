// Autosave timing rules (GDD 06 §15) as a pure state machine driven by real-time deltas: no clock, no storage, so a
// unit test can play 20 minutes in microseconds.
import { AUTOSAVE_DEFER_MAX_S, AUTOSAVE_INTERVAL_REAL_S, AUTOSAVE_MIN_GAP_S, AUTOSAVE_RETRY_S, THUMB_PRECAPTURE_LEAD_S } from './constants';
import type { AutosaveLabel } from './types';

/** Labels that are checkpoints around an event: they ignore the minimum gap and the lapse/flight blocks. */
export const CHECKPOINT_LABELS: readonly AutosaveLabel[] = [
  'pre-timelapse', 'opening-sealed', 'opening-complete', 'pre-winter', 'post-winter', 'pre-flight', 'final', 'quit',
];

export function isCheckpointLabel(label: string): boolean {
  return label === 'opening-start' || (CHECKPOINT_LABELS as readonly string[]).includes(label);
}

export interface PolicyFrame {
  /** Real seconds since the previous frame (clamped by the caller). */
  dtS: number;
  /** A game is running, not in a menu or paused (the sim's own pause counts as paused). */
  playing: boolean;
  /** The page is visible. */
  visible: boolean;
}

export interface PolicyContext {
  /** Block reason for an autosave right now (blocks.ts), null when allowed. */
  block: string | null;
  /** The possessed ant is in combat (defers the interval autosave up to AUTOSAVE_DEFER_MAX_S). */
  combat: boolean;
  /** Current sim tick: an autosave is skipped when it equals the last saved tick (rule 2). */
  tick: number;
}

export type PolicyOutcome = 'ok' | 'retry' | 'disabled';

export class AutosavePolicy {
  /** Interval in real seconds; 0 = off (setting "Off"). */
  intervalS: number = AUTOSAVE_INTERVAL_REAL_S;
  /** Master switch: false in `?test=1` unless `?autosave=1` (rule 8). */
  enabled = true;
  /** Switched off for the session after a failed retry (rule 7). */
  disabled = false;
  private playedS = 0;
  private clockS = 0;
  private lastAttemptClockS = -Infinity;
  private lastSavedTick = -1;
  private retryAtClockS = -1;
  private failures = 0;

  constructor(opts: { intervalS?: number; enabled?: boolean } = {}) {
    if (opts.intervalS !== undefined) this.intervalS = opts.intervalS;
    if (opts.enabled !== undefined) this.enabled = opts.enabled;
  }

  /** `autosaveMin` setting (minutes, 0 = off). */
  setIntervalMinutes(min: number): void {
    this.intervalS = Number.isFinite(min) && min > 0 ? min * 60 : 0;
  }

  /** Adds one frame: the interval counts only unpaused, visible play. */
  advance(f: PolicyFrame): void {
    const dt = Math.max(0, f.dtS);
    this.clockS += dt;
    if (f.playing && f.visible) this.playedS += dt;
  }

  /** Real seconds until the interval autosave falls due (Infinity when there is none). Drives the thumbnail pre-capture. */
  secondsToNext(): number {
    if (!this.enabled || this.disabled || this.intervalS <= 0) return Infinity;
    if (this.retryAtClockS >= 0) return Math.max(0, this.retryAtClockS - this.clockS);
    return Math.max(0, this.intervalS - this.playedS);
  }

  /** Real seconds the interval autosave has been due and waiting (the combat deferral is capped by it). */
  private overdueS(): number {
    return Math.max(0, this.retryAtClockS >= 0 ? this.clockS - this.retryAtClockS : this.playedS - this.intervalS);
  }

  /** True when a thumbnail should be captured now so the coming autosave can reuse it. */
  wantsThumbnail(): boolean {
    return this.secondsToNext() <= THUMB_PRECAPTURE_LEAD_S;
  }

  /** The interval check (call once per frame after advance). Returns 'interval' when an autosave should be written now. */
  poll(ctx: PolicyContext): AutosaveLabel | null {
    if (this.secondsToNext() > 0) return null;
    if (ctx.block) return null; // stays due until the block lifts
    if (ctx.combat && this.overdueS() < AUTOSAVE_DEFER_MAX_S) return null;
    if (this.clockS - this.lastAttemptClockS < AUTOSAVE_MIN_GAP_S) return null;
    if (ctx.tick === this.lastSavedTick) { this.playedS = 0; this.retryAtClockS = -1; return null; } // nothing new to save
    this.markAttempt();
    return 'interval';
  }

  /**
   * A named trigger (season change, checkpoint, quit, page hidden). Returns whether it may write now. Checkpoint
   * labels bypass the minimum gap; every label respects the master switches and the same-tick rule.
   */
  allow(label: AutosaveLabel, ctx: PolicyContext): boolean {
    if (!this.enabled || this.disabled) return false;
    if (ctx.block) return false;
    if (ctx.tick === this.lastSavedTick) return false;
    if (!CHECKPOINT_LABELS.includes(label) && this.clockS - this.lastAttemptClockS < AUTOSAVE_MIN_GAP_S) return false;
    this.markAttempt();
    return true;
  }

  private markAttempt(): void {
    this.lastAttemptClockS = this.clockS;
    this.playedS = 0;
    this.retryAtClockS = -1;
  }

  /** Reports the write outcome. First failure schedules one retry; a second in a row disables autosave. */
  noteResult(ok: boolean, tick: number): PolicyOutcome {
    if (ok) {
      this.failures = 0;
      this.lastSavedTick = tick;
      return 'ok';
    }
    this.failures++;
    if (this.failures >= 2) {
      this.disabled = true;
      return 'disabled';
    }
    this.retryAtClockS = this.clockS + AUTOSAVE_RETRY_S;
    return 'retry';
  }

  /** A new game or a load: the timers start again; failures and the disabled flag are forgotten only by `resetSession`. */
  resetGame(): void {
    this.playedS = 0;
    this.lastSavedTick = -1;
    this.retryAtClockS = -1;
  }

  /** Re-enables autosave (the player exported or fixed storage and pressed "try again"). */
  resetSession(): void {
    this.resetGame();
    this.failures = 0;
    this.disabled = false;
  }
}
