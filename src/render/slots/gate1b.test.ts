// Gate 1B application fixes on the render side: the deep-shade exposure adaptation (shadeAdapt.ts) and the direct
// path clearing its target after the post chain switched autoClear off (quality switch High -> Low ghosting).
import { describe, expect, it } from 'vitest';
import { DirectGrade } from '@/render/app/look';
import type { WebGLRenderer } from 'three';
import { easeEV, occlusionAt, shadeEV } from './shadeAdapt';
import { SHADE_ADAPT } from './params';

describe('deep-shade exposure adaptation', () => {
  const grid = { data: new Uint8Array([0, 255, 128, 0]), width: 2, height: 2, invX: 1 / 200, invZ: 1 / 200 };

  it('reads the occlusion cell under the subject and nothing outside the grid', () => {
    expect(occlusionAt(grid, 50, 50)).toBe(0);
    expect(occlusionAt(grid, 150, 50)).toBe(1);
    expect(occlusionAt(grid, 50, 150)).toBeCloseTo(128 / 255, 6);
    expect(occlusionAt(grid, -1, 50)).toBe(0);
    expect(occlusionAt(grid, 250, 50)).toBe(0);
    expect(occlusionAt(null, 50, 50)).toBe(0);
  });

  it('open ground adds nothing; full shade on the ground opens by the cap; the effect fades off the ground', () => {
    expect(shadeEV(0, 0)).toBe(0);
    expect(shadeEV(1, 0)).toBeCloseTo(SHADE_ADAPT.maxEV, 6);
    expect(shadeEV(0.3, 0)).toBeGreaterThan(0);
    expect(shadeEV(0.3, 0)).toBeLessThan(SHADE_ADAPT.maxEV);
    expect(shadeEV(1, SHADE_ADAPT.liftMm / 2)).toBeCloseTo(SHADE_ADAPT.maxEV / 2, 6);
    expect(shadeEV(1, SHADE_ADAPT.liftMm * 3)).toBe(0); // an ant on the car roof is in the open
    expect(Number.isFinite(shadeEV(Number.NaN, 0))).toBe(true);
  });

  it('eases like an eye adapting and snaps on settled frames', () => {
    expect(easeEV(0, 1.5, 0)).toBe(1.5);
    const a = easeEV(0, 1.5, 0.1);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1.5);
  });
});

describe('direct grade clears its target whatever the composer left behind', () => {
  it('renders the scene with autoClear on and restores the previous value', () => {
    const seen: boolean[] = [];
    const fake = {
      autoClear: false,
      extensions: { has: () => false },
      getDrawingBufferSize: (v: { x: number; y: number; set?: unknown }) => { v.x = 4; v.y = 4; return v; },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      render(this: { autoClear: boolean }) { seen.push(this.autoClear); },
    };
    const d = new DirectGrade();
    d.render(fake as unknown as WebGLRenderer, {} as never, {} as never);
    expect(seen).toEqual([true, true]);
    expect(fake.autoClear).toBe(false);
    d.dispose();
  });
});
