// sim-seams review: adversarial checks of the world-discovery stand-in (progression/discovery.ts) that feeds
// `ms-zone-crossed` ("a worker first enters a zone type other than the nest zone", GDD 06 §8 table), the aim
// `aim-cross-zone`, `ms-micro-connection` and the habitat / joint codex entries.
import { describe, expect, it } from 'vitest';
// first: the sim entry (through the testkit) settles the module cycle
import { makeProgSim, pollOnce, recordEvents } from './testkit';
import type { Ant, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { attachProgression } from './index';

/** Splits the test world: x > half is pavement (zone id 7); the rest stays lawn. */
function twoZones(sim: Sim): number {
  const half = sim.world.size / 2;
  sim.world.zones.push({ id: 7, type: 'pavement', variant: null, rects: [[half, 0, sim.world.size, sim.world.size]], areaMm2: 1 });
  const m = sim.world.maps.zone;
  for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) if ((ix + 0.5) * m.cell > half) m.data[iz * m.nx + ix] = 7;
  return half;
}

function standOutside(sim: Sim, a: Ant, x: number, z: number): void {
  a.nestId = -1;
  a.chamberId = -1;
  a.medium = 'surface';
  a.pos = { x, y: sim.field.height(x, z), z };
}

/** x in the zone that is not the nest's. */
function otherZoneX(sim: Sim, half: number): number {
  return sim.state.nests[0].origin.x < half ? half * 1.5 : half * 0.5;
}

describe('world discovery stand-in (review)', () => {
  it('the queen walking into another zone is not "a worker" crossing (GDD 06 ms-zone-crossed)', () => {
    // In a real opening the foundress searches the surface (nestId -1) while her colony's founding nest record
    // already exists at the landing point; discovery.ts counts every ant of the colony, so her search crossing a
    // zone edge completes ms-zone-crossed ("A forager has crossed ...") during the founding, and aim-cross-zone
    // (opened at stage growing, never opened if done) is then never offered.
    const sim = makeProgSim({ workers: 2 });
    const half = twoZones(sim);
    const queen = sim.stores.ants.list.find((a) => a.alive && a.caste === 'queen')!;
    standOutside(sim, queen, otherZoneX(sim, half), half);
    pollOnce(sim);
    expect(sim.state.progression.milestones['ms-zone-crossed']).toBeUndefined();
    // and when a worker does cross later, the milestone must still be reachable
    const worker = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
    standOutside(sim, worker, otherZoneX(sim, half), half * 0.9);
    pollOnce(sim);
    expect(sim.state.progression.milestones['ms-zone-crossed']).toBeDefined();
  });

  it('a zone first entry and a micro discovery are not announced again after a save and load', () => {
    const sim = makeProgSim({ workers: 2 });
    const half = twoZones(sim);
    const bu = sim.world.bu;
    const c = sim.world.size * 0.2;
    const y = sim.field.height(c, c);
    sim.world.micro.push({
      id: 901, kind: 'paving-joint', posA: { x: c - 4 * bu, y, z: c }, posB: { x: c + 4 * bu, y, z: c }, gapMm: bu,
      minClearanceBu: 1, lengthBu: 8, useful: true, reason: 'test',
    });
    sim.state.worldDelta.microState.push({ id: 901, discovered: false, discoveredTick: -1, open: true });
    const worker = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
    standOutside(sim, worker, c, c);
    pollOnce(sim);
    standOutside(sim, worker, otherZoneX(sim, half), half);
    pollOnce(sim);
    expect(sim.state.worldDelta.microState.find((m) => m.id === 901)?.discovered).toBe(true);

    const loaded = createSim(restore(snapshot(sim)).state, sim.world, { systems: sim.systems });
    attachProgression(loaded);
    const ev = recordEvents(loaded, ['world.micro-discovered', 'world.zone-first-entry']);
    const w2 = loaded.stores.ants.get(worker.id)!;
    standOutside(loaded, w2, c, c);
    pollOnce(loaded);
    standOutside(loaded, w2, otherZoneX(loaded, half), half);
    pollOnce(loaded);
    expect(ev).toEqual([]);
  });

  it('ants inside the nest, and ants of another colony, discover nothing', () => {
    const sim = makeProgSim({ workers: 2 });
    const bu = sim.world.bu;
    const c = sim.world.size * 0.2;
    const y = sim.field.height(c, c);
    sim.world.micro.push({
      id: 902, kind: 'paving-joint', posA: { x: c - 4 * bu, y, z: c }, posB: { x: c + 4 * bu, y, z: c }, gapMm: bu,
      minClearanceBu: 1, lengthBu: 8, useful: true, reason: 'test',
    });
    sim.state.worldDelta.microState.push({ id: 902, discovered: false, discoveredTick: -1, open: true });
    const worker = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!;
    standOutside(sim, worker, c, c);
    worker.nestId = sim.state.nests[0].id; // counted as inside a nest
    const other = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker' && a.id !== worker.id)!;
    standOutside(sim, other, c + bu, c);
    other.colony = 999;
    pollOnce(sim);
    expect(sim.state.worldDelta.microState.find((m) => m.id === 902)?.discovered).toBe(false);
  });

  it('a micro-connection with no microState row is skipped without throwing', () => {
    const sim = makeProgSim({ workers: 2 });
    const bu = sim.world.bu;
    const c = sim.world.size * 0.2;
    const y = sim.field.height(c, c);
    sim.world.micro.push({
      id: 903, kind: 'paving-joint', posA: { x: c - 4 * bu, y, z: c }, posB: { x: c + 4 * bu, y, z: c }, gapMm: bu,
      minClearanceBu: 1, lengthBu: 8, useful: true, reason: 'test',
    });
    sim.state.worldDelta.microState.push({ id: 904, discovered: false, discoveredTick: -1, open: true }); // other id
    const ev = recordEvents(sim, ['world.micro-discovered']);
    standOutside(sim, sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!, c, c);
    expect(() => pollOnce(sim)).not.toThrow();
    expect(ev).toEqual([]);
  });
});
