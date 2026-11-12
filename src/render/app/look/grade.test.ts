// Colour grade (render-integration): the maths both render paths share, the post effect's uniforms and the no-post
// pass's switching (no WebGL in Node: the passes are checked on their CPU side).
import { describe, expect, it } from 'vitest';
import { computeLighting, createLightingState } from '@/render/world/lighting';
import { Vector3 } from 'three';
import {
  applyGrade, DirectGrade, DIRECT_GRADE_MSAA_SAMPLES, easeGrade, GRADE_GLSL, GradeEffect, gradeTarget, isNeutralGrade, neutralGrade,
} from './index';

const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c: readonly number[]) => Math.max(...c) - Math.min(...c);

function lightingAt(elevDeg: number, weather: 'clear' | 'frost' | 'overcast') {
  const sunDir = new Vector3(0, Math.sin((elevDeg * Math.PI) / 180), Math.cos((elevDeg * Math.PI) / 180)).normalize();
  return computeLighting({
    sunDir, sunElevDeg: elevDeg, moonDir: sunDir.clone().negate(), moonIllum: 0.8, weather, cloud: 0.1, fog: 0, zone: 'lawn', bu: 4,
    under: 0, hazeScale: 1,
  }, createLightingState());
}

describe('colour grade maths', () => {
  it('neutral grade leaves colour unchanged; saturation keeps luminance', () => {
    const c: [number, number, number] = [0.6, 0.3, 0.1];
    expect(applyGrade(c, neutralGrade())).toEqual(c.map((v) => expect.closeTo(v, 9)));
    const grey = applyGrade(c, { saturation: 0, gain: [1, 1, 1] });
    expect(grey[0]).toBeCloseTo(grey[1], 9);
    expect(grey[0]).toBeCloseTo(luma(c), 9);
    const rich = applyGrade(c, { saturation: 1.2, gain: [1, 1, 1] });
    expect(luma(rich)).toBeCloseTo(luma(c), 9);
    expect(chroma(rich)).toBeGreaterThan(chroma(c));
  });

  it('frost desaturates about 30 % (GDD 08 11.4), golden hour is warm, night cool and desaturated (11.2)', () => {
    const noon = gradeTarget(lightingAt(60, 'clear'), 0);
    const frost = gradeTarget(lightingAt(60, 'frost'), 0);
    expect(frost.saturation / noon.saturation).toBeCloseTo(0.7, 2);
    const golden = gradeTarget(lightingAt(4, 'clear'), 0);
    expect(golden.gain[0]).toBeGreaterThan(golden.gain[2]); // warm
    expect(golden.saturation).toBeGreaterThan(1);
    const night = gradeTarget(lightingAt(-20, 'clear'), 0);
    expect(night.gain[2]).toBeGreaterThan(night.gain[0]); // cool
    expect(night.saturation).toBeLessThan(0.8);
    // a warm, saturated midtone stays warm after the golden grade and loses chroma under frost
    const c: [number, number, number] = [0.5, 0.35, 0.2];
    expect(chroma(applyGrade(c, frost))).toBeLessThan(chroma(applyGrade(c, noon)) * 0.75);
  });

  it('fades to neutral underground and clamps broken input', () => {
    const night = lightingAt(-20, 'frost');
    expect(isNeutralGrade(gradeTarget(night, 1))).toBe(true);
    const half = gradeTarget(night, 0.5);
    expect(half.saturation).toBeCloseTo(1 + (night.saturation - 1) / 2, 6);
    const bad = gradeTarget({ saturation: Number.NaN, gain: [Infinity, -3, 1] }, 0);
    expect(bad.saturation).toBe(1);
    expect(bad.gain[0]).toBe(1);
    expect(bad.gain[1]).toBeGreaterThan(0);
  });

  it('eases over real time and snaps on a settle frame', () => {
    const cur = neutralGrade(), goal = { saturation: 0.7, gain: [0.9, 1, 1.1] as [number, number, number] };
    easeGrade(cur, goal, 0.1);
    expect(cur.saturation).toBeLessThan(1);
    expect(cur.saturation).toBeGreaterThan(0.95);
    easeGrade(cur, goal, 0);
    expect(cur).toEqual(goal);
  });

  it('the GLSL mirrors the reference implementation (gain, then saturation about Rec. 709 luminance)', () => {
    expect(GRADE_GLSL).toContain('vec3 lookGrade(vec3 c, float sat, vec3 gain)');
    expect(GRADE_GLSL).toContain('0.2126, 0.7152, 0.0722');
  });
});

describe('grade passes', () => {
  it('GradeEffect carries the grade in its uniforms', () => {
    const e = new GradeEffect({ saturation: 0.7, gain: [0.9, 1, 1.1] });
    expect(e.current.saturation).toBeCloseTo(0.7);
    e.set({ saturation: 1.1, gain: [1.05, 1, 0.9] });
    expect(e.current.gain[2]).toBeCloseTo(0.9);
    expect(e.getFragmentShader()).toContain('lookGrade');
    e.dispose();
  });

  it('DirectGrade is skipped while neutral and switches MSAA by preset', () => {
    const d = new DirectGrade();
    expect(d.active).toBe(false);
    d.set({ saturation: 0.72, gain: [1, 1, 1] });
    expect(d.active).toBe(true);
    expect(d.material.uniforms.uGradeSat!.value).toBeCloseTo(0.72);
    d.setMsaa(true);
    expect((d as unknown as { samples: number }).samples).toBe(DIRECT_GRADE_MSAA_SAMPLES);
    d.set(neutralGrade());
    expect(d.active).toBe(false);
    expect(d.material.fragmentShader).toContain('#include <tonemapping_fragment>');
    d.dispose();
  });
});
