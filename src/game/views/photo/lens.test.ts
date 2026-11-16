// Lens clamping (task photo acceptance 1): every setter keeps the rig inside GDD 08 7.9's ranges and refuses NaN.
import { describe, expect, it } from 'vitest';
import { PhotoRig, PHOTO_EXPOSURE_EV, PHOTO_FOCAL_MM, PHOTO_FOCUS_BU, PHOTO_ROLL_DEG, makePose } from '@/render/camera';
import { aimAt, readLens, resetLens, setExposureEV, setFNumber, setFocalMm, setFocusBu, setFocusMm, setRollDeg, viewDirection } from './lens';

const BU = 4;
function rig(): PhotoRig {
  const r = new PhotoRig(BU);
  const p = makePose();
  p.pos = { x: 100, y: 20, z: 100 };
  p.look = { x: 100, y: 20, z: 60 };
  r.enter(p);
  return r;
}

describe('lens setters clamp to the documented ranges', () => {
  it('focal length 24-200 mm', () => {
    const r = rig();
    setFocalMm(r, 5); expect(readLens(r).focalMm).toBeCloseTo(PHOTO_FOCAL_MM[0], 6);
    setFocalMm(r, 9999); expect(readLens(r).focalMm).toBeCloseTo(PHOTO_FOCAL_MM[1], 6);
    setFocalMm(r, 85); expect(readLens(r).focalMm).toBeCloseTo(85, 6);
  });

  it('aperture f/1.4-f/22', () => {
    const r = rig();
    setFNumber(r, 0.1); expect(readLens(r).fNumber).toBeCloseTo(1.4, 6);
    setFNumber(r, 400); expect(readLens(r).fNumber).toBeCloseTo(22, 6);
    setFNumber(r, 5.6); expect(readLens(r).fNumber).toBeCloseTo(5.6, 3);
  });

  it('focus 0.5-200 BU, in BU and in mm', () => {
    const r = rig();
    setFocusBu(r, 0); expect(readLens(r).focusBu).toBeCloseTo(PHOTO_FOCUS_BU[0], 9);
    setFocusBu(r, 1e6); expect(readLens(r).focusBu).toBeCloseTo(PHOTO_FOCUS_BU[1], 9);
    setFocusMm(r, 40); expect(readLens(r).focusBu).toBeCloseTo(40 / BU, 9);
    setFocusMm(r, -3); expect(readLens(r).focusBu).toBeCloseTo(PHOTO_FOCUS_BU[0], 9);
  });

  it('exposure -3..+3 EV and roll -45..+45 degrees', () => {
    const r = rig();
    setExposureEV(r, 9); expect(r.exposureEV).toBe(PHOTO_EXPOSURE_EV[1]);
    setExposureEV(r, -9); expect(r.exposureEV).toBe(PHOTO_EXPOSURE_EV[0]);
    setRollDeg(r, 90); expect(r.roll).toBe(PHOTO_ROLL_DEG[1]);
    setRollDeg(r, -90); expect(r.roll).toBe(PHOTO_ROLL_DEG[0]);
  });

  it('a NaN or infinite value changes nothing', () => {
    const r = rig();
    setFocalMm(r, 70); setFNumber(r, 4); setFocusBu(r, 12); setExposureEV(r, 1); setRollDeg(r, 10);
    const before = readLens(r);
    for (const bad of [NaN, Infinity, -Infinity]) {
      setFocalMm(r, bad); setFNumber(r, bad); setFocusBu(r, bad); setExposureEV(r, bad); setRollDeg(r, bad);
    }
    const after = readLens(r);
    expect(after.focalMm).toBeCloseTo(before.focalMm, 6);
    expect(after.fNumber).toBeCloseTo(before.fNumber, 6);
    expect(after.focusBu).toBeCloseTo(before.focusBu, 9);
    expect(after.exposureEV).toBe(before.exposureEV);
    expect(after.rollDeg).toBe(before.rollDeg);
    expect([after.focalMm, after.fNumber, after.focusBu].every(Number.isFinite)).toBe(true);
  });

  it('the rig output follows the set values (bokeh = 9 / f, vertical FOV from the focal length)', () => {
    const r = rig();
    setFNumber(r, 2.8); setFocalMm(r, 50); setExposureEV(r, 1.5);
    const o = r.update(0.016, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0 }, () => 1e9);
    expect(o.dof.bokehScale).toBeCloseTo(9 / 2.8, 6);
    expect(o.fov).toBeCloseTo((2 * Math.atan(12 / 50)) * 180 / Math.PI, 6);
    expect(o.exposureEV).toBe(1.5);
  });

  it('reset puts aperture, exposure and roll back', () => {
    const r = rig();
    setFNumber(r, 16); setExposureEV(r, -2); setRollDeg(r, 30);
    resetLens(r);
    expect(readLens(r).fNumber).toBeCloseTo(2.8, 6);
    expect(r.exposureEV).toBe(0); expect(r.roll).toBe(0);
  });
});

describe('aimAt', () => {
  it('points the view direction at the target', () => {
    const r = rig();
    const target = { x: 130, y: 35, z: 70 };
    expect(aimAt(r, target)).toBe(true);
    const d = viewDirection(r, { x: 0, y: 0, z: 0 });
    const want = { x: target.x - r.pos.x, y: target.y - r.pos.y, z: target.z - r.pos.z };
    const l = Math.hypot(want.x, want.y, want.z);
    expect(d.x).toBeCloseTo(want.x / l, 6); expect(d.y).toBeCloseTo(want.y / l, 6); expect(d.z).toBeCloseTo(want.z / l, 6);
  });
  it('refuses a target at the camera', () => {
    const r = rig();
    expect(aimAt(r, { ...r.pos })).toBe(false);
  });
});
