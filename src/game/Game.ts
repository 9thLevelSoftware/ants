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
import { applyQualityToServices } from './qualityWiring';
import { createBrowserAssetLoader, loadWorkerSource, type AssetLoader } from '@/render/assets';
import { applyPose } from '@/render/camera';
import { RenderRegistry, type FrameInfo, type HighlightRef } from '@/render';
import { LodObserverFeed } from './lodObserver';
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
import { generateAsync, wake } from './newGame/startSession';
import { SaveHooks } from './saveHooks';
import { Toasts } from './toasts';
import { resolveNewGame, type NewGameOptions } from './newGame/options';
import { TOASTS } from './possessionEvents';
import { collectRefusals, type Rejection } from './refusals';
import { GameSession } from './session';
import { SettingsStore, type SettingsPatch } from './settings/settings';
import { AutoSlowWatcher } from './time/autoSlow';
import { isFrozen, refusalFor, type GameMode, type ViewId } from './time/speedRules';
import { buildSnapshot } from './uiBridge';
import { generationPhase, loadingPhases, type LoadingPhase } from './newGame/loading';
import { UndergroundSwitch } from './undergroundSwitch';
import { requestView, toggleColonyView, togglePhoto, type ViewSwitchHost } from './views/viewSwitch';
import { ViewsLayer } from './views/viewsLayer';
import { FoundingFlow, installFoundingDebug } from './flows/founding';
import { installLifecycleDebug, LifecycleFlows } from './flows/epitaph';
import { registerScenicQueries, TitleHost, titleQualityCap, titleSceneWanted } from './title';
import { edgeGlyphActive } from '@/render/world/boundary';
import { createGameAudio, type AudioSystem } from '@/audio';
import { clearOverlays, ComfortFeed, installOverlayHost } from './stage2Wiring';
import { Accessibility } from './accessibility';

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
  private readonly undergroundSw = new UndergroundSwitch();
  /** LOD observer last given to locomotion (it is re-sent only when the focus moved). */
  /** Locomotion's LOD observer, fed from the camera focus before every tick (lodObserver.ts). */
  private readonly lodObserver = new LodObserverFeed();
  /** Hover / inspect highlights (the views task sets them from picking; the debug API for now). */
  hover: HighlightRef | null = null;
  inspect: HighlightRef | null = null;
  /** Picking, hover / inspect, colony tools and markers (src/game/views); `viewsLayer.inspectTarget` for the HUD. */
  readonly viewsLayer = new ViewsLayer(this);
  /** The opening sequence's flow: intro card, time-lapse playback, hand-over, failure (src/game/flows/founding). */
  readonly founding: FoundingFlow = new FoundingFlow(this);
  /** Winter, nuptial flight, epitaph and Lineage flows (src/game/flows/{overwinter,flight,epitaph}). */
  readonly lifecycle: LifecycleFlows = new LifecycleFlows(this);
  /** GDD 06 §4.5 automatic slow-downs on raised alerts (src/game/time/autoSlow.ts). */
  private readonly autoSlow = new AutoSlowWatcher({
    level: () => this.session?.driver.level ?? 0,
    choice: () => { const g = this.settings.get().gameplay; return { critical: g.autoSlowCritical, warning: g.autoSlowWarning }; },
    apply: (to) => this.setSpeed(to),
  });
  /** The live scene behind the title menu (src/game/title, render-integration). */
  readonly title: TitleHost;
  /** GDD 04 §14 edge glyph hook: the possessed ant presses outward against the map's hard limit (for the HUD). */
  atLocalityEdge = false;
  /** The title's Low quality cap is on (GDD 08 §3.3; set by the TitleHost) and the preset 'auto' resolved to. */
  private titleCapped = false;
  private autoQuality: QualityId = 'medium';
  /** The title backdrop may be (re)built on its own: after boot, unless ?title=0 / ?autostart=1. */
  private titleArmed = false;
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => {};
  /** Sound (src/audio): starts on the first user gesture, never in test mode; silent no-op until then. */
  readonly audio: AudioSystem;
  /** Undo of the fx slot's overlay-host registration (stage2Wiring). */
  private uninstallOverlayHost: () => void = () => {};
  private readonly comfort = new ComfortFeed();
  /** Applies Settings > Accessibility to the camera, the render app and the palette (src/game/accessibility). */
  readonly a11y = new Accessibility(this);

  constructor(readonly opts: GameOptions) {
    this.realtime = !opts.testMode;
    this.assets = createBrowserAssetLoader();
    this.audio = createGameAudio({ assets: this.assets, settings: this.settings, testMode: opts.testMode });
    this.ready = new Promise<void>((r) => { this.resolveReady = r; });
    this.settings.set({ graphics: { quality: opts.quality, overrides: {} } });
    registerScenicQueries();
    installFoundingDebug(this.founding, this);
    installLifecycleDebug(this.lifecycle, this);
    this.title = new TitleHost({
      registry: () => this.registry, app: () => this.app, camera: this.camera, canvas: opts.canvas, testMode: opts.testMode,
      reducedMotion: () => this.settings.get().camera.reducedMotion,
      comfort: () => this.comfort.get(this.settings.get()),
      playerQuality: () => this.playerQuality(),
      setQualityCap: (on) => { if (on !== this.titleCapped) { this.titleCapped = on; this.applyQuality(); } },
    });
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
      this.autoQuality = pick.id;
      this.app.setQuality(this.presetFor(pick.id));
    }
    if (this.opts.testMode) this.app.setOnDemand(true);
    this.assets.setAnisotropy(this.app.quality.anisotropy);
    this.dom = attachDomInput(this.input, { canvas: this.opts.canvas });
    this.input.contexts.setBase('UI');
    this.registry = new RenderRegistry({ forceDebug: this.opts.forceDebugRender });
    const assetsReady = this.registry.init({
      renderer: this.app.renderer, scene: this.scene, camera: this.camera, quality: this.app.quality, assets: this.assets,
      game: { requestRender: () => this.requestRender(), testMode: this.opts.testMode },
      // photo mode adds its exposure compensation and look on top of what the world lighting asks for
      setExposure: (ev) => this.app.setExposure(this.viewsLayer.photo.mapExposure(ev)),
      setGrade: (g) => this.app.setGrade(this.viewsLayer.photo.mapGrade(g)),
    });
    this.uninstallOverlayHost = installOverlayHost(this.registry, this.settings);
    this.a11y.attach();
    this.viewsLayer.attach(this.opts.canvas, this.scene, this.registry);
    this.app.start(this.onFrame);
    this.app.renderFrame(0);
    await Promise.all([this.app.ready, assetsReady]);
    const titleWanted = typeof location !== 'undefined' && titleSceneWanted(location.search);
    if (this.mode === 'title' && titleWanted) await this.title.enter();
    this.titleArmed = titleWanted;
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
    this.title.leave();
    if (this.session) this.endGame(false);
    const token = ++this.loadToken;
    const phases = loadingPhases();
    let attempt = 1;
    const show = async (p: LoadingPhase) => {
      this.loading = { phase: p.label, progress: p.progress, attempt, maxAttempts: WORLDGEN_MAX_ATTEMPTS, error: null, kind: 'generate' };
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
      if (this.opts.testMode && opts.failGenerationForTest) throw new Error(opts.failGenerationForTest);
      const resolved = resolveNewGame(opts);
      const created = await generateAsync(resolved, {
        workerSource: await this.workerSource(),
        onProgress: (p) => {
          if (token !== this.loadToken) return;
          const g = generationPhase(p);
          attempt = g.attempt;
          this.loading = { phase: g.label, progress: g.progress, attempt, maxAttempts: WORLDGEN_MAX_ATTEMPTS, error: null, kind: 'generate' };
          this.refreshUi();
        },
      });
      if (token !== this.loadToken) throw new Cancelled();
      attempt = created?.world.meta.attempts ?? 1;
      await show(phases.simulate);
      const sim = wake(resolved, created);
      await show(phases.render);
      // the renderers build the world (textures, terrain, nest meshes) before the first frame of play
      await this.registry.onGameStart(sim);
      if (token !== this.loadToken) throw new Cancelled(); // the newer request (or endGame) owns the renderers now
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

  private workerSrc: Promise<string | null> | null = null;
  /** The worldgen worker's source when this build ships it (portable build), else null; read once. */
  private workerSource(): Promise<string | null> {
    this.workerSrc ??= loadWorkerSource(this.assets).catch(() => null);
    return this.workerSrc;
  }

  private startPlaying(sim: Sim, possessQueen: boolean): void {
    const session = new GameSession(sim, this.settings.get().camera);
    this.lodObserver.reset();
    const focus = (out: Vec3) => session.focus(out);
    session.driver.beforeTick = () => this.lodObserver.sample(sim, focus);
    session.driver.timer = () => performance.now();
    this.session = session;
    this.audio.attachSim(sim);
    this.viewsLayer.reset();
    this.loading = null;
    this.mode = 'playing';
    this.epitaph = null;
    if (possessQueen) {
      session.driver.enqueue(session.possessCommand('queen', this.settings.get().gameplay.dropTo1xOnPossess, 'auto'));
      session.driver.applyCommandsNow();
      session.update(0);
    }
    if (session.view !== 'possess') session.setView('observer', true);
    this.founding.attach(session);
    this.lifecycle.attach(session);
    this.autoSlow.attach(sim);
    this.syncContexts();
    this.renderNow(this.opts.testMode ? TEST_CAMERA_SETTLE_S : 0);
  }

  /**
   * Starts playing a sim built elsewhere (a loaded save, src/game/save/gameHost.ts): the renderers build its world
   * first, as in newGame. Throws when a newer newGame / endGame superseded it meanwhile.
   */
  async adoptSim(sim: Sim): Promise<void> {
    const token = this.loadToken;
    try {
      await this.registry.onGameStart(sim);
    } catch (e) {
      this.registry.onGameEnd();
      throw e;
    }
    if (token !== this.loadToken) throw new Error('The load was superseded by a newer game.');
    this.startPlaying(sim, false);
  }

  /** Founding retry (src/game/flows/founding): continue in a restored simulation of the same world. */
  async restartWith(sim: Sim): Promise<void> {
    if (this.session) { this.session.dispose(); this.session = null; }
    this.registry.onGameEnd();
    await this.registry.onGameStart(sim);
    this.startPlaying(sim, true);
  }

  /** Leaves the running game (renderers drop their meshes); `toTitle` shows the title screen. */
  endGame(toTitle = true): void {
    this.loadToken++;
    this.title.leave(); // a load from the title (save host adopt) ends the game without newGame's leave()
    this.atLocalityEdge = false;
    if (this.session) {
      this.saves.quitting();
      this.audio.detachSim();
      this.session.dispose();
      this.session = null;
    }
    this.registry?.onGameEnd(); // also after a cancelled load whose world the renderers already built
    clearOverlays();
    this.founding.detach();
    this.lifecycle.detach();
    this.autoSlow.detach();
    this.viewsLayer.reset();
    this.loading = null;
    if (toTitle) { this.mode = 'title'; void this.title.enter(); }
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
    const s = this.session;
    if (!this.opts.testMode && s?.view !== 'photo') this.time += dt; // photo mode freezes the animation clock (GDD 08 7.9)
    if (s && (this.mode === 'playing' || this.mode === 'paused')) this.playFrame(s, dt);
    else if (!s && this.mode === 'title' && !this.opts.testMode) { if (this.titleArmed) this.title.ensure(); this.title.frame(dt); }
    if (!s || (this.mode !== 'playing' && this.mode !== 'paused')) this.audio.idle(dt); // world sound fades outside play
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
    this.founding.frame(s, dt); // the opening's own playback (time-lapse) before the normal clock
    this.lifecycle.frame(s, dt); // winter lapse playback, flight prompts
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
    this.audio.frame({
      dt, sim: s.sim, camera: this.camera, focus: s.focus(), possessedId: s.possessedId, view: s.view, underground: this.lastFrame.underground,
      paused: this.mode === 'paused' || s.driver.paused, hudHidden: this.hudHidden,
    });
  }

  /** Reactions to sim events (views, toasts) and the epitaph check. */
  private afterSimChange(s: GameSession, realDt: number): void {
    const before = s.view;
    s.autoRepossessOnDeath = this.settings.get().gameplay.autoRepossessOnDeath;
    const r = s.update(realDt);
    for (const t of s.toasts.splice(0)) this.toast(t);
    if (s.view !== before) this.viewChanged();
    if (r.repossessId >= 0) this.possess(r.repossessId, 'cycle');
    if (this.lifecycle.epitaphDue(r.epitaph) && this.mode !== 'epitaph') this.enterEpitaph(s);
  }

  private enterEpitaph(s: GameSession): void {
    const st = s.sim.state;
    this.mode = 'epitaph';
    const cause = Object.entries(st.progression.deaths.byCause).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    this.epitaph = { ageDays: Math.floor(st.tick / TICKS_PER_DAY), peakWorkers: st.progression.peakWorkers, cause };
    this.lifecycle.onEpitaph();
    this.input.contexts.setBase('UI');
    this.refreshUi();
  }

  /** Camera + renderers for the current state. `settleS` > 0 first settles the camera rig (test screenshots). */
  renderScene(s: GameSession, dt: number, alpha: number, settleS: number): FrameInfo {
    const live = this.mode === 'playing' && settleS === 0 ? this.input : null;
    this.viewsLayer.frame(s, live, this.nowS, alpha);
    const subject = s.currentSubject(alpha);
    if (subject) s.views.setSubject(subject);
    const vf = settleS > 0 ? s.views.settle(settleS, TEST_CAMERA_SETTLE_DT) : s.views.update(dt, live);
    const canvas = this.opts.canvas;
    applyPose(this.camera, vf.pose, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const underground = this.undergroundSw.update(s.sim.field.substrate(this.camera.position), s.sim.world.bu, settleS > 0);
    // reduced motion: focus changes are instant (GDD 08 §12)
    const instantFocus = settleS > 0 || dt === 0 || this.settings.get().camera.reducedMotion;
    this.app.setFocus(vf.focus, undefined, instantFocus);
    this.viewsLayer.photo.afterCamera(s, instantFocus); // photo mode: aperture range, bokeh, exposure
    this.a11y.frame(s.view); // tremor scale and depth-of-field strength of the accessibility settings
    const pred = s.possessedId >= 0 && s.view === 'possess' && subject ? subject : null;
    const frame: FrameInfo = {
      dt: s.view === 'photo' ? 0 : dt, time: this.time, alpha, sim: s.sim, view: s.view, underground, camera: this.camera,
      viewportHeightPx: this.app.renderer.domElement.height, subject: subject ? subject.pos : null, possessedId: s.possessedId,
      possessedPose: pred, subjectOpacity: s.view === 'possess' ? vf.subjectOpacity : 1, cutaway: vf.cutaway,
      fade: s.view === 'possess' ? vf.fade : null, hover: this.hover, inspect: this.inspect, reducedMotion: this.settings.get().camera.reducedMotion, reducedFlash: this.settings.get().accessibility.flashReduction,
      comfort: this.comfort.get(this.settings.get()),
      hidePossessedHighlight: this.viewsLayer.photo.hidesMarkers,
    };
    this.registry.update(frame);
    const pa = s.possessedId >= 0 ? s.sim.stores.ants.get(s.possessedId) : undefined;
    this.atLocalityEdge = !!pa && edgeGlyphActive(pa.pos, s.sim.state.player.intent.dir, s.sim.world.size, s.sim.world.bu);
    this.lastFrame = { underground, possessionState: vf.possessionState, observerMode: vf.observerMode };
    return frame;
  }

  /** Switches the quality preset at runtime (renderer, post chain and every sub-renderer). */
  setQuality(id: QualityId): void {
    this.settings.set({ graphics: { quality: id } });
    this.applyQuality();
    this.requestRender();
  }

  /** The player's preset ('auto' resolved at boot). */
  private playerQuality(): QualityId {
    const q = this.settings.get().graphics.quality;
    return q === 'auto' ? this.autoQuality : q;
  }

  /** Applies the player's preset, capped at Low while the title backdrop is shown (GDD 08 §3.3). */
  private applyQuality(): void {
    if (!this.app) return;
    const id = this.titleCapped ? titleQualityCap(this.playerQuality()) : this.playerQuality();
    this.app.setQuality(this.presetFor(id));
    applyQualityToServices(this.app.quality, { registry: this.registry ?? null, assets: this.assets });
    this.requestRender();
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
    this.lifecycle.afterStep(s);
    this.afterSimChange(s, 0);
    this.dirty = true;
    this.refreshUi();
  }

  /** Frame time, simulation time per tick, draw calls, triangles and ant count (architecture §5 perf()). */
  perf() {
    const p = gamePerf(this.app, this.registry, this.session, this.uiCost);
    this.uiCost.maxMs = 0;
    return p;
  }

  /** Cost of the UI snapshot builds (perf()). */
  private readonly uiCost = { lastMs: 0, maxMs: 0 };

  /** Synchronous render of the current state (debug API, after loading). */
  renderNow(settleS = 0): void {
    const s = this.session;
    if (s) this.renderScene(s, 0, this.realtime ? s.driver.clock.alpha : 1, settleS);
    else if (this.mode === 'title') { if (this.titleArmed) this.title.ensure(); this.title.frame(0); }
    this.app.renderFrame(0);
    this.dirty = false;
    if (this.opts.testMode) waitForGpu(this.app);
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
    if (this.viewsLayer.consumeEscape(s)) return; // Esc cancels the colony tool / ghost first
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

  quickSave(): void { void this.save('quick').then((r) => { if (!r.ok) this.toast(r.message ?? 'Saving is not available here'); }); }
  quickLoad(): void { void this.load('quick').then((r) => { if (!r.ok) this.toast(r.message ?? 'Loading is not available here'); }); }

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
    if (patch.graphics) this.applyQuality();
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
    const t0 = performance.now();
    const snap = buildSnapshot({
      sim: s?.sim ?? null, mode: this.mode, view: s?.view ?? 'observer', loading: this.loading,
      speed: s ? s.driver.speedReport() : null, manualClock: !this.realtime, toasts: this.toasts.list, hudHidden: this.hudHidden,
      error: this.error, underground: this.lastFrame.underground, epitaph: this.epitaph, observerPrompt: s?.observerPrompt ?? null,
    }, this.uiRev);
    this.uiRev = snap.rev;
    this.uiCost.lastMs = performance.now() - t0;
    this.uiCost.maxMs = Math.max(this.uiCost.maxMs, this.uiCost.lastMs);
    this.lastSnapshot = snap;
    this.opts.onSnapshot(snap);
  }

  dispose(): void {
    this.title.leave();
    this.endGame(false);
    this.audio.dispose();
    this.viewsLayer.dispose();
    this.uninstallOverlayHost();
    this.a11y.dispose();
    this.registry?.dispose();
    this.dom?.detach();
    this.app?.dispose();
  }
}

const onePixel = new Uint8Array(4);

/**
 * Blocks until the GPU has finished the frame (a 1-pixel read-back). Scripted test-mode renders call it so software
 * GL never builds a backlog of heavy frames that would make the next screenshot time out (tech-stack 7).
 */
function waitForGpu(app: RenderApp): void {
  const gl = app.renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, onePixel);
}

/** Lets the browser paint between loading phases (skipped in test mode for speed). */
function nextFrame(test: boolean): Promise<void> {
  if (test) return Promise.resolve();
  return new Promise((r) => setTimeout(r, 0));
}
