// Colony-life round 9 (direction 20 item 1, the founding at the start pose): a queen out of her cavity on the way back
// in, wedged in the throat beside her own half-laid plug, stood still in the guide's BACK state until the seal's
// budget ran out (suburban-garden #4: 5600 ticks frozen, no seal). The way in has the same stall rule as the walk to
// the stand: no progress over SEAL_STALL_TICKS and, in the throat of her opening, she bites toward the way in.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { SEAL_STALL_TICKS } from '@/sim/balance/founding';
import { FB } from './access';
import { SG } from './sealGuide';
import { throatCase } from './sealKit';
import { nestOf, pinTemperature, queen, stepUntil } from './testkit';
import { cellReachesAir, queenInCavity } from './sealPlan';

const BACK = 4;

describe('the seal guide on the way back in (BACK)', () => {
  it('wedged at the lip of her opening, she bites toward the way in after SEAL_STALL_TICKS without progress', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim), nest = nestOf(sim);
    pinTemperature(sim, 22);
    // on the ground 2 BU from the opening, outside the cavity and inside the throat (SEAL_THROAT_BU)
    const lip: Vec3 = { x: c.mouth.x - 2 * bu, y: sim.field.height(c.mouth.x - 2 * bu, c.mouth.z) + 0.5 * bu, z: c.mouth.z };
    // a lump of loose soil (her half-laid plug) at the lip between her and the shaft; the shaft beside it stays open
    sim.enqueue({ type: 'cheat.fillSphere', pos: { x: c.mouth.x - 1.1 * bu, y: sim.field.height(c.mouth.x - 1.1 * bu, c.mouth.z), z: c.mouth.z }, r: 0.7 * bu, loose: true });
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: lip });
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    expect(queenInCavity(sim, nest, q)).toBe(false);
    expect(cellReachesAir(sim, nest)).toBe(true);
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => (q.bb[SG.state] ?? 0) === BACK, 50);
    expect(q.bb[SG.state]).toBe(BACK);
    // wedged: whatever she is told, she stays where she is
    const at = { ...q.pos }, bites0 = q.bb[FB.bites] ?? 0;
    let bitAt = -1;
    for (let t = 0; t < SEAL_STALL_TICKS + 20 && bitAt < 0; t++) {
      sim.tick();
      if ((q.bb[SG.state] ?? 0) !== BACK) break;
      q.pos.x = at.x; q.pos.y = at.y; q.pos.z = at.z;
      if ((q.bb[FB.bites] ?? 0) > bites0 || q.action?.id === 'dig-bite') bitAt = t;
    }
    expect(bitAt).toBeGreaterThanOrEqual(0);
    expect(bitAt).toBeLessThanOrEqual(SEAL_STALL_TICKS + 2);
  }, 90_000);
});
