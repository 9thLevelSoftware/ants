// Loudness estimator (BS.1770 K-weighting, gating, true peak) against synthetic signals with known readings.
import { describe, expect, it } from 'vitest';
import { highPassCoefficients, integratedLoudness, kWeight, measure, RunningLoudness, shelfCoefficients, shortTermLoudness, truePeakDb } from './loudness';

const FS = 48000;

function sine(freq: number, peakDb: number, seconds: number, fs = FS, phase = 0): Float32Array {
  const a = Math.pow(10, peakDb / 20);
  const x = new Float32Array(Math.round(seconds * fs));
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin((2 * Math.PI * freq * i) / fs + phase);
  return x;
}

describe('K-weighting filter', () => {
  it('has the BS.1770 coefficients at 48 kHz', () => {
    const s = shelfCoefficients(48000), h = highPassCoefficients(48000);
    expect(s.b0).toBeCloseTo(1.53512485958697, 6);
    expect(s.b1).toBeCloseTo(-2.69169618940638, 6);
    expect(s.b2).toBeCloseTo(1.19839281085285, 6);
    expect(s.a1).toBeCloseTo(-1.69065929318241, 6);
    expect(s.a2).toBeCloseTo(0.73248077421585, 6);
    expect(h.a1).toBeCloseTo(-1.99004745483398, 6);
    expect(h.a2).toBeCloseTo(0.99007225036621, 6);
  });

  it('is about +0.7 dB at 997 Hz, roughly unity at 1 kHz and strongly attenuates 20 Hz', () => {
    const gainDb = (f: number) => {
      const x = sine(f, -20, 2);
      const y = kWeight(x, FS);
      let sx = 0, sy = 0;
      for (let i = FS; i < x.length; i++) { sx += x[i] * x[i]; sy += y[i] * y[i]; }
      return 10 * Math.log10(sy / sx);
    };
    expect(gainDb(997)).toBeCloseTo(0.691, 1);
    expect(gainDb(20)).toBeLessThan(-6);
    expect(gainDb(10000)).toBeGreaterThan(3); // the shelf lifts the highs
  });
});

describe('integrated loudness', () => {
  it('reads a 997 Hz sine at -23 dBFS in both channels as -23.0 LUFS (±0.3)', () => {
    const x = sine(997, -23, 10);
    const lufs = integratedLoudness([x, x], FS);
    expect(Math.abs(lufs - -23)).toBeLessThanOrEqual(0.3);
    expect(lufs).toBeCloseTo(-23, 1);
  });

  it('reads a mono (one-channel) sine 3 dB lower: channel energies add', () => {
    const x = sine(997, -23, 10);
    expect(integratedLoudness([x], FS)).toBeCloseTo(-26.02, 1);
  });

  it('is level-linear: +10 dB in, +10 LU out', () => {
    const a = sine(997, -33, 6), b = sine(997, -23, 6);
    expect(integratedLoudness([b, b], FS) - integratedLoudness([a, a], FS)).toBeCloseTo(10, 2);
  });

  it('works at other sample rates (44.1 kHz reads the same sine within 0.3 LU)', () => {
    const x = sine(997, -23, 8, 44100);
    expect(Math.abs(integratedLoudness([x, x], 44100) - -23)).toBeLessThanOrEqual(0.3);
  });

  it('applies the absolute gate: a -80 dBFS sine is silence', () => {
    const x = sine(997, -80, 5);
    expect(integratedLoudness([x, x], FS)).toBe(-Infinity);
  });

  it('applies the relative gate: quiet passages 10 LU below the loud part do not drag the reading down', () => {
    const loud = sine(997, -20, 4), quiet = sine(997, -45, 4);
    const x = new Float32Array(loud.length + quiet.length);
    x.set(loud, 0);
    x.set(quiet, loud.length);
    // ungated the mean would be about -23 LUFS; gated it is the loud part alone, -20
    expect(integratedLoudness([x, x], FS)).toBeCloseTo(-20, 0);
  });

  it('measures only the requested range', () => {
    const a = sine(997, -20, 3), b = sine(997, -40, 3);
    const x = new Float32Array(a.length + b.length);
    x.set(a, 0);
    x.set(b, a.length);
    expect(integratedLoudness([x, x], FS, { fromS: 3.2, toS: 6 })).toBeCloseTo(-40, 0);
  });

  it('returns silence for empty or all-zero input', () => {
    expect(integratedLoudness([], FS)).toBe(-Infinity);
    expect(integratedLoudness([new Float32Array(FS), new Float32Array(FS)], FS)).toBe(-Infinity);
  });
});

