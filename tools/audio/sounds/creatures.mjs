// Insects: wingbeat buzzes, cricket chirps, grasshopper stridulation.
import { SR, addInPlace, band, curve, dbToGain, lp4, osc, samples, smoothNoise, white, zeros } from '../lib/dsp.mjs';
import { addChirp } from '../lib/insects.mjs';

/** One flying insect: a harmonic-rich wingbeat (low-passed saw) with vibrato, flutter and a hiss of air. */
function buzzVoice(rng, n, f0, flight) {
  const vib = smoothNoise(rng.fork('vib'), n, 5), flutter = smoothNoise(rng.fork('flutter'), n, 14);
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = f0 * (1 + 0.035 * vib[i]);
  // a narrow pulse per wingbeat has a flat harmonic comb up to the filter, which is what makes a buzz bright
  const wing = lp4(osc(f, n, 'pulse', rng.next(), 0.06), 6000);
  const air = band(white(rng.fork('air'), n), 800, 5200);
  const out = zeros(n);
  for (let i = 0; i < n; i++) out[i] = (wing[i] + 1.1 * air[i]) * dbToGain(2.5 * flutter[i]) * flight[i];
  return out;
}

/** A single fly: approaches, circles, recedes - the level follows a flight path. */
export function insectWingBuzz01({ rng }) {
  const n = samples(1.6), flight = curve(n, [[0, 0.25], [0.5, 0.8], [0.9, 1], [1.3, 0.7], [1.6, 0.3]]);
  return [buzzVoice(rng, n, 188, flight)];
}

/** A swarm: seven bees, each slightly off the others, so the beating makes a restless chorus. */
export function insectWingBuzz02({ rng }) {
  const n = samples(1.6), out = zeros(n), flight = curve(n, [[0, 0.8], [0.8, 1], [1.6, 0.85]]);
  for (let v = 0; v < 7; v++) {
    const r = rng.fork(`bee${v}`);
    addInPlace(out, buzzVoice(r, n, r.range(205, 255), flight), r.range(0.5, 1));
  }
  return [out];
}

/** Cricket chirps: `chirps` = [[start s, carrier Hz, pulses, pulse period s, gain]]. */
function crickets({ seconds, chirps }) {
  const n = samples(seconds), out = zeros(n);
  for (const [t, f, pulses, period, g] of chirps) addChirp(out, Math.round(t * SR), f, pulses, period, g);
  return [out];
}
export const cricketChirp01 = () => crickets({ seconds: 0.8, chirps: [[0.05, 4600, 4, 0.024, 1], [0.38, 4600, 4, 0.024, 0.9], [0.2, 4150, 3, 0.027, 0.35]] });
export const cricketChirp02 = () => crickets({ seconds: 0.8, chirps: [[0.04, 4300, 3, 0.026, 1], [0.27, 4300, 3, 0.026, 0.95], [0.5, 4300, 3, 0.026, 0.85]] });

/**
 * Grasshopper song: three short phrases of fast scraping pulses (hind leg over the wing), the up-stroke louder than the
 * down-stroke. Each pulse is a few ms of noise in 2.5-7 kHz; the cue pitches it up a fifth in the game.
 */
export function stridulationGrasshopper({ rng }) {
  const n = samples(1.83), out = zeros(n), r = rng.fork('pulses');
  let t = 0.04;
  for (let phrase = 0; phrase < 3; phrase++) {
    const pulses = 38, period = 0.0125;
    for (let p = 0; p < pulses; p++) {
      const at = Math.round((t + p * period * r.range(0.93, 1.07)) * SR);
      const len = Math.round(r.range(0.004, 0.007) * SR);
      const crescendo = 0.55 + 0.45 * Math.sin((Math.PI / 2) * (p / pulses));
      const g = (p % 2 === 0 ? 1 : 0.5) * crescendo * r.range(0.8, 1);
      const nz = band(white(r.fork(`p${phrase}_${p}`), len + 64), 2500, 7000);
      for (let i = 0; i < len && at + i < n; i++) out[at + i] += g * nz[i + 32] * Math.sin((Math.PI * i) / len) * 3;
    }
    t += 0.52;
  }
  return [out];
}
