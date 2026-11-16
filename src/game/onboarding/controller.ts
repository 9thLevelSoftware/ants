// Glue between the running game and the hint engine: listens to the sim's events, reads the facts from the UI
// snapshot, turns changes of UI state (colony view entered, overlay switched on, a drawer opened) into uses of verbs,
// and advances the engine's clock. No DOM and no three here; the UI host (src/ui/hud/prompts) feeds it the snapshot
// and the pointer drags, and draws what `view()` says.
//
// Two clocks. In play the engine runs on the wall clock (`tick()` measures real seconds between calls). In the manual
// clock test mode (?test=1: only __game.step advances the game) the wall clock is ignored and `advance(realS)` is the
// only thing that moves the engine, so scripted runs are deterministic however slow the machine or the screenshots are.
import type { Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { HINT_ADVANCE_STEP_REAL_S } from './balance';
import { HintEngine } from './engine';
import { noFacts, readFacts, type UiFacts } from './facts';
import { EVENT_RULES } from './rules';
import { LiveHintStore } from './store';
import type { Facts, HintStore, HintView } from './types';

/** The members of Game this file reads. Everything is optional so any facade (the demo page's mock) can be passed. */
export interface OnboardingGame {
  session?: { sim: Sim } | null;
  getSettings?(): { gameplay: { hints: boolean } };
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

  constructor(private readonly opts: ControllerOptions) {
    this.store = opts.store ?? new LiveHintStore();
    this.engine = new HintEngine({ store: this.store });
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

  /** One refresh from the UI: wall-clock time since the last call drives the engine (never in manual mode). */
  tick(): void {
    const now = (this.opts.now ?? Date.now)();
    const dt = Number.isFinite(this.lastNow) ? Math.min(1, Math.max(0, (now - this.lastNow) / 1000)) : 0;
    this.lastNow = now;
    this.step(this.opts.manual ? 0 : dt);
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

  dispose(): void {
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
