// Giant-scale sounds: footfall thuds, two mower loops, car passes, a push broom.
import {
  SR, addInPlace, band, bp, biquad, circular, curve, decay, hp, lp, lp4, lpVar, modal, mulInPlace, osc, pinkFilter, readFrac, squash,
  samples, smoothNoise, svfBand, white, zeros,
} from '../lib/dsp.mjs';

// ---------------------------------------------------------------------------------------------- thuds

/** A heavy footfall: a broad strike, a short pitch-falling body, and the floor's modes ringing on for a while. */
function thud({ rng, seconds, body, modes, bodyGain, tailGain, strikeHz }) {
  const n = samples(seconds), out = zeros(n);
  const strike = lp4(white(rng.fork('strike'), n), strikeHz);
  addInPlace(out, mulInPlace(strike, decay(n, 0.25)), 0.6);
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = body.end + (body.start - body.end) * Math.exp((-i / SR) / 0.08);
  addInPlace(out, mulInPlace(osc(f, n, 'sine'), decay(n, body.t60)), bodyGain);
  const imp = zeros(n);
  imp[2] = 1;
  addInPlace(out, modal(imp, modes), 1);
  const tail = lp4(white(rng.fork('tail'), n), 320);
  addInPlace(out, mulInPlace(tail, decay(n, 1.1)), tailGain);
  // the old pair were low-passed at 600-700 Hz with a bass shelf for weight: same here
  return [biquad(lp4(squash(out, 10), 700), 'lowshelf', 90, 0.7, 4)];
}
// sandbag on a wooden floor: a boom with the floor's knock above it
export const thudGiantStep01 = ({ rng }) => thud({
  rng, seconds: 1.6, body: { start: 150, end: 85, t60: 0.7 }, bodyGain: 0.5, tailGain: 0.3, strikeHz: 650,
  modes: [{ f: 110, t60: 1.2, g: 0.8 }, { f: 165, t60: 1.0, g: 1 }, { f: 245, t60: 0.9, g: 0.9 }, { f: 350, t60: 0.7, g: 0.7 }, { f: 470, t60: 0.5, g: 0.4 }],
});
// a hollow wooden surface: higher, longer-ringing modes and less body
export const thudGiantStep02 = ({ rng }) => thud({
  rng, seconds: 1.6, body: { start: 140, end: 90, t60: 0.5 }, bodyGain: 0.35, tailGain: 0.2, strikeHz: 600,
  modes: [{ f: 118, t60: 1.3, g: 0.7 }, { f: 172, t60: 1.1, g: 1 }, { f: 255, t60: 0.9, g: 0.9 }, { f: 360, t60: 0.7, g: 0.6 }, { f: 480, t60: 0.5, g: 0.35 }],
});

// ---------------------------------------------------------------------------------------------- mowers

/** Phase-accumulating pulse times from a rate (Hz) array, rescaled so a whole number of pulses fits the loop exactly. */
function loopPulses(rate, n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += rate[i] / SR;
  const scale = Math.round(total) / total, o = [];
  let ph = 0;
  for (let i = 0; i < n; i++) { ph += (rate[i] * scale) / SR; if (ph >= 1) { ph -= 1; o.push(i); } }
  return o;
}

/** Petrol mower at idle-to-run: a four-stroke single firing about 27 times a second, the exhaust's modes, blade hiss. */
export function lawnmowerLoop({ rng }) {
  const secs = 20, n = samples(secs);
  const wob = smoothNoise(rng.fork('gov'), n, 0.8, true), surge = smoothNoise(rng.fork('surge'), n, 0.2, true);
  const rate = new Float64Array(n);
  for (let i = 0; i < n; i++) rate[i] = 27 * (1 + 0.035 * wob[i] + 0.03 * surge[i]);
  const fire = zeros(n), r = rng.fork('fire');
  for (const at of loopPulses(rate, n)) fire[at] += r.chance(0.015) ? 0.25 : 0.8 + 0.4 * r.next(); // an occasional weak stroke
  const exhaust = circular(fire, (x) => modal(x, [{ f: 85, t60: 0.035, g: 1 }, { f: 170, t60: 0.025, g: 0.9 }, { f: 340, t60: 0.02, g: 0.6 }, { f: 620, t60: 0.012, g: 0.3 }]));
  // mechanical clatter and the blade: noise bands that follow the engine's load
  const load = smoothNoise(rng.fork('load'), n, 0.35, true);
  const clatter = circular(white(rng.fork('clatter'), n), (x) => band(x, 1200, 5200));
  const blade = circular(white(rng.fork('blade'), n), (x) => lp4(hp(x, 400), 2400));
  const out = zeros(n);
  addInPlace(out, exhaust, 1);
  for (let i = 0; i < n; i++) out[i] += clatter[i] * (0.8 + 0.2 * load[i]) * (0.6 + 0.5 * Math.max(0, exhaust[i])) + blade[i] * (1.0 + 0.2 * load[i]);
  return [out];
}

