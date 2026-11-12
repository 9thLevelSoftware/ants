// Seamless crossfading loop player over one AudioBuffer (plan in loopSchedule.ts). pump(until) keeps segments
// scheduled ahead; each segment is its own source with equal-power fade curves, so the files' loop-point defects
// (~5 ms dropout, encoder delay) are never played.
import { equalPowerCurve, firstSegment, nextSegment, type LoopSegment } from '../loopSchedule';
import { LOOP } from '../tuning';

const curves = new Map<string, Float32Array>();
function curve(fadeIn: boolean): Float32Array {
  const key = fadeIn ? 'in' : 'out';
  let c = curves.get(key);
  if (!c) { c = equalPowerCurve(LOOP.curvePoints, fadeIn); curves.set(key, c); }
  return c;
}

export class LoopPlayer {
  private last: LoopSegment;
  private live: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  private stopped = false;
  readonly output: GainNode;

  constructor(private readonly ctx: BaseAudioContext, private readonly buffer: AudioBuffer, when: number, offset01: number, fadeInS: number, private readonly rate = 1) {
    this.output = ctx.createGain();
    this.last = firstSegment(buffer.duration, LOOP, when, offset01, fadeInS);
    this.play(this.last);
  }

  private play(s: LoopSegment): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    const g = this.ctx.createGain();
    // real time scales with the playback rate
    const dur = s.duration / this.rate, fin = s.fadeInS / this.rate, fout = s.fadeOutS / this.rate;
    g.gain.setValueCurveAtTime(curve(true), s.when, Math.max(1e-3, fin));
    g.gain.setValueCurveAtTime(curve(false), s.when + dur - fout, Math.max(1e-3, fout));
    src.connect(g).connect(this.output);
    src.start(s.when, s.offset, s.duration);
    const rec = { src, gain: g };
    this.live.push(rec);
    src.onended = () => {
      const i = this.live.indexOf(rec);
      if (i >= 0) this.live.splice(i, 1);
      try { g.disconnect(); } catch { /* ignore */ }
    };
  }

  /** Schedules segments that begin before `until` (context time). */
  pump(until: number): void {
    if (this.stopped) return;
    for (let guard = 0; guard < 64; guard++) {
      const nextWhen = this.last.when + (this.last.duration - this.last.fadeOutS) / this.rate;
      if (nextWhen > until) break;
      const n = nextSegment(this.buffer.duration, LOOP, this.last);
      n.when = nextWhen;
      this.last = n;
      this.play(n);
    }
  }

  /** Fades out over `fadeS` from `t` and stops every source. */
  stop(t: number, fadeS = 0.5): void {
    if (this.stopped) return;
    this.stopped = true;
    const g = this.output.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fadeS);
    for (const { src } of this.live) { try { src.stop(t + fadeS + 0.05); } catch { /* not started */ } }
  }

  get active(): boolean { return !this.stopped; }
}
