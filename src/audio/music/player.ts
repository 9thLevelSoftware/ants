// Generative music voices (GDD 08 §13.9): an FM bell-marimba, a bowed pad and a low wooden pulse, all synthesised.
import type { SynthKit } from '../synth/kit';
import { midiToHz, type Note, type Phrase } from './compose';

/** FM bell-marimba: sine carrier, sine modulator at 3.5x with a decaying index, fast attack, ring of `dur`. */
function bell(k: SynthKit, out: AudioNode, t: number, n: Note): void {
  const f = midiToHz(n.midi);
  const car = k.osc('sine', f, t, n.dur + 0.6);
  const mod = k.osc('sine', f * 3.5, t, n.dur + 0.6);
  const idx = k.gain(f * 2.2);
  idx.gain.setValueAtTime(f * 2.2, t);
  idx.gain.setTargetAtTime(f * 0.1, t, 0.12);
  mod.connect(idx).connect(car.frequency);
  k.chain(car, k.ad(t, 0.22 * n.vel, 0.004, n.dur + 0.5), out);
}

/** Bowed pad: two saws detuned by ±5 cents, low-passed at 900 Hz, slow attack and release. */
function pad(k: SynthKit, out: AudioNode, t: number, n: Note): void {
  const f = midiToHz(n.midi);
  const lp = k.filter('lowpass', 900, 0.5);
  const env = k.ahr(t, 0.05 * n.vel, Math.min(1.8, n.dur / 3), Math.max(0, n.dur - 3.6), Math.min(1.8, n.dur / 3));
  lp.connect(env).connect(out);
  for (const c of [-5, 5]) k.osc('sawtooth', f * Math.pow(2, c / 1200), t, n.dur + 0.1).connect(lp);
}

/** Low wooden pulse: decaying sine two octaves down plus a soft noise knock. */
function pulse(k: SynthKit, out: AudioNode, t: number, n: Note): void {
  k.chain(k.osc('sine', midiToHz(n.midi), t, 0.6), k.ad(t, 0.3 * n.vel, 0.003, 0.45), out);
  k.chain(k.noise('pink', t, 0.06), k.filter('lowpass', 600, 0.7), k.ad(t, 0.08 * n.vel, 0.001, 0.03), out);
}

export function playPhrase(k: SynthKit, out: AudioNode, t: number, p: Phrase): void {
  for (const n of p.notes) {
    const at = t + n.t;
    if (n.voice === 'bell') bell(k, out, at, n);
    else if (n.voice === 'pad') pad(k, out, at, n);
    else pulse(k, out, at, n);
  }
}
