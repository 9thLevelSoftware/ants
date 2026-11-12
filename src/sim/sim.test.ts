import { describe, expect, it } from 'vitest';
import { rngInt, rngRange } from '@/core/rng';
import type { Sim, System } from '@/sim/types';
import { killAnt, spawnAnt } from '@/sim/entities';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim, makeTestWorld } from '@/sim/testing';

/** Test-only system that exercises rng streams, spawning, death/sweep and pheromone storage. */
const churn: System = {
  name: 'test-churn',
  run(sim: Sim) {
    const rng = sim.stream('rng.behaviour');
    const col = sim.state.colonies[0];
    for (const a of sim.stores.ants.list) {
      if (!a.alive) continue;
      a.pos.x += rngRange(rng, -1, 1);
      a.pos.z += rngRange(rng, -1, 1);
      sim.phero.deposit(col.id, 'trail', a.pos, 0.25);
    }
    if (sim.state.tick % 50 === 0) {
      const q = sim.stores.ants.get(col.queenId);
      if (q) spawnAnt(sim, { colony: col.id, caste: 'worker', pos: q.pos, task: 'forage' });
    }
    if (sim.state.tick % 70 === 0) {
      const workers = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker');
      if (workers.length > 0) killAnt(sim, workers[rngInt(rng, 0, workers.length - 1)].id, 'old-age');
    }
    if (sim.state.tick % 9 === 0) sim.phero.decay('trail', 0.98);
    if (sim.state.tick % 100 === 0) {
      const q = sim.world.queenStart.pos;
      sim.carve.carveSphere({ x: q.x + rngRange(rng, -8, 8), y: q.y - 6, z: q.z + rngRange(rng, -8, 8) }, 3);
    }
  },
};

const SYSTEMS_WITH_CHURN = [...SYSTEMS, churn];

function newSim(seed: number): Sim {
  const sim = makeTestSim({ seed, terrain: 'noise', prims: 3, systems: SYSTEMS_WITH_CHURN });
  sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: 12, caste: 'worker', ageGd: 2, task: null, pos: null });
  return sim;
}

function run(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

describe('sim skeleton', () => {
  it('ticks a new game on the test world 2000 times without throwing', () => {
    const sim = makeTestSim();
    expect(() => run(sim, 2000)).not.toThrow();
    expect(sim.state.tick).toBe(2000);
    expect(sim.stores.ants.count).toBe(1); // the founding queen
  });

  it('gives identical state hashes for two runs with the same seed', () => {
    const a = newSim(7), b = newSim(7), c = newSim(8);
    run(a, 600); run(b, 600); run(c, 600);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
    expect(a.stores.ants.count).toBeGreaterThan(1);
    expect(a.state.worldDelta.carve.keys.length).toBeGreaterThan(0);
    expect(a.state.phero.layers.length).toBeGreaterThan(0);
  });

  it('snapshot -> restore -> re-encode is byte-identical', () => {
    const sim = newSim(3);
    run(sim, 300);
    const bytes = snapshot(sim);
    const again = snapshot(restore(bytes));
    expect(again.length).toBe(bytes.length);
    expect(again.every((b, i) => b === bytes[i])).toBe(true);
  });

  it('restoring at tick N and running M more equals an uninterrupted N + M run', () => {
    const N = 250, M = 400;
    const world = makeTestWorld({ seed: 5, terrain: 'noise', prims: 3 });
    const mk = (): Sim => {
      const s = makeTestSim({ world, seed: 5, systems: SYSTEMS_WITH_CHURN });
      s.enqueue({ type: 'cheat.spawnAnts', colonyId: s.state.colonies[0].id, n: 8, caste: 'worker', ageGd: 0, task: null, pos: null });
      return s;
    };
    const straight = mk();
    run(straight, N + M);
    const first = mk();
    run(first, N);
    const resumed = createSim(restore(snapshot(first)).state, world, { systems: SYSTEMS_WITH_CHURN });
    run(resumed, M);
    expect(resumed.state.tick).toBe(N + M);
    expect(stateHash(resumed.state)).toBe(stateHash(straight.state));
  });

  it('delivers events queued during a tick after the tick, in order', () => {
    const seen: string[] = [];
    let duringTick = false;
    const emitter: System = {
      name: 'test-emitter',
      run(sim) {
        duringTick = true;
        for (const v of ['a', 'b', 'c']) sim.emit({ type: 'cue', cue: `ambient.${v}`, pos: null, strength: 1 });
        expect(seen).toEqual([]);
        duringTick = false;
      },
    };
    const sim = makeTestSim({ systems: [emitter] });
    const ticksAtDelivery: number[] = [];
    sim.events.on('cue', (e) => {
      expect(duringTick).toBe(false);
      seen.push(e.cue.slice('ambient.'.length));
      ticksAtDelivery.push(sim.state.tick);
    });
    sim.tick();
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(ticksAtDelivery).toEqual([1, 1, 1]);
  });

  it('applies commands at the start of the next tick', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 2, p: 1, toxin: 0 });
    expect(col.stores.c).toBe(0);
    sim.tick();
    expect(col.stores.c).toBe(2);
    expect(col.stores.p).toBe(1);
  });

  it('rejects cheats unless config.cheats is set', () => {
    const sim = makeTestSim({ config: { cheats: false } });
    const col = sim.state.colonies[0];
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(e.commandType));
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 2, p: 1, toxin: 0 });
    sim.tick();
    expect(col.stores.c).toBe(0);
    expect(rejected).toEqual(['cheat.addFood']);
  });

  it('possesses and releases the queen through commands', () => {
    const sim = makeTestSim();
    const queenId = sim.state.colonies[0].queenId;
    sim.enqueue({ type: 'possess', antId: queenId, via: 'command' });
    sim.tick();
    expect(sim.state.player.possessedAntId).toBe(queenId);
    sim.enqueue({ type: 'release', reason: 'player' });
    sim.tick();
    expect(sim.state.player.possessedAntId).toBe(-1);
  });
});
