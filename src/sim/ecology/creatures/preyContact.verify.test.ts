// Independent review of colony-life round 3, fix H2a ("one escape roll per contact", preyFauna.ts). Measures what the
// contact window covers: a springtail that stayed when touched is bitten without an escape roll for the whole 2 s jump
// cooldown, by any number of bites and by any ant. GDD 05 §2.3 says "escapes per bite attempt"; the round records the
// one-roll-per-contact reading as a GDD deviation. This test pins the measured behaviour (green) so the integrator can
// rule on it with numbers: the 2nd bite attempt in the window (bite cycle 1.0 s, COMBAT_BITE_CYCLE_S) and a second
// ant's bite escape with p 0, where a per-bite roll would give 0.6 on open ground.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { despawnCreature } from '@/sim/entities';
import { preyEvades } from './index';
import { creatureScene, installFakeCombat, placeWorker, sendQueenAway, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('H2a review: what one contact window covers', () => {
  it('after a touch it stayed for, every bite in the next 2 s lands without an escape roll, from any ant', () => {
    const sim = creatureScene({ seed: 11 });
    sendQueenAway(sim);
    const a1 = placeWorker(sim, 250, 252);
    const a2 = placeWorker(sim, 252, 250);
    let stayed = 0, firstEsc = 0, secondEsc = 0, otherAntEsc = 0;
    for (let i = 0; i < 200; i++) {
      const s = spawnAt(sim, 'springtail', 250, 250, { state: 'graze', bb: { contact: sim.state.tick } });
      const x0 = s.pos.x, z0 = s.pos.z;
      step(sim, 2); // the touch rolls on the creature's update
      const jumped = (s.pos.x - x0) ** 2 + (s.pos.z - z0) ** 2 > 30 * 30;
      if (!jumped) {
        stayed++;
        if (preyEvades(sim, s.id, a1.id)) firstEsc++; // bite 1 (t + 0.2 s)
        else {
          step(sim, 10); // bite 2 of the same ant, one bite cycle later (t + 1.2 s), still in the window
          if (s.alive && preyEvades(sim, s.id, a1.id)) secondEsc++;
          else if (s.alive && preyEvades(sim, s.id, a2.id)) otherAntEsc++; // a nestmate's bite in the same window
        }
      }
      if (s.alive) despawnCreature(sim, s.id, 'test');
      step(sim, 25); // past the window before the next springtail
    }
    const info = JSON.stringify({ stayed, firstEsc, secondEsc, otherAntEsc });
    expect(stayed, info).toBeGreaterThan(40);
    // the measured deviation: no bite in the window is rolled (per-bite rolling would give ~0.6 x stayed on each)
    expect(firstEsc + secondEsc + otherAntEsc, info).toBe(0);
  });
});
