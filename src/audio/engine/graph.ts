// The mix graph (GDD 08 §13.2): ambience / effects / giants / ui / music buses, ducking, a pause fade on the world
// buses, master volume, the tab-hidden fade, a brick-wall limiter at -1 dBFS, optional mono, and an analyser tap.
//
//   ambience -> duckA ┐
//   effects ──────────┼-> world (pause fade) ┐
//   giants ───────────┤                       ├-> master -> hide -> limiter -> mono -> destination
//   music  -> duckM  ┘                        │                           └-> analyser (tap)
//   ui ───────────────────────────────────────┘
import { busGains, dbToGain, type MixSettings } from '../mix';
import { CONTEXT, DUCK, LIMITER, type BusId } from '../tuning';

export class MixGraph {
  readonly buses: Record<Exclude<BusId, 'master'>, GainNode>;
  readonly master: GainNode;
  readonly analyser: AnalyserNode;
  private readonly duckAmb: GainNode;
  private readonly duckMusic: GainNode;
  private readonly world: GainNode;
  private readonly hide: GainNode;
  private readonly mono: GainNode;
  readonly limiter: DynamicsCompressorNode;
  private duckState = { giant: false, critical: false };
  /** Last applied linear bus gains (debug read-out). */
  gains: Record<BusId, number> = { master: 1, ambience: 1, effects: 1, giants: 1, ui: 1, music: 1 };

  constructor(readonly ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    const g = () => ctx.createGain();
    this.buses = { ambience: g(), effects: g(), giants: g(), ui: g(), music: g() };
    this.duckAmb = g();
    this.duckMusic = g();
    this.world = g();
    this.master = g();
    this.hide = g();
    this.mono = g();
    this.limiter = ctx.createDynamicsCompressor();
    const l = this.limiter;
    l.threshold.value = LIMITER.thresholdDb;
    l.knee.value = LIMITER.kneeDb;
    l.ratio.value = LIMITER.ratio;
    l.attack.value = LIMITER.attackS;
    l.release.value = LIMITER.releaseS;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.buses.ambience.connect(this.duckAmb).connect(this.world);
    this.buses.effects.connect(this.world);
    this.buses.giants.connect(this.world);
    this.buses.music.connect(this.duckMusic).connect(this.world);
    this.world.connect(this.master);
    this.buses.ui.connect(this.master);
    this.master.connect(this.hide).connect(l).connect(this.mono).connect(destination);
    this.mono.connect(this.analyser);
  }

  /** Bus volumes from the settings (slider law, mute, music off). Smoothed over 50 ms. */
  applySettings(s: MixSettings & { mono?: boolean }): void {
    this.gains = busGains(s);
    const t = this.ctx.currentTime;
    for (const id of Object.keys(this.buses) as (keyof MixGraph['buses'])[]) this.buses[id].gain.setTargetAtTime(this.gains[id], t, 0.05);
    this.master.gain.setTargetAtTime(this.gains.master, t, 0.05);
    this.setMono(!!s.mono);
  }

  /** Mono: an explicit 1-channel node downmixes left and right (Settings > Audio > Mono). */
  setMono(on: boolean): void {
    this.mono.channelCount = on ? 1 : 2;
    this.mono.channelCountMode = on ? 'explicit' : 'max';
    this.mono.channelInterpretation = 'speakers';
  }

  /** Ducking (§13.2): ambience under giant events, music under giants and critical alerts. */
  setDuck(giant: boolean, critical: boolean): void {
    if (giant === this.duckState.giant && critical === this.duckState.critical) return;
    const t = this.ctx.currentTime;
    const tau = (on: boolean) => (on ? DUCK.attackS : DUCK.releaseS) / 3;
    if (giant !== this.duckState.giant) this.duckAmb.gain.setTargetAtTime(giant ? dbToGain(DUCK.ambienceUnderGiantDb) : 1, t, tau(giant));
    const musicDb = (critical ? DUCK.musicUnderCriticalDb : 0) + (giant ? DUCK.musicUnderGiantDb : 0);
    this.duckMusic.gain.setTargetAtTime(dbToGain(musicDb), t, tau(giant || critical));
    this.duckState = { giant, critical };
  }

  /** Game paused: the world buses fade out (UI keeps sounding). */
  setPaused(paused: boolean): void {
    this.world.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, CONTEXT.pauseFadeS / 3);
  }

  /** Tab hidden with "mute when hidden": master fades to silence over 300 ms. */
  setHidden(hidden: boolean): void {
    this.hide.gain.setTargetAtTime(hidden ? 0 : 1, this.ctx.currentTime, CONTEXT.hideFadeS / 3);
  }

  get ducking(): { giant: boolean; critical: boolean } { return { ...this.duckState }; }

  dispose(): void {
    try { this.mono.disconnect(); this.master.disconnect(); } catch { /* context already closed */ }
  }
}
