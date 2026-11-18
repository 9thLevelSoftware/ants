// BS.1770-4 integrated loudness and an oversampled peak, for the renderers. This is a port of src/audio/loudness.ts
// (which cannot be imported from plain Node: it uses TypeScript parameter properties); src/audio/provenance.test.ts
// checks that the two agree.

const OFFSET = -0.691;

function shelf(fs) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}
function rlb(fs) {
  const f0 = 38.13547087602444, Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
}
function run(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}
export const kWeight = (x, fs) => run(run(x, shelf(fs)), rlb(fs));

const toLufs = (z) => (z > 0 ? OFFSET + 10 * Math.log10(z) : -Infinity);

/** Mean-square energies of windows (summed over channels). */
export function windowEnergies(weighted, fs, windowS, hopS) {
  const win = Math.round(windowS * fs), hop = Math.round(hopS * fs);
  const len = weighted[0].length;
  const sq = weighted.map((w) => {
    const p = new Float64Array(len + 1);
    for (let i = 0; i < len; i++) p[i + 1] = p[i] + w[i] * w[i];
    return p;
  });
  const out = [];
  for (let s = 0; s + win <= len; s += hop) {
    let z = 0;
    for (const p of sq) z += (p[s + win] - p[s]) / win;
    out.push(z);
  }
  return out;
}

/** Integrated loudness, LUFS. `channels` are Float32Array / Float64Array. */
export function integratedLufs(channels, fs) {
  const w = channels.map((c) => kWeight(c, fs));
  const z = windowEnergies(w, fs, 0.4, 0.1).filter((e) => toLufs(e) > -70);
  if (!z.length) return -Infinity;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const gate = toLufs(mean(z)) - 10;
  const g = z.filter((e) => toLufs(e) > gate);
  return g.length ? toLufs(mean(g)) : -Infinity;
}

/** Loudness of the whole signal as one ungated window (for short clips below 400 ms, where blocks do not fit). */
export function meanLufs(channels, fs) {
  const w = channels.map((c) => kWeight(c, fs));
  const len = w[0].length;
  let z = 0;
  for (const c of w) { let s = 0; for (let i = 0; i < len; i++) s += c[i] * c[i]; z += s / len; }
  return toLufs(z);
}

/** Sample peak, linear. */
export function samplePeak(channels) {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}

/** True peak in dBFS, 4x oversampled with a windowed sinc (same estimator as src/audio/loudness.ts). */
export function truePeakDb(channels) {
  const TAPS = 12, half = TAPS / 2;
  const phases = [1, 2, 3].map((p) => {
    const h = new Float64Array(TAPS);
    for (let k = 0; k < TAPS; k++) {
      const x = k - half + 1 - p / 4;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      h[k] = sinc * (0.5 + 0.5 * Math.cos((Math.PI * x) / (half + 1)));
    }
    return h;
  });
  let peak = samplePeak(channels);
  const thr = peak * 0.5;
  for (const ch of channels) {
    for (let i = half; i < ch.length - half; i++) {
      if (Math.abs(ch[i]) < thr && Math.abs(ch[i + 1]) < thr) continue;
      for (const h of phases) {
        let s = 0;
        for (let k = 0; k < TAPS; k++) s += h[k] * ch[i - half + 1 + k];
        if (Math.abs(s) > peak) peak = Math.abs(s);
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
