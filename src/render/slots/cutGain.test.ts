// gate-close-app play-through: at night the colony slice blew out to pale pink (playSeed1/x1-m14-slice.png). The
// cut face has its own light (the cap colour and the cut fill), calibrated for the day exposure; the night metering
// lifted it by about 3 EV. The gain holds it: 1 up to CUTAWAY.refEV, then 2^(refEV - EV), so the displayed cut
// face (gain x 2^EV) stays at its day level whatever the metering.
import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { CUTAWAY } from '../nest';
import { createNestUniforms } from '../nest/materials/nestUniforms';
import { NestLighting } from '../nest/lighting/nestLighting';
import { cutGain } from './nestSlot';

describe('cut face gain', () => {
  it('is 1 by day and holds the displayed level at night', () => {
    expect(cutGain(0)).toBe(1);
    expect(cutGain(CUTAWAY.refEV)).toBe(1);
    const day = Math.pow(2, CUTAWAY.refEV);
    for (const ev of [1, 2, 3, 3.5]) expect(cutGain(ev) * Math.pow(2, ev)).toBeCloseTo(day, 9);
    expect(cutGain(Number.NaN)).toBe(1);
  });

  it('scales the cut fill and the cap gain uniform together', () => {
    const u = createNestUniforms();
    const l = new NestLighting(u);
    l.setBodyUnit(4);
    const full = new Color(CUTAWAY.fillHex).multiplyScalar(CUTAWAY.fillLevel);
    expect(u.uCutFill.value.r).toBeCloseTo(full.r, 9);
    l.setCutGain(0.25);
    expect(u.uCutGain.value).toBe(0.25);
    expect(u.uCutFill.value.r).toBeCloseTo(full.r * 0.25, 9);
    l.setBodyUnit(4); // a BU change keeps the gain
    expect(u.uCutFill.value.g).toBeCloseTo(full.g * 0.25, 9);
    l.setCutGain(5); // never brighter than calibrated
    expect(u.uCutGain.value).toBe(1);
  });
});
