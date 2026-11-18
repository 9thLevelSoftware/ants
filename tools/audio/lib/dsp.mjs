// Pure-maths building blocks for the offline sound renderers: noise, filters, envelopes, resonators, circular
// (loop-safe) processing. Everything works on Float64Array at SR and is deterministic for a given seed.

export const SR = 44100;
const TAU = Math.PI * 2;

export const samples = (seconds) => Math.round(seconds * SR);
export const zeros = (n) => new Float64Array(n);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(g);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------- noise

export function white(rng, n) {
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) o[i] = rng.white();
  return o;
}

/** Pink-noise filter (Paul Kellet's 3-pole approximation): colours white noise, roughly unit variance. */
export function pinkFilter(w) {
  const o = new Float64Array(w.length);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    o[i] = (b0 + b1 + b2 + x * 0.1848) * 0.33;
  }
  return o;
}

// ---------------------------------------------------------------- loop-safe processing

/**
 * Applies `fn` (Float64Array -> Float64Array of the same length) as if the signal repeated forever: three copies are
 * filtered and the middle one is kept, so the result's end flows into its start (any filter transient has died out).
 */
export function circular(x, fn) {
  const n = x.length;
  const t = new Float64Array(3 * n);
  t.set(x, 0); t.set(x, n); t.set(x, 2 * n);
  return fn(t).slice(n, 2 * n);
}

/** Adds `src` into `out` at `start`, wrapping around the end (for events in a loop). */
export function addWrap(out, src, start, gain = 1) {
  const n = out.length;
  let j = ((Math.round(start) % n) + n) % n;
  for (let i = 0; i < src.length; i++) { out[j] += gain * src[i]; if (++j === n) j = 0; }
}

/** Adds `src` into `out` at `start`, clipped at both ends (for one-shots). */
export function addAt(out, src, start, gain = 1) {
  const s = Math.round(start);
  for (let i = Math.max(0, -s); i < src.length && s + i < out.length; i++) out[s + i] += gain * src[i];
}

// ---------------------------------------------------------------- filters

