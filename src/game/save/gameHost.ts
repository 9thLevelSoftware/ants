// Adapter between the save layer and the Game orchestrator. The save layer needs six things from the game: the
// running sim, the mode/view, a thumbnail, "replace the running game with this sim" (Game.adoptSim), and two
// loading-state hooks.
import type { Sim, SimState } from '@/sim/types';
import { TEST_CAMERA_SETTLE_S } from '../config/loop';
import type { Game } from '../Game';
import type { DriverHost } from './autosaveDriver';
import { savedCameraOf } from './meta';
import { captureCanvasThumbnail } from './thumbnail';
import type { SaveMeta } from './types';

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
  /** The loading panel this host put up; loadingEnd leaves a newer game's panel alone. */
  private ownLoading: Game['loading'] = null;

  constructor(private readonly game: Game, private readonly opts: GameHostOptions = {}) {}

  getSim(): Sim | null {
    return this.game.sim;
  }

  context() {
    const c = this.game.camera;
    const d = c.getWorldDirection(c.up.clone());
    const pos = { x: c.position.x, y: c.position.y, z: c.position.z };
    return { mode: this.game.mode, view: this.game.view, camera: { pos, look: { x: pos.x + d.x * 100, y: pos.y + d.y * 100, z: pos.z + d.z * 100 } } };
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
    this.ownLoading = { phase: 'Rebuilding the locality', progress: 0.3, attempt: 1, maxAttempts: 1, error: null, kind: 'load' };
    g.loading = this.ownLoading;
    g.mode = 'loading';
    g.refreshUi();
    await nextPaint(g.opts.testMode);
  }

  loadingEnd(): void {
    const g = this.game;
    const own = this.ownLoading;
    this.ownLoading = null;
    // Another game took over (its own loading panel, or already playing): leave it alone.
    if (own === null || g.mode !== 'loading' || (g.loading !== null && g.loading !== own)) return;
    g.loading = null;
    // A failed adopt has already ended the old game: with no session left the title is the only place to go.
    g.mode = this.priorMode === 'loading' || !g.session ? 'title' : this.priorMode;
    if (g.mode === 'title' && !g.session) void g.title?.enter(); // the backdrop comes back with the title
    g.refreshUi();
  }

  /** Replaces the running game with `sim`: same order as Game.newGame (renderers build the world, then play starts). */
  async adopt(sim: Sim, meta: SaveMeta): Promise<void> {
    const g = this.game;
    const replace = () => g.endGame(false);
    if (this.opts.withoutQuitSave) this.opts.withoutQuitSave(replace); else replace();
    if (this.ownLoading && g.mode === 'loading') g.loading = this.ownLoading; // endGame cleared the panel
    // endGame dropped every mesh: the renderers build the loaded world before the first frame of play
    await g.adoptSim(sim);
    const s = g.session;
    if (s) resumeView(g, s, sim.state, meta);
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

/**
 * A loaded save resumes possession of the saved ant if it is alive, else the observer (GDD 01 §1.3); a save made in
 * the colony view reopens it (the view is recorded in the save meta).
 */
function resumeView(g: Game, s: NonNullable<Game['session']>, state: SimState, meta: Pick<SaveMeta, 'view' | 'camera'>): void {
  const id = state.player.possessedAntId;
  if (id >= 0 && s.sim.stores.ants.get(id)) {
    s.followId = id;
    s.setView('possess', true);
    g.viewChanged();
  } else if (meta.view === 'colony') {
    g.setView('colony');
  } else if (s.view === 'observer') {
    const cam = savedCameraOf(meta);
    if (cam) s.views.freeFlyAt(cam.pos, cam.look); // the observer comes back where the player left it
  }
}
