// Read-outs that let a script check sound without ears: level, peak, clipping, spectral band shares and centroid,
// and the loop-boundary continuity metric.

export interface Bands { sub: number; low: number; mid: number; high: number; air: number }
export interface Analysis {
  rmsDb: number;
  peakDb: number;
  clipped: number;
  centroidHz: number;
  /** Energy share per band (sum 1): sub < 120 Hz, low 120-500, mid 500-2k, high 2k-8k, air > 8k. */
  bands: Bands;
  silent: boolean;
}

const EDGES = [120, 500, 2000, 8000];
/** Peak below -60 dBFS counts as silence. */
const SILENT_PEAK = 1e-3;

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k), wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
}

/** Mono mix of all channels from sample `from` to `to`. */
export function monoOf(buf: AudioBuffer, from = 0, to = buf.length): Float32Array {
  const out = new Float32Array(Math.max(0, to - from));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = from; i < to; i++) out[i - from] += d[i] / buf.numberOfChannels;
  }
  return out;
}

export function analyse(buf: AudioBuffer, fromS = 0, toS = buf.duration): Analysis {
  const sr = buf.sampleRate;
  const from = Math.floor(fromS * sr), to = Math.min(buf.length, Math.floor(toS * sr));
  let peak = 0, clipped = 0, sum = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = from; i < to; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, (to - from) * buf.numberOfChannels));
  const mono = monoOf(buf, from, to);
  const N = 4096;
  const band = [0, 0, 0, 0, 0];
  let wsum = 0, fsum = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= mono.length; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = mono[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const f = (k * sr) / N;
      let b = 0;
      while (b < EDGES.length && f >= EDGES[b]) b++;
      band[b] += p;
      wsum += p; fsum += p * f;
    }
  }
  const tot = band.reduce((a, b) => a + b, 0) || 1;
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);
  return {
    rmsDb: Math.round(db(rms) * 10) / 10, peakDb: Math.round(db(peak) * 10) / 10, clipped,
    centroidHz: wsum > 0 ? Math.round(fsum / wsum) : 0,
    bands: { sub: r3(band[0] / tot), low: r3(band[1] / tot), mid: r3(band[2] / tot), high: r3(band[3] / tot), air: r3(band[4] / tot) },
    // silent: nothing reaches -60 dBFS peak (a whole-buffer RMS floor would pass a lone quiet click)
    silent: peak < SILENT_PEAK,
  };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Continuity around time `atS`: the largest sample step and the lowest RMS (5 ms blocks) within ±winS,
 * relative to the typical (median) values of the same measures over the whole steady part of the buffer.
 */
export function continuity(buf: AudioBuffer, atS: number, winS = 0.08, steadyFromS = 1): { stepRatio: number; rmsDipRatio: number } {
  const sr = buf.sampleRate;
  const x = monoOf(buf);
  const blk = Math.round(0.005 * sr), rblk = blk;
  const steps: number[] = [], rmss: number[] = [];
  const blockStats = (b: number) => {
    let mx = 0, s = 0;
    for (let i = b; i < b + blk; i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > mx) mx = d; }
    const r0 = Math.max(0, b + blk / 2 - rblk / 2), r1 = Math.min(x.length, r0 + rblk);
    for (let i = r0; i < r1; i++) s += x[i] * x[i];
    return { mx, rms: Math.sqrt(s / Math.max(1, r1 - r0)) };
  };
  for (let b = Math.floor(steadyFromS * sr); b + blk < x.length; b += blk) { const st = blockStats(b); steps.push(st.mx); rmss.push(st.rms); }
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)] || 1e-9; };
  const ms = med(steps), mr = med(rmss);
  let worstStep = 0, minRms = Infinity;
  for (let b = Math.max(1, Math.floor((atS - winS) * sr)); b + blk < Math.min(x.length, (atS + winS) * sr); b += blk) {
    const st = blockStats(b);
    worstStep = Math.max(worstStep, st.mx);
    minRms = Math.min(minRms, st.rms);
  }
  return { stepRatio: r3(worstStep / ms), rmsDipRatio: r3(minRms / mr) };
}
