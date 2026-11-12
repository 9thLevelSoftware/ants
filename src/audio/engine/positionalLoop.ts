// A long positional sound (giant event loops: mower, vacuum, hose): a crossfading file loop, or a synth shot
// re-triggered with overlap when the file is missing. Gain, pan and occlusion follow the listener every frame,
// smoothed; line-of-sight is re-traced every 0.25 real s (§13.3).
import type { Vec3 } from '@/core/math/vec3';
import { dbToGain } from '../mix';
import type { Listener } from '../listener';
import { newSpatial, spatialize, type TraceBudget } from '../spatial';
import type { SpaceClass } from '../cueTable';
import type { ShotRecipe, SynthKit } from '../synth/kit';
import { LOS_OCCLUSION } from '../tuning';
import type { LoopPlayer } from './loopPlayer';

export interface SynthLoop { recipe: ShotRecipe; pieceS: number; overlapS: number; rate: number }

export class PositionalLoop {
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly out: GainNode;
  private nextPiece = 0;
  private lastTrace = -Infinity;
  private occl = { cutoffHz: 20000, db: 0 };
  private stopped = false;
  private readonly sp = newSpatial();
  readonly pos: Vec3;

  constructor(private readonly kit: SynthKit, bus: AudioNode, private readonly loop: LoopPlayer | null, private readonly synth: SynthLoop | null,
    pos: Vec3, private readonly space: SpaceClass, gainDb: number, fadeInS: number, bandHz: [number, number] | null = null) {
    const ctx = kit.ctx;
    this.pos = { ...pos };
    this.out = ctx.createGain();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.pan = ctx.createStereoPanner();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(dbToGain(gainDb), ctx.currentTime + fadeInS);
    let head: AudioNode = this.out;
    if (bandHz) {
      const hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = bandHz[0];
      lp.type = 'lowpass'; lp.frequency.value = bandHz[1];
      head = head.connect(hp).connect(lp);
    }
    head.connect(this.gain).connect(this.filter).connect(this.pan).connect(bus);
    if (loop) loop.output.connect(this.out);
    this.nextPiece = ctx.currentTime;
  }

  /** Glide the loop's own level (warning phase -> main phase). */
  setLevel(gainDb: number, fadeS: number): void {
    if (this.stopped) return;
    const now = this.kit.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(dbToGain(gainDb), now + fadeS);
  }

  setPos(p: Vec3): void { this.pos.x = p.x; this.pos.y = p.y; this.pos.z = p.z; }

  /** Follow the listener; keep the source fed until `now + horizonS`. */
  update(l: Listener, budget: TraceBudget, horizonS: number): void {
    if (this.stopped) return;
    const now = this.kit.ctx.currentTime;
    const retrace = now - this.lastTrace >= LOS_OCCLUSION.refreshS;
    const sp = spatialize(l, this.space, this.pos, retrace ? budget : null, this.sp);
    if (sp.traced) { this.lastTrace = now; this.occl.cutoffHz = sp.cutoffHz; this.occl.db = sp.occlusionDb; }
    const tau = LOS_OCCLUSION.smoothS / 3;
    const cutoff = sp.traced || !retrace ? sp.cutoffHz : Math.min(sp.cutoffHz, this.occl.cutoffHz);
    this.gain.gain.setTargetAtTime(sp.audible ? sp.gain : 0, now, tau);
    this.filter.frequency.setTargetAtTime(cutoff, now, tau);
    this.pan.pan.setTargetAtTime(sp.pan, now, tau);
    if (this.loop) this.loop.pump(now + horizonS);
    else if (this.synth) {
      while (this.nextPiece < now + horizonS) {
        this.synth.recipe(this.kit, this.out, this.nextPiece, { gain: 1, rate: this.synth.rate, strength: 1, durS: this.synth.pieceS });
        this.nextPiece += this.synth.pieceS - this.synth.overlapS;
      }
    }
  }

  stop(fadeS: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.kit.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fadeS);
    this.loop?.stop(now, fadeS);
    setTimeoutSafe(() => { try { this.pan.disconnect(); } catch { /* ignore */ } }, (fadeS + 0.2) * 1000);
  }

  get active(): boolean { return !this.stopped; }
}

/** setTimeout when it exists (offline renders in Node tests have no timers worth waiting for). */
function setTimeoutSafe(fn: () => void, ms: number): void {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
}
