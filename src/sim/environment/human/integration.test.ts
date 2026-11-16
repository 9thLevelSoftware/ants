// The module inside the full system list: the cheat command reaches it, a pass over the nest runs with every other
// system, the queen sealed underground is never hurt, and the cues reach ant perception.

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { PC, THREAT } from '@/sim/ants/perception/keys';
import { placeOnSurface } from '@/sim/locomotion';

describe('human events in the full sim', () => {
  it('cheat.humanEvent runs a pass over the nest; the queen underground is unharmed; workers outside sense the threat', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6 });
    const queen = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const nest = sim.state.nests[0];
    const e = nest.entrances[0].pos;
    const hp = queen.hp;
    let starts = 0, impacts = 0, perceived = 0;
    sim.events.on('human.start', () => { starts++; });
    sim.events.on('human.impact', () => { impacts++; });
    sim.enqueue({ type: 'cheat.humanEvent', kind: 'footsteps', variant: 'adult', at: { ...e }, startInS: 0 });
    // a worker on the surface 300 mm from the entrance
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    expect(placeOnSurface(sim, w, { x: e.x + 300, y: e.y + 50, z: e.z })).toBe(true);
    w.nestId = -1; w.chamberId = -1;
    for (let i = 0; i < 400; i++) {
      sim.tick();
      if ((w.bb[PC.threat] ?? 0) === THREAT.human) perceived++;
    }
    expect(starts).toBe(1);
    expect(impacts).toBeGreaterThan(5);
    expect(queen.alive).toBe(true);
    expect(queen.hp).toBe(hp);
    expect(perceived).toBeGreaterThan(0);
  });
});
