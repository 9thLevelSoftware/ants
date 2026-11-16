// Reviewer's checks of the ant form light (tuning.ts ANT_FILL): broken inputs never poison the uniforms, the night
// fill follows the exposure smoothly, and the colour blend stays inside the warm/cool endpoints.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import { ANT_FILL } from './tuning';

type Fill = { uFillBody: { value: number }; uFillRim: { value: number }; uFillCol: { value: { r: number; g: number; b: number } } };
function make() {
  const r = new AntRenderer();
  r.init({ scene: new Scene(), camera: new PerspectiveCamera(), quality: getPreset('test') });
  return { r, s: (r as unknown as { shared: Fill }).shared };
}
const finite = (s: Fill) => [s.uFillBody.value, s.uFillRim.value, s.uFillCol.value.r, s.uFillCol.value.g, s.uFillCol.value.b].every(Number.isFinite);

describe('ant form light (reviewer)', () => {
  it('NaN / infinite exposure and NaN dt leave finite uniforms', () => {
    const { r, s } = make();
    for (const ev of [Number.NaN, Infinity, -Infinity]) {
      r.setHighlightExposure(ev);
      expect(finite(s), String(ev)).toBe(true);
    }
    r.update({ dt: Number.NaN, time: 0, alpha: 1, sim: null, underground: true });
    expect(finite(s)).toBe(true);
    expect(s.uFillBody.value).toBeGreaterThan(0);
    r.dispose();
  });

  it('the on-screen night fill (amplitude x 2^EV) rises monotonically through fromEV..toEV and never overshoots', () => {
    const { r, s } = make();
    r.update({ dt: 0, time: 0, alpha: 1, sim: null, underground: false });
    let prev = -1;
    for (let ev = 0; ev <= ANT_FILL.toEV + 2; ev += 0.1) {
      r.setHighlightExposure(ev);
      const screen = s.uFillBody.value * Math.pow(2, ev);
      expect(screen).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(screen).toBeLessThanOrEqual(ANT_FILL.body.night + 1e-9);
      prev = screen;
    }
    r.dispose();
  });

  it('the fill colour stays between the cool and the warm endpoint while easing underground', () => {
    const { r, s } = make();
    r.setHighlightExposure(2.6);
    r.update({ dt: 0, time: 0, alpha: 1, sim: null, underground: false });
    for (let i = 0; i < 20; i++) {
      r.update({ dt: 0.05, time: i * 0.05, alpha: 1, sim: null, underground: true });
      const c = s.uFillCol.value;
      for (const [k, v] of [[0, c.r], [1, c.g], [2, c.b]] as const) {
        expect(v).toBeGreaterThanOrEqual(Math.min(ANT_FILL.warm[k], ANT_FILL.cool[k]) - 1e-9);
        expect(v).toBeLessThanOrEqual(Math.max(ANT_FILL.warm[k], ANT_FILL.cool[k]) + 1e-9);
      }
    }
    r.dispose();
  });
});
