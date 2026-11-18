// Ambience beds. Every bed is periodic by construction: noise is filtered "around the circle" (circular()) and events
// wrap past the end (addWrap()), so the last sample flows into the first with no crossfade and no seam.
// None of these contains a voice or a tonal melody; the playground bed is deliberately voice-less (GDD 08 13.7).
import {
  SR, addInPlace, addWrap, band, biquad, bp, circular, decay, dbToGain, hp, lp, lp4, hp4, modal, mulInPlace, osc, pinkFilter, samples,
  smoothNoise, white, zeros,
} from '../lib/dsp.mjs';
import { addChirp } from '../lib/insects.mjs';

/** Pink noise made loop-safe: white noise coloured and shaped by `fn` as if it repeated forever. */
const pinkLoop = (rng, n, fn) => circular(white(rng, n), (w) => fn(pinkFilter(w)));

/** Level control that breathes: exp(depthDb/20 * smoothNoise) so the bed is never a flat hiss. */
function breathe(rng, n, rateHz, depthDb) {
  const c = smoothNoise(rng, n, rateHz, true);
  for (let i = 0; i < n; i++) c[i] = dbToGain(depthDb * c[i]);
  return c;
}

/** Impulse train with random gains from `gain()` at `perSecond` events per second (wrapping not needed: it is indexed). */
function impulses(rng, n, perSecond, gain) {
  const o = zeros(n), count = Math.round((n / SR) * perSecond);
  for (let k = 0; k < count; k++) o[Math.floor(rng.next() * n)] += gain();
  return o;
}

// ---------------------------------------------------------------------------------------------- crickets

export function cricketsNight({ rng }) {
  const n = samples(45), out = zeros(n);
  const bout = (r) => smoothNoise(r, n, 0.12, true);
  const VOICES = 64;
  for (let v = 0; v < VOICES; v++) {
    const r = rng.fork(`voice${v}`);
    const tree = v % 7 === 0; // a few lower, steadier tree crickets among the field crickets
    const f = tree ? r.range(2700, 3300) : r.range(4000, 5100);
    const pulses = tree ? 6 : r.int(3, 5), period = tree ? 0.016 : r.range(0.022, 0.031);
    const every = tree ? r.range(0.22, 0.3) : r.range(0.42, 0.95);
    const gain = dbToGain(-20 * Math.pow(r.next(), 0.7)); // many distant, a few near
    const active = bout(r), thresh = r.range(-0.6, 0.2);
    for (let t = r.range(0, every); t < 45; t += every * r.range(0.96, 1.04)) {
      const s = Math.floor(t * SR);
      if (active[Math.min(n - 1, s)] < thresh) continue;
      addChirp(out, s, f * r.range(0.994, 1.006), pulses, period * r.range(0.97, 1.03), gain * r.range(0.8, 1));
    }
  }
  // faint leaves and air under the chorus
  const air = pinkLoop(rng.fork('air'), n, (x) => band(x, 900, 7000));
  addInPlace(out, mulInPlace(air, breathe(rng.fork('airlvl'), n, 0.2, 3)), 0.012);
  return [out];
}

// ---------------------------------------------------------------------------------------------- rain

export function rainHeavy({ rng }) {
  const n = samples(42);
  // the sheet: pink noise tilted toward 2-8 kHz, breathing a little
  // (+5 dB around 3 kHz so the hiss reads as rain, not as plain noise)
  const sheet = pinkLoop(rng.fork('sheet'), n, (x) => biquad(lp4(hp(x, 250), 9500), 'peak', 3200, 0.5, 5));
  mulInPlace(sheet, breathe(rng.fork('sheetlvl'), n, 0.35, 1.8));
  // the drops: impulse trains rung by band-passes, bigger drops lower
  const drops = zeros(n);
  const centres = [1400, 2100, 3000, 4300, 6200];
  centres.forEach((fc, i) => {
    const r = rng.fork(`drops${i}`);
    const tr = impulses(r, n, 260 - 30 * i, () => (r.next() < 0.5 ? 1 : -1) * Math.pow(r.next(), 2.2));
    addInPlace(drops, circular(tr, (x) => bp(x, fc, 1.4)), 1.0 - 0.1 * i);
  });
  // heavy drops on the ground: low, short knocks
  const knocks = impulses(rng.fork('knocks'), n, 14, () => Math.pow(rng.next(), 1.5));
  const knock = circular(knocks, (x) => modal(x, [{ f: 140, t60: 0.06, g: 1 }, { f: 260, t60: 0.04, g: 0.6 }]));
  const thrum = pinkLoop(rng.fork('thrum'), n, (x) => lp4(x, 220));
  const out = zeros(n);
  addInPlace(out, sheet, 1);
  addInPlace(out, drops, 0.9);
  addInPlace(out, knock, 0.35);
  addInPlace(out, thrum, 0.5);
  return [out];
}

