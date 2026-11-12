// Everything that sounds, on one BaseAudioContext: the mix graph, buffers, ambience, positional effects, giants,
// UI and music. It knows nothing about the game or browser lifecycle, so the same runtime runs on a live
// AudioContext (AudioSystem) and on an OfflineAudioContext (demo page, harness analysis).
import type { Season } from '@/sim/types/ids';
import { ALL_BED_IDS, ALL_SFX_IDS } from './assetIds';
import { computeAmbience, newAmbienceTarget, type AmbienceInput, type AmbienceTarget } from './ambience/matrix';
import { AmbiencePlayer } from './ambience/player';
import { CueLog } from './engine/cueLog';
import { CuePlayer } from './engine/cuePlayer';
import { BufferBank, type AudioBytesSource } from './engine/buffers';
import { MixGraph } from './engine/graph';
import { GiantDirector } from './giants';
import { newListener, type Listener } from './listener';
import type { MixSettings } from './mix';
import { composePhrase, MusicDirector, type MusicTrigger } from './music/compose';
import { playPhrase } from './music/player';
import { AudioRng } from './rng';
import { SynthKit } from './synth/kit';
import { AMBIENCE } from './tuning';
import { UiSounds } from './uiSounds';

const BEDS = new Set<string>(ALL_BED_IDS);

export interface RuntimeOptions {
  bytes: AudioBytesSource | null;
  destination?: AudioNode;
  seed?: number;
  /** Positional voice limit (default AUDIO_MAX_VOICES; the demo's CPU bench raises it to 32). */
  maxVoices?: number;
}

export interface RuntimeFrame {
  /** Ambience inputs; null = no world (title screen): ambience fades out. */
  ambience: AmbienceInput | null;
  paused: boolean;
  /** An unacknowledged critical alert is active (music ducks). */
  criticalActive: boolean;
  /** Real seconds since the last warning / critical alert (music calm trigger). */
  calmS: number;
  season: Season;
  /** The possessed ant is in combat: music never plays. */
  combat: boolean;
  musicMode: MixSettings['musicMode'];
}

export class AudioRuntime {
  readonly graph: MixGraph;
  readonly kit: SynthKit;
  readonly bank: BufferBank;
  readonly log = new CueLog();
  readonly cues: CuePlayer;
  readonly ambience: AmbiencePlayer;
  readonly giants: GiantDirector;
  readonly ui: UiSounds;
  readonly listener: Listener = newListener();
  private readonly director: MusicDirector;
  private readonly musicRng: AudioRng;
  private target: AmbienceTarget = newAmbienceTarget();
  private ambienceAge = Infinity;
  private paused = false;
  private silentTarget = newAmbienceTarget();
  musicPlaying = false;
  private musicEnds = 0;

  constructor(readonly ctx: BaseAudioContext, opts: RuntimeOptions) {
    const seed = opts.seed ?? 1;
    this.graph = new MixGraph(ctx, opts.destination);
    this.kit = new SynthKit(ctx, seed);
    this.bank = new BufferBank(ctx, opts.bytes, (id) => BEDS.has(id));
    const env = { kit: this.kit, bank: this.bank };
    const l = () => this.listener;
    this.cues = new CuePlayer(env, this.graph, this.log, l, opts.maxVoices);
    this.ambience = new AmbiencePlayer(this.kit, this.bank, this.graph.buses.ambience);
    this.giants = new GiantDirector(this.kit, this.bank, this.graph, this.cues, l, this.log);
    this.ui = new UiSounds(env, this.graph.buses.ui, this.log);
    this.musicRng = new AudioRng(seed * 7 + 3);
    this.director = new MusicDirector(this.musicRng);
  }

  applySettings(s: MixSettings & { mono?: boolean }): void { this.graph.applySettings(s); }

  /** Decode every effect file in the background (§13.1: SFX after the context starts; beds on demand). */
  preloadEffects(): Promise<void> { return this.bank.preload(ALL_SFX_IDS); }

  /** Per frame. `horizonS`: how far ahead loops and grains are scheduled. */
  update(dtS: number, f: RuntimeFrame, horizonS = 0.25): void {
    if (f.paused !== this.paused) { this.paused = f.paused; this.graph.setPaused(f.paused); }
    this.graph.setDuck(this.giants.active, f.criticalActive);
    this.ambienceAge += dtS;
    if (this.ambienceAge >= AMBIENCE.refreshS || dtS === 0) {
      this.ambienceAge = 0;
      if (f.ambience) {
        f.ambience.childrenActive = f.ambience.childrenActive || this.giants.childrenActive();
        this.ambience.update(computeAmbience(f.ambience, this.target), horizonS + AMBIENCE.refreshS);
      } else this.ambience.update(this.silentTarget, horizonS + AMBIENCE.refreshS);
    }
    this.cues.update(horizonS);
    this.giants.update(horizonS);
    this.ui.season = f.season;
    this.updateMusic(f);
  }

  private updateMusic(f: RuntimeFrame): void {
    const now = this.ctx.currentTime;
    this.musicPlaying = now < this.musicEnds;
    if (this.paused || this.musicPlaying) return;
    const why = this.director.update(now, { mode: f.musicMode, blocked: f.combat || this.giants.active, calmS: f.calmS });
    if (why) this.playMusic(f.season, f.musicMode, why);
  }

  /** Starts a phrase now (the demo calls it directly). */
  playMusic(season: Season, mode: MixSettings['musicMode'], why: string): number {
    const now = this.ctx.currentTime;
    const p = composePhrase(season, this.musicRng);
    playPhrase(this.kit, this.graph.buses.music, now + 0.05, p);
    this.director.started(now, p.lengthS, mode);
    this.musicEnds = now + p.lengthS;
    this.log.push({ t: now, cue: `music.${why}`, bus: 'music', gainDb: 0, source: `synth:phrase(${p.notes.length})`, distBu: 0 });
    return p.lengthS;
  }

  musicTrigger(kind: MusicTrigger): void { this.director.note(kind, this.ctx.currentTime); }

  ambienceTarget(): AmbienceTarget { return this.target; }

  stopAll(): void {
    this.cues.stopAll();
    this.giants.stopAll();
    this.ambience.stopAll();
  }
}
