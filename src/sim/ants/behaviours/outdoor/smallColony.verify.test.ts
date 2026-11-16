// Independent review test for viab-economy R3 (docs/design/tasks/viab-economy.md): "spontaneous departures at small
// N are fast enough that a worker makes >= 2 trips per game day when food is known within 150 BU". A 12-worker
// colony short of food, a sugar spill 100 BU from the entrance known to the colony, real behaviours, 0.25 gd.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { ti } from '@/sim/colony/taskIdx';
import { announce, countEvents, forageScenario, run } from './testkit';

function smallColonyTrips(sources: { kind: 'sugar'; variant: 'sugary-spill'; distBu: number; bearingDeg: number; units: number }[]) {
  const workers = 12;
  const sc = forageScenario({ seed: 3, workers, pinned: true, stores: { c: 1, p: 0.2 }, holdStores: { c: 1, p: 0.2 }, sources });
  const { sim, col } = sc;
  for (const s of sc.sources) announce(sim, col, s);
  const ev = countEvents(sim, ['forager-departed', 'delivery']);
  run(sim, Math.round(0.05 * TICKS_PER_DAY)); // settle allocation
  const t0 = col.counters.trips;
  const gd = 0.25;
  run(sim, Math.round(gd * TICKS_PER_DAY));
  const trips = col.counters.trips - t0;
  const perWorkerGd = trips / workers / gd;
  console.log(`R3 (${sources.length} known): ${trips} trips in ${gd} gd by ${workers} workers = ${perWorkerGd.toFixed(2)} trips / worker / gd;`,
    `deliveries ${ev.n.delivery ?? 0}; forage demand/actual ${col.alloc.demand[ti('forage')].toFixed(2)}/${col.alloc.actual[ti('forage')]},`,
    `scout ${col.alloc.demand[ti('scout')].toFixed(2)}/${col.alloc.actual[ti('scout')]}, needC ${col.needs.needC.toFixed(2)}`);
  return { perWorkerGd, forageDemand: col.alloc.demand[ti('forage')], scoutDemand: col.alloc.demand[ti('scout')] };
}

describe('viab-economy R3: a small colony forages known food near home', () => {
  it('12 workers, one sugar spill 100 BU known: >= 2 trips per worker per gd', { timeout: 120_000 }, () => {
    const r = smallColonyTrips([{ kind: 'sugar', variant: 'sugary-spill', distBu: 100, bearingDeg: 45, units: 300 }]);
    // R3: at least 2 scouts, the rest of max(2, 35 %) outside should be able to work the known source
    expect(r.forageDemand).toBeGreaterThanOrEqual(Math.max(2, 0.35 * 12) - 2 - 1e-6);
    expect(r.perWorkerGd).toBeGreaterThanOrEqual(2);
  });

  it('12 workers, two sugar spills 100 BU known: >= 2 trips per worker per gd', { timeout: 120_000 }, () => {
    const r = smallColonyTrips([
      { kind: 'sugar', variant: 'sugary-spill', distBu: 100, bearingDeg: 45, units: 300 },
      { kind: 'sugar', variant: 'sugary-spill', distBu: 120, bearingDeg: 200, units: 300 },
    ]);
    expect(r.perWorkerGd).toBeGreaterThanOrEqual(2);
  });
});
