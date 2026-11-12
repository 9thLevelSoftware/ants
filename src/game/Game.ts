// The Game orchestrator (architecture §1/§2, contracts guidance §8): application modes, the frame loop (fixed
// tick accumulator via SimDriver, per-frame possessed-ant integration, input -> PlayerIntent, camera rigs,
// renderers), the UI bridge, and the GameFacade the UI calls. The only module that wires sim, render, input and
// UI together. The debug API (window.__game) is built on top of it in src/game/debug.
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { attachDomInput, InputState, type DomInput, type InputContext, type PadSnapshot } from '@/input';
import {
  applyOverrides, createRenderApp, getPreset, pickQuality, runStartupBenchmark, type QualityId, type QualityPreset, type QualitySetting,
  type RenderApp,
} from '@/render/app';
import { createBrowserAssetLoader, type AssetLoader } from '@/render/assets';
import { applyPose } from '@/render/camera';
import { RenderRegistry, type FrameInfo } from '@/render';
import type { Command, DirectivesPatch, MarkerKind, PlayerIntent, PossessRole, Sim, SpeedLevel } from '@/sim/types';
import { WORLDGEN_MAX_ATTEMPTS } from '@/worldgen/tuning/pipeline';
import { calendarTick, dayOf, TICKS_PER_DAY } from '@/sim/time';
import type { Vec3 } from '@/core';
import type { GameFacade, NewGameResult, SaveResult, SaveSlotInfo, UiLoading, UiSnapshot } from '@/ui/api';
import { TEST_CAMERA_SETTLE_DT, TEST_CAMERA_SETTLE_S, TICK_SECONDS, UI_REFRESH_HZ } from './config/loop';
import { handleGlobalInput, handlePhotoInput, type GlobalControls } from './globalInput';
import { applyIntent } from './intent/applyIntent';
import { newPossessionInputResult } from './intent/possessionInput';
import { gamePerf } from './debug/perf';
import { generate, wake } from './newGame/startSession';
import { SaveHooks } from './saveHooks';
import { Toasts } from './toasts';
import { resolveNewGame, type NewGameOptions } from './newGame/options';
import { TOASTS } from './possessionEvents';
import { collectRefusals, type Rejection } from './refusals';
import { GameSession } from './session';
import { SettingsStore, type SettingsPatch } from './settings/settings';
import { isFrozen, refusalFor, type GameMode, type ViewId } from './time/speedRules';
import { buildSnapshot } from './uiBridge';
import { loadingPhases, type LoadingPhase } from './newGame/loading';
import { requestView, toggleColonyView, togglePhoto, type ViewSwitchHost } from './views/viewSwitch';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** ?test=1: render on demand, manual clock (only step() advances), frozen animation time. */
  testMode: boolean;
  quality: QualitySetting;
  /** Explicit post-processing override (null = preset). */
  post: boolean | null;
  /** Use debug renderers in every slot. */
  forceDebugRender: boolean;
  /** Receives every UI snapshot. */
  onSnapshot: (s: UiSnapshot) => void;
}

export interface CommandOutcome {
  /** Applied before returning (false: it waits for the next real-time tick, so refusals are not known yet). */
  applied: boolean;
  rejected: Rejection[];
}

/** Thrown inside newGame when a newer request superseded it. */
class Cancelled extends Error {}

export interface PossessOutcome extends CommandOutcome {
  /** Game-level refusal (not playing, photo mode, nobody has that role), null when the command was sent. */
  refused: string | null;
}

const CONTEXT_OF_VIEW: Record<ViewId, InputContext> = { possess: 'P', observer: 'O', colony: 'C', photo: 'Ph' };
const _fwd = new Vector3(), _up = new Vector3();

