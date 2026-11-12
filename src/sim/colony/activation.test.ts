import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { addChamber, addEntrance, addWorkers, colonyOf, establishQueen, makeColonySim } from './testkit';
import { isWaitingForager, shouldDepart } from './activation';

/** E12 setup: 6 ants in forage.wait at the entrance, needP 0.5, surface activity 1, RH 80 %. */
function run(withReturns: boolean, seed: number): number {
  const sim: Sim = makeColonySim({ seed, noAllocation: true });
  const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  const entrance = addEntrance(sim, { x: 100, y: 0, z: 100 });
  const ants = addWorkers(sim, 6, { chamber: ch, task: 'forage', state: 'forage.wait' });
  ants.forEach((a, i) => { a.pos = { x: 100 + i * 0.5, y: 0, z: 100 }; });
  sim.tick();
  const col = colonyOf(sim);
  let departures = 0;
  for (let t = 0; t < 600; t++) {
    col.needs.needP = 0.5;
    col.needs.needC = 0;
    if (withReturns && t % 100 === 0) sim.enqueue({ type: 'cheat.injectReturn', entranceId: entrance, success: true, sourceId: -1 });
    sim.tick();
    for (const a of ants) {
      if (!isWaitingForager(a)) continue;
      if (shouldDepart(sim, a)) { a.state = 'forage.outbound'; departures++; }
    }
  }
  return departures;
}

describe('forager activation (GDD 02 §6.6, E12)', () => {
  it('successful returns every 10 s give >= 4 departures and >= 3x the spontaneous rate', () => {
    let a = 0, b = 0;
    const seeds = 10;
    for (let s = 1; s <= seeds; s++) { a += run(false, s); b += run(true, s); }
    const meanA = a / seeds, meanB = b / seeds;
    expect(meanA).toBeGreaterThan(0.4); // expected about 1.1 (6 ants x 60 s x 0.75 / 240 s)
    expect(meanA).toBeLessThan(2.0);
    expect(meanB).toBeGreaterThanOrEqual(4);
    expect(meanB).toBeGreaterThanOrEqual(3 * meanA);
  });
});
