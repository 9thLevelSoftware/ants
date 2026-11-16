// The hint engine (GDD 08 §9.1): a small state machine over the hint table. It sees plain facts a few times per real
// second and sim events as they happen, and decides which ONE hint the card draws.
//
//   pending --(trigger true for its delay)--> shown --(the verb is done `learn.uses` times)--> learned
//   shown --(not done in HINT_IDLE_REAL_S)--> compact --(HINT_RETURN_REAL_S more)--> full once more
//   any --(Shift+H, Settings > Hints off, "dismiss")--> dismissed          learned and dismissed are final
//
// Rules held here: one hint at a time; none during a fight, a critical alert, a time-lapse (unless it is about
// that) or while the opening runs (unless it is about the opening and no overlay draws it); at most
// HINT_MAX_PER_MINUTE new prompts per minute; performing the verb counts as learning even when the hint never showed.
// Pure TypeScript: the clock is advanced by `update(facts, dtRealSeconds)`, so tests and the manual-clock test mode
// are deterministic.
import type { HintId, HintState } from '@/sim/types';
import { hintText } from '@/content/text';
import {
  HINT_DELAY_REAL_S, HINT_EXPIRY_REAL_S, HINT_FIGHT_QUIET_REAL_S, HINT_GAP_REAL_S, HINT_IDLE_REAL_S, HINT_MAX_FULL_SHOWS,
  HINT_MAX_PER_MINUTE, HINT_RATE_WINDOW_REAL_S, HINT_RESHOW_COOLDOWN_REAL_S, HINT_RETIRE_COOLDOWN_REAL_S, HINT_RETURN_REAL_S, HINT_USE_GAP_REAL_S,
} from './balance';
import { EVENT_RULES } from './rules';
import { HINT_TABLE } from './table';
import type { EngineEvent, EventContext, Facts, HintDef, HintLogEntry, HintStore, HintView, TriggerContext, UseKey } from './types';

/** The log keeps this many entries (the e2e reads it; it is not a save). */
const LOG_CAP = 400;
/** Verbs whose repeated reports within HINT_USE_GAP_REAL_S count once. */
const GAPPED: ReadonlySet<UseKey> = new Set<UseKey>(['antennate']);

interface Runtime {
  /** Seconds the trigger has held without a break. */
  trueS: number;
  /** Seconds in full form since the last time it became full; seconds in compact form. */
  fullS: number;
  compactS: number;
  /** Seconds on screen in all (expiry). */
  displayS: number;
  /** Seconds the trigger has been false while displayed. */
  lostS: number;
  compact: boolean;
  returned: boolean;
  /** How many times it came up in full form. */
  fulls: number;
  /** Engine time it last went away by itself; blocks a re-show for a while. */
  hiddenAt: number;
  hiddenCooldown: number;
  /** Seconds of continuous action counted (seconds-type verbs). */
  secs: number;
  /** Seconds an external presenter has shown it (passive hints). */
  passiveS: number;
  /** An external presenter showed it at least once (log once). */
  externalLogged: boolean;
}

const newRuntime = (): Runtime => ({
  trueS: 0, fullS: 0, compactS: 0, displayS: 0, lostS: 0, compact: false, returned: false, fulls: 0, hiddenAt: -Infinity, hiddenCooldown: 0,
  secs: 0, passiveS: 0, externalLogged: false,
});

export interface EngineOptions {
  store: HintStore;
  table?: readonly HintDef[];
}

export class HintEngine {
  readonly log: HintLogEntry[] = [];
  private readonly store: HintStore;
  private readonly table: readonly HintDef[];
  private readonly rt = new Map<HintId, Runtime>();
  private readonly flags = new Set<string>();
  private readonly lastUse = new Map<UseKey, number>();
  /** Per-use counts of this game by key (debug read-out; the store keeps the persisted counts). */
  private readonly useCount = new Map<UseKey, number>();
  private readonly firstShows: number[] = [];
  private clockS = 0;
  private gameS = 0;
  private fightUntil = -Infinity;
  private lastHiddenAt = -Infinity;
  private seq = 0;
  private cur: HintId | null = null;
  private facts: Facts | null = null;
  private cached: HintView | null = null;
  private unsubscribe: () => void;

  constructor(opts: EngineOptions) {
    this.store = opts.store;
    this.table = opts.table ?? HINT_TABLE;
    this.unsubscribe = this.store.subscribe(() => this.onStoreChanged());
  }