// ---------------------------------------------------------------------------------------------- street

/** A car passing far away: tyre noise and engine harmonics under a smooth bell, engine pitch falling ~6% (Doppler). */
function distantCar(rng, n, startS, durS, gain) {
  const len = samples(durS), env = new Float64Array(len);
  for (let i = 0; i < len; i++) env[i] = Math.pow(Math.sin((Math.PI * i) / len), 2.2);
  const tyre = band(white(rng.fork('tyre'), len), 350, 2200);
  const f0 = rng.range(70, 115);
  const fr = new Float64Array(len);
  for (let i = 0; i < len; i++) fr[i] = f0 * (1.03 - 0.06 * (i / len));
  const eng = osc(fr, len, 'saw');
  const engL = lp(lp(eng, 420), 420);
  const sig = new Float64Array(len);
  for (let i = 0; i < len; i++) sig[i] = (tyre[i] * 0.5 + engL[i] * 0.9) * env[i];
  const out = zeros(n);
  addWrap(out, sig, startS * SR, gain);
  return out;
}

export function streetSuburban({ rng }) {
  const n = samples(29), out = zeros(n);
  // neighbourhood wash: mid noise that never quite settles
  const wash = pinkLoop(rng.fork('wash'), n, (x) => lp4(hp(x, 140), 2600));
  addInPlace(out, mulInPlace(wash, breathe(rng.fork('washlvl'), n, 0.3, 2.5)), 1);
  const hum = pinkLoop(rng.fork('hum'), n, (x) => lp4(x, 180));
  addInPlace(out, hum, 0.8);
  addInPlace(out, distantCar(rng.fork('car1'), n, 3.5, 7.0, 0.55));
  addInPlace(out, distantCar(rng.fork('car2'), n, 17.5, 6.0, 0.4));
  // a few far-off birds: short rising-falling whistles, high and quiet
  const r = rng.fork('birds');
  for (let k = 0; k < 7; k++) {
    const len = samples(r.range(0.06, 0.14)), f0 = r.range(2600, 4300), up = r.range(-0.25, 0.3);
    const fr = new Float64Array(len), env = new Float64Array(len);
    for (let i = 0; i < len; i++) { const u = i / len; fr[i] = f0 * (1 + up * Math.sin(Math.PI * u)); env[i] = Math.sin(Math.PI * u) ** 2; }
    const b = osc(fr, len, 'sine');
    mulInPlace(b, env);
    for (let rep = 0, at = r.range(0, 29); rep < r.int(1, 3); rep++, at += r.range(0.12, 0.22)) addWrap(out, b, at * SR, 0.05 * r.range(0.5, 1));
  }
  return [out];
}

// ---------------------------------------------------------------------------------------------- traffic

export function trafficDistant({ rng }) {
  const n = samples(45), out = zeros(n);
  const low = pinkLoop(rng.fork('low'), n, (x) => lp4(x, 900));
  addInPlace(out, mulInPlace(low, breathe(rng.fork('swell'), n, 0.22, 4.5)), 1);
  const rumble = pinkLoop(rng.fork('rumble'), n, (x) => lp4(x, 110));
  addInPlace(out, mulInPlace(rumble, breathe(rng.fork('rumblelvl'), n, 0.15, 3)), 0.45);
  // far tyre hiss in slow waves, as separate traffic streams come and go
  const hiss = circular(white(rng.fork('hiss'), n), (x) => band(x, 500, 2600));
  addInPlace(out, mulInPlace(hiss, breathe(rng.fork('hisslvl'), n, 0.28, 7)), 0.18);
  return [out];
}

