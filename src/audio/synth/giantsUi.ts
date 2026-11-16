// Giant human sounds (GDD 08 §13.6), UI / alert tones (§13.8) and the granular ambience grains (§13.4).
import { bandMakeup, type ShotRecipe, type SynthKit } from './kit';

function burst(k: SynthKit, out: AudioNode, t: number, gain: number, f: number, q: number, a: number, d: number, kind: 'white' | 'pink' | 'brown' = 'white', type: BiquadFilterType = 'bandpass'): number {
  k.chain(k.noise(kind, t, a + d + 0.05), k.filter(type, f, q), k.ad(t, gain * bandMakeup(type, f, q, k.ctx.sampleRate), a, d), out);
  return a + d + 0.05;
}

function tone(k: SynthKit, out: AudioNode, t: number, gain: number, freq: number, len: number, type: OscillatorType = 'sine'): void {
  k.chain(k.osc(type, freq, t, len + 0.05), k.ahr(t, gain, 0.008, Math.max(0, len - 0.04), 0.03), out);
}

/** A soft wooden tone: sine plus its octave with a quick decay. */
function wood(k: SynthKit, out: AudioNode, t: number, gain: number, freq: number, len: number): void {
  k.chain(k.osc('sine', freq, t, len + 0.1), k.ad(t, gain, 0.004, len), out);
  k.chain(k.osc('sine', freq * 2, t, len + 0.1), k.ad(t, gain * 0.35, 0.002, len * 0.5), out);
}

