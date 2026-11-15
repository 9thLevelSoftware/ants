// Test support for the rivals module (imported by *.test.ts only): test sims with rival sites placed at given
// offsets from the world centre, quick access to rival colonies, stepping helpers.

import type { Colony, DifficultyId, GameConfig, Sim, SimEvent, SpeciesId, RivalSpeciesId } from '@/sim/types';
import { DIFFICULTY_PARAMS, resolveRules } from '@/sim/balance';
import { clonePlain } from '@/sim/entities';
import { makeTestSim, makeTestWorld, type TestSimOptions } from '@/sim/testing';
import { isRival, type RivalColony } from './state';

export interface RivalSiteSpec {
  species: SpeciesId | RivalSpeciesId;
  /** Offset of the nest from the world centre, BU. */
  dx: number;
  dz: number;
  incipient?: boolean;
}

export interface RivalSimOptions extends TestSimOptions {
  rivals: RivalSiteSpec[];
  preset?: DifficultyId;
}

/** A test sim (full systems by default) whose world has the given rival sites. */
export function rivalSim(o: RivalSimOptions): Sim {
  const world = makeTestWorld({ sizeBu: o.sizeBu ?? 256, seed: o.seed ?? 1, terrain: o.terrain, prims: o.prims, features: o.features });
  const bu = world.bu, c = world.size / 2;
  world.placements.rivalSites = o.rivals.map((r) => ({
    species: r.species, origin: { x: c + r.dx * bu, y: 0, z: c + r.dz * bu }, incipient: r.incipient ?? false,
  }));
  const preset = o.preset ?? 'naturalist';
  const config: Partial<GameConfig> = {
    difficulty: { preset, params: clonePlain(DIFFICULTY_PARAMS[preset]), custom: {} },
    rules: resolveRules(preset, {}, 7),
    ...o.config,
  };
  return makeTestSim({ ...o, world, config });
}

export function rivalsOf(sim: Sim): RivalColony[] {
  return sim.state.colonies.filter((c): c is RivalColony => isRival(c));
}

export function player(sim: Sim): Colony {
  return sim.state.colonies[0];
}

export function run(sim: Sim, ticks: number, each?: (sim: Sim) => void): void {
  for (let i = 0; i < ticks; i++) { sim.tick(); each?.(sim); }
}

/** Records events of the given types (until the returned stop is called). */
export function record(sim: Sim, types: SimEvent['type'][]): SimEvent[] {
  const out: SimEvent[] = [];
  for (const t of types) sim.events.on(t, (e) => { out.push(e as SimEvent); });
  return out;
}
