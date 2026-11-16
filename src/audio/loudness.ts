// Loudness measurement for offline renders (ITU-R BS.1770-4 / EBU R128), pure over Float32Array channels so it runs
// in Node tests and in the browser demo alike. K-weighting is the two-stage pre-filter (a high shelf and the RLB
// high-pass), coefficients derived for any sample rate; blocks are 400 ms with 75 % overlap; integrated loudness
// uses the absolute gate (-70 LUFS) and the relative gate (-10 LU below the absolute-gated mean).
// Also: short-term loudness (3 s windows) and the true peak (4x oversampled, windowed-sinc).

/** LUFS reported for silence. */
export const SILENCE_LUFS = -Infinity;

const ABS_GATE_LUFS = -70;
const REL_GATE_LU = -10;
const BLOCK_S = 0.4;
const HOP_S = 0.1;
const SHORT_TERM_S = 3;
const OFFSET = -0.691;

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** Stage 1: high shelf (+4 dB above ~1.7 kHz), the head-related part of the K-weighting. */
export function shelfCoefficients(fs: number): Biquad {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

/** Stage 2: the RLB high-pass (about 38 Hz). */
export function highPassCoefficients(fs: number): Biquad {
  const f0 = 38.13547087602444, Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}

function biquad(x: Float32Array, c: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = yi;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

/** K-weighted copy of a channel. */
export function kWeight(x: Float32Array, fs: number): Float64Array {
  const s1 = biquad(x, shelfCoefficients(fs));
  // second stage on the float64 result (copied into Float32 would lose precision at very low levels)
  const c = highPassCoefficients(fs);
  const y = new Float64Array(s1.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < s1.length; i++) {
    const xi = s1[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = yi;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

const toLufs = (z: number): number => (z > 0 ? OFFSET + 10 * Math.log10(z) : SILENCE_LUFS);

/**
 * Mean-square energy per window of `windowS` seconds, hop `hopS`, summed over channels (all channel weights are 1:
 * left and right). `from`/`to` are sample bounds.
 */
function windowEnergies(weighted: Float64Array[], fs: number, windowS: number, hopS: number, from: number, to: number): number[] {
  const win = Math.round(windowS * fs), hop = Math.round(hopS * fs);
  if (win < 1 || hop < 1) return []; // a zero-length window or hop would never advance
  const n = weighted.length;
  // prefix sums of squares per channel make every window O(channels)
  const sq = weighted.map((w) => {
    const p = new Float64Array(to - from + 1);
    for (let i = from; i < to; i++) p[i - from + 1] = p[i - from] + w[i] * w[i];
    return p;
  });
  const out: number[] = [];
  for (let s = 0; s + win <= to - from; s += hop) {
    let z = 0;
    for (let c = 0; c < n; c++) z += (sq[c][s + win] - sq[c][s]) / win;
    out.push(z);
  }
  return out;
}

export interface LoudnessOptions {
  /** Measure from this time, s (skip a fade-in). */
  fromS?: number;
  /** Measure up to this time, s. */
  toS?: number;
}

function bounds(len: number, fs: number, o: LoudnessOptions): [number, number] {
  const from = Math.max(0, Math.floor((o.fromS ?? 0) * fs));
  const to = Math.min(len, Math.floor((o.toS ?? Infinity) * fs));
  return [from, Math.max(from, to)];
}

/** Integrated loudness, LUFS (BS.1770-4: 400 ms blocks, 75 % overlap, absolute then relative gate). */
export function integratedLoudness(channels: Float32Array[], fs: number, o: LoudnessOptions = {}): number {
  if (channels.length === 0) return SILENCE_LUFS;
  const [from, to] = bounds(channels[0].length, fs, o);
  const weighted = channels.map((c) => kWeight(c, fs));
  const z = windowEnergies(weighted, fs, BLOCK_S, HOP_S, from, to);
  const absGated = z.filter((e) => toLufs(e) > ABS_GATE_LUFS);
  if (absGated.length === 0) return SILENCE_LUFS;
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const relGate = toLufs(mean(absGated)) + REL_GATE_LU;
  const gated = absGated.filter((e) => toLufs(e) > relGate);
  return gated.length === 0 ? SILENCE_LUFS : toLufs(mean(gated));
}

export interface ShortTerm {
  /** Loudness of each 3 s window, hop 100 ms, LUFS. */
  values: number[];
  max: number;
  /** Loudness of the whole range as one window (ungated): a plain K-weighted mean level. */
  meanLufs: number;
}

/** Short-term loudness (3 s windows). A buffer shorter than 3 s is measured as one window. */
export function shortTermLoudness(channels: Float32Array[], fs: number, o: LoudnessOptions = {}): ShortTerm {
  if (channels.length === 0) return { values: [], max: SILENCE_LUFS, meanLufs: SILENCE_LUFS };
  const [from, to] = bounds(channels[0].length, fs, o);
  const weighted = channels.map((c) => kWeight(c, fs));
  const span = (to - from) / fs;
  if (span <= 0) return { values: [], max: SILENCE_LUFS, meanLufs: SILENCE_LUFS }; // an empty range has no windows
  const win = Math.min(SHORT_TERM_S, span);
  const values = win > 0 ? windowEnergies(weighted, fs, win, HOP_S, from, to).map(toLufs) : [];
  const whole = windowEnergies(weighted, fs, span, span, from, to);
  return { values, max: values.length ? Math.max(...values) : SILENCE_LUFS, meanLufs: whole.length ? toLufs(whole[0]) : SILENCE_LUFS };
}

/** Taps per polyphase branch of the oversampling filter (windowed sinc, Hann). */
const TP_TAPS = 12;
const TP_OVERSAMPLE = 4;

/** True peak, dBFS: 4x oversampling with a 48-tap windowed-sinc interpolator (BS.1770-4 Annex 2 style). */
export function truePeakDb(channels: Float32Array[], o: { fromS?: number; toS?: number; fs?: number } = {}): number {
  const fs = o.fs ?? 48000;
  let peak = 0;
  const half = TP_TAPS / 2;
  // filter bank: phase p (1..3) interpolates between samples at offsets p/4
  const phases: Float64Array[] = [];
  for (let p = 1; p < TP_OVERSAMPLE; p++) {
    const h = new Float64Array(TP_TAPS);
    for (let k = 0; k < TP_TAPS; k++) {
      const x = k - half + 1 - p / TP_OVERSAMPLE; // distance from the interpolation point, in input samples
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (half + 1));
      h[k] = sinc * w;
    }
    phases.push(h);
  }
  for (const ch of channels) {
    const from = Math.max(0, Math.floor((o.fromS ?? 0) * fs)), to = Math.min(ch.length, Math.floor((o.toS ?? Infinity) * fs));
    for (let i = from; i < to; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
    // only samples near the sample peak can overshoot: refine around loud samples
    const thr = peak * 0.5;
    for (let i = Math.max(from, half); i < Math.min(to, ch.length) - half; i++) {
      if (Math.abs(ch[i]) < thr && Math.abs(ch[i + 1]) < thr) continue;
      for (const h of phases) {
        let s = 0;
        for (let k = 0; k < TP_TAPS; k++) s += h[k] * ch[i - half + 1 + k];
        const a = Math.abs(s);
        if (a > peak) peak = a;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** A full read-out of a render (what the demo prints). */
export interface LoudnessReport {
  integratedLufs: number;
  shortTermMaxLufs: number;
  truePeakDb: number;
}

export function measure(channels: Float32Array[], fs: number, o: LoudnessOptions = {}): LoudnessReport {
  return {
    integratedLufs: integratedLoudness(channels, fs, o),
    shortTermMaxLufs: shortTermLoudness(channels, fs, o).max,
    truePeakDb: truePeakDb(channels, { fs, ...o }),
  };
}

/**
 * Running short-term / momentary loudness of a live signal that arrives in chunks (the analyser tap, one chunk per
 * frame). The tap is a mono mix, so the channel energy is counted twice (a centred stereo signal reads as BS.1770
 * would read it; wide stereo reads up to a few LU low). Chunks that do not touch (frames further apart than the
 * analyser window) are measured as they are: the readout is a monitor, not a meter for mastering.
 */
export class RunningLoudness {
  private readonly shelf: Biquad;
  private readonly hp: Biquad;
  private s = [0, 0, 0, 0, 0, 0, 0, 0]; // x1 x2 y1 y2 for each stage
  private chunks: { sumSq: number; n: number }[] = [];
  private total = { sumSq: 0, n: 0 };

  constructor(private readonly fs: number) {
    this.shelf = shelfCoefficients(fs);
    this.hp = highPassCoefficients(fs);
  }

  /** Adds the last `n` samples of `window` (a time-domain window; n is clamped to its length). */
  push(window: Float32Array, n: number): void {
    const count = Math.max(0, Math.min(window.length, Math.round(n)));
    if (count === 0) return;
    const s = this.s, a = this.shelf, h = this.hp;
    let sumSq = 0;
    for (let i = window.length - count; i < window.length; i++) {
      const x = window[i];
      const y1 = a.b0 * x + a.b1 * s[0] + a.b2 * s[1] - a.a1 * s[2] - a.a2 * s[3];
      s[1] = s[0]; s[0] = x; s[3] = s[2]; s[2] = y1;
      const y2 = h.b0 * y1 + h.b1 * s[4] + h.b2 * s[5] - h.a1 * s[6] - h.a2 * s[7];
      s[5] = s[4]; s[4] = y1; s[7] = s[6]; s[6] = y2;
      sumSq += y2 * y2;
    }
    this.chunks.push({ sumSq, n: count });
    this.total.sumSq += sumSq;
    this.total.n += count;
    const keep = SHORT_TERM_S * this.fs;
    while (this.chunks.length > 1 && this.total.n - this.chunks[0].n >= keep) {
      const c = this.chunks.shift()!;
      this.total.sumSq -= c.sumSq;
      this.total.n -= c.n;
    }
  }

  /** Loudness of the last 3 s (fewer while it is filling), LUFS; -Infinity when nothing was pushed. */
  shortTerm(): number { return this.over(SHORT_TERM_S); }
  /** Loudness of the last 400 ms. */
  momentary(): number { return this.over(BLOCK_S); }

  private over(seconds: number): number {
    const want = seconds * this.fs;
    let sum = 0, n = 0;
    for (let i = this.chunks.length - 1; i >= 0 && n < want; i--) { sum += this.chunks[i].sumSq; n += this.chunks[i].n; }
    return n > 0 ? toLufs((2 * sum) / n) : SILENCE_LUFS;
  }

  reset(): void {
    this.s.fill(0);
    this.chunks.length = 0;
    this.total = { sumSq: 0, n: 0 };
  }
}
