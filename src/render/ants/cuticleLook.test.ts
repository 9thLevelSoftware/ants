// One cuticle look by day (app-seams-2 item 12): queen, gyne, male and worker share the cuticle values, the clearcoat is cut by day, a full gaster
// has no clearcoat, and the hair rim is dark brown, not beige.
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { LASIUS_QUEEN, LASIUS_GYNE, LASIUS_MALE, LASIUS_WORKER } from './morph/lasius';
import { ANT_SHEEN } from './shader/fragmentChunk';
import { ANT_DAY_LOOK, CUTICLE, GASTER_MEMBRANE } from './tuning';

describe('one cuticle look by day', () => {
  it('the four forms share roughness, sheen and clearcoat', () => {
    for (const m of [LASIUS_WORKER, LASIUS_QUEEN, LASIUS_GYNE, LASIUS_MALE]) {
      expect(m.roughness, m.name).toBe(CUTICLE.roughness);
      expect(m.sheen, m.name).toBe(CUTICLE.sheen);
      expect(m.clearcoat, m.name).toBe(CUTICLE.clearcoat);
    }
  });
  it('by day the clearcoat is cut, at full night weight it is not cut again', () => {
    expect(ANT_DAY_LOOK.clearcoatMul).toBeLessThan(0.6);
    expect(ANT_SHEEN).toContain(`mix(${ANT_DAY_LOOK.clearcoatMul.toFixed(2)}, 1.0, uFillK)`);
  });
  it('a full gaster loses all of its clearcoat', () => {
    expect(GASTER_MEMBRANE.clearcoatCut).toBe(1);
  });
  it('the hair rim is a dark brown (not beige)', () => {
    const c = new Color(CUTICLE.sheenColor);
    expect(c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722).toBeLessThan(0.05);
  });
});
