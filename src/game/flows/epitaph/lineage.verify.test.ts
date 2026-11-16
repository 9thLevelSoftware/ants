// Reviewer tests (task overwinter-repro): the device Lineage across games. GDD 06 §12.1 keeps one flight record per
// flight and §13.5 offers "Found again in this locality" (same world seed): a second game on the same seed must add
// its own flight and daughters, not overwrite the first game's. A failing test demonstrates a defect.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { ProfileStore } from '../../profile/profile';
import { makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { spawnAnt } from '@/sim/entities';
import { daysToTicks } from '@/sim/time';
import { LineageKeeper } from './lineage';

function flyOnce(seed: number): Sim {
  const sim = makeLifeSim({ workers: 20, chamberC: 25, seed });
  const col = sim.state.colonies[0];
  const q = sim.stores.ants.get(col.queenId)!;
  for (let i = 0; i < 30; i++) spawnAnt(sim, { colony: col.id, caste: i < 20 ? 'gyne' : 'male', pos: { ...q.pos }, nestId: q.nestId, chamberId: q.chamberId });
  return sim;
}

describe('lineage across games (reviewer)', () => {
  // DEFECT: flight ids are `f{worldSeed}-{calendar anchor}-{seq}`; a replay of the same locality reproduces them,
  // so the second game's flight and daughters merge into the first game's records (one record for two flights).
  it('two games on the same world seed keep two flight records and separate daughters', () => {
    const profile = new ProfileStore({ storage: null, kv: null });
    const keeper = new LineageKeeper(() => profile);
    const ids: string[] = [];
    for (const nowMs of [1000, 2000]) {
      const sim = flyOnce(7);
      keeper.attach(sim, nowMs);
      send(sim, { type: 'cheat.forceFlight' });
      step(sim, daysToTicks(0.1) + 20);
      keeper.writeFlights(sim);
      ids.push(sim.state.colonies[0].lifecycle!.flights[0].id);
    }
    const lin = profile.get().lineage;
    expect(lin.colonies).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(lin.flights).toHaveLength(2);
    const mothers = new Set(lin.daughters.map((d) => d.motherColonyId));
    expect(mothers.size).toBe(2);
  });
});
