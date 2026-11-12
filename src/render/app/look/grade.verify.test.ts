// Adversarial checks of the colour grade (reviewer, render-integration): the no-post pass's render-target handling
// with a fake renderer (no WebGL in Node), the grade maths on hostile input, and how often the "skipped while
// neutral" fast path can actually apply on the surface.
import { describe, expect, it } from 'vitest';
import { HalfFloatType, PerspectiveCamera, Scene, UnsignedByteType, Vector2, Vector3, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { computeLighting, createLightingState } from '@/render/world/lighting';
import { DirectGrade, easeGrade, gradeTarget, isNeutralGrade, neutralGrade } from './index';

/** A renderer stand-in that records render targets and draws. */
function fakeRenderer(w: number, h: number, exts: string[]) {
  const calls: { target: WebGLRenderTarget | null; scene: Scene }[] = [];
  let current: WebGLRenderTarget | null = null;
  const size = { w, h };
  const r = {
    extensions: { has: (n: string) => exts.includes(n) },
    getDrawingBufferSize: (v: Vector2) => v.set(size.w, size.h),
    getRenderTarget: () => current,
    setRenderTarget: (t: WebGLRenderTarget | null) => { current = t; },
    render: (scene: Scene) => { calls.push({ target: current, scene }); },
  };
  return { renderer: r as unknown as WebGLRenderer, calls, size, setCurrent: (t: WebGLRenderTarget | null) => { current = t; } };
}

describe('DirectGrade render pass', () => {
  it('draws the scene into an HDR target, grades to the previous target, and restores it', () => {
    const d = new DirectGrade();
    d.set({ saturation: 0.7, gain: [1, 1, 1.05] });
    const f = fakeRenderer(640, 360, ['EXT_color_buffer_float']);
    const scene = new Scene(), cam = new PerspectiveCamera();
    d.render(f.renderer, scene, cam);
    expect(f.calls.length).toBe(2);
    const target = f.calls[0]!.target!;
    expect(f.calls[0]!.scene).toBe(scene);
    expect(target.texture.type).toBe(HalfFloatType);
    expect([target.width, target.height]).toEqual([640, 360]);
    expect(f.calls[1]!.target).toBeNull(); // the graded triangle goes where the caller was drawing
    expect(d.material.uniforms.tScene!.value).toBe(target.texture);
    d.dispose();
  });

  it('follows the drawing-buffer size, falls back to 8-bit without float buffers, and rebuilds on an MSAA switch', () => {
    const d = new DirectGrade();
    d.set({ saturation: 0.7, gain: [1, 1, 1] });
    const f = fakeRenderer(100, 50, []);
    const scene = new Scene(), cam = new PerspectiveCamera();
    d.render(f.renderer, scene, cam);
    const t1 = f.calls[0]!.target!;
    expect(t1.texture.type).toBe(UnsignedByteType);
    f.size.w = 200; f.size.h = 80;
    d.render(f.renderer, scene, cam);
    expect(f.calls[2]!.target).toBe(t1);
    expect([t1.width, t1.height]).toEqual([200, 80]);
    d.setMsaa(true);
    d.render(f.renderer, scene, cam);
    const t2 = f.calls[4]!.target!;
    expect(t2).not.toBe(t1);
    expect(t2.samples).toBe(4);
    d.dispose();
  });

  it('a zero-size drawing buffer still gets a 1 x 1 target (no WebGL error on a hidden canvas)', () => {
    const d = new DirectGrade();
    d.set({ saturation: 0.5, gain: [1, 1, 1] });
    const f = fakeRenderer(0, 0, ['EXT_color_buffer_float']);
    d.render(f.renderer, new Scene(), new PerspectiveCamera());
    expect([f.calls[0]!.target!.width, f.calls[0]!.target!.height]).toEqual([1, 1]);
    d.dispose();
  });
});

describe('grade maths on hostile input', () => {
  it('a NaN underground factor and NaN / negative dt never produce NaN', () => {
    const g = gradeTarget({ saturation: 0.7, gain: [0.9, 1, 1.1] }, Number.NaN);
    for (const v of [g.saturation, ...g.gain]) expect(Number.isFinite(v)).toBe(true);
    const cur = neutralGrade();
    easeGrade(cur, { saturation: 0.7, gain: [0.9, 1, 1.1] }, Number.NaN);
    expect(cur.saturation).toBeCloseTo(0.7);
    easeGrade(cur, neutralGrade(), -1);
    expect(isNeutralGrade(cur)).toBe(true);
  });
});

describe('how often the no-post grading pass runs', () => {
  it('records that a clear-sky surface grade is NOT neutral at any sun elevation (the extra pass runs all day)', () => {
    // directGrade.ts: "The pass is skipped while the grade is neutral, so a neutral frame costs exactly what it did
    // before". The lighting model's day grade is saturation 1.04-1.05 (constants.ts), so on the Low preset (no post,
    // MSAA) every surface frame renders into a 4x MSAA HalfFloat target plus a full-screen pass.
    const active: number[] = [];
    for (const elev of [-20, -3, 4, 15, 35, 60]) {
      const sunDir = new Vector3(0, Math.sin((elev * Math.PI) / 180), Math.cos((elev * Math.PI) / 180)).normalize();
      const L = computeLighting({
        sunDir, sunElevDeg: elev, moonDir: sunDir.clone().negate(), moonIllum: 0.8, weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn',
        bu: 4, under: 0, hazeScale: 1,
      }, createLightingState());
      if (!isNeutralGrade(gradeTarget(L, 0))) active.push(elev);
    }
    expect(active).toEqual([-20, -3, 4, 15, 35, 60]);
  });
});
