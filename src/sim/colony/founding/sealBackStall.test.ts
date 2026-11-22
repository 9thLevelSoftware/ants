// Colony-life round 9 (direction 20 item 1, the founding at the start pose): a queen out of her cavity on the way back
// in, wedged in the throat beside her own half-laid plug, stood still in the guide's BACK state until the seal's
// budget ran out (suburban-garden #4: 5600 ticks frozen, no seal; the watchdog's new strategy planned her straight back
// into BACK). The way in now has the same stall rule as the walk to the stand: no progress toward it over
// SEAL_STALL_TICKS and, in the throat of her opening, she bites toward the way in. And a queen looking for soil in
// that throat stays on the soil rule while a plug has narrowed the throat so far that she counts as out of the cavity.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { SEAL_SOIL_WAIT_TICKS, SEAL_STALL_TICKS, SEAL_UNPOCKET_EVERY_TICKS } from '@/sim/balance/founding';
import { bbSet } from './access';
import { FB } from './access';
import { SG } from './sealGuide';
import { throatCase } from './sealKit';
import { cellReachesAir, queenInCavity } from './sealPlan';
import { nestOf, pinTemperature, queen, stepUntil } from './testkit';

const BACK = 4, SOIL = 5;

/** Her cell's throat with a pocket in it, 1 BU under the ground and 0.6 BU of soil away from the shaft: in the throat
 * of her opening, below the ground, and not part of her cavity (she cannot walk from it to the way in). */
function inPocket(): { sim: Sim; c: ReturnType<typeof throatCase> } {
  const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
  const sim = c.sim, bu = sim.world.bu, q = queen(sim), nest = nestOf(sim);
  pinTemperature(sim, 22);
  const pocket = { x: c.mouth.x - 2.5 * bu, y: c.mouth.y - 1.0 * bu, z: c.mouth.z };
  sim.enqueue({ type: 'cheat.carveSphere', pos: pocket, r: 0.8 * bu });
  sim.tick();
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: { ...pocket, y: pocket.y - 0.4 * bu } });
  sim.enqueue({ type: 'possess', antId: q.id });
  sim.tick();
  expect({ inCavity: queenInCavity(sim, nest, q), air: cellReachesAir(sim, nest) }).toEqual({ inCavity: false, air: true });
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  stepUntil(sim, () => (q.bb[SG.state] ?? 0) === BACK, 50);
  expect(q.bb[SG.state]).toBe(BACK);
  return { sim, c };
}

describe('the seal guide on the way back in (BACK)', () => {
  it('shut in a pocket beside the top of her shaft, she bites toward the way in once she makes no progress', () => {
    const { sim } = inPocket();
    const q = queen(sim), bites0 = q.bb[FB.bites] ?? 0;
    // two stall checks: the first may still see her slide in the pocket, the second finds her stuck
    stepUntil(sim, () => (q.bb[FB.bites] ?? 0) > bites0 || q.action?.id === 'dig-bite', 2 * SEAL_STALL_TICKS + 2);
    expect((q.bb[FB.bites] ?? 0) > bites0 || q.action?.id === 'dig-bite').toBe(true);
  }, 90_000);

  it('looking for soil (SOIL) in the throat of her opening, out of the cavity, she stays on the soil rule and bites', () => {
    // woodland-edge #4 at the start pose: SOIL -> BACK -> SOIL every 5-12 ticks, the soil bite never came
    const { sim } = inPocket();
    const q = queen(sim), bites0 = q.bb[FB.bites] ?? 0;
    bbSet(q, SG.state, SOIL);
    bbSet(q, SG.since, sim.state.tick);
    let left = false;
    stepUntil(sim, () => {
      if ((q.bb[SG.state] ?? 0) !== SOIL && (q.bb[FB.bites] ?? 0) === bites0) left = true;
      return left || (q.bb[FB.bites] ?? 0) > bites0 || q.action?.id === 'dig-bite';
    }, SEAL_SOIL_WAIT_TICKS + 3 * SEAL_UNPOCKET_EVERY_TICKS);
    expect({ left, bit: (q.bb[FB.bites] ?? 0) > bites0 || q.action?.id === 'dig-bite' }).toEqual({ left: false, bit: true });
  }, 90_000);
});
