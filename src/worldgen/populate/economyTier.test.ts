// viab-economy review: the economy floors count only the supply the sim renews at its tier. The T1 crumb rule
// (30 % of consumed clusters re-placed daily) runs at Tier 1 only (ecology/sources/system.ts); from Tier 2 on crumbs
// come from human events, which the floors do not count.
import { describe, expect, it } from 'vitest';
import { CRUMB_REPLACE_FRACTION } from '@/sim/balance';
import { defAt } from './common';
import { renewalPerGd } from './economy';

describe('renewalPerGd by tier', () => {
  it('crumb clusters renew at Tier 1 only', () => {
    for (const v of ['crumb-starch', 'crumb-protein'] as const) {
      const def = defAt(v, 1);
      expect(renewalPerGd(v, 1)).toBeCloseTo(CRUMB_REPLACE_FRACTION * (def.units[0] + def.units[1]) / 2, 9);
      expect(renewalPerGd(v, 2)).toBe(0);
    }
  });

  it('pool refills count at every tier', () => {
    expect(renewalPerGd('flower', 2)).toBe(defAt('flower', 2).refillPerGd);
    expect(renewalPerGd('flower', 2)).toBeGreaterThan(0);
  });
});