  dispose(): void {
    this.unsubscribe();
  }

  // ------------------------------------------------------------------ reading
  /** The engine clock, real seconds of play. */
  get clock(): number {
    return this.clockS;
  }

  /** Hint state as the store knows it. */
  state(id: HintId): HintState {
    return this.store.get(id)?.state ?? 'pending';
  }

  /** The progress of every hint (the debug API's `hints()`). */
  states(): Record<string, { state: HintState; uses: number }> {
    const out: Record<string, { state: HintState; uses: number }> = {};
    for (const d of this.table) {
      const s = this.store.get(d.id);
      out[d.id] = { state: s?.state ?? 'pending', uses: s?.uses ?? 0 };
    }
    return out;
  }

  /** May a presenter other than the card still show this hint? False once learned or dismissed, or with hints off. */
  allows(id: HintId): boolean {
    const st = this.state(id);
    return (this.facts?.hintsOn ?? true) && st !== 'learned' && st !== 'dismissed';
  }

  /** The hint the card draws now, or null. The same object is returned while nothing changes. */
  view(): HintView | null {
    if (this.cur === null) { this.cached = null; return null; }
    const def = this.defOf(this.cur);
    const rt = this.runtime(this.cur);
    const c = this.cached;
    if (c && c.id === this.cur && c.seq === this.seq && c.compact === rt.compact) return c;
    const t = hintText(this.cur);
    this.cached = { id: this.cur, seq: this.seq, anchor: def.anchor, compact: rt.compact, verb: t.verb, action: t.action, hold: !!t.hold, ...(t.fixedKey ? { fixedKey: t.fixedKey } : {}) };
    return this.cached;
  }

  // ------------------------------------------------------------------ input from the game
  /** Starts a fresh game: per-game flags and timers clear (hint progress is the profile's and stays). */
  newGame(): void {
    this.flags.clear();
    this.lastUse.clear();
    this.useCount.clear();
    this.gameS = 0;
    this.fightUntil = -Infinity;
    this.hideCurrent('new-game');
    for (const r of this.rt.values()) { r.trueS = 0; r.lostS = 0; r.hiddenAt = -Infinity; r.passiveS = 0; r.fulls = 0; }
  }

  /** A sim event; the rules table turns it into uses, flags and fight time. */
  onEvent(e: EngineEvent, ctx: EventContext): void {
    for (const rule of EVENT_RULES) {
      if (rule.type !== e.type) continue;
      rule.run(e, {
        ctx, use: (k, n) => this.use(k, n), flag: (name) => { this.flags.add(name); },
        fight: () => { this.fightUntil = this.clockS + HINT_FIGHT_QUIET_REAL_S; },
      });
    }
  }

  /** The verb `key` was performed `n` times (`seconds` for continuous verbs: pass `{ seconds }`). */
  use(key: UseKey, n = 1): void {
    if (GAPPED.has(key)) {
      const last = this.lastUse.get(key);
      if (last !== undefined && this.gameS - last < HINT_USE_GAP_REAL_S) { this.lastUse.set(key, this.gameS); return; }
    }
    this.lastUse.set(key, this.gameS);
    this.useCount.set(key, (this.useCount.get(key) ?? 0) + n);
    for (const d of this.table) {
      if (d.learn.key !== key || d.learn.seconds) continue;
      if (this.isResolved(d.id)) continue;
      this.store.recordUse(d.id, d.learn.uses, n);
      if (this.state(d.id) === 'learned') this.onLearned(d);
    }
  }

  /** Continuous action (cumulative movement): `dt` real seconds of `key`. */
  useSeconds(key: UseKey, dt: number): void {
    this.lastUse.set(key, this.gameS);
    for (const d of this.table) {
      if (d.learn.key !== key || !d.learn.seconds || this.isResolved(d.id)) continue;
      const r = this.runtime(d.id);
      r.secs += dt;
      if (r.secs >= d.learn.uses) { this.store.learn(d.id); this.onLearned(d); }
    }
  }

  /** The player dismisses the hint on the card (Shift+H, the close button). True when one was showing. */
  dismiss(): boolean {
    const id = this.cur;
    if (id === null) return false;
    this.store.dismiss(id);
    this.logEntry('dismissed', id);
    this.hideCurrent('dismissed', false);
    return true;
  }

  /** "Reset hints": every hint pending again (the profile's reset; the engine follows through its store subscription). */
  resetStore(): void {
    this.store.reset();
  }

