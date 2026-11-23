// GDD 02 App. E 23: a 100-worker colony and a quality-1.0 carrion source 200 BU away discovered by a scout; within
// 0.5 gd trail-established fires, >= 80 % of the cells along the forager path hold >= 1 ph, and >= 5 distinct ants
// delivered from that source. (The carcass is pinned in place and the colony kept short of protein, as in a colony
// with brood.)

import { describe, expect, it } from 'vitest';
import { requestTask } from '@/sim/colony';
import { announce, countEvents, forageScenario, run } from './testkit';

describe('GDD 02 App. E 23: recruitment to carrion forms a trail', () => {
  it('100 workers, carrion 200 BU, 0.5 gd', () => {
    const { sim, col, entrance, sources } = forageScenario({
      seed: 6, workers: 100, pinned: true, holdStores: { c: 4, p: 0.2 },
      sources: [{ kind: 'carrion', variant: 'large-carcass', distBu: 200, bearingDeg: 300, units: 1 }],
    });
    const carcass = sources[0];
    carcass.quality = 1;
    announce(sim, col, carcass); // reported by a scout
    const ev = countEvents(sim, ['trail-established', 'delivery']);
    run(sim, 3000);
    const est = ev.kept.find((e) => e.type === 'trail-established' && e.sourceId === carcass.id);
    const ants = new Set(ev.kept.filter((e) => e.type === 'delivery' && e.sourceId === carcass.id).map((e) => (e.type === 'delivery' ? e.antId : -1)));
    // cells along the path: every 4 BU from the entrance to the carcass rim, the strongest cell within 6 BU
    const bu = sim.world.bu, out = { x: 0, y: 0, z: 0 };
    const dx = carcass.pos.x - entrance.pos.x, dz = carcass.pos.z - entrance.pos.z, L = Math.hypot(dx, dz);
    let n = 0, ok = 0;
    for (let d = 8 * bu; d < L - 12 * bu; d += 4 * bu) {
      const p = { x: entrance.pos.x + (dx * d) / L, y: 0, z: entrance.pos.z + (dz * d) / L };
      p.y = sim.field.height(p.x, p.z);
      n++;
      if ((sim.phero.strongestNear?.(col.id, 'trail', p, 6 * bu, out) ?? 0) >= 1) ok++;
    }
    console.log(`App. E 23: trail-established ${est ? 'yes' : 'no'}, ${ants.size} distinct deliverers, ${(100 * ok / Math.max(1, n)).toFixed(0)} % of path cells >= 1 ph, events ${JSON.stringify(ev.n)}`);
    expect(est).toBeDefined();
    expect(ants.size).toBeGreaterThanOrEqual(5);
    expect(ok / n).toBeGreaterThanOrEqual(0.8);
  }, 600000);
});

describe('GDD 02 App. E 18: full stores suppress departures', () => {
  it('pool at capacity: departures in 0.1 gd <= 20 % of a hungry colony, and failed unloads are unsuccessful trips', () => {
    const departures = (full: boolean) => {
      const { sim, col, sources } = forageScenario({
        seed: 7, workers: 30, pinned: true, stores: full ? { c: 1e4, p: 1e4 } : { c: 1, p: 0.2 }, // capped at capacity
        holdStores: full ? undefined : { c: 1, p: 0.2 },
        sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 90, units: 300 }],
      });
      announce(sim, col, sources[0]);
      const ev = countEvents(sim, ['forager-departed']);
      // ten foragers, as in the check
      const ten = sim.state.ants.filter((a) => a.caste === 'worker').slice(0, 10);
      const keep = () => { for (const a of ten) if (a.task !== 'forage' && a.nestId >= 0) requestTask(sim, a, 'forage', 'job:test'); };
      run(sim, 1200, 1, keep);
      const before = ev.n['forager-departed'] ?? 0;
      run(sim, 600, 1, keep); // 0.1 gd
      // successful trips of the ten foragers (colony-life round 10: the colony's counters also count a scout that found
      // the spill and came home to report with a crop, which is not a forager's unload; R35 changed the scout demand)
      const ok = ten.filter((a) => a.mem.trips > 0 && a.mem.lastSuccessTick >= 0).length;
      return { n: (ev.n['forager-departed'] ?? 0) - before, trips: col.counters.trips, ok, needC: col.needs.needC };
    };
    const hungry = departures(false), full = departures(true);
    console.log(`App. E 18: departures in 0.1 gd: hungry colony ${hungry.n}, full stores ${full.n};`,
      `trips / successful: hungry ${hungry.trips}/${hungry.ok}, full ${full.trips}/${full.ok}`);
    expect(hungry.n).toBeGreaterThan(0);
    expect(full.n).toBeLessThanOrEqual(0.2 * hungry.n);
    expect(full.ok).toBe(0); // trips whose crop the full pool would not take are unsuccessful
  }, 600000);
});
