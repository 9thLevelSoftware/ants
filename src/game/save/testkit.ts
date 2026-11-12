// Test helpers for the save layer: a small real sim on a test world, a fake host, a manager on the memory back end.
// Not imported by game code.
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import type { Sim, WorldData } from '@/sim/types';
import { SaveManager, type SaveManagerOptions } from './manager';
import { MemoryStorage } from './memoryStorage';
import type { SaveMeta } from './types';

export interface TestRig {
  manager: SaveManager;
  storage: MemoryStorage;
  host: { sim: Sim | null; mode: string; view: string; adopted: { sim: Sim; meta: SaveMeta }[]; thumb: string | null };
  world: WorldData;
  clock: { ms: number };
}

/** A sim with `workers` workers in the small nest (default 6), on the shared test world. */
export function makeSim(workers = 6): { sim: Sim; world: WorldData } {
  const world = makeTestWorld({ seed: 3 });
  const sim = makeTestSim({ world, nest: 'small', workers });
  sim.state.player.opening = null; // no intro card: autosave is allowed
  return { sim, world };
}

export function makeRig(opts: { workers?: number; storage?: MemoryStorage; manager?: Partial<SaveManagerOptions> } = {}): TestRig {
  const { sim, world } = makeSim(opts.workers ?? 6);
  const storage = opts.storage ?? new MemoryStorage({ persistent: true });
  const clock = { ms: Date.UTC(2026, 0, 1) };
  const host: TestRig['host'] = { sim, mode: 'playing', view: 'observer', adopted: [], thumb: null };
  const manager = new SaveManager({
    storage, now: () => clock.ms, loader: { worldFor: () => world },
    host: {
      getSim: () => host.sim,
      context: () => ({ mode: host.mode, view: host.view }),
      thumbnail: () => host.thumb,
      adopt: (s, meta) => { host.adopted.push({ sim: s, meta }); host.sim = s; },
    },
    ...opts.manager,
  });
  return { manager, storage, host, world, clock };
}
