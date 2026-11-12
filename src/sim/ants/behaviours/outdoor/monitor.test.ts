// The trail observers keep their memory in colony state (Colony.forage), so save -> load -> continue announces
// exactly what the uninterrupted game announces: a trail that connected before the save is announced once after it,
// and one already announced is not announced again.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TRAIL_CHECK_S } from '@/sim/balance/foraging';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { secondsToTicks } from '@/sim/time';
import { announce, forageScenario } from './testkit';

function established(sim: Sim): number[] {
  const out: number[] = [];
  sim.events.on('trail-established', (e) => { if (e.type === 'trail-established') out.push(e.sourceId); });
  return out;
}

describe('trail monitor state survives a load', () => {
  it('a trail laid before the save is announced once in both runs, and not again later', () => {
    const { sim, col, entrance, sources } = forageScenario({
      seed: 2, workers: 2, sources: [{ kind: 'sugar', variant: 'sugar-granules', distBu: 80, bearingDeg: 30, units: 50 }],
    });
    const s = sources[0];
    announce(sim, col, s);
    // a strong trail from the entrance to the source, laid just before the save
    for (let k = 0; k <= 100; k++) {
      const f = k / 100;
      const x = entrance.pos.x + (s.pos.x - entrance.pos.x) * f, z = entrance.pos.z + (s.pos.z - entrance.pos.z) * f;
      sim.phero.deposit(col.id, 'trail', { x, y: sim.field.height(x, z), z }, 8);
    }
    sim.tick();
    const b = createSim(restore(snapshot(sim)).state, sim.world, { systems: sim.systems });
    const evA = established(sim), evB = established(b);
    const ticks = 3 * secondsToTicks(TRAIL_CHECK_S);
    for (let t = 0; t < ticks; t++) { sim.tick(); b.tick(); }
    console.log(`trail-established: uninterrupted ${JSON.stringify(evA)}, loaded ${JSON.stringify(evB)}`);
    expect(evA).toEqual([s.id]);
    expect(evB).toEqual(evA);
    expect(stateHash(b.state)).toBe(stateHash(sim.state));
    // a second load after the announcement does not repeat it
    const c = createSim(restore(snapshot(b)).state, b.world, { systems: b.systems });
    const evC = established(c);
    for (let t = 0; t < ticks; t++) c.tick();
    expect(evC).toEqual([]);
  }, 300000);
});
