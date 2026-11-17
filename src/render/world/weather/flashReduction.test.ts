// GDD 08 App. E 25: storm weather with flash reduction on, 20 real s rendered: no frame-to-frame exposure increase
// above +0.5 EV and at most 5 brightening events. The lightning quad multiplies the frame by (1 + k x tint), so the
// frame's exposure change is log2(1 + k x tint luminance). Measured on the renderer's own flash clock (FlashTimer),
// frame by frame at 60 fps, with the sim's densest strikes at 1x, 4x and 8x (LIGHTNING_MIN_GAP_TICKS game ticks).
import { describe, expect, it } from 'vitest';
import { LIGHTNING_MIN_GAP_TICKS } from '@/sim/balance/environmentWeather';
import { TICKS_PER_SECOND } from '@/sim/time';
import { FlashTimer } from './lightning';

const TINT_LUM = 0.2126 * 0.82 + 0.7152 * 0.86 + 0.0722 * 1.0; // the quad's cool tint (lightning.ts FRAG)
const FPS = 60;

interface Run { maxRiseEv: number; events: number }

/** 20 real s of storm: strikes every `gapRealS`, frames at 60 fps; exposure EV per frame and rises counted. */
function storm(reduced: boolean, gapRealS: number, seconds = 20): Run {
  const t = new FlashTimer();
  let prevEv = 0, maxRiseEv = 0, events = 0, rising = false, nextStrike = 0;
  for (let i = 0; i < seconds * FPS; i++) {
    const now = i / FPS;
    if (now >= nextStrike) { t.strike(reduced); nextStrike += gapRealS; }
    const ev = Math.log2(1 + t.frame(1 / FPS, reduced) * TINT_LUM);
    const rise = ev - prevEv;
    maxRiseEv = Math.max(maxRiseEv, rise);
    if (rise > 1e-4 && !rising) events++;
    rising = rise > 1e-4;
    prevEv = ev;
  }
  return { maxRiseEv, events };
}

describe('flash reduction (GDD 08 App. E 25)', () => {
  const gapGameS = LIGHTNING_MIN_GAP_TICKS / TICKS_PER_SECOND;
  for (const speed of [1, 4, 8]) {
    it(`densest strikes at ${speed}x: rise <= +0.5 EV per frame, <= 5 brightening events in 20 s`, () => {
      const r = storm(true, gapGameS / speed);
      expect(r.maxRiseEv).toBeLessThanOrEqual(0.5);
      expect(r.events).toBeLessThanOrEqual(5);
      expect(r.events).toBeGreaterThan(0);
    });
  }

  it('without flash reduction the pulse would fail the check (the measure sees it)', () => {
    const r = storm(false, gapGameS / 8);
    expect(r.maxRiseEv).toBeGreaterThan(0.5);
    expect(r.events).toBeGreaterThan(5);
  });
});
