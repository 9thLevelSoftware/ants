// A caste with ownColours keeps its body colours under the species appearance; wing tint and shape still follow it.
import { describe, expect, it } from 'vitest';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { resolveMorph } from './catalog';
import { LASIUS_GYNE, LASIUS_QUEEN } from './lasius';

describe('ownColours', () => {
  const appearance = LASIUS_NIGER.appearance;
  it('the queen and the gyne keep their own colours and differ from the workers in game', () => {
    const w = resolveMorph('lasius-niger', 'worker', appearance);
    for (const [caste, own] of [['queen', LASIUS_QUEEN], ['gyne', LASIUS_GYNE]] as const) {
      const m = resolveMorph('lasius-niger', caste, appearance);
      expect(m.colors.mesosoma).toBe(own.colors.mesosoma);
      expect(m.colors.gaster).toBe(own.colors.gaster);
      expect(m.colors.mesosoma).not.toBe(w.colors.mesosoma);
    }
  });
  it('other appearance fields still apply to her', () => {
    const m = resolveMorph('lasius-niger', 'queen', { ...appearance, alateWingTint: '#123456', hairiness: 0.4 });
    expect(m.colors.wingMembrane).toBe('#123456');
    expect(m.hairs).toBeGreaterThan(LASIUS_QUEEN.hairs);
  });
});
