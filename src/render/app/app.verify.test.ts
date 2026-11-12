// Adversarial review tests for src/render/app (F3a review). Tests that fail here document real defects.
import { describe, expect, it } from 'vitest';
import { pickQuality } from './autoDetect';
import { DynamicResolution, dynResConfig } from './dynamicResolution';
import { FrameStats } from './frameStats';
import { applyOverrides, getPreset, QUALITY_IDS, QUALITY_PRESETS } from './quality';
import { validatePreset } from './qualitySchema';

const VSYNC_60_MS = 1000 / 60;

describe('dynamic resolution (verify)', () => {
  it('drops the scale under sustained overload and never leaves [min, max]', () => {
    const d = new DynamicResolution(dynResConfig(60, 0.6, 1));
    for (let i = 0; i < 5000; i++) d.update(40);
    expect(d.scale).toBeCloseTo(0.6, 9);
    for (let i = 0; i < 5000; i++) d.update(1);
    expect(d.scale).toBeCloseTo(1, 9);
  });

  it('ignores NaN, zero, negative and absurd samples', () => {
    const d = new DynamicResolution(dynResConfig(60, 0.6, 1));
    for (const v of [NaN, 0, -5, Infinity, 5000]) for (let i = 0; i < 200; i++) d.update(v);
    expect(d.scale).toBe(1);
    expect(d.smoothedMs).toBe(-1);
  });

  // BUG: the controller is fed the interval between rAF callbacks (renderApp.ts: dynres.update(stats.lastIntervalMs)).
  // On a 60 Hz display that interval can never go below ~16.7 ms, but scaling up needs < targetMs * upRatio =
  // 13.3 ms. With the default targetFps 60 one hitch (20 slow frames) lowers the scale and it never comes back.
  it('recovers full resolution once a 60 Hz vsync-limited game is running at the target again', () => {
    const d = new DynamicResolution(dynResConfig(60, 0.6, 1));
    for (let i = 0; i < 60; i++) d.update(40); // a short hitch (shader compile, GC)
    expect(d.scale).toBeLessThan(1);
    for (let i = 0; i < 60 * 60; i++) d.update(VSYNC_60_MS); // one minute at a perfect 60 fps
    expect(d.scale).toBe(1);
  });
});

describe('quality presets (verify)', () => {
  it('every preset with every combination of overrides stays schema-valid', () => {
    for (const id of QUALITY_IDS) {
      for (const dof of ['off', 'subtle', 'full'] as const) {
        for (const shadows of ['off', 'low', 'high'] as const) {
          const p = applyOverrides(getPreset(id), { depthOfField: dof, shadows, resolutionScale: 0, density: -1, haze: false, targetFps: 30, dynamicResolution: true });
          expect(validatePreset(p), `${id} ${dof} ${shadows}`).toEqual([]);
        }
      }
    }
  });

  it('test preset cannot be re-enabled into dynamic resolution by overrides', () => {
    expect(applyOverrides(getPreset('test'), { dynamicResolution: true }).dynamicResolution.enabled).toBe(false);
  });

  it('auto never picks test and never exceeds the GPU class cap', () => {
    for (const ms of [0.1, 3, 7, 20, NaN]) {
      expect(pickQuality({ renderer: 'SwiftShader', benchMs: ms, maxTextureSize: 8192 }).id).toBe('low');
      expect(['low', 'medium']).toContain(pickQuality({ renderer: 'Intel(R) UHD Graphics 620', benchMs: ms, maxTextureSize: 8192 }).id);
    }
  });

  it('validator rejects bad shadow map sizes and inverted dynres bounds', () => {
    const p = getPreset('high');
    expect(validatePreset({ ...p, shadows: { ...p.shadows, mapSize: 1000 } })).toContain('shadows.mapSize');
    expect(validatePreset({ ...p, dynamicResolution: { ...p.dynamicResolution, minScale: 0.9, maxScale: 0.8 } })).toContain('dynamicResolution.maxScale');
    expect(Object.isFrozen(QUALITY_PRESETS.test)).toBe(false); // plain data (structurally cloned by getPreset)
  });
});

describe('frame statistics (verify)', () => {
  it('reports NaN fps before two frames and correct numbers after', () => {
    const s = new FrameStats(4);
    expect(Number.isNaN(s.snapshot().fps)).toBe(true);
    s.record(0, 1, { calls: 3, triangles: 10 });
    s.record(20, 1, { calls: 4, triangles: 11 });
    s.record(40, 1, { calls: 5, triangles: 12 });
    const snap = s.snapshot();
    expect(snap.fps).toBeCloseTo(50, 9);
    expect(snap.drawCalls).toBe(5);
    s.resetTiming();
    expect(Number.isNaN(s.lastIntervalMs)).toBe(true);
  });
});
