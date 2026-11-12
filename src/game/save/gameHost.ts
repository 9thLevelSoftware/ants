// Adapter between the save layer and the Game orchestrator. The save layer needs six things from the game: the
// running sim, the mode/view, a thumbnail, "replace the running game with this sim", and two loading-state hooks.
// Game.ts has no public "start from a loaded sim" yet, so `adopt` uses its (private) startPlaying through a typed
// cast: when Game gets a public `adoptSim(sim)`, only this file changes (reported to the integrator).
import type { Sim, SimState } from '@/sim/types';
import { TEST_CAMERA_SETTLE_S } from '../config/loop';
import type { Game } from '../Game';
import type { DriverHost } from './autosaveDriver';
import { captureCanvasThumbnail } from './thumbnail';
import type { SaveMeta } from './types';

interface GameInternals {
  startPlaying(sim: Sim, possessQueen: boolean): void;
}

/** Lets the browser paint (a macrotask), skipped on the manual test clock. */
function nextPaint(test: boolean): Promise<void> {
  return test ? Promise.resolve() : new Promise((r) => setTimeout(r, 0));
}

export interface GameHostOptions {
  /** Capture thumbnails in `?test=1` too (default: no, GDD 06 §15 rule 5). */
  thumbnailsInTest?: boolean;
  /** Runs `fn` while the `quit` autosave is muted (set by install: endGame() must not autosave the replaced game). */
  withoutQuitSave?: <T>(fn: () => T) => T;
  /** Called with the adopted sim (the driver re-attaches its event triggers). */
  onAdopted?: (sim: Sim) => void;
}

export class GameHost implements DriverHost {
  private priorMode: Game['mode'] = 'title';

  constructor(private readonly game: Game, private readonly opts: GameHostOptions = {}) {}

  getSim(): Sim | null {
    return this.game.sim;
  }

  context() {
    return { mode: this.game.mode, view: this.game.view };
  }

  visible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  thumbnail(): string | null {
    const g = this.game;
    if (g.opts.testMode && !this.opts.thumbnailsInTest) return null;
    if (!g.session) return null;
    g.renderNow(0); // draw now: a WebGL canvas can only be copied in the task that rendered it
    return captureCanvasThumbnail(g.opts.canvas);
  }

  async loadingBegin(): Promise<void> {
    const g = this.game;
    this.priorMode = g.mode;
    g.loading = { phase: 'Rebuilding the locality', progress: 0.3, attempt: 1, maxAttempts: 1, error: null };
    g.mode = 'loading';
    g.refreshUi();
    await nextPaint(g.opts.testMode);
  }

  loadingEnd(): void {
    const g = this.game;
    g.loading = null;
    g.mode = this.priorMode === 'loading' ? 'title' : this.priorMode;
    g.refreshUi();
  }

  adopt(sim: Sim, _meta: SaveMeta): void {
    const g = this.game;
    const replace = () => g.endGame(false);
    if (this.opts.withoutQuitSave) this.opts.withoutQuitSave(replace); else replace();
    (g as unknown as GameInternals).startPlaying(sim, false);
    const s = g.session;
    if (s) resumeView(g, s, sim.state);
    this.applyLoadSpeed(sim.state);
    this.opts.onAdopted?.(sim);
    g.renderNow(g.opts.testMode ? TEST_CAMERA_SETTLE_S : 0);
  }

  /** GDD 01 LOAD_RESUME_SPEED: after any load the game runs at 1x, paused only with the `pauseOnLoad` setting. */
  private applyLoadSpeed(state: SimState): void {
    const g = this.game;
    const wantPaused = g.settings.get().gameplay.pauseOnLoad;
    const t = state.env.time;
    if (t.paused === wantPaused && (wantPaused || t.speed === 1)) return; // already so: leave the state untouched
    g.setSpeed(wantPaused ? 0 : 1);
  }
}

/** A loaded save resumes possession of the saved ant if it is alive, else the observer (GDD 01 §1.3). */
function resumeView(g: Game, s: NonNullable<Game['session']>, state: SimState): void {
  const id = state.player.possessedAntId;
  if (id >= 0 && s.sim.stores.ants.get(id)) {
    s.followId = id;
    s.setView('possess', true);
    g.viewChanged();
  }
}
