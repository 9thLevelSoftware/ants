// Unit tests of the views-task retune of the possession camera: environment state switching with hold and blend,
// the occlusion cone and rule 4 above ground only, the up-vector timing (GDD 01 E14), pinch fallback, ceiling
// comfort and the path boom on a straight analytic tunnel.
import { describe, expect, it } from 'vitest';
import { v3Dot, vec3 } from '@/core';
import { Breadcrumbs } from './breadcrumbs';
import { boomLift, clearLine, solveBoom } from './boomPath';
import { CAM_STATE_HOLD_S, OCCLUSION_CONE_END_L, OCCLUSION_CONE_RADIUS_L, PINCH_HOLD_S } from './constants';
import { classify, StateHold } from './envState';
import { creviceForcesCutaway, targetOpacity, writeFade } from './fade';
import { comfortWeight, leanUp, PinchFallback } from './pinch';
import { makeSphereTracer } from './sphereTrace';
import { ThirdPersonRig } from './thirdPersonRig';
import { NO_ORBIT_INPUT, type FadeOutput } from './types';

const BU = 4;

describe('environment state switching (GDD 01 6.3)', () => {
  it('classifies by ray hits, underground and airborne', () => {
    expect(classify({ hitsTunnel: 2, hitsCrevice: 0 }, false, false, false)).toBe('open');
    expect(classify({ hitsTunnel: 2, hitsCrevice: 0 }, true, false, false)).toBe('chamber');
    expect(classify({ hitsTunnel: 5, hitsCrevice: 2 }, true, false, false)).toBe('tunnel');
    expect(classify({ hitsTunnel: 8, hitsCrevice: 7 }, false, false, false)).toBe('crevice');
    expect(classify({ hitsTunnel: 8, hitsCrevice: 7 }, false, true, false)).toBe('falling');
    expect(classify({ hitsTunnel: 0, hitsCrevice: 0 }, false, false, true)).toBe('flight');
  });

  it('a candidate must persist CAM_STATE_HOLD_S; falling switches at once', () => {
    const h = new StateHold();
    h.reset('open');
    expect(h.update(CAM_STATE_HOLD_S * 0.5, 'tunnel')).toBe(false);
    expect(h.update(CAM_STATE_HOLD_S * 0.4, 'open')).toBe(false); // flicker resets the hold
    expect(h.update(CAM_STATE_HOLD_S * 0.6, 'tunnel')).toBe(false);
    expect(h.update(CAM_STATE_HOLD_S * 0.6, 'tunnel')).toBe(true);
    expect(h.state).toBe('tunnel');
    expect(h.update(1 / 60, 'falling')).toBe(true);
  });
});

describe('fade and occlusion cone (GDD 01 6.5, views deviation)', () => {
  it('rule 4 forces the cutaway only in a surface crevice', () => {
    expect(creviceForcesCutaway('crevice', false)).toBe(true);
    expect(creviceForcesCutaway('crevice', true)).toBe(false);
    expect(creviceForcesCutaway('tunnel', false)).toBe(false);
    expect(targetOpacity(10 * BU, BU, true)).toBe(0.5);
    expect(targetOpacity(0.5 * BU, BU, false)).toBeCloseTo(0.3);
    expect(targetOpacity(0.75 * BU, BU, false)).toBeCloseTo(0.65);
  });

  it('the cone ends short of the thorax and is narrow', () => {
    const out: FadeOutput = { target: 1, occlusion: 0, capsuleA: vec3(), capsuleB: vec3(), capsuleRadius: 0 };
    const L = 2 * BU;
    writeFade(out, { x: 0, y: 0, z: 0 }, { x: 3 * L, y: 0, z: 0 }, L, false, 1);
    expect(out.capsuleB.x).toBeCloseTo(3 * L - OCCLUSION_CONE_END_L * L);
    expect(out.capsuleRadius).toBeCloseTo(OCCLUSION_CONE_RADIUS_L * L);
    expect(out.coneStart).toBeLessThan(1);
    // camera closer than the end margin: no cone at all
    writeFade(out, { x: 0, y: 0, z: 0 }, { x: 0.3 * L, y: 0, z: 0 }, L, false, 1);
    expect(out.capsuleRadius).toBe(0);
  });
});

