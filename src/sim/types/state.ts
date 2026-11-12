// SimState: the complete persisted simulation state (contracts guidance §3). Plain data only: JSON-like values
// and typed arrays; no class instances, functions, Maps, Sets or undefined values. Runtime services are derived
// caches rebuilt by createSim(state). The static world is NOT here: it is regenerated from config.world.

import type { RngState } from '@/core/rng';
import type { Ant } from './ant';
import type { Brood } from './brood';
import type { Colony } from './colony';
import type { GameConfig } from './config';
import type { Creature } from './creature';
import type { EcologyState, RivalsState } from './ecology';
import type { EnvironmentState } from './environment';
import type { Item } from './item';
import type { Marker } from './marker';
import type { Nest } from './nest';
import type { PheromoneState } from './pheromone';
import type { PlantState } from './plant';
import type { PlayerState } from './player';
import type { ProgressionState } from './progression';
import type { FoodSource } from './source';
import type { WorldDelta } from './world';

export interface SimState {
  /** Save format version (SAVE_VERSION). */
  version: number;
  /** World generator version used for config.world. */
  generatorVersion: number;
  config: GameConfig;
  /** Main simulation RNG stream. */
  rng: RngState;
  /** Named sub-streams (RNG_STREAMS), created lazily from config.world.seed. Additive to the guidance root. */
  rngStreams: Record<string, RngState>;
  /** Next entity id (ids are never reused). */
  nextId: number;
  /** Integer tick counter since game start, 10 ticks per game second. */
  tick: number;
  env: EnvironmentState;
  worldDelta: WorldDelta;
  /** colonies[0] is the player's colony. Colonies are never swept from this array. */
  colonies: Colony[];
  ants: Ant[];
  brood: Brood[];
  items: Item[];
  sources: FoodSource[];
  plants: PlantState[];
  creatures: Creature[];
  nests: Nest[];
  markers: Marker[];
  phero: PheromoneState;
  /** Herds, prey patches, hazards, creature director, bird event, carrion accumulators (D1.15). */
  ecology: EcologyState;
  /** Rival relations, territory grid, threat director (D1.16). Rival populations are Colony.rival. */
  rivals: RivalsState;
  player: PlayerState;
  progression: ProgressionState;
}
