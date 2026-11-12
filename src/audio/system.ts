// The game's audio system: gesture-gated context (context.ts), the runtime on it (runtime.ts), settings, tab
// visibility, pause, and the simulation hookup (events in, listener and ambience inputs out of the sim). Before a
// gesture, in test mode, when blocked or unsupported it is a silent no-op facade; nothing it does can throw into
// the game.
import type { Sim, SimEvent } from '@/sim/types';
import type { Season } from '@/sim/types/ids';
import { calendarNow } from '@/sim/environment/calendar';
import { TICKS_PER_SECOND } from '@/sim/time';
import { createLogger } from '@/core';
import type { AlertLevel } from '@/sim/types/ids/progression';
import { AlertSoundGate } from './alertGate';
import { SPEECH_CHECKED_FILES } from './assetIds';
import { browserContextHost, ContextManager, type AudioStatus, type ContextHost } from './context';
import type { AudioBytesSource } from './engine/buffers';
import type { CueLogEntry } from './engine/cueLog';
import { FootstepDriver } from './footsteps';
import type { MixSettings } from './mix';
import { AudioRuntime, type RuntimeFrame } from './runtime';
import { newAmbienceInput, releaseListener, updateAmbienceInput, updateListener, type CameraLike } from './simAdapter';
import { AMBIENCE, CONTEXT, UI_SOUND } from './tuning';
import { installUiSounds, type DelegationTarget } from './uiDelegation';
import type { UiSoundId } from './uiSounds';

const log = createLogger('audio');

/** The game settings the audio reads (src/game/settings: one store, these names). */
export interface AudioSettingsShape {
  audio: MixSettings & { distantVoices: boolean; muteWhenHidden: boolean; mono: boolean };
  gameplay: { milestoneNotices: 'full' | 'quiet' | 'off' };
}
export interface AudioSettingsSource {
  get(): AudioSettingsShape;
  subscribe(fn: (s: AudioSettingsShape, changed: string[]) => void): () => void;
}

/** Asset access: the asset loader (bytes) and its manifest (speech-check marks). */
export interface AudioAssets extends AudioBytesSource {
  manifest?: { assets: Map<string, { speechCheck?: unknown } & object> } | null;
}

export interface AudioSystemOptions {
  assets: AudioAssets | null;
  settings: AudioSettingsSource;
  /** ?test=1: never creates an AudioContext (GDD 08 §13.1, App. E 15). */
  testMode: boolean;
  /** Where trusted gestures are listened for (window); null = none (tests). */
  gestureTarget?: DelegationTarget | null;
  /** UI root for delegated interface sounds (document); null = none. */
  uiRoot?: DelegationTarget | null;
  /** Visibility source (document); null = never hidden. */
  visibility?: { readonly hidden: boolean; addEventListener(t: 'visibilitychange', f: () => void): void; removeEventListener(t: 'visibilitychange', f: () => void): void } | null;
  host?: ContextHost;
}

/** One rendered frame, as the game hands it over. */
export interface AudioFrame {
  dt: number;
  sim: Sim | null;
  camera: CameraLike;
  focus: { x: number; y: number; z: number } | null;
  possessedId: number;
  view: string;
  underground: boolean;
  paused: boolean;
  hudHidden: boolean;
}

