// Measurements used to judge a sound without listening: spectrum (centroid, band shares), loop seam, stereo
// correlation. Pure functions over Float32Array / Float64Array channels.
import { SR } from './dsp.mjs';

/** In-place radix-2 FFT of (re, im). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Welch power spectrum of the mono mix: Hann windows of `size`, 50 % overlap. Returns power per bin (0..size/2). */
export function powerSpectrum(chs, size = 4096) {
  const n = chs[0].length, half = size / 2, p = new Float64Array(half + 1);
  const win = new Float64Array(size);
  const short = chs[0].length <= size; // a clip that fits one frame is measured whole (a Hann taper would erase a click at its start)
  for (let i = 0; i < size; i++) win[i] = short ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const re = new Float64Array(size), im = new Float64Array(size);
  let frames = 0;
  const hop = half;
  const starts = [];
  if (n <= size) starts.push(0); else for (let s = 0; s + size <= n; s += hop) starts.push(s);
  for (const s of starts) {
    for (let i = 0; i < size; i++) {
      let v = 0;
      for (const c of chs) v += s + i < n ? c[s + i] : 0;
      re[i] = (v / chs.length) * win[i]; im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= half; k++) p[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  for (let k = 0; k <= half; k++) p[k] /= frames;
  return p;
}

export const BANDS = [[0, 100], [100, 500], [500, 2000], [2000, 6000], [6000, SR / 2]];
export const BAND_NAMES = ['<100', '100-500', '0.5-2k', '2-6k', '>6k'];

/** Spectral centroid (Hz, power-weighted), band energy shares (sum 1), share above 2 kHz and 95 % roll-off. */
export function spectralSummary(chs, size = 4096) {
  const p = powerSpectrum(chs, size), df = SR / size;
  let tot = 0, cen = 0;
  for (let k = 1; k < p.length; k++) { tot += p[k]; cen += p[k] * k * df; }
  const bands = BANDS.map(([lo, hi]) => {
    let s = 0;
    for (let k = 1; k < p.length; k++) { const f = k * df; if (f >= lo && f < hi) s += p[k]; }
    return s / tot;
  });
  let acc = 0, roll = 0;
  for (let k = 1; k < p.length; k++) { acc += p[k]; if (acc >= 0.95 * tot) { roll = k * df; break; } }
  return { centroidHz: cen / tot, bands, above2k: bands[3] + bands[4], rolloff95Hz: roll };
}

/** Pearson correlation of two channels. */
export function correlation(a, b) {
  let sa = 0, sb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db || 1);
}

const rmsOf = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

/**
 * Loop seam of one channel, as if the file were played end to start with sample-accurate looping:
 *   jump   - |x[0] - x[N-1]| in units of the signal's typical step (RMS of first differences); a smooth wrap is <= ~3
 *   kink   - change of slope across the wrap in units of the RMS second difference; smooth is <= ~4
 *   energyDb - level of the 250 ms after the seam against the 250 ms before it (dB, absolute); the spec asks <= 1
 */
export function loopSeam(x, windowS = 0.25) {
  const n = x.length, w = Math.round(windowS * SR);
  let d1 = 0, d2 = 0;
  for (let i = 2; i < n; i++) { const a = x[i] - x[i - 1], b = a - (x[i - 1] - x[i - 2]); d1 += a * a; d2 += b * b; }
  const s1 = Math.sqrt(d1 / (n - 2)) || 1e-12, s2 = Math.sqrt(d2 / (n - 2)) || 1e-12;
  const jump = Math.abs(x[0] - x[n - 1]) / s1;
  const slopeBefore = x[n - 1] - x[n - 2], slopeAcross = x[0] - x[n - 1];
  const kink = Math.abs(slopeAcross - slopeBefore) / s2;
  const before = rmsOf(x, n - w, n), after = rmsOf(x, 0, w);
  return { jump, kink, energyDb: Math.abs(20 * Math.log10((after || 1e-12) / (before || 1e-12))) };
}

/**
 * What the game's loop player actually plays at a pass boundary (src/audio/loopSchedule.ts): each pass skips `trimS`
 * at both ends and the next pass starts `xfadeS` before the end of this one, with equal-power fades. Builds that
 * join (2 s of lead-in, the crossfade, 2 s after it) and reports
 *   click   - largest sample step of the join in units of the RMS step of the whole file (a smooth join stays near the
 *             file's own largest steps, <= ~4x the file's own peak-step ratio)
 *   dipDb   - the lowest 250 ms level inside the join against the median level outside it (dB, negative = dip)
 */
export function engineJoin(x, trimS = 0.03, xfadeS = 1.5) {
  const t = Math.round(trimS * SR), xf = Math.round(xfadeS * SR), lead = 2 * SR;
  const start = t, end = x.length - t;
  const len = lead + xf + lead, o = new Float64Array(len);
  for (let i = 0; i < lead + xf; i++) {
    const a = end - xf - lead + i;
    let g = 1;
    if (i >= lead) g = Math.cos(((i - lead) / xf) * (Math.PI / 2));
    o[i] += g * x[a];
  }
  for (let i = 0; i < xf + lead; i++) {
    const b = start + i;
    const g = i < xf ? Math.sin((i / xf) * (Math.PI / 2)) : 1;
    o[lead + i] += g * x[b];
  }
  let d = 0, own = 0, ownMax = 0;
  for (let i = 1; i < x.length; i++) { const s = x[i] - x[i - 1]; d += s * s; if (Math.abs(s) > ownMax) ownMax = Math.abs(s); }
  const rmsStep = Math.sqrt(d / (x.length - 1)) || 1e-12;
  let joinMax = 0;
  for (let i = 1; i < len; i++) joinMax = Math.max(joinMax, Math.abs(o[i] - o[i - 1]));
  const w = Math.round(0.25 * SR), levels = [];
  for (let s = 0; s + w <= len; s += Math.round(w / 2)) levels.push([s, rmsOf(o, s, s + w)]);
  const outside = levels.filter(([s]) => s + w <= lead || s >= lead + xf).map(([, v]) => v).sort((a, b) => a - b);
  const inside = levels.filter(([s]) => s + w > lead && s < lead + xf).map(([, v]) => v);
  const med = outside[Math.floor(outside.length / 2)] || 1e-12;
  void own;
  return { click: joinMax / rmsStep, fileMaxStep: ownMax / rmsStep, dipDb: 20 * Math.log10(Math.min(...inside) / med) };
}
