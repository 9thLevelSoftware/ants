// Ground foley: soil scrapes (digging), gravel grit (sliding steps), dry crunch. All built from sparse random grains
// rung through band filters or short resonators, shaped by a stroke envelope.
import { SR, addInPlace, bp, curve, decay, lp, lp4, modal, mulInPlace, samples, smoothNoise, white, zeros } from '../lib/dsp.mjs';

/** Poisson impulses: `rate[i]` events per second at sample i, amplitude from gain(). */
function poisson(rng, n, rate, gain) {
  const o = zeros(n);
  for (let i = 0; i < n; i++) if (rng.next() < rate[i] / SR) o[i] += gain();
  return o;
}

/** A sum of band-rung grain trains: `bands` = [[centreHz, q, weight]], each fed by its own Poisson train. */
function grit(rng, n, rate, bands, gamma = 2) {
  const out = zeros(n);
  bands.forEach(([fc, q, w], i) => {
    const r = rng.fork(`band${i}`);
    const train = poisson(r, n, rate, () => (r.next() < 0.5 ? 1 : -1) * Math.pow(r.next(), gamma));
    addInPlace(out, bp(train, fc, q), w);
  });
  return out;
}

/** Rate envelope with stick-slip: `strokes` = [[start s, length s, peak rate]], each a quick rise and a slower fall. */
function strokeRate(rng, n, strokes) {
  const rate = zeros(n), wob = smoothNoise(rng.fork('wob'), n, 22);
  for (const [s, len, peak] of strokes) {
    for (let i = Math.floor(s * SR); i < Math.min(n, Math.floor((s + len) * SR)); i++) {
      const u = Math.max(0, (i / SR - s) / len), shape = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.6))), 1.5);
      rate[i] += peak * shape * (0.65 + 0.35 * wob[i]);
    }
  }
  return rate;
}

/** Soil scrape: grit in a soft band, a dull body under it. `plunge` adds the thump of the blade going in. */
function soilScrape({ rng, seconds, strokes, bands, bodyHz, plunge }) {
  const n = samples(seconds), rate = strokeRate(rng, n, strokes);
  const out = grit(rng.fork('grit'), n, rate, bands);
  const env = zeros(n);
  for (let i = 0; i < n; i++) env[i] = rate[i] / 1000;
  const body = lp4(white(rng.fork('body'), n), bodyHz);
  addInPlace(out, mulInPlace(body, env), 0.22);
  if (plunge) {
    const imp = zeros(n);
    imp[Math.floor(plunge * SR)] = 1;
    addInPlace(out, modal(imp, [{ f: 120, t60: 0.08, g: 1 }, { f: 230, t60: 0.05, g: 0.5 }]), 0.25);
  }
  return [out];
}

export const soilScrape01 = ({ rng }) => soilScrape({
  rng, seconds: 1.17, strokes: [[0.04, 1.05, 900]], bands: [[1500, 1.2, 1], [2600, 1.4, 0.9], [4000, 1.6, 0.6], [6200, 1.8, 0.35]], bodyHz: 900,
});
export const soilScrape02 = ({ rng }) => soilScrape({
  rng, seconds: 1.4, strokes: [[0.12, 0.6, 700], [0.7, 0.65, 850]], bands: [[1100, 1.1, 1], [2000, 1.3, 1], [3400, 1.5, 0.7], [5200, 1.8, 0.35]], bodyHz: 650, plunge: 0.1,
});

/** Gravel grit: clusters of stone ticks from sliding steps. `clusters` = [[start, length, rate]]. */
function gravelGrit({ rng, seconds, clusters, bands }) {
  const n = samples(seconds), rate = strokeRate(rng, n, clusters);
  const out = grit(rng.fork('grit'), n, rate, bands, 2.4);
  const scuff = lp(white(rng.fork('scuff'), n), 900);
  const env = zeros(n);
  for (let i = 0; i < n; i++) env[i] = rate[i] / 500;
  addInPlace(out, mulInPlace(scuff, env), 0.05);
  return [out];
}
// stones are short and bright: modal ticks rather than broad noise
const stoneTicks = [[1300, 5, 1], [2000, 6, 0.9], [2900, 6, 0.8], [4000, 7, 0.5]];
export const gravelGrit02 = ({ rng }) => gravelGrit({ rng, seconds: 0.9, clusters: [[0.02, 0.28, 520], [0.34, 0.25, 430], [0.62, 0.26, 560]], bands: stoneTicks });
export const gravelGrit03 = ({ rng }) => gravelGrit({ rng, seconds: 0.9, clusters: [[0.0, 0.3, 480], [0.38, 0.22, 600], [0.64, 0.24, 380]], bands: [[1200, 5, 1], [1900, 6, 1], [2700, 6, 0.8], [3800, 7, 0.55]] });

/** Dry brittle crunch: cracks, densest at the start, each a short band-limited burst; a few low pops. */
export function crunch03({ rng }) {
  const n = samples(1.0), out = zeros(n), r = rng.fork('cracks');
  // brittle material giving way: a steady crackle (about 260 grains a second, thinning over the second) with some bigger cracks
  for (let t = 0; t < 1.0;) {
    t += -Math.log(1 - r.next()) / (650 * Math.exp(-t / 0.8));
    if (t >= 0.98) break;
    const big = r.chance(0.03);
    const len = samples(r.range(0.004, big ? 0.03 : 0.014)), burst = decay(len, r.range(0.005, big ? 0.03 : 0.012));
    const nz = bp(white(r.fork(`n${Math.round(t * SR)}`), len), r.range(500, big ? 2600 : 4200), r.range(0.7, 1.3));
    mulInPlace(nz, burst);
    const at = Math.floor(t * SR), g = (big ? 1.8 : 0.3 + 0.7 * Math.pow(r.next(), 2)) * (1 - 0.5 * t);
    for (let i = 0; i < len && at + i < n; i++) out[at + i] += g * nz[i];
    if (big) {
      const imp = zeros(samples(0.06));
      imp[0] = 1;
      addInPlace(out.subarray(at, Math.min(n, at + imp.length)), modal(imp, [{ f: r.range(250, 700), t60: 0.025 }]).subarray(0, Math.min(n - at, imp.length)), 0.5 * g);
    }
  }
  return [out];
}
