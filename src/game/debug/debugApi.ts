// window.__game (architecture §5): the verification surface every scripted check uses. Deterministic: step()
// advances the sim synchronously without rendering; renderFrame() draws the current state once (with a settled
// camera in test mode). Commands issued through it are applied at once while the sim is not ticking in real time.
import type { Command, PlayerIntent, PossessRole, SpeedLevel, TargetRef } from '@/sim/types';
import { ACTION_IDS } from '@/sim/types';
import type { Vec3 } from '@/core';
import type { HighlightRef } from '@/render';
import { isQualityId } from '@/render/app';
import { stateHash } from '@/sim/save/hash';
import { cameraRelativeDir, sanitizeDir } from '../intent/cameraRelative';
import type { Game } from '../Game';
import { GameSession } from '../session';
import type { NewGameOptions } from '../newGame/options';
import { TEST_CAMERA_SETTLE_S } from '../config/loop';
import type { ViewId } from '../time/speedRules';
import type { SettingsPatch } from '../settings/settings';
import { buildSummary } from './summary';
import { buildQueries, plain } from './query';
import { registerGateQueries } from './gateQueries';
import { buildFxDebug, lookOf, registerStage2Queries } from './stage2Debug';
import { buildCheats } from './cheats';
import { possessResult } from './possessResult';
import { buildViewsDebug } from '../views/debug';

export interface IntentInput {
  /** World-space direction (length 0..1). */
  dir?: Vec3;
  /** Camera-relative stick (x right, y forward), mapped like the keyboard. */
  move?: { x: number; y: number };
  hurry?: boolean;
  grip?: boolean;
  held?: string[];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const clampAxis = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0);

function now(): number {
  return performance.now();
}

/** The HUD's test hook (src/ui/hud/debugHook.ts); the game does not import the UI, so it is read off window. */
type HudHook = { hud?: () => unknown; alerts?: () => unknown; prompts?: () => unknown; inspect?: (ref: unknown) => unknown };
const hudHook = (): HudHook | null => (typeof window !== 'undefined' ? ((window as unknown as { __hud?: HudHook }).__hud ?? null) : null);