// ---------------------------------------------------------------------------------------------- playground

/** A ball bouncing: damped hollow thumps at shrinking intervals. */
function ballBounces(out, rng, startS, gain) {
  const f = rng.range(110, 190);
  let gap = rng.range(0.42, 0.55), t = startS, g = gain;
  while (gap > 0.05) {
    const len = samples(0.2), imp = zeros(len);
    imp[0] = 1; imp[3] = -0.5;
    const hit = modal(imp, [{ f, t60: 0.09, g: 1 }, { f: f * 2.3, t60: 0.05, g: 0.5 }]);
    addWrap(out, hit, t * SR, g);
    t += gap; gap *= 0.72; g *= 0.85;
  }
}

/** A chain link clink: three inharmonic metal modes. */
function chainClink(out, startS, gain, f = 2100) {
  const len = samples(0.5), imp = zeros(len);
  imp[0] = 1;
  const c = modal(imp, [{ f, t60: 0.22, g: 1 }, { f: f * 1.62, t60: 0.15, g: 0.6 }, { f: f * 2.49, t60: 0.1, g: 0.4 }]);
  addWrap(out, c, startS * SR, gain);
}

export function playgroundDistant({ rng }) {
  const n = samples(45), out = zeros(n);
  // the general activity wash: broadband, slow irregular swells, no formant structure
  const wash = pinkLoop(rng.fork('wash'), n, (x) => band(x, 160, 3800));
  addInPlace(out, mulInPlace(wash, breathe(rng.fork('activity'), n, 0.5, 6)), 1);
  const patter = circular(white(rng.fork('patter'), n), (x) => band(x, 1200, 4200));
  addInPlace(out, mulInPlace(patter, breathe(rng.fork('patterlvl'), n, 1.1, 9)), 0.12);
  const r = rng.fork('play');
  for (let k = 0; k < 5; k++) ballBounces(out, r, r.range(0, 42), r.range(0.15, 0.4));
  for (let k = 0; k < 12; k++) chainClink(out, r.range(0, 45), r.range(0.05, 0.15), r.range(1800, 2600));
  // the old bed was low-passed at 4.2 kHz and high-passed at 120 Hz so it reads as far away
  return [circular(out, (x) => lp4(hp4(x, 120), 4200))];
}

// ---------------------------------------------------------------------------------------------- underground

/** Frequencies snap to whole cycles per loop so the drones wrap exactly. */
const wholeCycles = (f, seconds) => Math.round(f * seconds) / seconds;

export function undergroundRumble({ rng }) {
  const secs = 40, n = samples(secs), chs = [];
  const shape = (w) => lp4(hp4(pinkFilter(w), 22), 320);
  // most of the rumble is shared by both ears (earth is not a point source); a smaller part is independent
  const shared = circular(white(rng.fork('shared'), n), shape);
  const knockR = rng.fork('knocks');
  const knocks = Array.from({ length: 3 }, (_, k) => ({ at: knockR.range(0, secs), noise: lp4(white(knockR.fork(`k${k}`), samples(1.6)), 120) }));
  const phases = [rng.next(), rng.next(), rng.next()];
  for (const side of ['l', 'r']) {
    const r = rng.fork(side), out = zeros(n);
    const own = circular(white(r.fork('own'), n), shape);
    const bed = zeros(n);
    addInPlace(bed, shared, 0.8);
    addInPlace(bed, own, 0.6);
    addInPlace(out, mulInPlace(bed, breathe(r.fork('swell'), n, 0.09, 3.5)), 1);
    // slow-beating drones, the same in both ears with their own slow level drift
    [[38, 0.8], [45.5, 0.6], [57, 0.35]].forEach(([f, g], i) => {
      const d = osc(wholeCycles(f, secs), n, 'sine', phases[i]);
      addInPlace(out, mulInPlace(d, breathe(r.fork(`d${f}`), n, 0.12, 4)), g * 0.5);
    });
    // settling: soft low knocks every so often, in both ears
    for (const k of knocks) addWrap(out, mulInPlace(Float64Array.from(k.noise), decay(k.noise.length, 1.2)), k.at * SR, 1.6);
    chs.push(out);
  }
  return chs;
}
