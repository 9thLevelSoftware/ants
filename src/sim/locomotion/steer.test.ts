// Steering terms on trip legs: the prefer-floor bias in a straight horizontal tunnel (spike-nest §5 item 4).
import { describe, expect, it } from 'vitest';
import { navWander, placeOnSurface } from './index';
import { rt } from './runtime';
import { locoSim, runUntilDone, v3 } from './testkit';

/** Share of ticks a walker wandering in a straight horizontal tunnel (radius 1.2 BU) spends on walls or ceiling. */
function wallShare(floorW: number): number {
  const sim = locoSim({ sizeBu: 300 });
  const bu = sim.world.bu, c = sim.world.size / 2, y = -8 * bu;
  for (let x = -40; x <= 40; x += 0.5) sim.kernel.carveSphere(v3(c + x * bu, y, c), 1.2 * bu, { force: true });
  sim.tick();
  const P = rt(sim).P as { floorW: number }, old = P.floorW;
  P.floorW = floorW;
  try {
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, v3(c - 20 * bu, y, c), v3(0, -1, 0))).toBe(true);
    ant.fwd = { x: 0.86, y: 0, z: 0.51 };
    expect(navWander(sim, ant, v3(c, y, c), 30 * bu, { speed: 6 * bu })).toBe(true);
    let n = 0, wall = 0;
    runUntilDone(sim, [ant], 600, () => { if (ant.medium === 'cavity') { n++; if (ant.up.y < 0.5) wall++; } });
    expect(n).toBeGreaterThan(500);
    return wall / n;
  } finally {
    P.floorW = old;
  }
}

describe('prefer-floor bias (spike-nest §5 item 4)', () => {
  it('a walker wandering in a horizontal tunnel spends clearly less time on its walls with the bias', () => {
    const off = wallShare(0), on = wallShare(rt(locoSim({ sizeBu: 128 })).P.floorW);
    // measured: 63 % without, 48 % with the default weight
    expect(off - on).toBeGreaterThan(0.1);
  });
});