export function createDebugApi(game: Game) {
  registerGateQueries();
  registerStage2Queries();
  const sessionOrThrow = () => {
    if (!game.session) throw new Error('__game: no game running (call newGame first)');
    return game.session;
  };
  const summary = () => plain(buildSummary({
    mode: game.mode, session: game.session, manualClock: !game.realtime, autoPaused: game.autoPaused,
    camera: { state: game.lastFrame.possessionState, observerMode: game.lastFrame.observerMode, pos: game.camera.position, underground: game.lastFrame.underground },
    renderers: game.registry?.describe() ?? {},
  }));

  const api = {
    ready: game.ready,
    get testMode() { return game.opts.testMode; },
    /** Rejects when generation failed or was cancelled (the game shows the loading error panel). */
    async newGame(opts: NewGameOptions = {}) {
      const r = await game.newGame(opts);
      if (!r.ok) throw new Error(`__game.newGame failed: ${r.error ?? 'unknown'}`);
      return summary();
    },
    endGame() { game.endGame(true); },
    /** Advance n ticks synchronously (ignores pause and freezes); no rendering. */
    step(n = 1) {
      const s = sessionOrThrow();
      const t0 = now();
      const ran = s.driver.step(n);
      game.afterStep(s, ran);
      return { ticks: ran, tick: s.sim.state.tick, ms: Math.round((now() - t0) * 100) / 100 };
    },
    /** Render the current state once; in test mode the camera rig is settled first. */
    renderFrame(opts: { settle?: number } = {}) {
      const t0 = now();
      game.renderNow(opts.settle ?? (game.opts.testMode ? TEST_CAMERA_SETTLE_S : 0));
      return { ms: Math.round((now() - t0) * 100) / 100 };
    },
    summary,
    stateHash() { return stateHash(sessionOrThrow().sim.state); },
    query: buildQueries(() => game.sim),
    /** Recent sim events (newest last). `since`: only events with a larger seq (take `seq` from an earlier call). */
    events(type?: string, limit = 50, since = 0) {
      const log = game.session?.events.since(since) ?? [];
      return plain(log.filter((e) => !type || e.type === type).slice(-limit).map((e) => ({ seq: e.seq, tick: e.tick, ...e.event })));
    },
    possess(target: number | string) {
      const t = GameSession.parseTarget(target);
      if (t === null) return { ok: false, reason: 'bad-target' };
      const r = game.possess(t);
      return plain(possessResult(t, r, sessionOrThrow().possessedId));
    },
    release() { game.release(); return { id: game.session?.possessedId ?? -1 }; },
    /** Sets the player intent directly (bypasses keyboard input until the next frame with input focus). */
    setIntent(i: IntentInput = {}) {
      const s = sessionOrThrow();
      const ant = s.possessedAnt();
      const intent: PlayerIntent = { dir: { x: 0, y: 0, z: 0 }, hurry: !!i.hurry, grip: !!i.grip, held: [], flight: null };
      if (i.dir) sanitizeDir(intent.dir, { x: Number(i.dir.x), y: Number(i.dir.y), z: Number(i.dir.z) });
      else if (i.move && ant) {
        const b = game.cameraBasis();
        cameraRelativeDir(intent.dir, Number(i.move.x), Number(i.move.y), b.fwd, b.up, ant.up);
      }
      intent.held = (i.held ?? []).filter((h): h is PlayerIntent['held'][number] => (ACTION_IDS as readonly string[]).includes(h));
      game.setDebugIntent(intent);
      return plain(intent);
    },
    /** Begin / stop an action primitive of the possessed ant: act('dig-bite'), act({action, phase, target}). */
    act(a: string | { action: string; phase?: 'start' | 'stop'; target?: TargetRef; secondary?: boolean }, phase: 'start' | 'stop' = 'start') {
      const o = typeof a === 'string' ? { action: a, phase } : a;
      if (!(ACTION_IDS as readonly string[]).includes(o.action)) return { ok: false, reason: 'unknown-action' };
      const cmd = { type: 'action', actionId: o.action, phase: o.phase ?? phase, secondary: !!o.secondary, ...(o.target ? { target: o.target } : {}) } as Command;
      game.command(cmd);
      return { ok: true };
    },
    teleport(target: number | 'possessed', pos: Vec3) {
      const s = sessionOrThrow();
      const id = target === 'possessed' ? s.possessedId : target;
      game.command({ type: 'cheat.teleport', antId: id, pos });
      return plain(s.sim.stores.ants.get(id)?.pos ?? null);
    },
    command(cmd: Command) {
      sessionOrThrow();
      const r = game.command(cmd);
      return plain({ ok: r.rejected.length === 0, applied: r.applied, rejected: r.rejected });
    },
    setSpeed(level: SpeedLevel) { game.setSpeed(level); return summary(); },
    /** Real-time ticking on/off (test mode starts with it off). */
    realtime(on?: boolean) { if (on !== undefined) game.realtime = on; return game.realtime; },
    camera: {
      state: () => game.lastFrame.possessionState,
      view: () => game.session?.view ?? null,
      set: (view: ViewId) => { game.setView(view); return game.session?.view ?? null; },
      pose: () => plain({ pos: game.camera.position, up: game.camera.up, fov: game.camera.fov, near: game.camera.near, far: game.camera.far, dir: game.camera.getWorldDirection(game.camera.position.clone()) }),
      /** Orbit the active rig by these degrees (applied on the next camera update). */
      orbit: (yawDeg: number, pitchDeg: number) => {
        sessionOrThrow().views.nudge(yawDeg, pitchDeg);
        game.renderNow(0);
        return api.camera.pose();
      },
      /** Observer only: stop following and fly free from a pose above and behind the current focus. */
      free: () => {
        const s = sessionOrThrow();
        if (s.view !== 'observer') return null;
        const f = s.focus();
        s.followId = -1; s.followItemId = -1;
        s.views.freeFlyAbove(f);
        game.renderNow(0);
        return api.camera.pose();
      },
      /** Observer only: free fly at this pose (mm). */
      setPose: (pos: Vec3, look: Vec3) => {
        const s = sessionOrThrow();
        if (s.view !== 'observer') return null;
        s.followId = -1; s.followItemId = -1;
        s.views.freeFlyAt(pos, look);
        game.renderNow(0);
        return api.camera.pose();
      },
      /** Multiply the active rig's distance by `factor` (applied on the next camera update). */
      zoom: (factor: number) => {
        sessionOrThrow().views.nudge(0, 0, Math.log(Math.max(1e-3, factor)));
        game.renderNow(0);
        return api.camera.pose();
      },
      /** Footstep tremors that shook the possession camera this game (src/game/views/tremorCue.ts). */
      tremors: () => game.viewsLayer.tremorStrikes,
      clearance: () => {
        const s = game.session;
        if (!s) return null;
        const p = game.camera.position;
        // cutAway: the cell camera's cut-away has removed the soil the camera stands in (its view is clear although the field there is solid)
        return { f: s.sim.field.sampleXYZ(p.x, p.y, p.z), radius: s.views.third.radiusMm, cutAway: s.views.cameraInCutAway(p) };
      },
    },
    cheat: buildCheats(game),
    /** Scent view, overlays and particle effects (src/game/debug/stage2Debug.ts). */
    fx: buildFxDebug(() => game.registry, () => game.requestRender()),
    /** Picking and view tools (src/game/views/debug.ts). */
    views: buildViewsDebug(game),
    /** What the accessibility settings did to the systems: reduced motion, tremor, DoF, palette, hold timing (src/game/accessibility). */
    a11y: { state: () => plain(game.a11y.state()) },
    ui: {
      /** Screens that exist so far: 'pause' (the menu). Anything else is refused (not silently ignored). */
      open: (screen: string) => {
        if (screen !== 'pause') return { ok: false, mode: game.mode, reason: `unknown screen '${screen}' (known: pause)` };
        game.openPauseMenu();
        return { ok: game.mode === 'paused', mode: game.mode };
      },
      close: () => { game.closePauseMenu(); return game.mode; },
      screen: () => game.mode,
      snapshot: () => plain(game.lastSnapshot),
      /** GDD 08 E17: the render variant creature `id` was drawn as in the last frame ({look, comfort, ring}). */
      look: (id: number) => lookOf(game.registry, id),
      /** The HUD's own read-outs when the HUD is mounted (window.__hud, ?test=1): region boxes, alerts, prompts. */
      hud: () => plain(hudHook()?.hud?.() ?? game.lastSnapshot),
      alerts: () => plain(hudHook()?.alerts?.() ?? null),
      prompts: () => plain(hudHook()?.prompts?.() ?? null),
      inspect: (ref: unknown) => plain(hudHook()?.inspect?.(ref) ?? null),
      /** GDD 08 App. B: the audio status and recent cues (src/audio). */
      audio: {
        status: () => game.audio.status(), cueLog: () => plain(game.audio.cueLog()), loudness: () => plain(game.audio.loudness()),
        statusDetail: () => game.audio.statusDetail(), test: (bus: Parameters<typeof game.audio.testBus>[0]) => game.audio.testBus(bus), enable: () => game.audio.enable(),
      },
    },
    /** Which back end the asset loader would use for a path ('embedded' in the portable build). */
    assets: { backendFor: (path: string) => game.assets.backendFor(path) },
    input: {
      key: (code: string, state: 'down' | 'up' | 'tap' = 'tap') => {
        if (state !== 'up') game.input.keyDown(code);
        if (state !== 'down') game.input.keyUp(code);
      },
      blur: () => game.input.focusLost(),
      /**
       * Simulated standard-mapping gamepad (index 0) from the next frame on; null disconnects it. Buttons and axes
       * follow the standard mapping order (e.g. axes [lx, ly, rx, ry], buttons[0] = A).
       */
      pad: (p: { buttons?: number[]; axes?: number[]; id?: string } | null) => {
        if (!p) { game.setDebugPads([]); return null; }
        const buttons = Array.from({ length: 17 }, (_, i) => clamp01(Number(p.buttons?.[i] ?? 0)));
        const axes = Array.from({ length: 4 }, (_, i) => clampAxis(Number(p.axes?.[i] ?? 0)));
        game.setDebugPads([{ index: 0, id: p.id ?? 'debug pad (standard)', mapping: 'standard', buttons, axes }]);
        return plain({ buttons, axes });
      },
      summary: () => plain(game.input.debugSummary()),
    },
    perf() { return game.perf(); },
    /** The settings now, after applying `patch` when given (same path as the Settings screen: Game.setSettings). */
    settings(patch?: SettingsPatch) {
      if (patch) game.setSettings(patch);
      return plain(game.getSettings());
    },
    /** Quality preset now (no argument) or switch it at runtime ('test' | 'low' | 'medium' | 'high' | 'ultra'). */
    quality(id?: string) {
      if (id !== undefined) {
        if (!isQualityId(id)) return { ok: false, reason: `unknown quality '${id}'`, quality: game.app.quality.id };
        game.setQuality(id);
      }
      return { ok: true, quality: game.app.quality.id, post: game.app.quality.post.enabled, shadows: game.app.quality.shadows.enabled };
    },
    /** Hover / inspect highlight targets ({kind: 'ant' | 'brood' | 'item', id}); null clears; undefined keeps. */
    highlight(hover?: HighlightRef | null, inspect?: HighlightRef | null) {
      if (hover !== undefined) game.hover = hover;
      if (inspect !== undefined) game.inspect = inspect;
      game.requestRender();
      return plain({ hover: game.hover, inspect: game.inspect });
    },
    dispose() { game.dispose(); },
  };
  return api;
}

export type DebugApi = ReturnType<typeof createDebugApi>;
