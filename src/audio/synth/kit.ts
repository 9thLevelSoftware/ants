// Building blocks for synthesised sounds: noise buffers generated once per context, envelopes, filters and
// oscillators. Only plain Web Audio nodes (no AudioWorklet: it may be refused in sandboxed frames, §13.7).
import { AudioRng } from '../rng';

export type NoiseKind = 'white' | 'pink' | 'brown';

/** White noise in -1..1. */
export function fillWhite(a: Float32Array, rng: AudioRng): void {
  for (let i = 0; i < a.length; i++) a[i] = rng.next() * 2 - 1;
}

/** Pink noise (Paul Kellet's economy filter), normalised to about -1..1. */
export function fillPink(a: Float32Array, rng: AudioRng): void {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < a.length; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
}

/** Brown (red) noise: leaky integrated white noise, normalised to about -1..1. */
export function fillBrown(a: Float32Array, rng: AudioRng): void {
  let last = 0;
  for (let i = 0; i < a.length; i++) {
    last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
    a[i] = last * 3.5;
  }
}

/** Per-context synthesis kit. */
export class SynthKit {
  private noise = new Map<NoiseKind, AudioBuffer>();
  readonly rng: AudioRng;

  constructor(readonly ctx: BaseAudioContext, seed = 1234) {
    this.rng = new AudioRng(seed);
  }

  noiseBuffer(kind: NoiseKind): AudioBuffer {
    let b = this.noise.get(kind);
    if (!b) {
      const len = Math.round(this.ctx.sampleRate * 2);
      b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = b.getChannelData(0);
      const rng = new AudioRng(kind === 'white' ? 11 : kind === 'pink' ? 22 : 33);
      if (kind === 'white') fillWhite(data, rng); else if (kind === 'pink') fillPink(data, rng); else fillBrown(data, rng);
      this.noise.set(kind, b);
    }
    return b;
  }

  /** Looping noise source started at t from a random offset, stopped at t + dur. */
  noise(kind: NoiseKind, t: number, dur: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer(kind);
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, this.rng.next() * 1.9);
    if (Number.isFinite(dur)) s.stop(t + dur);
    return s;
  }

  osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    if (Number.isFinite(dur)) o.stop(t + dur);
    return o;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  gain(v = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  /** Attack-decay envelope on a gain node: 0 -> peak in `a` s, exponential-ish decay to silence over `d` s. */
  ad(t: number, peak: number, a: number, d: number): GainNode {
    const g = this.ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + Math.max(1e-4, a));
    p.setTargetAtTime(0, t + a, Math.max(1e-4, d / 4));
    p.setValueAtTime(0, t + a + d + 0.01);
    return g;
  }

  /** Attack-hold-release envelope. */
  ahr(t: number, peak: number, a: number, h: number, r: number): GainNode {
    const g = this.ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + Math.max(1e-4, a));
    p.setValueAtTime(peak, t + a + h);
    p.linearRampToValueAtTime(0, t + a + h + Math.max(1e-4, r));
    return g;
  }

  /** Connects nodes in series and returns the last one. */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i + 1 < nodes.length; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }
}

/** Parameters every one-shot recipe receives. */
export interface ShotParams {
  /** Linear peak gain. */
  gain: number;
  /** Pitch / speed factor (1 = nominal). */
  rate: number;
  /** Cue strength 0..1. */
  strength: number;
  /** Length for sustained shots (tremor, engine, vacuum, ...), s. */
  durS?: number;
  /** Note frequencies for melodic shots (milestone motif), Hz. */
  freqs?: number[];
}

/** A one-shot: builds its nodes into `out` starting at `t`; returns its length in seconds. */
export type ShotRecipe = (k: SynthKit, out: AudioNode, t: number, p: ShotParams) => number;
