import { describe, expect, it } from 'vitest';
import { NEST_LOOK } from '@/render/nest/params';
import { UndergroundSwitch } from './undergroundSwitch';

const BU = 4;

describe('UndergroundSwitch', () => {
  it('enters below the enter depth and leaves only above the exit depth (hysteresis)', () => {
    const u = new UndergroundSwitch();
    expect(u.update(10, BU)).toBe(false);
    const between = -0.5 * (NEST_LOOK.enterDepthBU + NEST_LOOK.exitDepthBU) * BU;
    expect(u.update(between, BU)).toBe(false);
    expect(u.update(-(NEST_LOOK.enterDepthBU + 0.05) * BU, BU)).toBe(true);
    expect(u.update(between, BU)).toBe(true);
    expect(u.update(-(NEST_LOOK.exitDepthBU - 0.05) * BU, BU)).toBe(false);
  });

  it('treats NaN as above ground and snaps without hysteresis on request', () => {
    const u = new UndergroundSwitch();
    u.update(-10 * BU, BU);
    expect(u.update(Number.NaN, BU)).toBe(false);
    expect(u.update(-NEST_LOOK.enterDepthBU * BU * 0.9, BU, true)).toBe(true);
  });
});
