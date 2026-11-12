// Pointer-lock policy (GDD 01 5.6), pure. The DOM adapter performs the actual requests and reports results.
//
// - Default mouse look is 'drag'; pointer lock is an optional enhancement requested only from a canvas click.
// - Refusal (pointerlockerror, sandboxed iframe, rejected promise): effective mode stays 'drag', no new request
//   for POINTER_LOCK_RETRY_MS; the stored preference is unchanged; the first refusal is flagged for one toast.
// - Unexpected loss (browser Esc): fall back to drag until the next canvas click; the Esc that caused it must not
//   open the menu (consumeEsc), a second Esc does.
import { POINTER_LOCK_RETRY_MS } from './defaults';

/** Esc keydowns this soon after an unexpected loss are treated as the lock-exit Esc. */
const LOST_ESC_WINDOW_MS = 600;

export type PointerLockNotice = { kind: 'locked' } | { kind: 'unlocked' } | { kind: 'lost' } | { kind: 'refused'; first: boolean };

export class PointerLockPolicy {
  preference: 'drag' | 'locked' = 'drag';
  locked = false;
  private pending = false;
  private releasing = false;
  private refusedUntil = -Infinity;
  private refusedOnce = false;
  private lostAt = -Infinity;
  private escSwallowed = false;
  readonly notices: PointerLockNotice[] = [];

  effectiveMode(): 'drag' | 'locked' {
    return this.locked ? 'locked' : 'drag';
  }

  setPreference(mode: 'drag' | 'locked'): void {
    this.preference = mode;
    if (mode === 'drag' && this.locked) this.releasing = true;
  }

  /** The adapter calls this from the canvas click handler; true = call requestPointerLock() now (user gesture). */
  onCanvasClick(nowMs: number): boolean {
    if (this.preference !== 'locked' || this.locked || this.pending) return false;
    if (nowMs < this.refusedUntil) return false;
    this.pending = true;
    return true;
  }

  /** Should the adapter call document.exitPointerLock() now? (consumes the request) */
  takeReleaseRequest(): boolean {
    if (!this.releasing || !this.locked) return false;
    return true;
  }

  onLockChange(locked: boolean, nowMs: number): void {
    this.pending = false;
    if (locked) {
      this.locked = true;
      this.notices.push({ kind: 'locked' });
      return;
    }
    if (!this.locked) return;
    this.locked = false;
    if (this.releasing) {
      this.releasing = false;
      this.notices.push({ kind: 'unlocked' });
    } else {
      this.lostAt = nowMs;
      this.escSwallowed = false;
      this.notices.push({ kind: 'lost' });
    }
  }

  onError(nowMs: number): void {
    this.pending = false;
    this.locked = false;
    this.refusedUntil = nowMs + POINTER_LOCK_RETRY_MS;
    this.notices.push({ kind: 'refused', first: !this.refusedOnce });
    this.refusedOnce = true;
  }

  /** True if this Esc keydown is the one that ended an unexpected lock loss and must not open the menu. */
  consumeEsc(nowMs: number): boolean {
    if (this.escSwallowed || nowMs - this.lostAt > LOST_ESC_WINDOW_MS) return false;
    this.escSwallowed = true;
    return true;
  }

  get wasRefused(): boolean {
    return this.refusedOnce;
  }
}