  /** Test and debug hook: complete the hint as if its verb had been performed enough times. */
  learn(id: HintId): void {
    if (this.isResolved(id)) return;
    this.store.learn(id);
    this.onLearned(this.defOf(id));
  }

  // ------------------------------------------------------------------ the clock
  /** Advances the engine by `dt` real seconds with the facts as they are now. */
  update(f: Facts, dt: number): void {
    this.facts = f;
    if (!f.active) {
      if (this.cur !== null) this.hideCurrent('inactive', false);
      return;
    }
    if (f.menuOpen || !this.store.ready() || !(dt > 0)) return; // the clock stands still behind a menu
    dt = Math.min(dt, 1);
    this.clockS += dt;
    this.gameS += dt;
    if (f.fighting) this.fightUntil = this.clockS + HINT_FIGHT_QUIET_REAL_S;
    if (f.moving && f.possessed) this.useSeconds('move', dt);

    this.trackExternal(f, dt);
    const ctx = this.triggerContext();
    const candidates: HintDef[] = [];
    for (const d of this.table) {
      if (!this.drawable(d, f) || !this.eligible(d)) { this.runtime(d.id).trueS = 0; continue; }
      const r = this.runtime(d.id);
      const on = (d.after ?? []).every((a) => this.isResolved(a)) && d.when(f, ctx) && !this.suppressed(d, f);
      if (on) r.trueS += dt; else r.trueS = 0;
      if (on && r.trueS >= (d.delayS ?? HINT_DELAY_REAL_S) && this.clockS - r.hiddenAt >= r.hiddenCooldown) candidates.push(d);
    }
    if (this.cur !== null) this.tickCurrent(f, ctx, dt);
    if (this.cur === null && candidates.length > 0 && f.hintsOn) this.maybeShow(candidates);
    if (!f.hintsOn && this.cur !== null) this.hideCurrent('hints-off', false);
  }

  // ------------------------------------------------------------------ internals
  private runtime(id: HintId): Runtime {
    let r = this.rt.get(id);
    if (!r) { r = newRuntime(); this.rt.set(id, r); }
    return r;
  }

  private defOf(id: HintId): HintDef {
    const d = this.table.find((x) => x.id === id);
    if (!d) throw new Error(`onboarding: no table entry for ${id}`);
    return d;
  }

  private isResolved(id: HintId): boolean {
    const s = this.state(id);
    return s === 'learned' || s === 'dismissed';
  }

  private eligible(d: HintDef): boolean {
    if (this.isResolved(d.id)) return false;
    return this.runtime(d.id).fulls < HINT_MAX_FULL_SHOWS || this.cur === d.id;
  }

  /** The engine draws this hint (its own, or as the fallback when its presenter is not showing it). */
  private drawable(d: HintDef, f: Facts): boolean {
    return d.presenter === 'engine' || (!!d.engineFallback && !f.externalShown.includes(d.id));
  }

  private triggerContext(): TriggerContext {
    return {
      sinceUse: (k) => { const t = this.lastUse.get(k); return t === undefined ? Infinity : this.gameS - t; },
      flag: (n) => this.flags.has(n),
      resolved: (id) => this.isResolved(id),
      clock: this.gameS,
    };
  }

  /** True while no hint of this kind should be on screen: a fight, an alert, a time-lapse, the opening, a hidden HUD. */
  private suppressed(d: HintDef, f: Facts): boolean {
    if (f.criticalAlert || this.clockS < this.fightUntil) return true;
    if (f.timelapse && !d.timelapse) return true;
    if (f.foundingInProgress && !d.opening) return true;
    return f.hudHidden || f.view === 'photo';
  }

  /** Hints drawn by another presenter: shown when it draws them; a gauge with nothing to press is learned by being seen. */
  private trackExternal(f: Facts, dt: number): void {
    for (const d of this.table) {
      if (!f.externalShown.includes(d.id) || this.isResolved(d.id)) continue;
      if (d.presenter === 'engine') continue;
      const r = this.runtime(d.id);
      if (this.state(d.id) === 'pending') this.store.markShown(d.id);
      if (!r.externalLogged) { r.externalLogged = true; this.logEntry('shown', d.id, d.presenter); }
      if (d.passiveS !== undefined) {
        r.passiveS += dt;
        if (r.passiveS >= d.passiveS) { this.store.learn(d.id); this.onLearned(d); }
      }
    }
  }

