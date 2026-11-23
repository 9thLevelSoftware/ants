// gate-sim-2 fix (item 4 kept, review: "check that item 4 restores exactly"): a point field a walker follows is never
// evicted from the bounded registry. The registry's order is a derived cache that a load rebuilds in another order;
// evicting "the oldest" removed a raider's field in the unsaved sg #2 run and another field after a load, and the two
// runs parted 31664 ticks after the hand-over (probe tools/sim/probe/g2f-handover.ts, test-output/gate-sim-2-fix/).
import { describe, expect, it } from 'vitest';
import { pointField } from './nests';
import { rt } from './runtime';
import { navTo } from './index';
import { deepestChamber, locoSim, playerNest, v3, workers } from './testkit';

describe('bounded point-field registry (gate-sim-2 fix)', () => {
  it('keeps a field a walker follows when the registry overflows, and drops the oldest unused one', () => {
    const sim = locoSim({ nest: 'small', workers: 2, sizeBu: 300 });
    const r = rt(sim), q = r.P.pointFieldCell, c = deepestChamber(playerNest(sim)).center;
    const at = (k: number) => v3(c.x + (k % 7) * q, c.y - Math.floor(k / 7) * q, c.z + 3 * q);
    const [ant] = workers(sim);
    expect(navTo(sim, ant, at(0))).toBe(true); // gives the walker its nav scratch
    const followed = pointField(sim, r, at(0));
    ant.nav.loco!.legField = followed;
    const unused = pointField(sim, r, at(1));
    for (let k = 2; k < r.P.pointFieldMax + 6; k++) pointField(sim, r, at(k));
    expect(r.pointFields.length).toBe(r.P.pointFieldMax);
    expect(sim.nestNav.hasTarget(followed)).toBe(true); // was the oldest: evicted by the FIFO rule
    expect(r.pointFields).toContain(followed);
    expect(sim.nestNav.hasTarget(unused)).toBe(false);
  });
});
