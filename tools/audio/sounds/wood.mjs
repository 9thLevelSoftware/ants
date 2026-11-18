// Wood sounds. A creak is stick-slip friction: an irregular pulse train whose pitch glides, rung through the resonances
// of a wooden body. A rasp is the same idea with a rougher, faster, noisier excitation.
import { SR, addInPlace, curve, hp, modal, mulInPlace, samples, smoothNoise, white, zeros } from '../lib/dsp.mjs';

/** Pulse train from a rate curve [seconds, Hz]; pulse times jitter by `jit` of a period; amplitudes by `ampJit`. */
function slipTrain(rng, n, ratePts, jit, ampJit) {
  const rate = curve(n, ratePts), wob = smoothNoise(rng.fork('wob'), n, 7);
  const o = zeros(n);
  let ph = rng.next();
  for (let i = 0; i < n; i++) {
    ph += (rate[i] * (1 + 0.06 * wob[i])) / SR;
    if (ph >= 1) {
      ph -= 1;
      const at = i + Math.round(rng.range(-jit, jit) * (SR / rate[i]));
      if (at >= 0 && at < n) o[at] += 1 + ampJit * (rng.next() * 2 - 1);
    }
  }
  return o;
}

/** Stroke-shaped amplitude: humps at [start, length, weight]. */
function humps(n, list) {
  const e = zeros(n);
  for (const [s, len, w] of list) for (let i = Math.floor(s * SR); i < Math.min(n, Math.floor((s + len) * SR)); i++) {
    const u = Math.max(0, (i / SR - s) / len);
    e[i] = Math.max(e[i], w * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 1.3));
  }
  return e;
}

function creak({ rng, seconds, rate, modes, strokes, jit = 0.25, noiseDb = -30 }) {
  const n = samples(seconds);
  const exc = slipTrain(rng, n, rate, jit, 0.45);
  const out = modal(exc, modes);
  const air = hp(white(rng.fork('air'), n), 900);
  addInPlace(out, air, Math.pow(10, noiseDb / 20));
  return [mulInPlace(out, humps(n, strokes))];
}

export const woodCreak01 = ({ rng }) => creak({
  rng, seconds: 1.18, rate: [[0, 150], [0.45, 235], [0.8, 190], [1.18, 160]],
  modes: [{ f: 680, t60: 0.05, g: 1 }, { f: 1180, t60: 0.04, g: 0.8 }, { f: 2050, t60: 0.03, g: 0.5 }, { f: 3100, t60: 0.02, g: 0.25 }],
  strokes: [[0.02, 1.12, 1]],
});
export const woodCreak02 = ({ rng }) => creak({
  rng, seconds: 2.2, rate: [[0, 75], [0.6, 135], [1.1, 90], [1.6, 150], [2.2, 100]],
  modes: [{ f: 360, t60: 0.08, g: 1 }, { f: 640, t60: 0.06, g: 0.9 }, { f: 1100, t60: 0.05, g: 0.6 }, { f: 1750, t60: 0.03, g: 0.3 }],
  strokes: [[0.05, 1.0, 1], [1.05, 1.1, 0.85]], jit: 0.3,
});
export const woodCreak03 = ({ rng }) => creak({
  rng, seconds: 4.0, rate: [[0, 40], [0.9, 78], [1.8, 52], [2.7, 96], [4, 44]],
  modes: [{ f: 300, t60: 0.1, g: 0.8 }, { f: 720, t60: 0.08, g: 1 }, { f: 1300, t60: 0.06, g: 0.8 }, { f: 2100, t60: 0.05, g: 0.5 }],
  strokes: [[0.1, 1.8, 1], [2.0, 1.9, 0.9]], jit: 0.35, noiseDb: -34,
});

/** Rasp: a rough tooth drawn over wood - fast irregular grains, back and forth. */
function rasp({ rng, seconds, rate, bands, strokes }) {
  const n = samples(seconds);
  const exc = slipTrain(rng, n, rate, 0.45, 0.35);
  // each grain is itself a few ms of noise, so the rasp reads as rough rather than as a buzz
  const grains = zeros(n), r = rng.fork('grain');
  for (let i = 0; i < n; i++) if (exc[i]) {
    const len = Math.round(r.range(0.002, 0.006) * SR);
    for (let k = 0; k < len && i + k < n; k++) grains[i + k] += exc[i] * r.white() * Math.exp((-3 * k) / len);
  }
  const out = modal(grains, bands);
  return [mulInPlace(out, humps(n, strokes))];
}
export const woodRasp01 = ({ rng }) => rasp({
  rng, seconds: 1.3, rate: [[0, 170], [0.6, 210], [1.3, 160]],
  bands: [{ f: 330, t60: 0.02, g: 0.8 }, { f: 620, t60: 0.015, g: 1 }, { f: 1150, t60: 0.01, g: 0.8 }, { f: 1900, t60: 0.008, g: 0.4 }],
  strokes: [[0.03, 0.5, 1], [0.55, 0.45, 0.8], [0.95, 0.33, 0.6]],
});
// the old pair were a stand-in for ant mandibles on wood: this one is finer and faster, pitched up like the +25 % one was
export const woodRasp02 = ({ rng }) => rasp({
  rng, seconds: 1.13, rate: [[0, 200], [0.5, 250], [1.13, 190]],
  bands: [{ f: 520, t60: 0.015, g: 0.8 }, { f: 880, t60: 0.01, g: 1 }, { f: 1500, t60: 0.008, g: 0.8 }, { f: 2400, t60: 0.006, g: 0.4 }],
  strokes: [[0.03, 0.4, 1], [0.48, 0.35, 0.85], [0.86, 0.25, 0.6]],
});
