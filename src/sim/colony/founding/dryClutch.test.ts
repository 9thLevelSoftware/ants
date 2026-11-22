// Colony-life round 9, FD2 (direction 21b, the first play on seed 2): rain caught by the open shaft while the queen
// dug is trapped by her seal; eggs laid on the wet floor drowned after FLOOD_BROOD_DROWN_S. In the sealed cell she is
// the only carer and puts her brood down on dry floor (GDD 06 §5.11: "carry eggs/larvae to the highest alcove").
import { describe, expect, it } from 'vitest';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { dryFloorAbove } from './dryPile';
import { careTick } from './care';
import { FB, bbSet } from './access';

describe('the founding queen keeps her clutch out of water in her sealed cell (FD2)', () => {
  it('brood under water in the sealed cell is put down on dry floor at her next care period', () => {
    const sim = searchingSim({ seed: 2 });
    pinTemperature(sim, 24);
    const r = readyInRampCell(sim);
    act(sim, 'dig-bite');
    walkTo(sim, r.rampAt(1.5), 0.5);
    act(sim, 'seal-entrance');
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    expect(phase(sim)).toBe('lay');
    walkTo(sim, r.floor, 0.8);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    const nest = nestOf(sim), colId = sim.state.player.colonyId, bu = sim.world.bu;
    const eggs = () => sim.state.brood.filter((b) => b.alive && b.colony === colId);
    const n0 = eggs().length;
    expect(n0).toBeGreaterThan(0);
    // water from a dig in the rain, kept in by the seal, half a body length over the eggs' floor; the flood's
    // submersion pass has marked them (submergedS)
    const level = Math.max(...eggs().map((b) => b.pos.y)) + 0.5 * bu;
    expect(dryFloorAbove(sim, nest, level)).not.toBeNull();
    nest.flood.level = level;
    for (const b of eggs()) b.submergedS = 10;
    // her next care period
    const q = queen(sim);
    bbSet(q, FB.careTick, -1e9);
    careTick(sim, sim.state.player.opening!, q, nest);
    expect(eggs().length).toBe(n0);
    for (const b of eggs()) {
      expect(b.pos.y).toBeGreaterThan(level);
      expect(b.submergedS).toBeUndefined();
    }
    // a dry floor is a floor: soil right under the new place
    const p = eggs()[0].pos;
    expect(sim.field.sampleXYZ(p.x, p.y - 0.5 * sim.carve.voxel, p.z)).toBeLessThan(0);
  }, 120_000);
});
