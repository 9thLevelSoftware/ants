// New-game options (UI New Game screen, URL flags, debug API) -> GameConfig and an optional prepared test world.
// Pure: no DOM, no three.
import type { ArchetypeId, DifficultyId, GameConfig, SpeciesId, WorldData, WorldSizeId } from '@/sim/types';
import { ARCHETYPES, DIFFICULTY_IDS, SPECIES_IDS, WORLD_SIZES } from '@/sim/types';
import { defaultGameConfig, syncWorldParams } from '@/sim/createGame';
import { makeTestWorld, type TestWorldOptions } from '@/sim/testing';
import { seedFromText } from '@/worldgen';

export type StartView = 'possess' | 'observer';

export interface NewGameOptions {
  /** Numeric seed or the text the player typed (GDD 04 §4.1). Default 1. */
  seed?: number | string;
  species?: SpeciesId;
  archetype?: ArchetypeId;
  size?: WorldSizeId;
  difficulty?: DifficultyId;
  /** Enable cheat.* commands (always on with ?test=1). */
  cheats?: boolean;
  /** View after loading: possess the founding queen (default) or the observer. */
  view?: StartView;
  /**
   * A small deterministic test world (src/sim/testing) instead of full generation; `nest: 'small'` installs the
   * standard pre-carved nest with `workers` adult workers in it.
   */
  testWorld?: TestWorldOptions & { nest?: 'none' | 'small'; workers?: number };
}

export interface ResolvedNewGame {
  config: GameConfig;
  /** Prepared world for test worlds; undefined = generate from config.world. */
  world?: WorldData;
  view: StartView;
  testWorld: NewGameOptions['testWorld'] | null;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function seedOf(seed: NewGameOptions['seed']): { seed: number; text: string } {
  if (typeof seed === 'number' && Number.isFinite(seed)) return { seed: seed >>> 0, text: String(seed >>> 0) };
  if (typeof seed === 'string' && seed.trim() !== '') return { seed: seedFromText(seed), text: seed.trim() };
  return { seed: 1, text: '1' };
}

/** Validates loosely typed options (URL flags, JSON from Playwright) and builds the config. */
export function resolveNewGame(opts: NewGameOptions = {}): ResolvedNewGame {
  const species = pick(opts.species, SPECIES_IDS, 'lasius-niger');
  const difficulty = pick(opts.difficulty, DIFFICULTY_IDS, 'naturalist');
  const { seed, text } = seedOf(opts.seed);
  const base = defaultGameConfig(species, seed, difficulty);
  const world = {
    ...base.world, seedText: text,
    archetype: pick(opts.archetype, ARCHETYPES, base.world.archetype),
    sizeClass: pick(opts.size, WORLD_SIZES, base.world.sizeClass),
  };
  const config: GameConfig = syncWorldParams({ ...base, world, cheats: opts.cheats === true });
  const view: StartView = opts.view === 'observer' ? 'observer' : 'possess';
  if (!opts.testWorld) return { config, view, testWorld: null };
  const tw = opts.testWorld;
  const prepared = makeTestWorld({ ...tw, species, seed: tw.seed ?? seed });
  return { config: { ...config, world: prepared.params }, world: prepared, view, testWorld: tw };
}