  private maybeShow(candidates: HintDef[]): void {
    if (this.clockS - this.lastHiddenAt < HINT_GAP_REAL_S) return;
    candidates.sort((a, b) => a.order - b.order);
    for (const d of candidates) {
      const fresh = this.state(d.id) === 'pending';
      if (fresh && this.recentFirstShows() >= HINT_MAX_PER_MINUTE) continue;
      this.show(d, fresh);
      return;
    }
  }

  private recentFirstShows(): number {
    while (this.firstShows.length > 0 && this.clockS - (this.firstShows[0] ?? 0) >= HINT_RATE_WINDOW_REAL_S) this.firstShows.shift();
    return this.firstShows.length;
  }

  private show(d: HintDef, fresh: boolean): void {
    const r = this.runtime(d.id);
    this.cur = d.id;
    this.seq++;
    r.fullS = 0; r.compactS = 0; r.displayS = 0; r.lostS = 0; r.compact = false; r.returned = false; r.fulls++;
    if (fresh) { this.store.markShown(d.id); this.firstShows.push(this.clockS); }
    this.logEntry('shown', d.id, 'engine');
  }

  /** Time passes for the hint on screen: it may fade, return, retire or lose its trigger. */
  private tickCurrent(f: Facts, ctx: TriggerContext, dt: number): void {
    const id = this.cur;
    if (id === null) return;
    const d = this.defOf(id);
    const r = this.runtime(id);
    if (this.isResolved(id)) { this.hideCurrent('resolved', false); return; }
    if (this.suppressed(d, f) || !this.drawable(d, f)) { this.hideCurrent('suppressed', true, 0); return; }
    r.lostS = d.when(f, ctx) ? 0 : r.lostS + dt;
    if (r.lostS >= 1) { this.hideCurrent('trigger-gone', true, HINT_RESHOW_COOLDOWN_REAL_S); return; }
    r.displayS += dt;
    if (r.displayS >= HINT_EXPIRY_REAL_S) { this.logEntry('retired', id, 'engine'); this.hideCurrent('expired', true, HINT_RETIRE_COOLDOWN_REAL_S); return; }
    if (!r.compact) {
      r.fullS += dt;
      if (r.fullS >= HINT_IDLE_REAL_S) { r.compact = true; r.compactS = 0; this.logEntry('compact', id, 'engine'); this.seq++; }
    } else if (!r.returned) {
      r.compactS += dt;
      if (r.compactS >= HINT_RETURN_REAL_S) { r.compact = false; r.returned = true; r.fullS = 0; this.logEntry('full-again', id, 'engine'); this.seq++; }
    }
  }

  private hideCurrent(note: string, log = true, cooldown = 0): void {
    const id = this.cur;
    if (id === null) return;
    if (log) this.logEntry('hidden', id, 'engine', note);
    const r = this.runtime(id);
    r.trueS = 0; r.hiddenAt = this.clockS; r.hiddenCooldown = cooldown;
    this.cur = null;
    this.cached = null;
    this.lastHiddenAt = this.clockS;
  }

  private onLearned(d: HintDef): void {
    this.logEntry('learned', d.id, d.presenter);
    if (this.cur === d.id) this.hideCurrent('learned', false);
  }

  /** A change of the hint states from outside: a reset from Settings makes everything pending again. */
  private onStoreChanged(): void {
    if (this.cur !== null && this.isResolved(this.cur)) this.hideCurrent('resolved', false);
    if (this.table.every((d) => this.state(d.id) === 'pending')) {
      this.rt.clear();
      this.firstShows.length = 0;
      this.useCount.clear();
      this.hideCurrent('reset', false);
    }
  }

  private logEntry(event: HintLogEntry['event'], id: HintId, presenter: HintLogEntry['presenter'] = 'engine', note?: string): void {
    this.log.push({ at: Math.round(this.clockS * 100) / 100, event, id, presenter, ...(note ? { note } : {}) });
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
  }

  /** Uses counted this game, by verb (debug read-out). */
  uses(): Record<string, number> {
    return Object.fromEntries(this.useCount);
  }

  /** Engine time until which a fight keeps the hints quiet (debug read-out). */
  quietUntil(): number {
    return this.fightUntil;
  }

  /** Per-game flags set by events (debug read-out). */
  flagList(): string[] {
    return [...this.flags];
  }
}
