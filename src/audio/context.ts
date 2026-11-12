// AudioContext lifecycle (GDD 08 §13.1): created inside the first trusted pointerdown / keydown, never in test mode.
// After resume(), the context must be running within 1 real s or the status is `blocked`; the next 3 gestures retry,
// then only an explicit enable() (Settings > Audio status button) does. No Web Audio at all = `unsupported`.
// Every failure is silent: the game plays on without sound.
import { CONTEXT } from './tuning';

export type AudioStatus = 'off' | 'running' | 'blocked' | 'unsupported';

export interface ContextHost {
  /** Constructs an AudioContext; null when the API does not exist. May throw (refused). */
  create(): AudioContext | null;
  setTimer(fn: () => void, ms: number): unknown;
}

export function browserContextHost(): ContextHost {
  return {
    create: () => {
      const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = g.AudioContext ?? g.webkitAudioContext;
      return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
  };
}

export class ContextManager {
  status: AudioStatus = 'off';
  ctx: AudioContext | null = null;
  private retriesLeft = CONTEXT.gestureRetries;
  private gaveUp = false;
  private checking = false;
  private announced = false;

  constructor(private readonly host: ContextHost, private readonly onRunning: (ctx: AudioContext) => void, private readonly onStatus: (s: AudioStatus) => void = () => {}) {}

  /** A trusted user gesture happened (call synchronously from the event handler). */
  gesture(): void {
    if (this.status === 'running' || this.status === 'unsupported' || this.gaveUp) return;
    this.start();
  }

  /** Explicit retry (Settings button): resets the retry budget. */
  enable(): void {
    this.gaveUp = false;
    this.retriesLeft = CONTEXT.gestureRetries;
    if (this.status !== 'running' && this.status !== 'unsupported') this.start();
  }

  private set(s: AudioStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }

  private start(): void {
    if (!this.ctx) {
      try {
        this.ctx = this.host.create();
      } catch {
        this.ctx = null;
        this.fail();
        return;
      }
      if (!this.ctx) { this.set('unsupported'); return; }
      this.ctx.onstatechange = () => { if (this.ctx?.state === 'running') this.becameRunning(); };
    }
    const ctx = this.ctx;
    try { void ctx.resume().catch(() => {}); } catch { /* old implementations */ }
    if (ctx.state === 'running') { this.becameRunning(); return; }
    if (this.checking) return;
    this.checking = true;
    this.host.setTimer(() => {
      this.checking = false;
      if (ctx.state === 'running') this.becameRunning();
      else this.fail();
    }, CONTEXT.runningTimeoutMs);
  }

  private fail(): void {
    this.set('blocked');
    if (--this.retriesLeft < 0) this.gaveUp = true;
  }

  private becameRunning(): void {
    if (!this.ctx) return;
    this.set('running');
    if (!this.announced) { this.announced = true; this.onRunning(this.ctx); }
  }

  suspend(): void { try { void this.ctx?.suspend().catch(() => {}); } catch { /* ignore */ } }
  resume(): void { try { void this.ctx?.resume().catch(() => {}); } catch { /* ignore */ } }

  close(): void {
    try { void this.ctx?.close().catch(() => {}); } catch { /* ignore */ }
    this.ctx = null;
    this.set('off');
  }
}
