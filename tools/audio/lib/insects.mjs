// Cricket song, shared by the night bed and the single-chirp one-shots.
import { SR } from './dsp.mjs';

/**
 * One chirp: `pulses` sine bursts `period` s apart at carrier `f` Hz, added into `out` from `startSample` (wrapping).
 * A burst is a wing-resonator ring: fast rise, longer fall, the carrier sagging 1 % as it dies away.
 */
export function addChirp(out, startSample, f, pulses, period, gain) {
  const len = Math.round(0.017 * SR);
  for (let p = 0; p < pulses; p++) {
    const s0 = startSample + Math.round(p * period * SR);
    for (let i = 0; i < len; i++) {
      const t = i / len, env = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 2);
      out[(s0 + i) % out.length] += gain * env * Math.sin(2 * Math.PI * f * (i / SR) * (1 - 0.01 * t));
    }
  }
}
