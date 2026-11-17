// What the accessibility settings mean in numbers (GDD 08 2.4, 12): reduced motion, shake, DoF, palette styles.
import { describe, expect, it } from 'vitest';
import { REDUCED_DOF_STRENGTH } from './balance';
import { COLONY_VIEW_DOF_STRENGTH, motionPlan, resolveReducedMotion, viewDofStrength } from './motion';
import { paletteCss } from './palette';

describe('reduced motion', () => {
  it('System follows the device, On and Off decide', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('on', false)).toBe(true);
    expect(resolveReducedMotion('off', true)).toBe(false);
  });

  it('zeroes the camera shake and sway and softens the depth of field', () => {
    const p = motionPlan(true, 100);
    expect(p).toEqual({ reduced: true, shakeScale: 0, swayScale: 0, dofStrength: REDUCED_DOF_STRENGTH });
    expect(motionPlan(true, 100).dofStrength).toBeLessThan(1);
  });

  it('without it the shake setting (0-100 %) scales the tremor, and sway stays zero (the rigs have none)', () => {
    expect(motionPlan(false, 100)).toMatchObject({ shakeScale: 1, dofStrength: 1, swayScale: 0 });
    expect(motionPlan(false, 40).shakeScale).toBeCloseTo(0.4);
    expect(motionPlan(false, 0).shakeScale).toBe(0);
    expect(motionPlan(false, 250).shakeScale).toBe(1);
    expect(motionPlan(false, NaN).shakeScale).toBe(1);
  });
});

describe('status palette', () => {
  it('the default palette leaves the GDD tokens alone; the other two override every status token', () => {
    const css = paletteCss();
    expect(css).not.toContain('okabe-ito');
    for (const p of ['high-contrast', 'pattern-only']) {
      const block = css.slice(css.indexOf(`data-palette="${p}"`));
      for (const t of ['--c-status-ok', '--c-status-watch', '--c-status-warn', '--c-status-bad']) expect(block, `${p} ${t}`).toContain(t);
    }
  });
});

describe('depth of field per view (look pass 3)', () => {
  it('is off in the colony view (labels are read, not photographed) and the plan\'s everywhere else', () => {
    for (const reduced of [false, true]) {
      const plan = motionPlan(reduced, 100);
      expect(viewDofStrength(plan, 'colony')).toBe(COLONY_VIEW_DOF_STRENGTH);
      for (const view of ['possess', 'observer', 'photo']) expect(viewDofStrength(plan, view)).toBe(plan.dofStrength);
    }
    expect(COLONY_VIEW_DOF_STRENGTH).toBe(0);
  });
});
