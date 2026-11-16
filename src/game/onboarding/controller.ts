// Glue between the running game and the hint engine: listens to the sim's events, reads the facts from the UI
// snapshot, turns changes of UI state (colony view entered, overlay switched on, a drawer opened) into uses of verbs,
// and advances the engine's clock. No DOM and no three here; the UI host (src/ui/hud/prompts) feeds it the snapshot
// and the pointer drags, and draws what `view()` says.
//
// Two clocks. In play the engine runs on the wall clock (`tick()` measures real seconds between calls). In the manual
// clock test mode (?test=1: only __game.step advances the game) the wall clock is ignored and `advance(realS)` is the
// only thing that moves the engine, so scripted runs are deterministic however slow the machine or the screenshots are.
import { foundingInProgress } from '@/sim/colony/founding/access';
import type { HintId, Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { TICK_SECONDS } from '../config/loop';
import { HINT_ADVANCE_STEP_REAL_S, HINT_MANUAL_MAX_STEP_REAL_S } from './balance';
import { HintEngine } from './engine';
import { noFacts, readFacts, type UiFacts } from './facts';
import { hookMethod } from './gameHooks';
import { EVENT_RULES } from './rules';
import { LiveHintStore } from './store';
import type { Facts, HintStore, HintView } from './types';

/** The members of Game this file reads. Everything is optional so any facade (the demo page's mock) can be passed. */
export interface OnboardingGame {
  session?: { sim: Sim } | null;
  getSettings?(): { gameplay: { hints: boolean } };
  /** The player's speed command (keys, time cluster, debug API). The controller counts the ones that change the speed. */
  setSpeed?(level: number): void;
  /** Settings > Gameplay > Reset hints (added by the persistence module). The controller makes the engine follow it. */
  resetHints?(): void;
}

export interface ControllerOptions {
  game: OnboardingGame;
  /** The latest UI snapshot (the host passes `() => snapshot.peek()`). */
  snapshot: () => UiSnapshot;
  /** UI-side facts (open drawer, overlays, prompts other presenters draw). */
  ui: () => UiFacts;
  store?: HintStore;
  /** Wall clock in ms. */
  now?: () => number;
  /** Manual clock: only `advance()` moves the engine. */
  manual: boolean;
}

const RULE_TYPES: ReadonlySet<string> = new Set(EVENT_RULES.map((r) => r.type));

export class OnboardingController {
  readonly engine: HintEngine;
  private sim: Sim | null = null;
  private off: (() => void) | null = null;
  private prev: Facts | null = null;
  /** The facts of the last step (debug read-out). */
  lastFacts: Facts | null = null;
  private lastNow = NaN;
  private shown: HintView | null = null;
  private readonly listeners = new Set<(v: HintView | null) => void>();
  private readonly store: HintStore;
  private readonly unhooks: (() => void)[] = [];
  /** Manual clock: the sim tick the engine last caught up to (and the sim it belongs to). */
  private clockSim: Sim | null = null;
  private clockTick = 0;

  constructor(private readonly opts: ControllerOptions) {
    this.store = opts.store ?? new LiveHintStore();
    this.engine = new HintEngine({ store: this.store });
    this.hookGame(opts.game);
  }

  /**
   * Two things only the Game's own methods can tell:
   *  - Settings > Reset hints clears the persistence layer's profile; the engine's store may be another instance of the
   *    same data (the profile is registered late, or not at all outside ?test=1), so the engine is told too.
   *  - A speed COMMAND is not a speed CHOICE: the performance step-down, the pause on focus loss and the opening's own
   *    pause all send the same command (and the same `time.speed-changed` event) as a key press. Only calls of
   *    `Game.setSpeed` (keys, time cluster buttons, the debug API) teach hint-speed.
   */
  private hookGame(game: OnboardingGame | undefined): void {
    if (!game || typeof game !== 'object') return;
    this.unhooks.push(hookMethod(game, 'resetHints', (raw) => () => {
      (raw as (() => void) | undefined)?.call(game);
      this.engine.resetStore();
      this.publish();
    }));
    this.unhooks.push(hookMethod(game, 'setSpeed', (raw) => ((level: number) => {
      this.noteSpeedChoice(level);
      return (raw as ((l: number) => void) | undefined)?.call(game, level);
    }) as never));
  }

  /** The player chose speed `level` (0 = pause) through the game's own entry point. */
  private noteSpeedChoice(level: number): void {
    const sim = this.opts.game.session?.sim ?? null;
    if (!sim || sim !== this.sim) return; // a game being started or loaded: the call is the game's own
    if (foundingInProgress(sim, sim.state.player.colonyId)) return; // the opening pauses at its intro card and resumes by itself
    const t = sim.state.env.time;
    if (level === 0 ? !t.paused : t.paused || t.speed !== level) this.engine.use('speed');
  }

  get manual(): boolean {
    return this.opts.manual;
  }

  /** The hint the card draws now. */
  view(): HintView | null {
    return this.shown;
  }

  /** Called with the new view whenever it changes (null: no hint). Returns the unsubscribe function. */
  subscribe(fn: (v: HintView | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * One refresh from the UI. In play the wall-clock time since the last call drives the engine. In the manual clock mode
   * the wall clock is ignored; what the sim was stepped since the last call (`__game.step`) counts as real seconds at
   * 1x, so scripted runs and the App E checks see the hints move with the game.
   */
  tick(): void {
    if (this.opts.manual) { this.advance(this.simSecondsSinceLastCall()); return; }
    const now = (this.opts.now ?? Date.now)();
    const dt = Number.isFinite(this.lastNow) ? Math.min(1, Math.max(0, (now - this.lastNow) / 1000)) : 0;
    this.lastNow = now;
    this.step(dt);
  }

  private simSecondsSinceLastCall(): number {
    const sim = this.opts.game.session?.sim ?? null;
    if (!sim) { this.clockSim = null; return 0; }
    const tick = sim.state.tick;
    const same = sim === this.clockSim && tick >= this.clockTick;
    this.clockSim = sim;
    const before = this.clockTick;
    this.clockTick = tick;
    return same ? Math.min(HINT_MANUAL_MAX_STEP_REAL_S, (tick - before) * TICK_SECONDS) : 0;
  }

  /** Moves the engine by `realS` real seconds with the current facts (the clock of a scripted run). */
  advance(realS: number): void {
    let left = Math.max(0, realS);
    while (left > 1e-9) {
      const dt = Math.min(HINT_ADVANCE_STEP_REAL_S, left);
      this.step(dt);
      left -= dt;
    }
    this.step(0); // publish
  }

  /** Writes the hint progress to storage now. */
  flush(): Promise<void> {
    return this.store.flush?.() ?? Promise.resolve();
  }

  /** The player dragged the camera. */
  noteDrag(): void {
    this.engine.use('look');
  }

  /** The player asked to dismiss the hint on the card (Shift+H). */
  dismiss(): boolean {
    const was = this.engine.dismiss();
    this.publish();
    return was;
  }

  /** Shift+H with no card: dismiss the opening overlay's teaching prompts (`ids`) that are on screen. */
  dismissExternal(ids: readonly HintId[]): boolean {
    const was = this.engine.dismissExternal(ids);
    this.publish();
    return was;
  }

  dispose(): void {
    for (const u of this.unhooks.splice(0)) u();
    this.off?.();
    this.engine.dispose();
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ internals
  private step(dt: number): void {
    this.followSim();
    const facts = this.read();
    this.noteChanges(facts);
    this.prev = facts;
    this.lastFacts = facts;
    this.engine.update(facts, dt);
    this.publish();
  }

  private read(): Facts {
    const snap = this.opts.snapshot();
    const hintsOn = this.opts.game.getSettings?.().gameplay.hints ?? true;
    return readFacts({ snap, sim: this.sim, ui: this.opts.ui(), hintsOn }) ?? noFacts(hintsOn);
  }

  /** A new game (a different sim) starts a fresh per-game state; events of the running one feed the engine. */
  private followSim(): void {
    const sim = this.opts.game.session?.sim ?? null;
    if (sim === this.sim) return;
    this.off?.();
    this.off = null;
    this.sim = sim;
    this.prev = null;
    this.clockSim = sim; // the manual clock counts the sim's steps from here
    this.clockTick = sim?.state.tick ?? 0;
    if (!sim) return;
    this.engine.newGame();
    this.off = sim.events.onAny((type, payload) => {
      if (!RULE_TYPES.has(type as string)) return;
      this.engine.onEvent(payload as unknown as { type: string }, { possessedId: sim.state.player.possessedAntId, colonyId: sim.state.player.colonyId });
    });
  }

  /** Verbs the player performs that leave a trace only in UI state or the view: counted from the change. */
  private noteChanges(f: Facts): void {
    const p = this.prev;
    if (!p || !f.active) return;
    if (f.view === 'colony' && p.view !== 'colony') this.engine.use('colony-view');
    if (f.view === 'photo' && p.view !== 'photo') this.engine.use('photo');
    if (f.overlayScent && !p.overlayScent) this.engine.use('scent');
    if (f.overlayOther && !p.overlayOther) this.engine.use('overlay');
    if (f.drawer === 'health' && p.drawer !== 'health') this.engine.use('why');
    if (f.drawer === 'directives' && p.drawer !== 'directives') this.engine.use('directives');
    if (f.markerTotal > p.markerTotal) this.engine.use('marker');
  }

  private publish(): void {
    const v = this.engine.view();
    if (v === this.shown) return;
    this.shown = v;
    for (const fn of [...this.listeners]) fn(v);
  }
}
