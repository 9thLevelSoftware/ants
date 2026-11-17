// Trunk trails (GDD 07 §5.3.7): cells walked by seed carriers stay scented while used within 3 GD, fade by half
// every 3 GD of disuse, are ghosts (cleared ground, no scent) after 10 GD and gone after 17 GD.

import { describe, expect, it } from 'vitest';
import { TRUNK_KEEP_PH } from '@/sim/balance/species-harvester';
import { TICKS_PER_DAY } from '@/sim/time';
import { messorKit } from './testkit';
import { markTrunk, onTrunk, refreshTrunk, trunkGone, trunkStrength } from './trunk';

describe('trunk trails', () => {
  it('strength: full for 3 GD, halves every 3 GD, ghost at 10, gone at 17', () => {
    const t = { enabled: true, unusedHalfLifeGd: 3, ghostAfterGd: 10, ghostFadeGd: 7, clearing: true };
    expect(trunkStrength(t, 2.9)).toBe(1);
    expect(trunkStrength(t, 6)).toBeCloseTo(0.5, 9);
    expect(trunkStrength(t, 10)).toBe(0);
    expect(trunkGone(t, 16.9)).toBe(false);
    expect(trunkGone(t, 17)).toBe(true);
  });

  it('a walked cell is kept scented, then fades and disappears', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const t = k.sim.getSpecies(col.species)!.signals.trunkTrail;
    const p = { x: 40 * k.sim.world.bu, y: 0, z: 50 * k.sim.world.bu };
    p.y = k.sim.field.height(p.x, p.z);
    markTrunk(k.sim, col.granary!, p.x, p.z);
    markTrunk(k.sim, col.granary!, p.x + 0.5 * k.sim.world.bu, p.z); // same cell
    expect(col.granary!.trunk!.length).toBe(1);
    expect(col.granary!.trunk![0].uses).toBe(2);
    refreshTrunk(k.sim, col, t);
    const cellCentre = { x: col.granary!.trunk![0].x, y: col.granary!.trunk![0].y, z: col.granary!.trunk![0].z };
    expect(k.sim.phero.sample(col.id, 'trail', cellCentre)).toBeGreaterThan(TRUNK_KEEP_PH * 0.5);
    expect(onTrunk(col.granary!, p.x, p.z, 3 * k.sim.world.bu)).toBe(true);
    k.sim.state.tick += 12 * TICKS_PER_DAY;
    refreshTrunk(k.sim, col, t);
    expect(col.granary!.trunk![0].strength).toBe(0); // ghost: still cleared ground
    expect(onTrunk(col.granary!, p.x, p.z, 3 * k.sim.world.bu)).toBe(true);
    k.sim.state.tick += 6 * TICKS_PER_DAY;
    refreshTrunk(k.sim, col, t);
    expect(col.granary!.trunk!.length).toBe(0);
  });
});
