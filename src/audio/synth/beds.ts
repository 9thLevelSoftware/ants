// Continuous synthesised beds (GDD 08 §13.4, §13.7): leaf rustle, low wind, the voice-less distant murmur, the
// underground tone, and a fallback bed for every bed file (used when its file is missing or failed to decode).
// Each bed's output is a GainNode at about -18 dBFS RMS; the ambience layer gain scales it.
import type { SynthKit } from './kit';
import type { SynthBed } from './ids';

export interface BedHandle {
  output: GainNode;
  stop(t: number): void;
}

type Stoppable = AudioScheduledSourceNode;

function lfo(k: SynthKit, t: number, freq: number, depth: number, target: AudioParam, srcs: Stoppable[], type: OscillatorType = 'sine'): void {
  const o = k.osc(type, freq, t, Infinity);
  const d = k.gain(depth);
  o.connect(d).connect(target);
  srcs.push(o);
}

function make(k: SynthKit, build: (out: GainNode, srcs: Stoppable[]) => void): BedHandle {
  const output = k.gain(1);
  const srcs: Stoppable[] = [];
  build(output, srcs);
  return { output, stop: (t) => { for (const s of srcs) { try { s.stop(t); } catch { /* already stopped */ } } } };
}

/** Noise -> filters -> amplitude node (base gain `level`, optional swells). */
function noiseBed(k: SynthKit, t: number, out: GainNode, srcs: Stoppable[], kind: 'white' | 'pink' | 'brown', filters: BiquadFilterNode[], level: number, swells: [number, number][] = []): GainNode {
  const n = k.noise(kind, t, Infinity);
  srcs.push(n);
  const amp = k.gain(level);
  for (const [f, depth] of swells) lfo(k, t, f, level * depth, amp.gain, srcs);
  k.chain(n, ...filters, amp, out);
  return amp;
}

export const BEDS: Record<SynthBed, (k: SynthKit, t: number) => BedHandle> = {
  /** Leaf rustle: pink noise band-passed 3.5 kHz with irregular swells (0.21 and 0.37 Hz). */
  'leaf-rustle': (k, t) => make(k, (o, s) => { noiseBed(k, t, o, s, 'pink', [k.filter('bandpass', 3500, 0.6)], 0.35, [[0.21, 0.5], [0.37, 0.3]]); }),
  /** Low wind: brown noise low-passed at 250 Hz whose cutoff drifts at 0.07 Hz. */
  'low-wind': (k, t) => make(k, (o, s) => {
    const lp = k.filter('lowpass', 250, 0.8);
    lfo(k, t, 0.07, 120, lp.frequency, s);
    noiseBed(k, t, o, s, 'brown', [lp], 0.6, [[0.11, 0.4]]);
  }),
  /**
   * Distant murmur (voice-less playground / activity bed, §13.7): band-limited noise 200-900 Hz with slow amplitude
   * swells at 0.3-1.5 Hz. Never formant-shaped: no resonant peaks, so nothing reads as speech.
   */
  'distant-murmur': (k, t) => make(k, (o, s) => {
    noiseBed(k, t, o, s, 'pink', [k.filter('highpass', 200, 0.5), k.filter('lowpass', 900, 0.5)], 0.45, [[0.31, 0.35], [0.83, 0.2], [1.47, 0.15]]);
  }),
  /** Underground tone (fallback for underground_rumble): brown noise below 120 Hz with 0.05 Hz modulation. */
  'underground-tone': (k, t) => make(k, (o, s) => { noiseBed(k, t, o, s, 'brown', [k.filter('lowpass', 120, 0.7)], 0.9, [[0.05, 0.4]]); }),
  /** Birds fallback: two FM sines (3.2 and 4.1 kHz, 9-13 Hz warble) gated by slow square pulses. */
  'bed-birds': (k, t) => make(k, (o, s) => {
    for (const [f, gate] of [[3200, 0.7], [4100, 0.43]] as const) {
      const osc = k.osc('sine', f, t, Infinity);
      s.push(osc);
      lfo(k, t, 9 + gate * 6, 500, osc.frequency, s);
      const g = k.gain(0.04);
      lfo(k, t, gate, 0.04, g.gain, s, 'square');
      k.chain(osc, g, o);
    }
  }),
  /** Crickets fallback: 4.5 kHz sine chopped at 30 Hz in 1.5 Hz trills. */
  'bed-crickets': (k, t) => make(k, (o, s) => {
    const osc = k.osc('sine', 4500, t, Infinity);
    s.push(osc);
    const chop = k.gain(0.5), trill = k.gain(0.05);
    lfo(k, t, 30, 0.5, chop.gain, s, 'square');
    lfo(k, t, 1.5, 0.05, trill.gain, s, 'square');
    k.chain(osc, chop, trill, o);
  }),
  /** Light rain fallback: pink noise 800 Hz - 6 kHz. */
  'bed-rain-light': (k, t) => make(k, (o, s) => { noiseBed(k, t, o, s, 'pink', [k.filter('highpass', 800, 0.6), k.filter('lowpass', 6000, 0.6)], 0.4); }),
  /** Heavy rain fallback: white noise low-passed 4 kHz plus a brown-noise body. */
  'bed-rain-heavy': (k, t) => make(k, (o, s) => {
    noiseBed(k, t, o, s, 'white', [k.filter('lowpass', 4000, 0.6)], 0.2);
    noiseBed(k, t, o, s, 'brown', [k.filter('lowpass', 400, 0.6)], 0.3);
  }),
  /** Wind fallback: pink noise band-passed 500 Hz with gusts (0.09, 0.23 Hz). */
  'bed-wind': (k, t) => make(k, (o, s) => { noiseBed(k, t, o, s, 'pink', [k.filter('bandpass', 500, 0.5)], 0.45, [[0.09, 0.5], [0.23, 0.25]]); }),
  /** Street fallback: brown noise low-passed 500 Hz with a pink-noise wash. */
  'bed-street': (k, t) => make(k, (o, s) => {
    noiseBed(k, t, o, s, 'brown', [k.filter('lowpass', 500, 0.6)], 0.4, [[0.05, 0.3]]);
    noiseBed(k, t, o, s, 'pink', [k.filter('bandpass', 1200, 0.5)], 0.06);
  }),
  /** Traffic fallback: brown noise low-passed 300 Hz with slow swells. */
  'bed-traffic': (k, t) => make(k, (o, s) => { noiseBed(k, t, o, s, 'brown', [k.filter('lowpass', 300, 0.6)], 0.5, [[0.04, 0.4], [0.13, 0.2]]); }),
  /** Fridge hum fallback: 50 Hz with 100 and 150 Hz partials and faint noise. */
  'bed-hum': (k, t) => make(k, (o, s) => {
    for (const [f, a] of [[50, 0.08], [100, 0.05], [150, 0.03]] as const) {
      const osc = k.osc('sine', f, t, Infinity);
      s.push(osc);
      k.chain(osc, k.gain(a), o);
    }
    noiseBed(k, t, o, s, 'pink', [k.filter('lowpass', 2000, 0.6)], 0.02);
  }),
};