/** RBJ cookbook biquad coefficients. */
export function biquadCoefs(type, f, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = (TAU * Math.min(f, SR * 0.49)) / SR, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break; // 0 dB peak gain
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
    case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(`unknown biquad ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function biquad(x, type, f, q, gainDb) {
  const c = biquadCoefs(type, f, q, gainDb);
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

export const lp = (x, f, q) => biquad(x, 'lp', f, q);
export const hp = (x, f, q) => biquad(x, 'hp', f, q);
export const bp = (x, f, q) => biquad(x, 'bp', f, q);
/** 4th-order Butterworth low-/high-pass (two biquads). */
export const lp4 = (x, f) => biquad(biquad(x, 'lp', f, 0.5412), 'lp', f, 1.3066);
export const hp4 = (x, f) => biquad(biquad(x, 'hp', f, 0.5412), 'hp', f, 1.3066);
/** Band-limits x between `lo` and `hi` Hz. */
export const band = (x, lo, hi) => lp4(hp(x, lo), hi);

/**
 * Band-pass with a centre frequency that may change per sample (zero-delay-feedback state-variable filter, unity peak
 * gain). `f` is a number or an array of Hz; `q` likewise.
 */
export function svfBand(x, f, q = 8) {
  const y = new Float64Array(x.length);
  let ic1 = 0, ic2 = 0;
  const fa = typeof f === 'number' ? null : f, qa = typeof q === 'number' ? null : q;
  let g = Math.tan((Math.PI * (fa ? 1000 : f)) / SR), k = 1 / (qa ? 1 : q);
  for (let i = 0; i < x.length; i++) {
    if (fa) g = Math.tan((Math.PI * Math.min(fa[i], SR * 0.45)) / SR);
    if (qa) k = 1 / qa[i];
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = k * v1;
  }
  return y;
}

/** One-pole low-pass with a per-sample cutoff (Hz array) - for air absorption that follows a distance. */
export function lpVar(x, f) {
  const y = new Float64Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp((-TAU * f[i]) / SR);
    s += a * (x[i] - s);
    y[i] = s;
  }
  return y;
}

/**
 * A bank of damped resonators (modes). Feed it an excitation (an impulse, a noise burst, a click train) and it rings:
 * each mode is a two-pole filter at `f` Hz whose amplitude falls by 60 dB in `t60` seconds. A unit impulse makes a
 * ring that starts at amplitude `g` (default 1).
 */
export function modal(x, modes) {
  const y = new Float64Array(x.length);
  for (const m of modes) {
    const r = Math.pow(10, -3 / (m.t60 * SR)), w = (TAU * m.f) / SR;
    const a1 = 2 * r * Math.cos(w), a2 = -r * r, gain = (m.g ?? 1) * Math.sin(w);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = gain * x[i] + a1 * y1 + a2 * y2;
      y2 = y1; y1 = v;
      y[i] += v;
    }
  }
  return y;
}

// ---------------------------------------------------------------- envelopes and control signals

/** Piecewise-linear curve through [seconds, value] points, n samples long. */
export function curve(n, pts) {
  const o = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [t0, v0] = pts[k], [t1, v1] = pts[k + 1];
    const u = t1 === t0 ? 1 : clamp((t - t0) / (t1 - t0), 0, 1);
    o[i] = v0 + (v1 - v0) * u;
  }
  return o;
}

/** Exponentially decaying envelope: 1 at 0, -60 dB after `t60` seconds, `n` samples. */
export function decay(n, t60) {
  const o = new Float64Array(n);
  const k = Math.pow(10, -3 / (t60 * SR));
  let v = 1;
  for (let i = 0; i < n; i++) { o[i] = v; v *= k; }
  return o;
}

/** Slowly varying random control in [-1, 1]: new random targets `rateHz` times per second, cosine-interpolated. */
export function smoothNoise(rng, n, rateHz, wrap = false) {
  const step = SR / rateHz, m = Math.max(2, Math.round(n / step));
  const v = Array.from({ length: m }, () => rng.next() * 2 - 1);
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i / n) * m, i0 = Math.floor(p), u = p - i0;
    const a = v[i0 % m], b = wrap || i0 + 1 < m ? v[(i0 + 1) % m] : v[m - 1];
    const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
    o[i] = a + (b - a) * s;
  }
  return o;
}

/** Phase-accumulating oscillator; `f` is a number or per-sample Hz array. `shape`: 'sine' | 'saw' | 'pulse'. */
export function osc(f, n, shape = 'sine', phase0 = 0, width = 0.5) {
  const o = new Float64Array(n);
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    const fi = typeof f === 'number' ? f : f[i];
    o[i] = shape === 'sine' ? Math.sin(TAU * ph) : shape === 'saw' ? 2 * (ph - Math.floor(ph)) - 1 : ph - Math.floor(ph) < width ? 1 : -1;
    ph += fi / SR;
  }
  return o;
}

export function mulInPlace(x, y) { for (let i = 0; i < x.length; i++) x[i] *= y[i]; return x; }
export function scaleInPlace(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
export function addInPlace(x, y, g = 1) { for (let i = 0; i < x.length; i++) x[i] += g * y[i]; return x; }
export function sum(...xs) { const o = new Float64Array(xs[0].length); for (const x of xs) addInPlace(o, x); return o; }

export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); }
export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }

/** Linear fades at both ends (seconds). */
export function fade(x, inS, outS) {
  const ni = Math.round(inS * SR), no = Math.round(outS * SR);
  for (let i = 0; i < ni && i < x.length; i++) x[i] *= i / ni;
  for (let i = 0; i < no && i < x.length; i++) x[x.length - 1 - i] *= i / no;
  return x;
}

/** Reads `src` at fractional positions (Catmull-Rom). Positions outside the signal read as 0. */
export function readFrac(src, pos) {
  const y = new Float64Array(pos.length), n = src.length;
  const at = (i) => (i < 0 || i >= n ? 0 : src[i]);
  for (let k = 0; k < pos.length; k++) {
    const p = pos[k], i = Math.floor(p), u = p - i;
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    y[k] = p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  }
  return y;
}

/** Playback-rate change by `semitones` (pitch and speed together), same sample rate out. */
export function resample(x, ratio) {
  const n = Math.floor(x.length / ratio), pos = new Float64Array(n);
  for (let i = 0; i < n; i++) pos[i] = i * ratio;
  return readFrac(x, pos);
}

/** A feedback-comb "room": a few short delays that give a tail (for drips in a cave, not a reverb model). */
export function echoTail(x, delaysS, feedback, mix) {
  const y = Float64Array.from(x);
  for (const d of delaysS) {
    const D = Math.round(d * SR);
    const buf = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) {
      buf[i] = x[i] + (i >= D ? feedback * buf[i - D] : 0);
      y[i] += mix * (i >= D ? buf[i - D] : 0);
    }
  }
  return y;
}

/** Soft saturation that keeps the peak and lifts everything below it: tanh(drive * x / peak) / tanh(drive). Lowers the crest factor. */
export function squash(x, drive) {
  const p = peak(x) || 1, k = Math.tanh(drive);
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = (p * Math.tanh((drive * x[i]) / p)) / k;
  return y;
}
