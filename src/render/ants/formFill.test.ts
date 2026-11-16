// Look pass 2, work item 2: ants are lit where the scene leaves them black (underground, night). The form light is a
// pair of uniforms (tuning.ts ANT_FILL) set from the exposure and the underground blend; the shader term is checked
// by tests/e2e/look2.mjs (the pictures) and by the program compiling in the harness.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import { ANT_FILL } from './tuning';
import { ANT_FILL as ANT_FILL_GLSL } from './shader/fragmentChunk';

function renderer() {
  const r = new AntRenderer();
  r.init({ scene: new Scene(), camera: new PerspectiveCamera(), quality: getPreset('test') });
  const shared = (r as unknown as { shared: { uFillBody: { value: number }; uFillRim: { value: number }; uFillCol: { value: { r: number; g: number; b: number } } } }).shared;
  return { r, shared };
}
const update = (r: AntRenderer, underground: boolean, dt = 0) => r.update({ dt, time: 0, alpha: 1, sim: null, underground });

describe('ant form light', () => {
  it('is off in daylight and in the day-metered shade', () => {
    const { r, shared } = renderer();
    r.setHighlightExposure(0);
    update(r, false);
    expect(shared.uFillBody.value).toBe(0);
    expect(shared.uFillRim.value).toBe(0);
    r.setHighlightExposure(ANT_FILL.fromEV - 0.2);
    expect(shared.uFillBody.value).toBe(0);
    r.dispose();
  });

  it('comes in with the night exposure, cool, compensated for the exposure (2^-EV)', () => {
    const { r, shared } = renderer();
    update(r, false);
    r.setHighlightExposure(ANT_FILL.toEV + 0.5);
    const k = Math.pow(2, -(ANT_FILL.toEV + 0.5));
    expect(shared.uFillBody.value).toBeCloseTo(k * ANT_FILL.body.night, 9);
    expect(shared.uFillRim.value).toBeCloseTo(k * ANT_FILL.rim.night, 9);
    expect(shared.uFillCol.value.b).toBeGreaterThan(shared.uFillCol.value.r);
    // brighter on screen = amplitude x 2^EV x 2^-EV: the same at any exposure above the range
    r.setHighlightExposure(ANT_FILL.toEV + 1.5);
    expect(shared.uFillBody.value * Math.pow(2, ANT_FILL.toEV + 1.5)).toBeCloseTo(ANT_FILL.body.night, 6);
    r.dispose();
  });

  it('is warm and stronger underground, whatever the exposure, and eases with the underground blend', () => {
    const { r, shared } = renderer();
    r.setHighlightExposure(1.7);
    update(r, true); // dt 0: a settle frame snaps
    expect(shared.uFillBody.value).toBeCloseTo(Math.pow(2, -1.7) * ANT_FILL.body.underground, 9);
    expect(shared.uFillCol.value.r).toBeGreaterThan(shared.uFillCol.value.b);
    update(r, false, 0.05); // part way back to the surface
    const part = shared.uFillBody.value;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(Math.pow(2, -1.7) * ANT_FILL.body.underground);
    r.dispose();
  });

  it('the shader term is a plain addition to the emission (no discards, no new samplers)', () => {
    expect(ANT_FILL_GLSL).toContain('totalEmissiveRadiance +=');
    expect(ANT_FILL_GLSL).not.toContain('discard');
    expect(ANT_FILL_GLSL).not.toContain('texture');
  });
});