describe('up-vector timing (GDD 01 E14)', () => {
  it('after a 90 degree up change: 33 +- 4 degrees after 0.35 s, <= 2 degrees after 1.5 s', () => {
    const trace = makeSphereTracer(() => 1e3); // open space
    const r = new ThirdPersonRig({ bu: BU, bodyL: 1, autoFollow: 'off' });
    const t = { pos: vec3(0, 0, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    for (let i = 0; i < 60; i++) r.update(1 / 60, t, NO_ORBIT_INPUT, { trace });
    t.up = vec3(0, 0, 1); // walked onto a wall in one tick
    const angle = () => Math.acos(Math.max(-1, Math.min(1, v3Dot(r.out.up, t.up)))) * 180 / Math.PI;
    let time = 0;
    for (; time < 0.35 - 1e-9; time += 1 / 60) r.update(1 / 60, t, NO_ORBIT_INPUT, { trace });
    expect(angle()).toBeGreaterThan(29);
    expect(angle()).toBeLessThan(37);
    for (; time < 1.5 - 1e-9; time += 1 / 60) r.update(1 / 60, t, NO_ORBIT_INPUT, { trace });
    expect(angle()).toBeLessThanOrEqual(2);
  });
});

describe('pinch fallback and ceiling comfort (spike-nest 5.9-5.10)', () => {
  it('pinch engages after being squeezed for PINCH_HOLD_S and releases with room again', () => {
    const p = new PinchFallback();
    const L = BU;
    for (let t = 0; t < PINCH_HOLD_S * 0.9; t += 0.05) p.update(0.05, 0.1 * L, L);
    expect(p.active).toBe(false);
    for (let t = 0; t < 0.5; t += 0.05) p.update(0.05, 0.1 * L, L);
    expect(p.active).toBe(true);
    for (let t = 0; t < 1; t += 0.05) p.update(0.05, 0.1 * L, L);
    expect(p.weight).toBe(1);
    for (let t = 0; t < 2; t += 0.05) p.update(0.05, 2 * L, L);
    expect(p.active).toBe(false);
    expect(p.weight).toBe(0);
  });

  it('comfort leans an upside-down view toward world up, and leaves an upright one alone', () => {
    expect(comfortWeight(1)).toBe(0);
    expect(comfortWeight(-1)).toBe(1);
    const up = vec3(0, -1, 0);
    leanUp(up, vec3(0, 0, 0), vec3(1, 0, 0), comfortWeight(-1));
    expect(up.y).toBeGreaterThan(0.99);
    const up2 = vec3(0, 1, 0);
    leanUp(up2, vec3(0, 0, 0), vec3(1, 0, 0), comfortWeight(1));
    expect(up2.y).toBe(1);
  });
});

describe('path boom (GDD 01 6.4, views retune)', () => {
  // a straight tunnel of radius 4 mm along -x (field: distance to the tube wall, saturating like the carve field)
  const R_TUBE = 4;
  const tube = (x: number, y: number, z: number) => Math.min(2, R_TUBE - Math.hypot(y - R_TUBE, z));
  const trace = makeSphereTracer(tube);
  const L = 2.1 * BU;

  it('rides the crumbs to the full distance inside a tube barely taller than the ant, near its axis', () => {
    const crumbs = new Breadcrumbs(64, 0.1 * L);
    for (let x = -40; x <= 0; x += 0.5) crumbs.sample({ x, y: 0.4, z: 0 }, { x: 0, y: 1, z: 0 });
    const out = vec3();
    const got = solveBoom(crumbs, trace, { x: 0, y: 0.4, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 2.5 * L, L, 1.1, out, tube, { x: 0, y: 1.6, z: 0 });
    expect(got).toBeCloseTo(2.5 * L);
    expect(out.x).toBeCloseTo(-2.5 * L, 0);
    expect(tube(out.x, out.y, out.z)).toBeGreaterThan(1.1);
    expect(boomLift(trace, { x: 0, y: 0.4, z: 0 }, { x: 0, y: 1, z: 0 }, L)).toBeLessThanOrEqual(0.5 * (2 * R_TUBE - 0.4) + 1e-6);
    expect(clearLine(trace, out, { x: 0, y: 1.6, z: 0 }, L)).toBe(true);
  });

  it('stops at the last sample that fits (a pinch in the path)', () => {
    const pinched = (x: number, y: number, z: number) => Math.min(tube(x, y, z), Math.abs(x + 1.5 * L) - 0.2 + 0.5);
    const tr = makeSphereTracer(pinched);
    const crumbs = new Breadcrumbs(64, 0.1 * L);
    for (let x = -40; x <= 0; x += 0.5) crumbs.sample({ x, y: 0.4, z: 0 }, { x: 0, y: 1, z: 0 });
    const out = vec3();
    const got = solveBoom(crumbs, tr, { x: 0, y: 0.4, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 2.5 * L, L, 1.1, out);
    expect(got).toBeGreaterThan(0.5 * L);
    expect(got).toBeLessThan(1.5 * L);
  });
});

describe('teleport snap', () => {
  it('a subject that jumps more than CAM_SNAP_JUMP_L starts over behind it (no stale tunnel trail)', () => {
    const trace = makeSphereTracer(() => 1e3);
    const r = new ThirdPersonRig({ bu: BU, bodyL: 1, autoFollow: 'off' });
    const t = { pos: vec3(0, 0, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    for (let i = 0; i < 30; i++) { t.pos.x += 0.2; r.update(1 / 30, t, NO_ORBIT_INPUT, { trace }); }
    t.pos = vec3(500, 0, 500);
    const o = r.update(1 / 30, t, NO_ORBIT_INPUT, { trace });
    expect(Math.hypot(o.pos.x - 500, o.pos.z - 500)).toBeLessThan(10 * BU);
    expect(o.guarded).toBe(false);
  });
});
