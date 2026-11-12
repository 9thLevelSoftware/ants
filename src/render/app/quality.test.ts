import { describe, expect, it } from 'vitest';
import { classifyGpu, pickQuality } from './autoDetect';
import { DynamicResolution, dynResConfig } from './dynamicResolution';
import { parseRenderFlags } from './flags';
import { FrameStats } from './frameStats';
import { applyOverrides, getPreset, QUALITY_IDS, QUALITY_PRESETS } from './quality';
import { validatePreset } from './qualitySchema';

describe('quality presets', () => {
  it('every preset is schema-valid', () => {
    for (const id of QUALITY_IDS) expect(validatePreset(QUALITY_PRESETS[id]), id).toEqual([]);
  });

  it('test has everything expensive off and renders on demand', () => {
    const t = QUALITY_PRESETS.test;
    expect(t.post.enabled).toBe(false);
    expect(t.post.dof.enabled || t.post.bloom.enabled || t.post.smaa.enabled || t.post.vignette.enabled).toBe(false);
    expect(t.shadows.enabled).toBe(false);
    expect(t.msaa).toBe(false);
    expect(t.dynamicResolution.enabled).toBe(false);
    expect(t.renderOnDemand).toBe(true);
    expect(t.maxPixelRatio).toBe(1);
  });

  it('presets get more expensive monotonically from low to ultra', () => {
    const order = ['low', 'medium', 'high', 'ultra'] as const;
    for (let i = 1; i < order.length; i++) {
      const a = QUALITY_PRESETS[order[i - 1]], b = QUALITY_PRESETS[order[i]];
      expect(b.shadows.mapSize).toBeGreaterThanOrEqual(a.shadows.mapSize);
      expect(b.drawDistanceBU).toBeGreaterThanOrEqual(a.drawDistanceBU);
      expect(b.anisotropy).toBeGreaterThanOrEqual(a.anisotropy);
      expect(b.density.grass).toBeGreaterThanOrEqual(a.density.grass);
    }
    expect(QUALITY_PRESETS.medium.post.dof.bokehScale).toBe(2.0); // LOOK_BOKEH
    expect(QUALITY_PRESETS.high.post.dof.bokehScale).toBe(3.2);
    expect(QUALITY_PRESETS.ultra.post.dof.resolutionScale).toBe(1);
  });

  it('settings overrides stay valid and do not mutate the table', () => {
    const p = applyOverrides(getPreset('high'), { resolutionScale: 0.2, depthOfField: 'subtle', shadows: 'off', density: 3, targetFps: 30 });
    expect(validatePreset(p)).toEqual([]);
    expect(p.resolutionScale).toBe(0.5);
    expect(p.post.dof.bokehScale).toBe(2);
    expect(p.shadows.enabled).toBe(false);
    expect(p.density.grass).toBe(1);
    expect(QUALITY_PRESETS.high.shadows.enabled).toBe(true);
    expect(validatePreset({ ...getPreset('low'), anisotropy: 3.5 })).toContain('anisotropy');
  });

  it('parses URL flags', () => {
    expect(parseRenderFlags('?test=1')).toEqual({ test: true, quality: 'test', post: null });
    expect(parseRenderFlags('?test=1&quality=high&post=0')).toEqual({ test: true, quality: 'high', post: false });
    expect(parseRenderFlags('?quality=banana').quality).toBe('auto');
  });
});

describe('auto detection', () => {
  it('classifies renderer strings', () => {
    expect(classifyGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe('software');
    expect(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('integrated');
    expect(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('discrete');
    expect(classifyGpu('Mali-G78')).toBe('mobile');
  });

  it('caps by class and scales by benchmark', () => {
    expect(pickQuality({ renderer: 'SwiftShader', benchMs: 1, maxTextureSize: 8192 }).id).toBe('low');
    expect(pickQuality({ renderer: 'Intel(R) Iris(R) Xe Graphics', benchMs: 1, maxTextureSize: 16384 }).id).toBe('medium');
    expect(pickQuality({ renderer: 'NVIDIA GeForce RTX 4070', benchMs: 1, maxTextureSize: 16384 }).id).toBe('ultra');
    expect(pickQuality({ renderer: 'NVIDIA GeForce RTX 4070', benchMs: 30, maxTextureSize: 16384 }).id).toBe('low');
    expect(pickQuality({ renderer: 'Something new', benchMs: NaN, maxTextureSize: 16384 }).id).toBe('medium');
  });
});

describe('dynamic resolution', () => {
  it('scales down under load, back up when fast, within bounds and without oscillating', () => {
    const d = new DynamicResolution(dynResConfig(60, 0.6, 1));
    for (let i = 0; i < 2000; i++) d.update(30);
    expect(d.scale).toBeCloseTo(0.6, 6);
    expect(d.atMinimum).toBe(true);
    for (let i = 0; i < 4000; i++) d.update(8);
    expect(d.scale).toBeCloseTo(1, 6);
    // inside the dead band (a little slower than the target, not slow enough to scale down) nothing changes
    const changes: number[] = [];
    d.reset(0.8);
    for (let i = 0; i < 2000; i++) { const before = d.scale; d.update(17.5); if (d.scale !== before) changes.push(i); }
    expect(changes).toEqual([]);
    expect(d.update(5000)).toBeCloseTo(0.8, 6); // absurd samples ignored
  });

  it('probes up from a vsync-limited frame time at the target and backs off when probes keep failing', () => {
    // a GPU that manages 60 fps up to scale 0.8 and drops to 40 fps above it, on a 60 Hz display
    const d = new DynamicResolution(dynResConfig(60, 0.6, 1));
    d.reset(0.7);
    const frameAt = (scale: number) => (scale <= 0.8 + 1e-9 ? 1000 / 60 : 25);
    const ups: number[] = [];
    for (let i = 0; i < 60 * 300; i++) { const before = d.scale; d.update(frameAt(d.scale)); if (d.scale > before) ups.push(i); }
    expect(d.scale).toBeGreaterThanOrEqual(0.75);
    expect(d.scale).toBeLessThanOrEqual(0.85);
    expect(d.probeBackoff).toBe(16);
    // after the backoff saturates, probes come at most every probeFrames x 16 frames (48 s)
    const late = ups.filter((i) => i > 60 * 150);
    for (let k = 1; k < late.length; k++) expect(late[k] - late[k - 1]).toBeGreaterThanOrEqual(180 * 16);
  });
});

describe('frame stats', () => {
  it('computes fps, p95 and keeps the last draw counts', () => {
    const s = new FrameStats(10);
    let t = 0;
    for (let i = 0; i < 20; i++) { s.record(t, 2, { calls: 10 + i, triangles: 1000 }); t += i === 19 ? 50 : 20; }
    const snap = s.snapshot();
    expect(snap.fps).toBeCloseTo(50, 6);
    expect(snap.drawCalls).toBe(29);
    expect(snap.triangles).toBe(1000);
    expect(snap.cpuMs).toBe(2);
    s.resetTiming();
    expect(Number.isNaN(s.snapshot().fps)).toBe(true);
  });
});
