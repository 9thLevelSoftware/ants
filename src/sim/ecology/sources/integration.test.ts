// The sources system inside the full system list: one game day of a new game with food anchors.

import { describe, expect, it } from 'vitest';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { anchor } from './testkit';

describe('sources in the full simulation', () => {
  it('a new game with anchors runs a game day with every system and keeps valid sources', () => {
    const world = makeTestWorld({ sizeBu: 600 });
    world.placements.foodAnchors = [
      anchor('nectar', 800, 800), anchor('honeydew', 1200, 900), anchor('crumb', 1000, 1400), anchor('sugar', 1500, 1500),
    ].map((a, id) => ({ ...a, id }));
    const sim = makeTestSim({ world });
    expect(sim.systems.some((s) => s.name === 'sources')).toBe(true);
    expect(sim.stores.sources.count).toBe(4);
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      sim.tick();
      sim.events.flush();
    }
    const live = sim.stores.sources.list.filter((s) => s.alive);
    expect(live.length).toBeGreaterThanOrEqual(4); // plus carrion drops
    for (const s of live) {
      expect(Number.isFinite(s.units) && s.units >= 0 && s.units <= s.capacity + 1e-9).toBe(true);
    }
  });
});