/** Push reel mower: blades flicking past the bed knife (clicks), the reel's whirr, wheels on grass, a push cadence. */
export function lawnmowerPushLoop({ rng }) {
  const secs = 20, n = samples(secs), cadenceHz = 0.7; // 14 pushes per loop
  const speed = new Float64Array(n), pulse = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ph = (2 * Math.PI * cadenceHz * (i / SR));
    pulse[i] = 0.5 + 0.5 * Math.sin(ph);
    speed[i] = 0.84 + 0.16 * pulse[i]; // a push cadence, but gentle: the level may not swing more than a dB or so
  }
  const rate = speed.map((s) => 17 * s);
  const clicks = zeros(n), r = rng.fork('click');
  for (const at of loopPulses(rate, n)) clicks[at] += 0.7 + 0.3 * r.next();
  const ring = circular(clicks, (x) => modal(x, [{ f: 2300, t60: 0.01, g: 0.5 }, { f: 4100, t60: 0.006, g: 0.3 }, { f: 950, t60: 0.02, g: 0.4 }]));
  const whirr = circular(white(rng.fork('whirr'), n), (x) => bp(x, 1700, 0.8));
  const wheels = circular(white(rng.fork('wheels'), n), (x) => lp4(pinkFilter(x), 260));
  const out = zeros(n);
  addInPlace(out, ring, 1);
  for (let i = 0; i < n; i++) out[i] += whirr[i] * 0.9 * speed[i] ** 2 + wheels[i] * 0.4 * speed[i];
  return [out];
}

// ---------------------------------------------------------------------------------------------- cars

const SOUND_SPEED = 343;

/** A car driving past the listener: engine harmonics and tyre noise as the source, read through the real propagation delay (Doppler),
 * distance attenuation and air absorption. */
function carPass({ rng, seconds, speed, offset, passAt, engineHz, engineRise, tyreGain, engineGain }) {
  const n = samples(seconds), margin = samples(1.0), len = n + 2 * margin;
  const fe = new Float64Array(len);
  for (let i = 0; i < len; i++) fe[i] = engineHz * (1 + engineRise * (i / len) + 0.01 * Math.sin(i / SR * 3));
  const saw = osc(fe, len, 'saw');
  const engine = hp(lp(lp(saw, 1500), 1500), 110);
  const firing = hp(lp(osc(fe.map((f) => f / 2), len, 'pulse', 0, 0.2), 400), 90); // low "putt" under the harmonics
  const tyre = band(white(rng.fork('tyre'), len), 200, 2600);
  const src = new Float64Array(len);
  for (let i = 0; i < len; i++) src[i] = engineGain * (engine[i] + 0.5 * firing[i]) + tyreGain * tyre[i];
  const pos = new Float64Array(n), amp = new Float64Array(n), cut = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = speed * (t - passAt), r = Math.hypot(offset, x);
    pos[i] = margin + (t - r / SOUND_SPEED) * SR;
    amp[i] = Math.pow(offset / r, 0.6); // gentler than 1/r: the old drive-bys were close-miked and stayed loud throughout
    cut[i] = Math.min(15000, Math.max(1800, 16000 * Math.exp(-r / 70)));
  }
  const y = readFrac(src, pos);
  mulInPlace(y, amp);
  return [lpVar(y, cut)];
}
// an older car, steady speed (the file the cue plays once per pass at giant scale)
export const carPass01 = ({ rng }) => carPass({ rng, seconds: 9, speed: 14, offset: 5, passAt: 4.5, engineHz: 62, engineRise: 0.03, tyreGain: 0.35, engineGain: 0.9 });
// low gear, slower, the engine working harder
export const carPass02 = ({ rng }) => carPass({ rng, seconds: 10, speed: 7.5, offset: 4, passAt: 5, engineHz: 95, engineRise: 0.1, tyreGain: 0.18, engineGain: 1.2 });

// ---------------------------------------------------------------------------------------------- broom

/** Push broom on a dirty floor: bristle strokes (a swell of bright, fluttering noise), grit ticks, a dull sweep underneath. */
function broom({ rng, seconds, strokes }) {
  const n = samples(seconds), out = zeros(n);
  const env = zeros(n);
  for (const [s, len, w] of strokes) for (let i = Math.floor(s * SR); i < Math.min(n, Math.floor((s + len) * SR)); i++) {
    const u = Math.max(0, (i / SR - s) / len);
    env[i] = Math.max(env[i], w * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.8))), 1.4));
  }
  const centre = new Float64Array(n);
  for (let i = 0; i < n; i++) centre[i] = 1300 + 1200 * env[i];
  const hiss = svfBand(white(rng.fork('hiss'), n), centre, 0.9);
  const flutter = smoothNoise(rng.fork('flutter'), n, 85);
  const bristle = new Float64Array(n);
  for (let i = 0; i < n; i++) bristle[i] = 0.75 + 0.25 * flutter[i];
  mulInPlace(mulInPlace(hiss, bristle), env);
  addInPlace(out, hiss, 1);
  const ticks = zeros(n), r = rng.fork('ticks');
  for (let i = 0; i < n; i++) if (r.next() < (env[i] * 700) / SR) ticks[i] += r.next();
  addInPlace(out, bp(ticks, 2600, 1.2), 5);
  addInPlace(out, mulInPlace(lp4(white(rng.fork('sweep'), n), 650), env), 0.35);
  return [out];
}
export const broomSweep01 = ({ rng }) => broom({ rng, seconds: 3.0, strokes: [[0.1, 0.85, 1], [1.05, 0.9, 0.9], [2.0, 0.9, 0.85]] });
export const broomSweep02 = ({ rng }) => broom({ rng, seconds: 3.0, strokes: [[0.0, 0.7, 0.9], [0.85, 1.0, 1], [2.0, 0.95, 0.8]] });
