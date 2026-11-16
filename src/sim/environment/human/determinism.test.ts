// Determinism and persistence: the same seed gives the same state; a game saved in the middle of a pass and loaded
// continues exactly like the uninterrupted one (plans are rebuilt from the saved instance; GDD 04 §16).

import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { stateHash } from '@/sim/save/hash';
import { humanSites } from './sites';
import { humanSim, patioWorld, placeWorker, scheduleNow } from './testkit';
import { humanEventsSystem } from './index';

function setUp() {
  const world = patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 4000 });
  const sim = humanSim(world);
  const play = humanSites(sim.world).list.find((s) => s.kind === 'playground')!;
  for (let i = 0; i < 40; i++) placeWorker(sim, 500 + (i % 8) * 400, 500 + Math.floor(i / 8) * 600);
  scheduleNow(sim, 'children', 'play-session', play.id, null);
  scheduleNow(sim, 'footsteps', 'child', -1, { x: 2000, y: 0, z: 2000 });
  scheduleNow(sim, 'spill', 'sugary', play.id, null);
  return { sim, world };
}

describe('human events determinism and save/load', () => {
  it('same seed, same state after 600 ticks', () => {
    const a = setUp(), b = setUp();
    for (let i = 0; i < 600; i++) { a.sim.tick(); b.sim.tick(); }
    expect(stateHash(a.sim.state)).toBe(stateHash(b.sim.state));
  });

  it('a save in the middle of a play session loads and continues identically', () => {
    const a = setUp();
    for (let i = 0; i < 200; i++) a.sim.tick();
    expect(a.sim.state.env.human.active.length).toBeGreaterThan(0);
    const b = createSim(restore(snapshot(a.sim)).state, a.world, { systems: [humanEventsSystem] });
    for (let i = 0; i < 500; i++) { a.sim.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.sim.state));
    expect(a.sim.state.worldDelta.heightDeltas.length).toBeGreaterThan(0);
    // the loaded field follows the saved deformation tiles too
    expect(b.field.height(2000, 2000)).toBeCloseTo(a.sim.field.height(2000, 2000), 6);
  });
});