describe('short-term loudness', () => {
  it('finds the loud 3 s window in a quiet-loud-quiet signal', () => {
    const quiet = sine(997, -50, 4), loud = sine(997, -26, 4);
    const x = new Float32Array(quiet.length * 2 + loud.length);
    x.set(quiet, 0);
    x.set(loud, quiet.length);
    x.set(quiet, quiet.length + loud.length);
    const st = shortTermLoudness([x, x], FS);
    expect(st.max).toBeCloseTo(-26, 0);
    expect(Math.min(...st.values)).toBeLessThan(-45);
  });

  it('measures a buffer shorter than 3 s as one window', () => {
    const x = sine(997, -23, 1);
    const st = shortTermLoudness([x, x], FS);
    expect(st.values.length).toBeGreaterThan(0);
    expect(st.max).toBeCloseTo(-23, 0);
    expect(st.meanLufs).toBeCloseTo(-23, 0);
  });
});

describe('true peak', () => {
  it('reads a full-scale sine at its amplitude', () => {
    const x = sine(1000, -6, 1);
    expect(truePeakDb([x], { fs: FS })).toBeGreaterThan(-6.05);
    expect(truePeakDb([x], { fs: FS })).toBeLessThan(-5.9);
  });

  it('finds the inter-sample peak a sample-peak meter misses (fs/4 sine at 45 degrees: samples at 0.707, true 1.0)', () => {
    const x = sine(FS / 4, 0, 0.5, FS, Math.PI / 4);
    let samplePeak = 0;
    for (const v of x) samplePeak = Math.max(samplePeak, Math.abs(v));
    expect(samplePeak).toBeCloseTo(Math.SQRT1_2, 3);
    const tp = truePeakDb([x], { fs: FS });
    expect(tp).toBeGreaterThan(-0.6);
    expect(tp).toBeLessThan(0.3);
  });

  it('returns -Infinity for silence', () => {
    expect(truePeakDb([new Float32Array(1000)])).toBe(-Infinity);
  });
});

describe('measure', () => {
  it('bundles the three readings', () => {
    const x = sine(997, -23, 5);
    const r = measure([x, x], FS);
    expect(r.integratedLufs).toBeCloseTo(-23, 1);
    expect(r.shortTermMaxLufs).toBeCloseTo(-23, 1);
    expect(r.truePeakDb).toBeCloseTo(-23, 0);
  });
});

describe('running loudness (the live monitor)', () => {
  it('reads a mono tap of a -23 dBFS sine as -23 LUFS, fed in frame-sized chunks of a 2048 window', () => {
    const x = sine(997, -23, 6);
    const m = new RunningLoudness(FS);
    const hop = 800;
    for (let at = 2048; at + hop <= x.length; at += hop) m.push(x.subarray(at - 2048, at), hop);
    expect(m.shortTerm()).toBeCloseTo(-23, 0);
    expect(m.momentary()).toBeCloseTo(-23, 0);
  });

  it('follows a level change within its window and forgets the old level', () => {
    const quiet = sine(997, -40, 4), loud = sine(997, -20, 4);
    const m = new RunningLoudness(FS);
    const feed = (x: Float32Array) => { for (let at = 2048; at + 800 <= x.length; at += 800) m.push(x.subarray(at - 2048, at), 800); };
    feed(quiet);
    expect(m.shortTerm()).toBeCloseTo(-40, 0);
    feed(loud);
    expect(m.momentary()).toBeCloseTo(-20, 0);
    expect(m.shortTerm()).toBeCloseTo(-20, 0);
  });

  it('is silent before any sample and after reset', () => {
    const m = new RunningLoudness(FS);
    expect(m.shortTerm()).toBe(-Infinity);
    m.push(sine(997, -23, 0.1), 2048);
    expect(m.shortTerm()).toBeGreaterThan(-100);
    m.reset();
    expect(m.momentary()).toBe(-Infinity);
  });
});
