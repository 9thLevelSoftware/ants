// The Lineage keeper (GDD 06 §12, App. E 25): the colony, its flight and daughters go to the device profile; founding
// as a daughter queen starts from her seed and carries generation 2 and the parent link; names follow §12.4.
import { describe, expect, it } from 'vitest';
import { ProfileStore } from '../../profile/profile';
import { makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { spawnAnt } from '@/sim/entities';
import { daughterSeed } from '@/sim/colony/reproduction';
import { colonyName, daughterGameOptions, LineageKeeper } from './lineage';

function flownSim() {
  const sim = makeLifeSim({ workers: 20, chamberC: 25 });
  const col = sim.state.colonies[0];
  const q = sim.stores.ants.get(col.queenId)!;
  for (let i = 0; i < 30; i++) spawnAnt(sim, { colony: col.id, caste: i < 20 ? 'gyne' : 'male', pos: { ...q.pos }, nestId: q.nestId, chamberId: q.chamberId });
  return sim;
}

describe('lineage keeper', () => {
  it('names: place token, two digits, roman generation from II on', () => {
    expect(colonyName(1234, 1)).toMatch(/^\w+ \w+ \d\d$/);
    expect(colonyName(1234, 2)).toMatch(/ II$/);
  });

  it('records the colony, the flight and its daughters; a daughter game links back with generation 2', () => {
    const profile = new ProfileStore({ storage: null, kv: null });
    const keeper = new LineageKeeper(() => profile);
    const sim = flownSim();
    keeper.attach(sim, 1000);
    const link = sim.state.progression.lineage;
    expect(link.colonyRecordId).not.toBe('');
    expect(profile.get().lineage.colonies.map((c) => c.id)).toContain(link.colonyRecordId);
    send(sim, { type: 'cheat.forceFlight' });
    step(sim, 620);
    keeper.writeFlights(sim);
    const lin = profile.get().lineage;
    expect(lin.flights).toHaveLength(1);
    expect(lin.daughters.length).toBeGreaterThanOrEqual(1);
    expect(lin.daughters.length).toBeLessThanOrEqual(12);
    const d = lin.daughters[0];
    expect(d.motherColonyId).toBe(link.colonyRecordId);
    expect(d.seed).toBe(daughterSeed(sim.state.config.world.seed, d.flightId, 0));
    // founding her: her seed, generation 2, the parent link; she is used once
    expect(keeper.choose(d.id)).not.toBeNull();
    const opts = daughterGameOptions(d);
    expect(opts.seed).toBe(d.seed);
    const next = makeLifeSim({ seed: 2 });
    next.state.config.world.seed = d.seed;
    keeper.attach(next, 2000);
    expect(next.state.progression.lineage.generation).toBe(2);
    expect(next.state.progression.lineage.parentColonyId).toBe(link.colonyRecordId);
    expect(next.state.progression.lineage.name).toMatch(/ II$/);
    expect(profile.get().lineage.daughters.find((x) => x.id === d.id)!.state).toBe('founded');
    expect(keeper.choose(d.id)).toBeNull();
  });
});
