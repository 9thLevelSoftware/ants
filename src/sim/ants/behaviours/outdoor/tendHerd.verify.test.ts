// Reviewer tests (ecology-plants, herd branch of `tend`): GDD 07 App. E 6 taken literally, and herd discovery
// without the "reported by scouts" shortcut. A failing test here demonstrates a defect for the fixer.

import { afterEach, describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { taskIndex } from '@/sim/types';
import { colonySlotBit, spawnAnt } from '@/sim/entities';
import { placeOnSurface } from '@/sim/locomotion';
import { herdSourceOf } from '@/sim/ecology';
import { addHerd, fixWeather, plantSim, stepTicks } from '@/sim/ecology/plants/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { startTravel } from './tendHerdStates';

const LONG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG === '1';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('GDD 07 App. E 6 (relay), literal', () => {
  it('within 10 s: a trophallaxis-give occurred AND honeydew-relay fired; the tender is still at the herd', () => {
    restore = fixWeather(20);
    const { sim, plants, sites } = plantSim({ workers: 1, herbs: [{ dx: -30, dz: -20, heightBu: 8 }] });
    const h = addHerd(sim, plants[0], 100);
    h.frozen = true;
    h.pool = 3;
    const col = sim.state.colonies[0];
    const site = sites[0], bu = sim.world.bu;
    const mk = (y: number, task: 'tend' | 'forage', crop: number): Ant => {
      const p = { x: site.x - 0.2 * bu, y, z: site.z };
      const a = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: p, fwd: { x: 0, y: 1, z: 0 }, ageGd: 8 });
      placeOnSurface(sim, a, p, { x: 1, y: 0, z: 0 });
      a.task = task;
      a.cropC = crop;
      return a;
    };
    const tender = mk(site.y, 'tend', 0.9);
    const forager = mk(site.y - 2 * bu, 'forage', 0.2);
    forager.thinkTick = Number.MAX_SAFE_INTEGER;
    tender.bb['run.task'] = taskIndex('tend');
    expect(startTravel(sim, tender, h)).toBe(true);
    let relayTick = -1;
    const t0 = sim.state.tick;
    sim.events.on('honeydew-relay', (e) => { if (relayTick < 0 && e.fromAnt === tender.id) relayTick = sim.state.tick; });
    stepTicks(sim, 100);
    expect(relayTick).toBeGreaterThanOrEqual(0);
    expect(relayTick - t0).toBeLessThanOrEqual(100);
    expect(['tend.solicit', 'tend.wait', 'tend.full', 'tend.guard-herd']).toContain(tender.state);
  });
});

describe.skipIf(!LONG)('discovery without cheats (FOUNDRESS_LONG)', () => {
  it('a 30-worker colony finds an untended herd by itself and tends it within 1 game day', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 30, sizeBu: 200, herbs: [{ dx: -20, dz: -30 }], seed: 1 });
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 30, p: 15, toxin: 0 });
    const h = addHerd(sim, plants[0], 100);
    h.pool = 3; // a full pool: the overflow runs into the film below, as an untended herd's does
    stepTicks(sim, TICKS_PER_DAY);
    const bit = colonySlotBit(sim, col.id);
    const film = sim.stores.sources.get(h.filmSourceId);
    console.log(JSON.stringify({
      herdKnown: (herdSourceOf(sim, h)!.discoveredBy & bit) !== 0, filmKnown: film ? (film.discoveredBy & bit) !== 0 : null,
      tenderColony: h.tenderColony, tend: h.tend, tenders: sim.state.ants.filter((a) => a.alive && a.task === 'tend').length,
    }));
    expect(herdSourceOf(sim, h)!.discoveredBy & bit).toBe(bit);
    expect(h.tenderColony).toBe(col.id);
  });
});