export class AudioSystem {
  private readonly mgr: ContextManager;
  private rt: AudioRuntime | null = null;
  private sim: Sim | null = null;
  private offSim: (() => void) | null = null;
  private queue: SimEvent[] = [];
  private readonly gate = new AlertSoundGate();
  private readonly steps = new FootstepDriver();
  private readonly ambIn = newAmbienceInput();
  private ambAge = Infinity;
  private lastView = '';
  private lastAlarmAt = -Infinity;
  private realNow = 0;
  private hudHidden = false;
  private criticalRepeats: { id: number; at: number }[] = [];
  private hiddenSince = -1;
  /** Last frame handed to the runtime (re-used to schedule ahead when the tab hides). */
  private lastRtFrame: RuntimeFrame | null = null;
  /** idle() ran since the last frame(): the world has been faded out. */
  private idling = false;
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly opts: AudioSystemOptions) {
    this.mgr = new ContextManager(opts.host ?? browserContextHost(), (ctx) => this.onRunning(ctx), (s) => log.info(`status ${s}`));
    if (opts.testMode) return;
    const g = opts.gestureTarget;
    if (g) {
      const onGesture = (e: Event) => { if ((e as Event & { isTrusted?: boolean }).isTrusted !== false) this.mgr.gesture(); };
      const o = { capture: true, passive: true };
      g.addEventListener('pointerdown', onGesture, o);
      g.addEventListener('keydown', onGesture, o);
      this.disposers.push(() => { g.removeEventListener('pointerdown', onGesture, o); g.removeEventListener('keydown', onGesture, o); });
    }
    if (opts.uiRoot) this.disposers.push(installUiSounds(opts.uiRoot, (id) => this.ui(id)));
    const v = opts.visibility;
    if (v) {
      const onVis = () => this.onVisibility(v.hidden);
      v.addEventListener('visibilitychange', onVis);
      this.disposers.push(() => v.removeEventListener('visibilitychange', onVis));
    }
    this.disposers.push(opts.settings.subscribe((s, changed) => { if (changed.some((c) => c.startsWith('audio'))) this.applySettings(s); }));
  }

  status(): AudioStatus { return this.opts.testMode ? 'off' : this.mgr.status; }

  /** Explicit "click to enable sound" (Settings > Audio status line; GDD 08 App. B `audioEnable`). */
  enable(): void { if (!this.opts.testMode) this.mgr.enable(); }

  /** The runtime once sound is running (demo / debug); null before. */
  get runtime(): AudioRuntime | null { return this.rt; }

  private onRunning(ctx: AudioContext): void {
    try {
      this.rt = new AudioRuntime(ctx, { bytes: this.opts.assets });
      this.applySettings(this.opts.settings.get());
      void this.rt.preloadEffects();
    } catch (e) {
      log.warn(`audio runtime failed: ${(e as Error).message}`);
      this.rt = null;
    }
  }

  private applySettings(s: AudioSettingsShape): void {
    this.rt?.applySettings({ ...s.audio });
    if (this.hiddenSince >= 0 && !s.audio.muteWhenHidden) this.rt?.graph.setHidden(false);
  }

  private onVisibility(hidden: boolean): void {
    if (!this.rt) return;
    if (hidden) {
      this.hiddenSince = this.realNow;
      if (this.opts.settings.get().audio.muteWhenHidden) this.rt.graph.setHidden(true);
      else this.scheduleThroughHidden();
      // suspend after 5 real s hidden (rAF stops while hidden, so use a timer)
      const at = this.hiddenSince;
      setTimeout(() => { if (this.hiddenSince === at) this.mgr.suspend(); }, CONTEXT.suspendAfterHiddenS * 1000);
    } else {
      this.hiddenSince = -1;
      this.mgr.resume();
      this.rt.graph.setHidden(false);
    }
  }

  /**
   * Heard while hidden ("Mute when hidden" off): rAF stops, so schedule loops and grains once far enough ahead to
   * cover the time until the context is suspended (§13.1), instead of letting file beds run out mid-loop.
   */
  private scheduleThroughHidden(): void {
    const rt = this.rt, f = this.lastRtFrame;
    if (!rt || !f) return;
    try { rt.update(0, f, CONTEXT.suspendAfterHiddenS + 1); } catch (e) { log.warn(`audio hide scheduling failed: ${(e as Error).message}`); }
  }

  /** A new game started: listen to its events. */
  attachSim(sim: Sim): void {
    this.detachSim();
    this.sim = sim;
    this.offSim = sim.events.onAny((_t, e) => { if (this.rt) this.queue.push(e as SimEvent); });
    this.gate.reset();
    this.steps.reset();
    this.ambAge = Infinity;
  }

  detachSim(): void {
    this.offSim?.();
    this.offSim = null;
    this.sim = null;
    this.queue.length = 0;
    this.lastRtFrame = null;
    if (!this.rt) return;
    this.rt.giants.stopAll();
    this.rt.ambience.stopAll();
    releaseListener(this.rt.listener); // the listener outlives the game: drop its probes of the old world
  }

  /** Interface sound (GDD 08 §13.8); the UI facade calls this. */
  ui(id: UiSoundId): void {
    try { this.rt?.ui.play(id); } catch { /* never disturb the UI */ }
  }

  /**
   * Per rendered frame outside play (title, loading, epitaph): the world fades out (ambience to silence, giant
   * events stop, no new music), interface sounds keep working. Sim events of a finished game are dropped.
   */
  idle(dt: number): void {
    this.realNow += dt;
    this.queue.length = 0;
    const rt = this.rt;
    if (!rt) return;
    try {
      if (!this.idling) { this.idling = true; rt.giants.stopAll(); }
      const f: RuntimeFrame = { ambience: null, paused: false, criticalActive: false, calmS: 0, season: rt.ui.season, combat: false, musicMode: 'off' };
      this.lastRtFrame = f;
      rt.update(dt, f);
    } catch (e) {
      log.warn(`audio idle frame failed: ${(e as Error).message}`);
    }
  }

  /** Per rendered frame. Cheap no-op until the context runs. */
  frame(f: AudioFrame): void {
    this.realNow += f.dt;
    this.idling = false;
    const rt = this.rt;
    if (!rt) { this.queue.length = 0; return; }
    try {
      this.hudHidden = f.hudHidden;
      const sim = f.sim ?? this.sim;
      let season: Season = 'spring';
      if (sim) {
        updateListener(sim, { camera: f.camera, focus: f.focus, possessedId: f.possessedId, possessView: f.view === 'possess', underground: f.underground }, rt.listener);
        season = calendarNow(sim).season;
        this.drainEvents(sim, rt);
        if (!f.paused) this.steps.update(sim, f.view === 'possess' ? f.possessedId : -1, rt.listener.hear, f.dt, (pos, m) => rt.cues.cue('step', pos, 1, m));
        this.ambAge += f.dt;
        if (this.ambAge >= AMBIENCE.refreshS) {
          this.ambAge = 0;
          const chamber = f.possessedId >= 0 ? sim.stores.ants.get(f.possessedId)?.chamberId ?? -1 : -1;
          updateAmbienceInput(sim, rt.listener, this.voicesAllowed(), chamber, this.ambIn);
        }
        if (f.view === 'colony' && this.lastView !== 'colony') rt.musicTrigger('colony-view');
      }
      this.lastView = f.view;
      this.repeatCriticals(sim);
      const s = this.opts.settings.get().audio;
      const rf: RuntimeFrame = {
        ambience: sim ? this.ambIn : null, paused: f.paused, criticalActive: !!sim && criticalActive(sim),
        calmS: this.realNow - this.lastAlarmAt, season, combat: !!sim && possessedInCombat(sim, f.possessedId), musicMode: s.musicMode,
      };
      this.lastRtFrame = rf;
      rt.update(f.dt, rf);
    } catch (e) {
      log.warn(`audio frame failed: ${(e as Error).message}`);
    }
  }

  private voicesAllowed(): boolean {
    if (!this.opts.settings.get().audio.distantVoices) return false;
    const m = this.opts.assets?.manifest;
    return SPEECH_CHECKED_FILES.every((id) => m?.assets.get(id)?.speechCheck === 'passed');
  }

  private drainEvents(sim: Sim, rt: AudioRuntime): void {
    const q = this.queue;
    this.queue = [];
    for (const e of q) {
      try { this.handleEvent(sim, rt, e); } catch (err) {
        log.warn(`audio event ${e.type} failed: ${(err as Error).message}`); // one bad event must not drop the rest
      }
    }
  }

  private handleEvent(sim: Sim, rt: AudioRuntime, e: SimEvent): void {
    switch (e.type) {
      case 'cue': rt.cues.cue(e.cue, e.pos, e.strength); break;
      case 'human.telegraph': {
        const speed = Math.max(1, sim.state.env.time.speed);
        rt.giants.telegraph(e.instId, e.kind, e.origin, (e.impactTick - sim.state.tick) / TICKS_PER_SECOND / speed);
        break;
      }
      case 'human.start': rt.giants.start(e.instId, e.kind, e.variant); break;
      case 'human.impact': rt.giants.impact(e.instId, e.kind, e.footprint); break;
      case 'human.end': case 'human.cancelled': rt.giants.end(e.instId); break;
      case 'weather.thunder': rt.giants.thunder(e.delayS, e.intensity); break;
      case 'alert': this.onAlert(sim, rt, e.op, e.alert.kind, e.alert.subjectId, e.alert.level, e.alert.id); break;
      case 'milestone.reached': this.onMilestone(rt); break;
      case 'time.phase': if (e.phase === 'dawn' || e.phase === 'dusk') rt.musicTrigger(e.phase); break;
      case 'opening.handover': case 'overwinter.end': rt.musicTrigger('timelapse-end'); break;
      default: break;
    }
  }

  private onAlert(sim: Sim, rt: AudioRuntime, op: 'raise' | 'update' | 'clear', kind: string, subjectId: number, level: AlertLevel, id: number): void {
    const play = this.gate.decide({ op, kind, subjectId, level }, this.realNow, sim.state.tick, this.hudHidden);
    if (op !== 'clear' && (level === 'warning' || level === 'critical')) this.lastAlarmAt = this.realNow;
    if (!play) return;
    rt.ui.play(`alert-${play}` as UiSoundId);
    if (play === 'critical') this.criticalRepeats.push({ id, at: this.realNow + UI_SOUND.criticalRepeatS });
  }

  /** §13.8: a critical alert repeats once after 4 real s if still unacknowledged, never more. */
  private repeatCriticals(sim: Sim | null): void {
    if (!this.criticalRepeats.length || !this.rt) return;
    const due = this.criticalRepeats.filter((r) => r.at <= this.realNow);
    if (!due.length) return;
    this.criticalRepeats = this.criticalRepeats.filter((r) => r.at > this.realNow);
    for (const r of due) {
      const a = sim?.state.progression.alerts.find((x) => x.id === r.id);
      if (a && !a.acknowledged) this.rt.ui.play('alert-critical');
    }
  }

  private onMilestone(rt: AudioRuntime): void {
    const mode = this.opts.settings.get().gameplay.milestoneNotices;
    if (mode !== 'off') rt.ui.play('milestone', mode === 'quiet' ? UI_SOUND.milestoneQuietDb : 0);
    rt.musicTrigger('milestone');
  }

  cueLog(): CueLogEntry[] { return this.rt?.log.list() ?? []; }

  /** Debug read-out (status, buses, ambience sources and surface filter, voices, giants, decode failures). */
  debug(): Record<string, unknown> {
    const rt = this.rt;
    if (!rt) return { status: this.status() };
    return {
      status: this.status(),
      buses: rt.graph.gains,
      ducking: rt.graph.ducking,
      listener: { underground: rt.listener.underground, depthBu: rt.listener.depthBu },
      ambience: { sources: rt.ambience.sources(), surface: rt.ambience.surfaceFilter(), playgroundSource: rt.ambienceTarget().playgroundSource, layers: rt.ambienceTarget().layers },
      voices: { active: rt.cues.voices.active, stats: rt.cues.voices.stats, live: rt.cues.liveCount },
      giants: rt.giants.kinds(),
      missing: rt.bank.missingIds,
      musicPlaying: rt.musicPlaying,
    };
  }

  dispose(): void {
    for (const d of this.disposers.splice(0)) d();
    this.detachSim();
    this.rt?.stopAll();
    this.rt?.graph.dispose();
    this.rt = null;
    this.mgr.close();
  }
}

function criticalActive(sim: Sim): boolean {
  for (const a of sim.state.progression.alerts) if (a.level === 'critical' && !a.acknowledged) return true;
  return false;
}

function possessedInCombat(sim: Sim, id: number): boolean {
  return id >= 0 && !!sim.stores.ants.get(id)?.combat;
}
