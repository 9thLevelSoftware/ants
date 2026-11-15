// Rival profiles: every rival species and every playable species (as a conspecific rival) has a sane profile.
import { describe, expect, it } from 'vitest';
import { PLAYABLE_SPECIES, RIVAL_SPECIES } from '@/sim/species';
import { rivalProfile, rivalProfileIds } from './profiles';

describe('rival profiles', () => {
  it('cover the rival roster and the playable species', () => {
    const ids = rivalProfileIds();
    for (const r of RIVAL_SPECIES) expect(ids).toContain(r.id);
    for (const p of PLAYABLE_SPECIES) expect(ids).toContain(p.id);
  });
  it('are consistent: N0 < K_max, field caps normal < war, a playable template species, a window lo < hi', () => {
    const playable = PLAYABLE_SPECIES.map((p) => p.id as string);
    for (const id of rivalProfileIds()) {
      const p = rivalProfile(id as never);
      expect(p.n0, id).toBeLessThan(p.kMax);
      expect(p.fieldCap.normal, id).toBeLessThan(p.fieldCap.war);
      expect(playable, id).toContain(p.templateSpecies);
      expect(p.activityC[0], id).toBeLessThan(p.activityC[1]);
      expect(p.queens, id).toBeGreaterThanOrEqual(1);
      expect(p.cp, id).toBeGreaterThan(0);
      expect(p.aggression, id).toBeGreaterThan(0);
      expect(p.aggression, id).toBeLessThanOrEqual(1);
    }
  });
  it('rows from the roster data are copied unchanged (tetramorium)', () => {
    const d = RIVAL_SPECIES.find((r) => r.id === 'tetramorium-immigrans')!;
    const p = rivalProfile('tetramorium-immigrans');
    expect([p.cp, p.aggression, p.n0, p.kMax, p.growthPerGd]).toEqual([d.cp, d.aggression, d.n0, d.kMax, d.growthPerGd]);
  });
});