export class Game implements GameFacade, GlobalControls, ViewSwitchHost {
  mode: GameMode = 'title';
  session: GameSession | null = null;
  readonly settings = new SettingsStore();
  readonly input = new InputState();
  readonly camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5);
  readonly scene = new Scene();
  readonly assets: AssetLoader;
  app!: RenderApp;
  registry!: RenderRegistry;
  /** Defaults for newGame() (the URL flags); explicit options win. */
  newGameDefaults: NewGameOptions = {};
  /** Real-time ticking (off in test mode until __game.realtime(true)). */
  realtime: boolean;
  hudHidden = false;
  error: string | null = null;
  loading: UiLoading | null = null;
  /** Set by blur / pad loss pauses (GDD 01 §5.8, E17). */
  autoPaused = false;
  /** Animation clock, seconds (stays 0 in test mode). */
  time = 0;
  private dom: DomInput | null = null;
  private debugPads: (PadSnapshot | null)[] | null = null;
  private readonly toasts = new Toasts();
  /** Save / load / autosave hook points (the save task fills them in). */
  readonly saves = new SaveHooks();
  private uiAccum = 0;
  private uiRev = 0;
  private dirty = true;
  private intentBuf = newPossessionInputResult();
  private nowS = 0;
  private epitaph: UiSnapshot['epitaph'] = null;
  /** Intent set through the debug API; overrides keyboard input until real input arrives. */
  private debugIntent: PlayerIntent | null = null;
  /** The last snapshot sent to the UI. */
  lastSnapshot: UiSnapshot | null = null;
  /** Camera facts of the last rendered frame (summary, debug API). */
  lastFrame: { underground: boolean; possessionState: string | null; observerMode: string | null } = { underground: false, possessionState: null, observerMode: null };
  private loadToken = 0;
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => {};

  constructor(readonly opts: GameOptions) {
    this.realtime = !opts.testMode;
    this.assets = createBrowserAssetLoader();
    this.ready = new Promise<void>((r) => { this.resolveReady = r; });
    this.settings.set({ graphics: { quality: opts.quality, overrides: {} } });
  }

  get sim() { return this.session?.sim ?? null; }
  get view(): ViewId { return this.session?.view ?? 'observer'; }
  get level(): SpeedLevel { return this.session?.driver.level ?? 0; }

  // ------------------------------------------------------------------ boot
  private presetFor(id: QualityId): QualityPreset {
    const p = getPreset(id);
    if (this.opts.post !== null) {
      p.post.enabled = this.opts.post;
      if (this.opts.post && !p.post.dof.enabled) p.post = getPreset('high').post;
    }
    return applyOverrides(p, this.settings.get().graphics.overrides);
  }

  /** Creates the renderer, input and sub-renderers; resolves `ready` after the first frame. */
  async boot(): Promise<void> {
    const q = this.opts.quality;
    this.app = createRenderApp(this.opts.canvas, { quality: this.presetFor(q === 'auto' ? 'test' : q), scene: this.scene, camera: this.camera });
    if (q === 'auto') {
      const pick = pickQuality(runStartupBenchmark(this.app.renderer));
      this.app.setQuality(this.presetFor(pick.id));
    }
    if (this.opts.testMode) this.app.setOnDemand(true);
    this.dom = attachDomInput(this.input, { canvas: this.opts.canvas });
    this.input.contexts.setBase('UI');
    this.registry = new RenderRegistry({ forceDebug: this.opts.forceDebugRender });
    this.registry.init({
      renderer: this.app.renderer, scene: this.scene, camera: this.camera, quality: this.app.quality, assets: this.assets,
      game: { requestRender: () => this.requestRender(), testMode: this.opts.testMode }, setExposure: (ev) => this.app.setExposure(ev),
    });
    this.app.start(this.onFrame);
    this.app.renderFrame(0);
    await this.app.ready;
    this.refreshUi();
    this.resolveReady();
  }

  requestRender(): void {
    this.dirty = true;
    this.app?.requestRender();
  }

  // ------------------------------------------------------------------ new game / end
  /**
   * Generates a world and starts playing in it. A failure shows the loading error panel and resolves with
   * ok:false (it does not reject: the UI's Begin button must not also raise the uncaught-error overlay; the debug
   * API turns it into a rejection for scripts). A newer newGame / endGame cancels this one (ok:false, cancelled).
   */
  async newGame(options: NewGameOptions = {}): Promise<NewGameResult> {
    if (this.session) this.endGame(false);
    const token = ++this.loadToken;
    const phases = loadingPhases();
    let attempt = 1;
    const show = async (p: LoadingPhase) => {
      this.loading = { phase: p.label, progress: p.progress, attempt, maxAttempts: WORLDGEN_MAX_ATTEMPTS, error: null };
      this.mode = 'loading';
      this.input.contexts.setBase('UI');
      this.refreshUi();
      await nextFrame(this.opts.testMode);
      if (token !== this.loadToken) throw new Cancelled();
    };
    try {
      const opts = { ...this.newGameDefaults, ...options };
      opts.cheats = opts.cheats ?? this.opts.testMode;
      await show(phases.generate);
      const resolved = resolveNewGame(opts);
      const created = generate(resolved);
      attempt = created?.world.meta.attempts ?? 1;
      await show(phases.simulate);
      const sim = wake(resolved, created);
      await show(phases.render);
      this.startPlaying(sim, resolved.view === 'possess');
      return { ok: true };
    } catch (e) {
      if (e instanceof Cancelled) return { ok: false, cancelled: true, error: 'cancelled' };
      const error = String((e as Error)?.message ?? e);
      this.loading = { phase: 'Generation failed', progress: 0, attempt, maxAttempts: WORLDGEN_MAX_ATTEMPTS, error };
      this.mode = 'loading';
      this.refreshUi();
      return { ok: false, error };
    }
  }

  private startPlaying(sim: Sim, possessQueen: boolean): void {
    const session = new GameSession(sim, this.settings.get().camera);
    session.driver.timer = () => performance.now();
    this.session = session;
    this.registry.onGameStart(sim);
    this.loading = null;
    this.mode = 'playing';
    this.epitaph = null;
    if (possessQueen) {
      session.driver.enqueue(session.possessCommand('queen', this.settings.get().gameplay.dropTo1xOnPossess, 'auto'));
      session.driver.applyCommandsNow();
      session.update(0);
    }
    if (session.view !== 'possess') session.setView('observer', true);
    this.syncContexts();
    this.renderNow(this.opts.testMode ? TEST_CAMERA_SETTLE_S : 0);
  }

  /** Leaves the running game (renderers drop their meshes); `toTitle` shows the title screen. */
  endGame(toTitle = true): void {
    this.loadToken++;
    if (this.session) {
      this.saves.quitting();
      this.registry.onGameEnd();
      this.session.dispose();
      this.session = null;
    }
    this.loading = null;
    if (toTitle) this.mode = 'title';
    this.input.contexts.setBase('UI');
    this.requestRender();
    this.refreshUi();
  }

  // ------------------------------------------------------------------ frame loop
  private onFrame = (dt: number, nowMs: number): void => {
    this.nowS = nowMs / 1000;
    if (this.debugPads) this.input.setPads(this.debugPads); // simulated pads instead of navigator.getGamepads()
    else this.dom?.poll();
    this.input.update(nowMs);
    this.handleInputEvents();
    if (!this.opts.testMode) this.time += dt;
    const s = this.session;
    if (s && (this.mode === 'playing' || this.mode === 'paused')) this.playFrame(s, dt);
    if (!this.opts.testMode && this.toasts.tick(dt)) this.refreshUi(); // test mode: toasts age in afterStep()
    this.uiAccum += dt;
    if (this.uiAccum >= 1 / UI_REFRESH_HZ) { this.uiAccum = 0; this.refreshUi(); }
  };

  private playFrame(s: GameSession, dt: number): void {
    if (this.mode === 'playing') {
      if (s.view === 'photo') handlePhotoInput(this.input, this);
      else handleGlobalInput(this.input, this);
    } else if (this.mode === 'paused' && this.input.pressed('menu')) this.closePauseMenu();
    if (!this.session) return; // a handler ended the game
    if (this.debugIntent && this.input.anyActivity) this.debugIntent = null; // real input takes over again
    applyIntent(s, this.input, this.cameraBasis(), s.view === 'possess' && this.mode === 'playing', this.intentBuf, this.debugIntent);
    const f = s.driver.frame(dt, { frozen: isFrozen({ mode: this.mode, view: s.view }), realtime: this.realtime, now: () => performance.now() });
    if (f.steppedDownTo !== null) this.toast(TOASTS.steppedDown(s.driver.speed, f.steppedDownTo));
    if (f.running) s.predict(f.advancedS); // game time that really passed, not dt x requested speed
    this.afterSimChange(s, dt);
    if (f.ran > 0) this.saves.noteDay(dayOf(calendarTick(s.sim.state)));
    const changed = f.ran > 0 || this.input.anyActivity || s.views.transition.running || this.dirty || f.running;
    if (!this.opts.testMode || changed) {
      this.renderScene(s, dt, this.realtime ? f.alpha : 1, 0); // manual clock: show the latest tick
      this.app.requestRender();
      this.dirty = false;
    }
  }

  /** Reactions to sim events (views, toasts) and the epitaph check. */
  private afterSimChange(s: GameSession, realDt: number): void {
    const before = s.view;
    s.autoRepossessOnDeath = this.settings.get().gameplay.autoRepossessOnDeath;
    const r = s.update(realDt);
    for (const t of s.toasts.splice(0)) this.toast(t);
    if (s.view !== before) this.viewChanged();
    if (r.repossessId >= 0) this.possess(r.repossessId, 'cycle');
    if (r.epitaph && this.mode !== 'epitaph') this.enterEpitaph(s);
  }

  private enterEpitaph(s: GameSession): void {
    const st = s.sim.state;
    this.mode = 'epitaph';
    const cause = Object.entries(st.progression.deaths.byCause).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    this.epitaph = { ageDays: Math.floor(st.tick / TICKS_PER_DAY), peakWorkers: st.progression.peakWorkers, cause };
    this.input.contexts.setBase('UI');
    this.refreshUi();
  }

  /** Camera + renderers for the current state. `settleS` > 0 first settles the camera rig (test screenshots). */
  renderScene(s: GameSession, dt: number, alpha: number, settleS: number): FrameInfo {
    const subject = s.currentSubject(alpha);
    if (subject) s.views.setSubject(subject);
    const live = this.mode === 'playing' && settleS === 0 ? this.input : null;
    const vf = settleS > 0 ? s.views.settle(settleS, TEST_CAMERA_SETTLE_DT) : s.views.update(dt, live);
    const canvas = this.opts.canvas;
    applyPose(this.camera, vf.pose, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const underground = s.view === 'possess' && subject ? subject.underground : s.sim.field.substrate(this.camera.position) < 0;
    this.app.setFocus(vf.focus, undefined, settleS > 0 || dt === 0);
    const pred = s.possessedId >= 0 && s.view === 'possess' && subject ? subject : null;
    const frame: FrameInfo = {
      dt, time: this.time, alpha, sim: s.sim, view: s.view, underground, camera: this.camera,
      viewportHeightPx: this.app.renderer.domElement.height, subject: subject ? subject.pos : null, possessedId: s.possessedId,
      possessedPose: pred, subjectOpacity: s.view === 'possess' ? vf.subjectOpacity : 1, cutaway: vf.cutaway,
    };
    this.registry.update(frame);
    this.lastFrame = { underground, possessionState: vf.possessionState, observerMode: vf.observerMode };
    return frame;
  }

  /** Camera forward and up (world space, unit) for camera-relative movement. */
  cameraBasis(): { fwd: Vector3; up: Vector3 } {
    return { fwd: this.camera.getWorldDirection(_fwd), up: _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion) };
  }

  /** Debug API: hold this intent (null = back to keyboard input). Applied at once. */
  setDebugIntent(intent: PlayerIntent | null): void {
    this.debugIntent = intent;
    const s = this.session;
    if (s && intent) s.sim.setPlayerIntent(intent);
  }

  /**
   * After a synchronous debug step of `ticks`: game reactions to the new events, UI refresh, redraw request. On the
   * manual clock toasts age with the stepped game time (deterministic screenshots, and they do not stay forever).
   */
  afterStep(s: GameSession, ticks = 0): void {
    if (this.opts.testMode) this.toasts.tick(ticks * TICK_SECONDS);
    this.afterSimChange(s, 0);
    this.dirty = true;
    this.refreshUi();
  }

  /** Frame time, simulation time per tick, draw calls, triangles and ant count (architecture §5 perf()). */
  perf() { return gamePerf(this.app, this.registry, this.session); }

  /** Synchronous render of the current state (debug API, after loading). */
  renderNow(settleS = 0): void {
    const s = this.session;
    if (s) this.renderScene(s, 0, this.realtime ? s.driver.clock.alpha : 1, settleS);
    this.app.renderFrame(0);
    this.refreshUi();
  }

  // ------------------------------------------------------------------ input events, contexts
  /** GDD 01 §5.8 device events: blur and active-pad loss pause, pad changes and pointer-lock refusal toast. */
  private handleInputEvents(): void {
    for (const e of this.input.drainEvents()) {
      if (e.type === 'focus-lost' && this.settings.get().gameplay.pauseOnBlur) this.autoPause(TOASTS.autoPaused);
      if (e.type === 'pad-connected') this.toast(TOASTS.padConnected);
      if (e.type === 'pad-disconnected' && e.wasActiveDevice) {
        if (!this.autoPause(TOASTS.padDisconnected)) this.toast(TOASTS.padDisconnected);
      }
      if (e.type === 'pointer-lock' && e.state === 'refused') this.toast(TOASTS.pointerLockRefused);
    }
  }

  /** Pause because the window lost focus or the active pad vanished (applied at once, zero-time). False: no pause. */
  autoPause(toast: string = TOASTS.autoPaused): boolean {
    const s = this.session;
    if (!s || this.mode !== 'playing' || s.driver.paused) return false;
    s.driver.enqueue({ type: 'setSpeed', speed: 0 });
    s.driver.applyCommandsNow();
    this.autoPaused = true;
    this.toast(toast);
    this.refreshUi();
    return true;
  }

  /**
   * Debug API gamepad simulation (GDD 01 App. F 17): these pads replace navigator.getGamepads() from the next frame
   * on, for the rest of the page's life ([] = all disconnected).
   */
  setDebugPads(pads: (PadSnapshot | null)[]): void {
    this.debugPads = pads;
  }

  private syncContexts(): void {
    if (this.mode !== 'playing' || !this.session) this.input.contexts.setBase('UI');
    else this.input.contexts.setBase(CONTEXT_OF_VIEW[this.session.view]);
  }

  // ------------------------------------------------------------------ GlobalControls / GameFacade
  /**
   * Enqueue a command; applied at once (zero time) whenever the sim is not ticking in real time. The refusals the
   * sim raised while applying it come back in the outcome (none when it waits for the next tick: applied false).
   */
  command(cmd: Command): CommandOutcome {
    const s = this.session;
    if (!s) return { applied: false, rejected: [] };
    s.driver.enqueue(cmd);
    const ticking = this.realtime && !s.driver.paused && !isFrozen({ mode: this.mode, view: s.view });
    let rejected: Rejection[] = [];
    if (!ticking) {
      rejected = collectRefusals(s.sim, () => s.driver.applyCommandsNow());
      this.afterSimChange(s, 0);
    }
    this.dirty = true;
    return { applied: !ticking, rejected };
  }

  setSpeed(level: SpeedLevel): void {
    const s = this.session;
    if (!s) return;
    const refusal = refusalFor(level, {
      mode: this.mode, view: s.view, possessed: s.possessedId !== -1, timelapse: s.sim.state.player.timelapse !== null,
      openingPhase: s.sim.state.player.opening && !s.sim.state.player.opening.done ? s.sim.state.player.opening.phase : null,
    });
    // possession / opening refusals go through the sim so its speed-refused event (and toast) is the one source
    if (refusal === 'frozen' || refusal === 'timelapse') return;
    if (level !== 0) this.autoPaused = false;
    this.command({ type: 'setSpeed', speed: level });
  }

  togglePause(): void {
    const s = this.session;
    if (!s) return;
    this.setSpeed(s.driver.paused ? s.driver.speed : 0);
  }

  toggleHud(): void { this.setHudHidden(!this.hudHidden); }
  setHudHidden(hidden: boolean): void { this.hudHidden = hidden; this.refreshUi(); }

  menuPressed(): void {
    const s = this.session;
    if (s?.view === 'colony') { this.toggleColonyView(); return; }
    this.openPauseMenu();
  }

  openPauseMenu(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.syncContexts();
    this.refreshUi();
  }

  closePauseMenu(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.syncContexts();
    this.refreshUi();
  }

  quitToTitle(): void { this.endGame(true); }

  /** Possess an ant or a role. `refused` names a game-level refusal (no command was sent). */
  possess(target: number | PossessRole, via: 'command' | 'role-key' | 'cycle' | 'last' = 'command'): PossessOutcome {
    const s = this.session;
    if (!s) return { applied: false, rejected: [], refused: 'no-game' };
    if (this.mode !== 'playing') return { applied: false, rejected: [], refused: `mode-${this.mode}` };
    if (s.view === 'photo') return { applied: false, rejected: [], refused: 'photo-mode' };
    if (typeof target === 'string' && !s.roleAvailable(target)) {
      this.toast(GameSession.noRoleToast(target));
      return { applied: false, rejected: [], refused: 'no-ant-for-role' };
    }
    return { ...this.command(s.possessCommand(target, this.settings.get().gameplay.dropTo1xOnPossess, via)), refused: null };
  }

  possessLast(): void {
    const s = this.session;
    if (s && s.sim.state.player.previousAntId >= 0) this.possess(s.sim.state.player.previousAntId, 'last');
  }

  cycle(dir: 1 | -1): void {
    const s = this.session;
    if (!s) return;
    const id = s.tab.next(s.sim, s.focus(), s.possessedId, dir, this.nowS);
    if (id >= 0) this.possess(id, 'cycle');
  }

  release(): void {
    if (this.session?.possessedId !== -1) this.command({ type: 'release', reason: 'player' });
  }

  setView(view: ViewId): void { requestView(this, view); }
  toggleColonyView(): void { toggleColonyView(this); }
  togglePhoto(): void { togglePhoto(this); }

  /** ViewSwitchHost: the view changed. */
  viewChanged(): void {
    this.syncContexts();
    this.dirty = true;
  }

  setDirectives(patch: DirectivesPatch): void { this.command({ type: 'setDirectives', ...patch }); }
  placeMarker(kind: MarkerKind, pos: Vec3, radius?: number): void { this.command({ type: 'placeMarker', kind, pos, radius }); }
  removeMarker(markerId: number): void { this.command({ type: 'removeMarker', markerId }); }

  quickSave(): void { void this.save('quick').then((r) => { if (!r.ok) this.toast(r.message ?? 'Saving is not available yet'); }); }
  quickLoad(): void { void this.load('quick').then((r) => { if (!r.ok) this.toast(r.message ?? 'Loading is not available yet'); }); }

  save(slot: string): Promise<SaveResult> { return this.saves.save(slot); }
  load(slot: string): Promise<SaveResult> { return this.saves.load(slot); }
  listSaves(): Promise<SaveSlotInfo[]> { return this.saves.listSaves(); }

  getSettings() { return this.settings.get(); }
  setSettings(patch: SettingsPatch): void {
    const next = this.settings.set(patch);
    if (patch.controls) {
      Object.assign(this.input.settings, next.controls);
      this.input.pointer.setPreference(next.controls.mouseLook);
    }
    if (patch.camera && this.session) {
      const c = next.camera;
      this.session.views.third.setOptions({ autoFollow: c.autoFollow, fovOffset: c.fovOffset, worldUpLock: c.worldUpLock, reducedMotion: c.reducedMotion });
    }
    if (patch.graphics && next.graphics.quality !== 'auto') {
      this.app.setQuality(this.presetFor(next.graphics.quality));
      this.registry.setQuality(this.app.quality);
    }
  }

  // ------------------------------------------------------------------ UI
  toast(text: string): void {
    if (this.toasts.push(text)) this.refreshUi();
  }

  dismissToast(id: number): void {
    this.toasts.dismiss(id);
    this.refreshUi();
  }

  showError(text: string): void {
    this.error = text;
    this.refreshUi();
  }

  refreshUi(): void {
    const s = this.session;
    const snap = buildSnapshot({
      sim: s?.sim ?? null, mode: this.mode, view: s?.view ?? 'observer', loading: this.loading,
      speed: s ? s.driver.speedReport() : null, manualClock: !this.realtime, toasts: this.toasts.list, hudHidden: this.hudHidden,
      error: this.error, underground: this.lastFrame.underground, epitaph: this.epitaph, observerPrompt: s?.observerPrompt ?? null,
    }, this.uiRev);
    this.uiRev = snap.rev;
    this.lastSnapshot = snap;
    this.opts.onSnapshot(snap);
  }

  dispose(): void {
    this.endGame(false);
    this.registry?.dispose();
    this.dom?.detach();
    this.app?.dispose();
  }
}

/** Lets the browser paint between loading phases (skipped in test mode for speed). */
function nextFrame(test: boolean): Promise<void> {
  if (test) return Promise.resolve();
  return new Promise((r) => setTimeout(r, 0));
}
