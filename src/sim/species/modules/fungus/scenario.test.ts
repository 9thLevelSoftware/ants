// Garden scenarios (GDD 07 App. E 24, 25; task AC2/AC3): larvae are fed from a healthy garden through the gardeners'
// harvest; all gardens dead -> all-gardens-lost, larvae die, no eggs, the queen starves after 3 GD; a toxic plant is
// rejected 1.0-1.5 GD after it starts to supply half the substrate; the bottleneck detector names an understaffed
// stage in a scripted imbalance.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addAnts, addLarvae, attaKit, leafSiteNearEntrance, run } from './testkit';
import { narrowestStage } from './chain';
import { publishFungusDiagnostics } from './diagnostics';
import { killGarden } from './states';

describe('fungus garden scenarios', () => {
  it('a healthy garden feeds the larvae: gardeners harvest staphylae, nurses feed fungus food', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 0.5; col.stores.p = 0;
    k.garden.supply = { luPerGd: 1.8 * 2, q: 1, p: 0.1, t: 0, plantId: -1 };
    const larvae = addLarvae(k, 6, k.room, 'minor');
    addAnts(k, 'minor', 4, k.room, 'garden', 0.35);
    addAnts(k, 'minor', 3, k.room, 'nurse', 0.35);
    run(k.sim, Math.round(0.5 * TICKS_PER_DAY));
    const fedP = larvae.reduce((a, b) => a + b.fedP, 0);
    expect(col.fungus!.chain!.harvested + (col.fungus!.chain!.last?.harvested ?? 0)).toBeGreaterThan(0.05);
    expect(fedP).toBeGreaterThan(0.05);
  }, 120_000);

  it('App. E 24: all gardens dead -> all-gardens-lost, >= 50 % of larvae dead in 1 GD, no eggs; the queen dies after 3 more GD', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 5; col.stores.p = 0;
    const q = k.sim.stores.ants.get(col.queenId)!;
    if (q.queen) q.queen.founding = null;
    const larvae = addLarvae(k, 20, k.room, 'minor');
    let lost = 0;
    k.sim.events.on('all-gardens-lost', () => { lost++; });
    const eggs0 = col.counters.eggsLaid;
    killGarden(k.garden, k.sim.state.tick);
    run(k.sim, TICKS_PER_DAY);
    expect(lost).toBe(1);
    const dead = larvae.filter((b) => !b.alive).length;
    expect(dead).toBeGreaterThanOrEqual(10);
    expect(col.counters.eggsLaid - eggs0).toBe(0);
    run(k.sim, 3 * TICKS_PER_DAY);
    expect(q.alive).toBe(false);
  }, 120_000);

  it('App. E 25: a plant supplying 50 % of the substrate with leafT 0.6 is rejected 1.0-1.5 GD after the supply starts', () => {
    const k = attaKit({ G: 2 });
    let at = -1;
    k.sim.events.on('plant-rejected', (e) => { if (e.plantId === 42 && at < 0) at = k.sim.state.tick; });
    // two plants, half each: the toxic one (42) and a clean one (43); the garden is fully supplied (fsub 1)
    const t0 = k.sim.state.tick;
    const g = k.garden;
    g.supply = { luPerGd: 1.8, q: 1, p: 0.1, t: 0.6, plantId: 42 };
    // the second half from a clean plant: a second supply through the cheat path on the same garden is not
    // possible, so the clean half is planted by hand each step
    const step = 25;
    for (let i = 0; i < Math.round(2 * TICKS_PER_DAY / step) && at < 0; i++) {
      run(k.sim, step);
      g.subBins![g.subBins!.length - 1].lu += 0; // keep the ledger as is
      const lu = 1.8 * (step / TICKS_PER_DAY);
      const b = g.subBins![g.subBins!.length - 1];
      b.lu += lu; b.qLu += lu; b.pLu += 0.1 * lu;
      const e = b.plants.find((x) => x.plantId === 43);
      if (e) e.lu += lu; else b.plants.push({ plantId: 43, lu, p: 0.1, t: 0 });
    }
    expect(at).toBeGreaterThan(0);
    const gd = (at - t0) / TICKS_PER_DAY;
    expect(gd).toBeGreaterThanOrEqual(1.0);
    expect(gd).toBeLessThanOrEqual(1.5);
    expect(k.sim.state.colonies[0].fungus!.rejected.some((r) => r.plantId === 42)).toBe(true);
    expect(k.sim.state.colonies[0].fungus!.rejected.some((r) => r.plantId === 43)).toBe(false);
  }, 120_000);

  it('bottleneck: cutters but no processor (minims cannot process) -> the chain names processing', () => {
    const k = attaKit({ G: 2 });
    leafSiteNearEntrance(k);
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 2;
    addAnts(k, 'media', 5, k.nest.chambers[0], 'cut', 1.0);
    addAnts(k, 'minor', 3, k.room, 'garden', 0.35);
    // the allocator must not move the cutters into the garden: hold the cut share
    col.directives.taskShares = { ...(col.directives.taskShares ?? {}), cut: 1 } as typeof col.directives.taskShares;
    run(k.sim, Math.round(0.6 * TICKS_PER_DAY));
    publishFungusDiagnostics(k.sim, col, k.P);
    const c = col.fungus!.chain!;
    expect(c.last).not.toBeNull();
    expect(narrowestStage(c.last!)).toBe('processed');
    const d = publishFungusDiagnostics(k.sim, col, k.P).find((x) => x.id === 'diag-at-chain')!;
    expect(d.status).toBe('warn');
    expect(d.factors[0]?.cause).toBe('chain-process');
  }, 120_000);
});
