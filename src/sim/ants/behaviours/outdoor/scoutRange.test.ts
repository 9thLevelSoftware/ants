// A small colony's scouts search inside their range (colony-life round 2). Below SMALL_COLONY_N workers a scout turns
// home beyond SMALL_SCOUT_RANGE_BU (R3, viab-economy). Its outward-biased walk reached that range in about 100 s of
// the 300 s it may scout and went home: one ray a trip. The range now bounds the walk instead: legs that would end
// beyond it are not taken, so the trip uses its time inside the range.

import { describe, expect, it } from 'vitest';
import { SCOUT_MAX_S, SMALL_SCOUT_RANGE_BU } from '@/sim/balance/foraging';
import { forageScenario } from './testkit';

describe('small-colony scouting range', () => {
  it('a scout stays out searching inside the range, not one ray out to it and back', () => {
    const { sim, col, entrance } = forageScenario({ workers: 20, sizeBu: 900, stores: { c: 4, p: 0.5 } });
    const bu = sim.world.bu;
    const out = new Map<number, { t0: number; maxD: number }>();
    const trips: { s: number; maxD: number }[] = [];
    for (let t = 0; t < 6000; t++) {
      sim.tick();
      if (t % 10 !== 0) continue;
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== col.id || a.task !== 'scout') continue;
        const tr = out.get(a.id);
        if (a.nestId < 0) {
          const d = Math.sqrt((a.pos.x - entrance.pos.x) ** 2 + (a.pos.z - entrance.pos.z) ** 2) / bu;
          if (tr) tr.maxD = Math.max(tr.maxD, d); else out.set(a.id, { t0: sim.state.tick, maxD: d });
        } else if (tr) {
          trips.push({ s: (sim.state.tick - tr.t0) / 10, maxD: tr.maxD });
          out.delete(a.id);
        }
      }
    }
    const s = trips.map((x) => x.s).sort((a, b) => a - b);
    const info = JSON.stringify({ trips: trips.map((x) => `${Math.round(x.s)}s/${Math.round(x.maxD)}BU`) });
    expect(trips.length, info).toBeGreaterThanOrEqual(2);
    // the median trip searches for most of the scout time (it went home at ~100 s, at the range, before)
    expect(s[Math.floor(s.length / 2)], info).toBeGreaterThan(0.6 * SCOUT_MAX_S);
    // and stays inside the range (a leg's overshoot allowed)
    for (const x of trips) expect(x.maxD, info).toBeLessThanOrEqual(SMALL_SCOUT_RANGE_BU + 15);
  }, 120_000);
});
