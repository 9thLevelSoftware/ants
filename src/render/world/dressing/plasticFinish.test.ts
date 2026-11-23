// Look pass 5 item 4: the moulded-plastic finish in the shader and its tuning.
import { describe, expect, it } from 'vitest';
import { FINISH } from './finishes';
import { LOOK_FRAG_DECL, lookFragMain } from './finishGlsl';
import { PLASTIC } from './tuning';

describe('plastic finish shader', () => {
  it('declares one shared moulded-surface function and both plastic finishes use it', () => {
    expect(LOOK_FRAG_DECL).toContain('vec3 wrPlastic(');
    const main = lookFragMain(false);
    expect(main).toContain(`fin == ${FINISH.plastic}`);
    expect(main.match(/wrPlastic\(col, lp, ln, hs, 0\.0, 0\.0, rough\)/g)).toHaveLength(1); // the ribbed finish: no part line or rim of its own
    expect(main.match(/wrPlastic\(col, lp, ln, hs, 0\.0, 1\.0, rough\)/g)).toHaveLength(1); // the plain finish: part line and rim
  });
  it('the stipple fades with the pixel footprint (no shimmer) and the dirt is measured from the object foot', () => {
    expect(LOOK_FRAG_DECL).toContain('fwidth(lp)');
    expect(LOOK_FRAG_DECL).toContain('vWrW.y - vWrFoot');
  });
  it('every feature is a few millimetres, the size that reads at 5 to 50 BU of ant-height distance', () => {
    expect(PLASTIC.grainMm).toBeGreaterThanOrEqual(1);
    expect(PLASTIC.grainMm).toBeLessThanOrEqual(3);
    expect(PLASTIC.seamMm).toBeLessThan(PLASTIC.rimInsetMm[0]);
    expect(PLASTIC.rimInsetMm[1]).toBeLessThanOrEqual(25);
    expect(PLASTIC.dirtMm[1]).toBeGreaterThan(PLASTIC.dirtMm[0]);
    for (const v of [PLASTIC.grainAlbedo, PLASTIC.seamDark, PLASTIC.rimDark, PLASTIC.wearMix, PLASTIC.dirtMix]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it('the finish code is new and unique', () => {
    const ids = Object.values(FINISH);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
