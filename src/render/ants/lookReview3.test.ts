// Look pass 3 review: the wing, cuticle and gaster numbers are in tuning.ts and the shaders read them (no look numbers inline).
// The wing budget is the one that went wrong twice: four folded layers of a membrane add up (0.07 x 4 read as milk by day, 0.17 x 4 as a white tuft at night).
import { describe, expect, it } from 'vitest';
import { ANT_FILL, ANT_FILL_RIM_THIN, ANT_NIGHT_LOOK, GASTER_MEMBRANE, WING_LOOK } from './tuning';
import { ANT_SHEEN, WING_COLOR, WING_EMISSIVE } from './shader/fragmentChunk';
import { ANT_COLOR_VERTEX } from './shader/vertexChunk';

const FOLDS = 4;
const covered = (a: number) => 1 - Math.pow(1 - a, FOLDS);

describe('wing look', () => {
  it('four folded layers stay clear by day and by night (no milk, no white tuft)', () => {
    expect(covered(WING_LOOK.alpha)).toBeLessThan(0.25);
    expect(covered(WING_LOOK.alpha * (1 + WING_LOOK.nightAlphaGain)), 'the membrane at full night').toBeLessThan(0.3);
    expect(covered(WING_LOOK.alpha * WING_LOOK.edgeBoost * (1 + WING_LOOK.nightAlphaGain)), 'the margin, which is meant to read as an edge').toBeLessThan(0.45);
  });
  it('veins stay see-through and the film is weak', () => {
    expect(WING_LOOK.veinAlpha).toBeLessThanOrEqual(0.7);
    expect(WING_LOOK.iridescence).toBeLessThanOrEqual(0.4);
    expect(WING_LOOK.roughness).toBeGreaterThanOrEqual(0.4);
    expect(WING_LOOK.specularIntensity).toBeLessThanOrEqual(0.5);
  });
  it('the night edge light is grazing only and the possession rim is cut on wings', () => {
    expect(WING_EMISSIVE).toContain(`* ${WING_LOOK.highlightRim.toFixed(2)}`);
    expect(WING_EMISSIVE).toMatch(/uFillRim \* 0\.45 \* pow\(/); // no baseline term over the whole membrane
    expect(WING_LOOK.highlightRim).toBeLessThan(1);
  });
  it('the wing shader reads the numbers from tuning', () => {
    expect(WING_COLOR).toContain(WING_LOOK.alpha.toFixed(3));
    expect(WING_COLOR).toContain(WING_LOOK.nightAlphaGain.toFixed(2));
  });
});

describe('cuticle look', () => {
  it('the clearcoat loses a share at night (no chrome), and the night rim is weaker than the old 0.22', () => {
    expect(ANT_SHEEN).toContain(`${ANT_NIGHT_LOOK.clearcoatCut.toFixed(2)} * uFillK`);
    expect(ANT_NIGHT_LOOK.clearcoatCut).toBeGreaterThan(0.3);
    expect(ANT_FILL.rim.night).toBeLessThan(0.22);
    expect(ANT_FILL_RIM_THIN).toBeLessThan(1);
  });
  it('the stretched-gaster numbers come from tuning', () => {
    expect(ANT_COLOR_VERTEX).toContain(GASTER_MEMBRANE.fullFrom.toFixed(2));
    expect(ANT_COLOR_VERTEX).toContain(GASTER_MEMBRANE.clearcoatCut.toFixed(2));
  });
});
