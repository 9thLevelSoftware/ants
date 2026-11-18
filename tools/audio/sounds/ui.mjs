// Interface clicks and the water drips. Short, soft, no hard edge.
import { SR, addAt, addInPlace, bp, decay, echoTail, lp4, modal, mulInPlace, osc, samples, white, zeros } from '../lib/dsp.mjs';

/** A soft click: a few ms of band-limited noise for the touch, a short damped tone for the body, a low tap under it. */
function click({ rng, seconds, tickHz, toneHz, toneT60, tapGain, tickGain }) {
  const n = samples(seconds), out = zeros(n);
  const tick = bp(white(rng.fork('tick'), n), tickHz, 1.2);
  addInPlace(out, mulInPlace(tick, decay(n, 0.004)), tickGain);
  addInPlace(out, mulInPlace(osc(toneHz, n, 'sine'), decay(n, toneT60)), 1);
  const imp = zeros(n);
  imp[0] = 1;
  addInPlace(out, modal(imp, [{ f: 310, t60: 0.012, g: 1 }]), tapGain);
  return [out];
}
export const uiClick01 = ({ rng }) => click({ rng, seconds: 0.11, tickHz: 3200, toneHz: 1500, toneT60: 0.035, tapGain: 0.25, tickGain: 3 });
export const uiClick02 = ({ rng }) => click({ rng, seconds: 0.1, tickHz: 3400, toneHz: 1900, toneT60: 0.03, tapGain: 0.3, tickGain: 2 });
export const uiClick03 = ({ rng }) => click({ rng, seconds: 0.07, tickHz: 7000, toneHz: 4800, toneT60: 0.006, tapGain: 0.05, tickGain: 6 });

/** Hover: a soft low blip that rises a little and dies away, with a smooth start (no edge at all). */
export function uiHover01() {
  const n = samples(0.11), f = new Float64Array(n), env = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = i / n; f[i] = 700 + 280 * u; env[i] = Math.pow(Math.sin(Math.PI * Math.min(1, u * 6) / 2), 2) * Math.exp(-4 * u); }
  return [mulInPlace(osc(f, n, 'sine'), env)];
}

/** Switch: two clicks, the second lower and a little heavier, like a toggle going over. */
export function uiSwitch01({ rng }) {
  const n = samples(0.22), out = zeros(n);
  addAt(out, click({ rng: rng.fork('a'), seconds: 0.09, tickHz: 3600, toneHz: 1700, toneT60: 0.03, tapGain: 0.2, tickGain: 3 })[0], 0, 1);
  addAt(out, click({ rng: rng.fork('b'), seconds: 0.12, tickHz: 2600, toneHz: 1100, toneT60: 0.045, tapGain: 0.35, tickGain: 2 })[0], 0.085 * SR, 1.1);
  return [out];
}

/**
 * A water drip in a hollow room: the drop's bubble rings and its pitch climbs as the bubble shrinks (Minnaert), a small
 * splash tick, then a couple of short echoes. `drops` = [[start s, bubble Hz, gain]].
 */
function drip({ rng, seconds, drops, echoes, echoMix }) {
  const n = samples(seconds), out = zeros(n);
  for (const [t, f0, g] of drops) {
    const len = samples(0.16), f = new Float64Array(len);
    for (let i = 0; i < len; i++) f[i] = f0 * (1 + 0.55 * (1 - Math.exp((-i / SR) / 0.012)));
    const bubble = mulInPlace(osc(f, len, 'sine'), decay(len, 0.07));
    const splash = mulInPlace(bp(white(rng.fork(`s${t}`), len), 3400, 1.5), decay(len, 0.006));
    addAt(out, bubble, t * SR, g);
    addAt(out, splash, t * SR, g * 0.6);
  }
  return [echoTail(lp4(out, 9000), echoes, 0.38, echoMix)];
}
export const waterDrip01 = ({ rng }) => drip({ rng, seconds: 0.9, drops: [[0.07, 820, 1], [0.58, 1050, 0.45]], echoes: [0.113, 0.197], echoMix: 0.22 });
export const waterDrip02 = ({ rng }) => drip({ rng, seconds: 0.9, drops: [[0.1, 1180, 1], [0.4, 960, 0.5], [0.69, 1320, 0.3]], echoes: [0.131, 0.229], echoMix: 0.2 });
