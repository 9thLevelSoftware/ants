// Where hint progress lives: the device profile (`foundress.profile.v1.hints`, src/game/profile) so it persists across
// colonies and a "Reset hints" in Settings clears it. The engine sees only the small HintStore interface.
//
// Finding the profile (the persistence module creates it inside `installPersistence`, which this task may not edit):
//   1. a store registered with `registerHintProfile(profile)` (the one-line hook the integrator adds after
//      `await profile.load()`), else
//   2. `window.__persistence.profile` (exposed in ?test=1), else
//   3. a profile of our own over localStorage (merge-safe, same key), so hints still persist per device. It does not see
//      a "Reset hints" made on another store instance in the same page: that is why (1) exists.
import type { HintId, HintState } from '@/sim/types';
import { createLocalKv } from '../save/localKv';
import { ProfileStore } from '../profile/profile';
import type { HintStore } from './types';

/** The part of ProfileStore the hint store uses (so a test can pass a stand-in). */
export interface HintProfileLike {
  hint(id: HintId): { uses: number; state: HintState } | undefined;
  markHintShown(id: HintId): void;
  recordHintUse(id: HintId, learnAt?: number, uses?: number): void;
  learnHint(id: HintId): void;
  dismissHint(id: HintId): void;
  resetHints(): void;
  subscribe(fn: (p: unknown, part: string) => void): () => void;
  status(): { loaded: string };
  flush?(): Promise<void>;
}

export class ProfileHintStore implements HintStore {
  constructor(private readonly profile: HintProfileLike) {}
  ready(): boolean { return this.profile.status().loaded !== 'pending'; }
  get(id: HintId): { uses: number; state: HintState } | undefined { return this.profile.hint(id); }
  markShown(id: HintId): void { this.profile.markHintShown(id); }
  recordUse(id: HintId, learnAt: number, n: number): void { this.profile.recordHintUse(id, learnAt, n); }
  learn(id: HintId): void { this.profile.learnHint(id); }
  dismiss(id: HintId): void { this.profile.dismissHint(id); }
  reset(): void { this.profile.resetHints(); }
  subscribe(fn: () => void): () => void { return this.profile.subscribe((_p, part) => { if (part === 'hints') fn(); }); }
  flush(): Promise<void> { return this.profile.flush?.() ?? Promise.resolve(); }
}

/** A store in memory (tests, and the last resort when nothing persists). */
export class MemoryHintStore implements HintStore {
  private readonly map = new Map<HintId, { uses: number; state: HintState }>();
  private readonly listeners = new Set<() => void>();
  ready(): boolean { return true; }
  get(id: HintId): { uses: number; state: HintState } | undefined { return this.map.get(id); }
  private set(id: HintId, v: { uses: number; state: HintState }): void {
    const cur = this.map.get(id);
    if (cur && (cur.state === 'learned' || cur.state === 'dismissed') && v.state !== 'learned') return; // final states never move back
    this.map.set(id, v);
    this.emit();
  }
  private emit(): void { for (const fn of [...this.listeners]) fn(); }
  markShown(id: HintId): void { const c = this.map.get(id); if (!c) this.set(id, { uses: 0, state: 'shown' }); }
  recordUse(id: HintId, learnAt: number, n: number): void {
    const c = this.map.get(id) ?? { uses: 0, state: 'pending' as HintState };
    const uses = c.uses + n;
    this.set(id, { uses, state: uses >= learnAt ? 'learned' : c.state === 'pending' ? 'shown' : c.state });
  }
  learn(id: HintId): void { this.set(id, { uses: Math.max(1, this.map.get(id)?.uses ?? 0), state: 'learned' }); }
  dismiss(id: HintId): void { this.set(id, { uses: this.map.get(id)?.uses ?? 0, state: 'dismissed' }); }
  reset(): void { this.map.clear(); this.emit(); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

let registered: ProfileStore | null = null;

/** The persistence layer hands over its profile store here (after it has loaded it). */
export function registerHintProfile(profile: ProfileStore | null): void {
  registered = profile;
}

let own: ProfileStore | null = null;

/** The profile to use now: see the file header for the order. */
function pickProfile(): ProfileStore {
  if (registered) return registered;
  const w = typeof window !== 'undefined' ? (window as unknown as { __persistence?: { profile?: ProfileStore } }) : null;
  const exposed = w?.__persistence?.profile;
  if (exposed) return exposed;
  if (!own) {
    const store = new ProfileStore({ kv: createLocalKv() });
    own = store;
    void store.load();
    // The persistence layer flushes ITS profile when the page is hidden; this one is ours to flush.
    if (typeof document !== 'undefined') {
      const flush = () => { void store.flush(); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') flush(); });
      window.addEventListener('pagehide', flush);
    }
  }
  return own;
}

/**
 * The store the engine holds. The persistence layer installs its profile after the game may already be running, so the
 * target is looked up on every call and the engine is told when it changes.
 */
export class LiveHintStore implements HintStore {
  private target: ProfileHintStore | null = null;
  private source: ProfileStore | null = null;
  private off: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly pick: () => ProfileStore = pickProfile) {}

  private cur(): ProfileHintStore {
    const next = this.pick();
    if (next !== this.source || !this.target) {
      this.off?.();
      this.source = next;
      this.target = new ProfileHintStore(next as unknown as HintProfileLike);
      this.off = this.target.subscribe(() => this.emit());
      if (this.listeners.size > 0) this.emit();
    }
    return this.target;
  }

  private emit(): void { for (const fn of [...this.listeners]) fn(); }
  ready(): boolean { return this.cur().ready(); }
  get(id: HintId): { uses: number; state: HintState } | undefined { return this.cur().get(id); }
  markShown(id: HintId): void { this.cur().markShown(id); }
  recordUse(id: HintId, learnAt: number, n: number): void { this.cur().recordUse(id, learnAt, n); }
  learn(id: HintId): void { this.cur().learn(id); }
  dismiss(id: HintId): void { this.cur().dismiss(id); }
  reset(): void { this.cur().reset(); }
  flush(): Promise<void> { return this.cur().flush(); }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    this.cur();
    return () => this.listeners.delete(fn);
  }
}
