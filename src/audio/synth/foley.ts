// Ant-scale foley recipes (GDD 08 §13.5, §13.7) and fallbacks for file-based cues. Each comment states the recipe.
import type { ShotRecipe, SynthKit } from './kit';

/** Filtered noise burst: `kind` noise -> band-pass(f, q) -> AD envelope. Shared by most clicks and grains. */
function burst(k: SynthKit, out: AudioNode, t: number, gain: number, f: number, q: number, a: number, d: number, kind: 'white' | 'pink' | 'brown' = 'white', type: BiquadFilterType = 'bandpass'): number {
  k.chain(k.noise(kind, t, a + d + 0.05), k.filter(type, f, q), k.ad(t, gain, a, d), out);
  return a + d + 0.05;
}

/** Short sine ping with exponential decay. */
function ping(k: SynthKit, out: AudioNode, t: number, gain: number, freq: number, d: number, type: OscillatorType = 'sine'): number {
  k.chain(k.osc(type, freq, t, d + 0.05), k.ad(t, gain, 0.001, d), out);
  return d + 0.05;
}

export const FOLEY: Record<string, ShotRecipe> = {
  /** Step: 2-4 ms white-noise click band-passed 3-8 kHz; pitch by substrate via rate. */
  'step-click': (k, o, t, p) => burst(k, o, t, p.gain, 5000 * p.rate, 1.2, 0.0005, 0.003 + 0.001 * k.rng.next()),
  /** Pellet / frass drop: grain trickle, 40 ms noise burst 2-6 kHz with a few grain spikes. */
  'grain-trickle': (k, o, t, p) => {
    burst(k, o, t, p.gain * 0.6, 3500 * p.rate, 0.8, 0.002, 0.04);
    for (let i = 0; i < 4; i++) burst(k, o, t + k.rng.range(0, 0.035), p.gain, k.rng.range(2000, 6000) * p.rate, 2, 0.0005, 0.004);
    return 0.09;
  },
  /** Mandible click: two 1.5 ms pulses at 6 kHz, 12 ms apart. */
  'mandible-click': (k, o, t, p) => {
    burst(k, o, t, p.gain, 6000 * p.rate, 3, 0.0003, 0.0015);
    burst(k, o, t + 0.012, p.gain * 0.8, 6000 * p.rate, 3, 0.0003, 0.0015);
    return 0.06;
  },
  /** Bite: mandible pulse pair plus a short 2 kHz body knock. */
  'bite-click': (k, o, t, p) => {
    burst(k, o, t, p.gain, 5000 * p.rate, 2, 0.0003, 0.002);
    burst(k, o, t + 0.008, p.gain * 0.9, 2200 * p.rate, 2, 0.0005, 0.01);
    return 0.06;
  },
  /** Grapple scuffle: 200 ms of pink noise band-passed 2.5 kHz with a 25 Hz tremolo. */
  'scuffle': (k, o, t, p) => {
    const g = k.ahr(t, p.gain, 0.02, 0.14, 0.04);
    const trem = k.gain(0.5);
    const lfo = k.osc('square', 25 * p.rate, t, 0.25);
    const depth = k.gain(0.5);
    lfo.connect(depth).connect(trem.gain);
    k.chain(k.noise('pink', t, 0.25), k.filter('bandpass', 2500 * p.rate, 0.9), trem, g, o);
    return 0.25;
  },
  /** Acid spray: white noise high-passed at 5 kHz, 250 ms swell-and-fade. */
  'acid-hiss': (k, o, t, p) => {
    k.chain(k.noise('white', t, 0.3), k.filter('highpass', 5000, 0.7), k.ahr(t, p.gain, 0.03, 0.12, 0.1), o);
    return 0.3;
  },
  /** Trophallaxis: three soft 1.2 kHz sine ticks with fast decay. */
  'liquid-tick': (k, o, t, p) => {
    for (let i = 0; i < 3; i++) ping(k, o, t + i * 0.09, p.gain * (1 - i * 0.2), 1200 * p.rate * (1 + 0.04 * i), 0.03);
    return 0.3;
  },
  /** Antennation: pink noise 80 ms band 4-9 kHz. */
  'antenna-brush': (k, o, t, p) => {
    k.chain(k.noise('pink', t, 0.1), k.filter('highpass', 4000, 0.7), k.filter('lowpass', 9000, 0.7), k.ahr(t, p.gain, 0.02, 0.03, 0.03), o);
    return 0.1;
  },
  /** Egg / eclosion: soft membranous pop, sine 700 Hz falling to 300 Hz in 40 ms plus a noise tick. */
  'membrane-pop': (k, o, t, p) => {
    const s = k.osc('sine', 700 * p.rate, t, 0.08);
    s.frequency.exponentialRampToValueAtTime(300 * p.rate, t + 0.04);
    k.chain(s, k.ad(t, p.gain, 0.002, 0.05), o);
    burst(k, o, t, p.gain * 0.3, 3000, 1, 0.001, 0.008);
    return 0.09;
  },
  /** Alarm proxy: rising shimmer, three detuned sines sweeping 1.8 -> 3.2 kHz over 0.6 s (UI bus). */
  'alarm-shimmer': (k, o, t, p) => {
    for (const d of [1, 1.007, 0.994]) {
      const s = k.osc('sine', 1800 * d, t, 0.7);
      s.frequency.exponentialRampToValueAtTime(3200 * d, t + 0.6);
      k.chain(s, k.ahr(t, p.gain / 3, 0.15, 0.25, 0.25), o);
    }
    return 0.7;
  },
  /** Camponotus drumming: 60-120 Hz knocks at ~10 Hz, each a decaying sine through a wood-like 400 Hz resonance. */
  'wood-drum': (k, o, t, p) => {
    const n = 6, period = 1 / k.rng.range(8, 12);
    const res = k.filter('peaking', 400, 4);
    res.gain.value = 8;
    res.connect(o);
    for (let i = 0; i < n; i++) {
      ping(k, res, t + i * period, p.gain, k.rng.range(60, 120) * p.rate, 0.05);
      burst(k, res, t + i * period, p.gain * 0.3, 900, 2, 0.0005, 0.01);
    }
    return n * period + 0.1;
  },
  /** Stridulation rasp: comb-filtered (delay feedback) noise 6-9 kHz pulsed at 40-60 Hz for 0.4 s. */
  'stridulation-rasp': (k, o, t, p) => {
    const dur = 0.4;
    const pulse = k.gain(0.5);
    const lfo = k.osc('square', k.rng.range(40, 60), t, dur);
    const depth = k.gain(0.5);
    lfo.connect(depth).connect(pulse.gain);
    const comb = k.ctx.createDelay(0.01);
    comb.delayTime.value = 1 / 7500;
    const fb = k.gain(0.6);
    comb.connect(fb).connect(comb);
    k.chain(k.noise('white', t, dur), k.filter('bandpass', 7500 * p.rate, 1.5), comb, pulse, k.ahr(t, p.gain, 0.03, dur - 0.08, 0.05), o);
    return dur;
  },
  /** Leaf cutting: granular tearing, 14 noise grains 2-6 kHz over 0.35 s. */
  'leaf-tear': (k, o, t, p) => {
    for (let i = 0; i < 14; i++) burst(k, o, t + k.rng.range(0, 0.33), p.gain * k.rng.range(0.4, 1), k.rng.range(2000, 6000), 2.5, 0.001, 0.012);
    return 0.4;
  },
  /** Prey struggle: noise amplitude-modulated at 15 Hz, band 1.5 kHz, 0.5 s. */
  'prey-flutter': (k, o, t, p) => {
    const am = k.gain(0.5);
    const lfo = k.osc('sine', 15, t, 0.5);
    const depth = k.gain(0.5);
    lfo.connect(depth).connect(am.gain);
    k.chain(k.noise('pink', t, 0.5), k.filter('bandpass', 1500 * p.rate, 0.8), am, k.ahr(t, p.gain, 0.03, 0.4, 0.07), o);
    return 0.5;
  },
  /** Large creature step: a pair of soft taps, 800 Hz knock + 150 Hz thump, slower and heavier than ants. */
  'creature-tap': (k, o, t, p) => {
    for (const dt of [0, 0.07]) {
      burst(k, o, t + dt, p.gain, 800 * p.rate, 1.5, 0.001, 0.02, 'pink');
      ping(k, o, t + dt, p.gain * 0.6, 150 * p.rate, 0.04);
    }
    return 0.15;
  },
  /** Single fly: sawtooth 150-300 Hz with FM jitter (8 Hz wobble), low-passed 2.5 kHz, 0.8 s pass. */
  'fly-buzz': (k, o, t, p) => {
    const f0 = k.rng.range(150, 300) * p.rate;
    const s = k.osc('sawtooth', f0, t, 0.85);
    const wob = k.osc('sine', 8, t, 0.85);
    const dev = k.gain(f0 * 0.04);
    wob.connect(dev).connect(s.frequency);
    k.chain(s, k.filter('lowpass', 2500, 0.7), k.ahr(t, p.gain, 0.2, 0.4, 0.25), o);
    return 0.85;
  },
  /** Swarm fallback: three detuned buzzes. */
  'swarm-buzz': (k, o, t, p) => {
    for (let i = 0; i < 3; i++) FOLEY['fly-buzz'](k, o, t + i * 0.05, { ...p, gain: p.gain / 2, rate: p.rate * k.rng.range(0.8, 1.4) });
    return 1;
  },
  /** Bird strike: low wing whoosh (noise low-pass sweep 300 -> 1200 Hz) then three peck thuds. */
  'wing-whoosh': (k, o, t, p) => {
    const lp = k.filter('lowpass', 300, 1);
    lp.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
    k.chain(k.noise('brown', t, 0.5), lp, k.ahr(t, p.gain, 0.15, 0.1, 0.25), o);
    for (let i = 0; i < 3; i++) ping(k, o, t + 0.6 + i * 0.16, p.gain * 0.8, 110, 0.06);
    return 1.1;
  },
  /** Antlion sand flick: 25 noise grains 3-8 kHz over 0.25 s. */
  'sand-spray': (k, o, t, p) => {
    for (let i = 0; i < 25; i++) burst(k, o, t + k.rng.range(0, 0.25) ** 1.5, p.gain * k.rng.range(0.3, 1), k.rng.range(3000, 8000), 3, 0.0005, 0.005);
    return 0.3;
  },
  /** Flood gurgle: brown noise low-passed 500 Hz with 2-6 Hz bubble sines (500-900 Hz chirps). */
  'gurgle': (k, o, t, p) => {
    k.chain(k.noise('brown', t, 1.2), k.filter('lowpass', 500, 0.8), k.ahr(t, p.gain, 0.1, 0.8, 0.3), o);
    for (let i = 0; i < 5; i++) {
      const tt = t + k.rng.range(0.05, 1);
      const s = k.osc('sine', k.rng.range(500, 900), tt, 0.06);
      s.frequency.exponentialRampToValueAtTime(1400, tt + 0.05);
      k.chain(s, k.ad(tt, p.gain * 0.5, 0.003, 0.04), o);
    }
    return 1.2;
  },
  /** Sand collapse / mound slump: 400 ms noise with a low-pass sweep 4 kHz -> 300 Hz. */
  'grain-slide': (k, o, t, p) => {
    const lp = k.filter('lowpass', 4000 * p.rate, 0.7);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    k.chain(k.noise('pink', t, 0.5), lp, k.ahr(t, p.gain, 0.02, 0.25, 0.2), o);
    return 0.5;
  },
  /** Wood gnaw (manifest recipe): noise bursts at 8-25 Hz rate, 1-4 kHz band-pass, plus crackle impulses. */
  'wood-gnaw': (k, o, t, p) => {
    const rate = k.rng.range(8, 25), n = Math.round(rate * 0.35);
    for (let i = 0; i < n; i++) burst(k, o, t + i / rate, p.gain * k.rng.range(0.6, 1), k.rng.range(1000, 4000) * p.rate, 1.5, 0.002, 0.03);
    for (let i = 0; i < 4; i++) burst(k, o, t + k.rng.range(0, 0.35), p.gain * 0.7, 6000, 4, 0.0003, 0.002);
    return n / rate + 0.05;
  },
  /** Seal tamp: soft pat, pink noise low-passed 900 Hz, 50 ms. */
  'soil-tamp': (k, o, t, p) => burst(k, o, t, p.gain, 900 * p.rate, 0.7, 0.003, 0.05, 'pink', 'lowpass'),
  /** Collapse rumble: brown noise low-passed 150 Hz, 1.5 s swell. */
  'low-rumble': (k, o, t, p) => {
    k.chain(k.noise('brown', t, 1.6), k.filter('lowpass', 150, 0.7), k.ahr(t, p.gain, 0.2, 0.6, 0.7), o);
    return 1.6;
  },
  /** Water trickle: 12 small drip pings 1.5-3 kHz over 0.8 s on a quiet noise bed. */
  'trickle': (k, o, t, p) => {
    k.chain(k.noise('pink', t, 0.9), k.filter('bandpass', 2000, 0.6), k.ahr(t, p.gain * 0.3, 0.1, 0.6, 0.2), o);
    for (let i = 0; i < 12; i++) ping(k, o, t + k.rng.range(0, 0.8), p.gain * 0.5, k.rng.range(1500, 3000), 0.025);
    return 0.9;
  },
  /** Garden tending: soft brush, pink noise 200 ms band 1-4 kHz. */
  'soft-brush': (k, o, t, p) => {
    k.chain(k.noise('pink', t, 0.25), k.filter('bandpass', 2000, 0.5), k.ahr(t, p.gain, 0.06, 0.08, 0.08), o);
    return 0.25;
  },
  // ---- fallbacks for file-based cues -------------------------------------------------------------------------
  /** Dig fallback: 150 ms granular scrape, 25 grains 2-7 kHz. */
  'soil-scrape': (k, o, t, p) => {
    for (let i = 0; i < 25; i++) burst(k, o, t + k.rng.range(0, 0.15), p.gain * k.rng.range(0.3, 1), k.rng.range(2000, 7000) * p.rate, 2, 0.0005, 0.006);
    return 0.2;
  },
  /** Crunch fallback: 8 broadband cracks over 80 ms plus a 1 kHz body. */
  'crunch': (k, o, t, p) => {
    for (let i = 0; i < 8; i++) burst(k, o, t + k.rng.range(0, 0.08), p.gain * k.rng.range(0.4, 1), k.rng.range(1500, 5000) * p.rate, 1, 0.0005, 0.01);
    burst(k, o, t, p.gain * 0.5, 1000 * p.rate, 1, 0.002, 0.04, 'pink');
    return 0.15;
  },
  /** Drip fallback: sine 900 Hz rising to 2.2 kHz in 20 ms (the "plip"). */
  'drip': (k, o, t, p) => {
    const s = k.osc('sine', 900 * p.rate, t, 0.12);
    s.frequency.exponentialRampToValueAtTime(2200 * p.rate, t + 0.02);
    k.chain(s, k.ad(t, p.gain, 0.002, 0.08), o);
    return 0.12;
  },
  /** Raindrop splat fallback: noise burst low-passed 2.5 kHz, 60 ms, plus a 300 Hz thump. */
  'splat': (k, o, t, p) => {
    burst(k, o, t, p.gain, 2500 * p.rate, 0.7, 0.001, 0.06, 'pink', 'lowpass');
    ping(k, o, t, p.gain * 0.5, 300 * p.rate, 0.04);
    return 0.1;
  },
  /** Cricket fallback: 4.5 kHz sine pulses, 3 trills of 4 pulses. */
  'chirp': (k, o, t, p) => {
    for (let tr = 0; tr < 3; tr++) for (let i = 0; i < 4; i++) ping(k, o, t + tr * 0.25 + i * 0.022, p.gain, 4500 * p.rate, 0.012);
    return 0.8;
  },
  /** Wood creak fallback: sawtooth 90 Hz with slow pitch wobble through a 600 Hz band-pass, 0.8 s. */
  'wood-creak': (k, o, t, p) => {
    const s = k.osc('sawtooth', 90 * p.rate, t, 0.8);
    s.frequency.linearRampToValueAtTime(70 * p.rate, t + 0.4);
    s.frequency.linearRampToValueAtTime(110 * p.rate, t + 0.8);
    k.chain(s, k.filter('bandpass', 600, 3), k.ahr(t, p.gain, 0.15, 0.4, 0.25), o);
    return 0.8;
  },
  /** Bird call slice fallback: two quick sine sweeps 2.5 -> 4 kHz. */
  'bird-call': (k, o, t, p) => {
    for (const dt of [0, 0.15]) {
      const s = k.osc('sine', 2500, t + dt, 0.1);
      s.frequency.exponentialRampToValueAtTime(4000, t + dt + 0.08);
      k.chain(s, k.ahr(t + dt, p.gain, 0.01, 0.05, 0.03), o);
    }
    return 0.3;
  },
};