export const GIANTS: Record<string, ShotRecipe> = {
  /** Giant footfall sub layer: sine sweep 80 -> 35 Hz over 300 ms. */
  'sub-thump': (k, o, t, p) => {
    const s = k.osc('sine', 80 * p.rate, t, 0.45);
    s.frequency.exponentialRampToValueAtTime(35 * p.rate, t + 0.3);
    k.chain(s, k.ad(t, p.gain, 0.008, 0.4), o);
    return 0.45;
  },
  /** Warning tremor: 30-60 Hz sine whose amplitude rises over the warning time, cut at the impact. */
  'sub-tremor': (k, o, t, p) => {
    const len = p.durS ?? 3;
    const g = k.gain(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p.gain, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.1);
    const s = k.osc('sine', 30 * p.rate, t, len + 0.15);
    s.frequency.linearRampToValueAtTime(60 * p.rate, t + len);
    k.chain(s, g, o);
    return len + 0.15;
  },
  /** Engine (mower fallback): 32 Hz sawtooth + 2nd harmonic, low-passed 400 Hz, with a noise layer. */
  'engine': (k, o, t, p) => {
    const len = p.durS ?? 4;
    const env = k.ahr(t, p.gain, 0.6, Math.max(0, len - 1.2), 0.6);
    const lp = k.filter('lowpass', 400, 1);
    lp.connect(env).connect(o);
    k.osc('sawtooth', 32 * p.rate, t, len).connect(lp);
    const h2 = k.gain(0.5);
    k.osc('sawtooth', 64.5 * p.rate, t, len).connect(h2).connect(lp);
    const n = k.gain(0.4);
    k.noise('brown', t, len).connect(n).connect(lp);
    return len;
  },
  /** Reel mower fallback: noise band 3 kHz amplitude-modulated at 12 Hz. */
  'reel-whirr': (k, o, t, p) => {
    const len = p.durS ?? 4;
    const am = k.gain(0.5), depth = k.gain(0.5);
    k.osc('sine', 12, t, len).connect(depth).connect(am.gain);
    k.chain(k.noise('pink', t, len), k.filter('bandpass', 3000, 0.7), am, k.ahr(t, p.gain, 0.5, Math.max(0, len - 1), 0.5), o);
    return len;
  },
  /** Broom swish fallback: noise band-pass sweeping 1 -> 4 kHz over 0.8 s. */
  'broom-swish': (k, o, t, p) => {
    const bp = k.filter('bandpass', 1000, 0.8);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.8);
    k.chain(k.noise('pink', t, 0.9), bp, k.ahr(t, p.gain, 0.2, 0.3, 0.4), o);
    return 0.9;
  },
  /** Vacuum: band-passed noise roar (900 Hz) plus a 120-180 Hz motor tone with slow pitch drift. */
  'vacuum': (k, o, t, p) => {
    const len = p.durS ?? 4;
    const env = k.ahr(t, p.gain, 1.2, Math.max(0, len - 2), 0.8);
    env.connect(o);
    k.chain(k.noise('white', t, len), k.filter('bandpass', 900, 0.5), env);
    const m = k.osc('sawtooth', 120, t, len);
    m.frequency.linearRampToValueAtTime(180, t + len * 0.6);
    m.frequency.linearRampToValueAtTime(150, t + len);
    const mg = k.gain(0.3);
    k.chain(m, k.filter('lowpass', 800, 1), mg, env);
    return len;
  },
  /** Tyre roll: brown noise low-passed 200 Hz with an 8-20 Hz texture. */
  'tyre-roll': (k, o, t, p) => {
    const len = p.durS ?? 6;
    const am = k.gain(0.6), depth = k.gain(0.4);
    k.osc('triangle', k.rng.range(8, 20), t, len).connect(depth).connect(am.gain);
    k.chain(k.noise('brown', t, len), k.filter('lowpass', 200, 0.7), am, k.ahr(t, p.gain, len * 0.45, 0.1, len * 0.45), o);
    return len;
  },
  /** Car pass fallback: tyre roll plus a 55 Hz engine, swelling and fading over 6 s. */
  'car-pass': (k, o, t, p) => {
    GIANTS['tyre-roll'](k, o, t, { ...p, durS: 6 });
    k.chain(k.osc('sawtooth', 55, t, 6), k.filter('lowpass', 300, 1), k.ahr(t, p.gain * 0.5, 2.7, 0.3, 3), o);
    return 6;
  },
  /** Hose / watering spray: white noise band 1-6 kHz. */
  'hose-hiss': (k, o, t, p) => {
    const len = p.durS ?? 3;
    k.chain(k.noise('white', t, len), k.filter('highpass', 1000, 0.7), k.filter('lowpass', 6000, 0.7), k.ahr(t, p.gain, 0.3, Math.max(0, len - 0.8), 0.5), o);
    return len;
  },
  /** Children's play nearby: sand thump, pink noise low-passed 300 Hz plus a 60 Hz knock. */
  'sand-thump': (k, o, t, p) => {
    burst(k, o, t, p.gain, 300, 0.7, 0.005, 0.15, 'pink', 'lowpass');
    k.chain(k.osc('sine', 60, t, 0.2), k.ad(t, p.gain * 0.7, 0.004, 0.15), o);
    return 0.25;
  },
  /** Spill: slow glug, three 120-200 Hz sine bubbles rising, 0.3 s apart. */
  'glug': (k, o, t, p) => {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.3;
      const s = k.osc('sine', k.rng.range(120, 160), tt, 0.25);
      s.frequency.exponentialRampToValueAtTime(220, tt + 0.2);
      k.chain(s, k.ad(tt, p.gain, 0.01, 0.2), o);
    }
    return 1;
  },
  /** Bait station: plastic clack, two filtered clicks at 800 Hz and 1.2 kHz. */
  'plastic-clack': (k, o, t, p) => {
    burst(k, o, t, p.gain, 800, 6, 0.0005, 0.03);
    burst(k, o, t + 0.07, p.gain * 0.8, 1200, 6, 0.0005, 0.03);
    return 0.15;
  },
  /** Thunder: noise burst low-passed 120-300 Hz with a long rumbling tail (3-8 s) of decaying swells. */
  'thunder': (k, o, t, p) => {
    const len = 3 + 5 * Math.min(1, Math.max(0, p.strength));
    const lp = k.filter('lowpass', k.rng.range(120, 300), 0.7);
    const env = k.gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(p.gain, t + 0.05);
    let tt = t + 0.3;
    while (tt < t + len - 0.5) {
      env.gain.setTargetAtTime(p.gain * k.rng.range(0.25, 0.7) * (1 - (tt - t) / len), tt, 0.2);
      tt += k.rng.range(0.3, 0.9);
    }
    env.gain.setTargetAtTime(0, t + len - 0.5, 0.15);
    k.chain(k.noise('brown', t, len + 0.5), lp, env, o);
    return len + 0.5;
  },
};

export const UI_TONES: Record<string, ShotRecipe> = {
  /** Button click fallback: 1 ms noise click at 3 kHz plus a 20 ms 2 kHz wood tick. */
  'ui-click': (k, o, t, p) => { burst(k, o, t, p.gain, 3000 * p.rate, 1.5, 0.0005, 0.002); wood(k, o, t, p.gain * 0.5, 2000 * p.rate, 0.02); return 0.06; },
  /** Hover fallback: a quieter 4 kHz tick. */
  'ui-hover': (k, o, t, p) => burst(k, o, t, p.gain * 0.5, 4000, 2, 0.0005, 0.002),
  /** Toggle fallback: two clicks 30 ms apart, the second lower. */
  'ui-switch': (k, o, t, p) => { wood(k, o, t, p.gain, 1800, 0.02); wood(k, o, t + 0.03, p.gain * 0.8, 1300, 0.025); return 0.1; },
  /** Alert notice: soft wooden tick, sine 880 Hz + 1760 Hz, 60 ms. */
  'alert-notice': (k, o, t, p) => { wood(k, o, t, p.gain, 880, 0.06); return 0.15; },
  /** Alert warning: two notes, 660 Hz then 495 Hz, 120 ms each. */
  'alert-warning': (k, o, t, p) => { tone(k, o, t, p.gain, 660, 0.12, 'triangle'); tone(k, o, t + 0.13, p.gain, 495, 0.12, 'triangle'); return 0.3; },
  /** Alert critical: three low notes, 392, 330, 262 Hz, 160 ms each. */
  'alert-critical': (k, o, t, p) => {
    [392, 330, 262].forEach((f, i) => tone(k, o, t + i * 0.17, p.gain, f, 0.16, 'triangle'));
    return 0.55;
  },
  /** Milestone: three rising notes of the season's scale (freqs given by the caller), FM-free bell tones. */
  'milestone-motif': (k, o, t, p) => {
    const f = p.freqs ?? [587.3, 698.5, 880];
    f.forEach((hz, i) => wood(k, o, t + i * 0.18, p.gain, hz, 0.5));
    return 0.18 * f.length + 0.5;
  },
  /** Camera shutter (photo mode): two quick clicks 24 ms apart, 4 kHz then a lower 2 kHz one, each on a short knock. */
  'shutter-click': (k, o, t, p) => {
    burst(k, o, t, p.gain, 4000, 2, 0.0004, 0.004);
    wood(k, o, t, p.gain * 0.4, 1800, 0.02);
    burst(k, o, t + 0.024, p.gain * 0.8, 2200, 2, 0.0004, 0.005);
    wood(k, o, t + 0.024, p.gain * 0.3, 1100, 0.025);
    return 0.12;
  },
  /** Journal / codex page: noise swish 180 ms, band 1-5 kHz. */
  'page-turn': (k, o, t, p) => {
    const bp = k.filter('bandpass', 1500, 0.6);
    bp.frequency.exponentialRampToValueAtTime(4500, t + 0.15);
    k.chain(k.noise('pink', t, 0.2), bp, k.ahr(t, p.gain, 0.05, 0.05, 0.08), o);
    return 0.2;
  },
};

export const GRAINS: Record<string, ShotRecipe> = {
  /** Near-field raindrop: 15 ms noise tick at 3 kHz plus a 1.5-3 kHz ping. */
  'droplet': (k, o, t, p) => {
    burst(k, o, t, p.gain, 3000, 0.8, 0.0005, 0.015, 'pink');
    k.chain(k.osc('sine', k.rng.range(1500, 3000), t, 0.04), k.ad(t, p.gain * 0.3, 0.001, 0.02), o);
    return 0.05;
  },
  /** Hot-surface expansion tick: 1 ms click at 7-10 kHz. */
  'heat-tick': (k, o, t, p) => burst(k, o, t, p.gain, k.rng.range(7000, 10000), 3, 0.0003, 0.0015),
  /** Ice tick: glassy ping 3-6 kHz, 30 ms. */
  'ice-tick': (k, o, t, p) => {
    k.chain(k.osc('sine', k.rng.range(3000, 6000), t, 0.05), k.ad(t, p.gain, 0.0005, 0.03), o);
    return 0.05;
  },
  /** Nest murmur grain: soft click 2-5 kHz, 2 ms. */
  'nest-tick': (k, o, t, p) => burst(k, o, t, p.gain, k.rng.range(2000, 5000), 1.5, 0.0005, 0.002, 'pink'),
  /** Wood-nest crackle grain: 1.5 ms broadband crack. */
  'crackle': (k, o, t, p) => burst(k, o, t, p.gain, k.rng.range(1500, 4000), 0.8, 0.0003, 0.0015),
  /** Crowd patter grain (many footsteps): the step click. */
  'patter': (k, o, t, p) => burst(k, o, t, p.gain, k.rng.range(3500, 7000), 1.2, 0.0005, 0.003),
};
