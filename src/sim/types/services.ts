// Runtime services on Sim (contracts guidance §7). Derived caches, never persisted: createSim(state, world)
// rebuilds them. Implementations: src/sim/world (field), src/sim/nest (carve grid, nest nav), src/sim/world
// navGrid (locomotion task), src/sim/pheromones. Until those land, src/sim/testing/placeholders provides safe no-ops.
//
// CarveGrid is the kernel's own interface (src/sim/nest/carve), re-exported: the kernel is the source of truth.
// WorldField and NestNav below are the interfaces the modules program against; reconciling them with the kernel's
// exports (src/sim/world/field.ts, src/sim/nest/nav) is the WIRING TASK's responsibility (ruling 1). Until then
// src/sim/testing/placeholders provides safe implementations.

import type { EventBus } from '@/core/events';
import type { RngState } from '@/core/rng';
import type { Store } from '@/core/store';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant } from './ant';
import type { Brood } from './brood';
import type { Colony } from './colony';
import type { Command, CommandOf, CommandType } from './commands';
import type { Creature } from './creature';
import type { SimEvent, SimEventMap } from './events';
import type { MaterialId } from './geom';
import type { ColonySpeciesId, PheroChannel, SpeciesId, Task } from './ids';
import type { NestFieldKind } from './ids/nest';
import type { NavClass } from './ids/world';
import type { RngStreamName } from './ids/progression';
import type { PlayerIntent } from './intent';
import type { Item } from './item';
import type { Marker } from './marker';
import type { Behaviour } from './moduleApi';
import type { Nest } from './nest';
import type { Herd, PlantState } from './plant';
import type { FoodSource } from './source';
import type { SpeciesDef } from './species';
import type { SimState } from './state';
import type { WorldData } from './world';
import type { CarveGrid } from '@/sim/nest/carve';

/**
 * The solid/free field f(p): mm, POSITIVE in free space (docs/01-design-seed.md §3). Reconciled with the kernel's
 * src/sim/world/field.ts by the wiring task (ruling 1).
 */
export interface WorldField {
  /** Terrain surface height at (x, z), mm (heightfield + mounds + deltas). */
  height(x: number, z: number): number;
  /** fSubstrate: min(terrain term, solid primitives); > 0 in open air (ignores the carve grid). */
  substrate(p: Vec3): number;
  /** fCavity: > 0 inside carved space, negative in un-carved material. */
  cavity(p: Vec3): number;
  /** f(p) = max(fSubstrate, fCavity) (smoothed). */
  sample(p: Vec3): number;
  /** Unnormalised gradient of f into out; returns its length. */
  gradient(p: Vec3, out: Vec3): number;
  /** Unit normal (direction of increasing f) into out; returns |grad| (0 = degenerate, out = +Y). */
  normal(p: Vec3, out: Vec3): number;
  /** Projects p onto the level set f = offset (out may alias p); false if it did not converge. */
  project(p: Vec3, offset: number, out: Vec3): boolean;
  /** Distance along unit dir at which a sphere of `radius` first touches solid, or maxDist. */
  sphereTrace(origin: Vec3, dir: Vec3, maxDist: number, radius: number): number;
  /** Material of the solid nearest to p. */
  materialAt(p: Vec3): MaterialId;
  /** Dig-speed multiplier for this species at p; 0 = not diggable. */
  diggability(p: Vec3, species: SpeciesId): number;
}

/**
 * Carve grid over SimState.worldDelta.carve. ALIGNED with the kernel: the interface is the one exported by
 * src/sim/nest/carve (F2-kernel), re-exported here so modules import it from the contracts barrel.
 */
export type {
  BrushOptions, BrushResult, CarveChange, CarveGrid, CarveListener, ChunkMesh, DigPredicate,
} from '@/sim/nest/carve';

export interface NestFieldTarget {
  kind: NestFieldKind;
  /** Chamber or plan id; -1 for exit/seal fields. */
  id: number;
}

/** BFS distance fields over open voxels per nest. Reconciled with the kernel's src/sim/nest/nav by the wiring task. */
export interface NestNav {
  /** Path distance from p to the target, mm; -1 if unreachable or unknown. */
  distance(nestId: number, target: NestFieldTarget, p: Vec3): number;
  /** Unit downhill direction toward the target into out; false if none. */
  descend(nestId: number, target: NestFieldTarget, p: Vec3, out: Vec3): boolean;
  /** Incremental update after carving the given chunks. */
  onCarve(keys: readonly number[]): void;
  /** Full rebuild of one nest's fields (after fills or load). */
  rebuild(nestId: number): void;
}

/** Coarse 2D navigation grid, 16 BU cells (GDD 04 §11). Owned by the locomotion task. */
export interface NavGrid {
  /** Cell edge, mm. */
  readonly cell: number;
  readonly w: number;
  readonly h: number;
  classAt(x: number, z: number): NavClass;
  /** Travel cost multiplier at (x, z), >= 1. */
  costAt(x: number, z: number): number;
  blocked(x: number, z: number): boolean;
  /** Waypoints from -> to (mm) into out (cleared first); false if no path. */
  findPath(from: Vec3, to: Vec3, out: Vec3[]): boolean;
  /** Runtime cost overlay for one cell (danger grid, human lanes); 1 = none. */
  setCostMult(ix: number, iz: number, mult: number): void;
}

/** Sparse 3D pheromone field over SimState.phero (GDD 02 §8). */
export interface PheromoneField {
  deposit(colony: number, channel: PheroChannel, p: Vec3, amount: number): void;
  sample(colony: number, channel: PheroChannel, p: Vec3): number;
  /** Gradient-ish sensing direction in the tangent plane (fwd/up frame) into out; returns local strength. */
  sense(colony: number, channel: PheroChannel, p: Vec3, fwd: Vec3, up: Vec3, out: Vec3): number;
  /** Multiplies a whole channel by factor (decay step). */
  decay(channel: PheroChannel, factor: number): void;
  /** Multiplies cells within radius of center (rain wash, sweeping, footsteps). */
  scaleRegion(channel: PheroChannel, center: Vec3, radius: number, factor: number): void;
  /** Removes all layers of a colony. */
  clearColony(colony: number): void;

  // ---- Optional extensions (phero task; the real field implements all of them, test fakes may not) ----
  /** Raw value of the cell containing p, ph (no blend). */
  sampleCell?(colony: number, channel: PheroChannel, p: Vec3): number;
  /** Strongest cell (>= minValue) whose centre lies within radius of p: centre into out, returns its value (0 = none). */
  strongestNear?(colony: number, channel: PheroChannel, p: Vec3, radius: number, out: Vec3, minValue?: number): number;
  /** Advances decay (and alarm diffusion) by dtSeconds of game time over active cells only. */
  step?(dtSeconds: number): void;
  /** Multiplies every cell for which isExposed(centre) is true (rain); returns the number of cells changed. */
  washExposed?(factors: number | PheroChannelFactors, isExposed: PheroCellTest): number;
  /** Multiplies the cells whose centres lie in the region (human events); returns the number of cells changed. */
  wipeRegion?(region: PheroRegion, factors: number | PheroChannelFactors, opts?: PheroWipeOptions): number;
  /** Read-only iteration over a layer's active cells (scent view, debugging); returns the number visited. */
  forEachActiveCell?(colony: number, channel: PheroChannel, fn: PheroCellVisitor): number;
  /** Active cells of one layer (or of all layers when colony is omitted). */
  activeCellCount?(colony?: number, channel?: PheroChannel): number;
  /** Counter that changes whenever the layer's cells change (renderers skip unchanged layers). */
  layerVersion?(colony: number, channel: PheroChannel): number;
  /** Installs runtime hooks (decay modifier, free-space test). */
  setHooks?(hooks: PheroHooks): void;
}

/** Spatial hash over entities, refreshed once per tick (and on demand). */
export interface EntityIndex {
  refresh(): void;
  queryAnts(p: Vec3, r: number, out: number[]): number[];
  queryBrood(p: Vec3, r: number, out: number[]): number[];
  queryItems(p: Vec3, r: number, out: number[]): number[];
  querySources(p: Vec3, r: number, out: number[]): number[];
  queryCreatures(p: Vec3, r: number, out: number[]): number[];
}

export interface SimStores {
  ants: Store<Ant>;
  brood: Store<Brood>;
  items: Store<Item>;
  sources: Store<FoodSource>;
  plants: Store<PlantState>;
  creatures: Store<Creature>;
  nests: Store<Nest>;
  markers: Store<Marker>;
  colonies: Store<Colony>;
  herds: Store<Herd>;
}

/**
 * Tick-order slots (docs/03-architecture.md §3). systems.ts collects every module's `systems` array and sorts by
 * phase (stable: module order, then array order), so a module adds a system without editing a shared file.
 */
export const SYSTEM_PHASES = [
  'commands', 'environment', 'ecology', 'colony-allocation', 'queen', 'brood', 'perception', 'behaviours',
  'player-control', 'actions', 'creatures', 'locomotion', 'combat', 'nest', 'pheromones', 'colony-economy', 'rivals',
  'progression', 'lifecycle',
] as const;
export type SystemPhase = (typeof SYSTEM_PHASES)[number];

/** A simulation system. Runs every `every` ticks (default 1) when (tick + offset) % every === 0. */
export interface System {
  name: string;
  /** Tick-order slot; required for systems exported by modules (ad-hoc test systems may omit it). */
  phase?: SystemPhase;
  every?: number;
  offset?: number;
  run(sim: Sim): void;
}

/** Handler of one command type. Handlers must not throw for bad input (emit `command-rejected` instead). */
export type CommandHandler<K extends CommandType> = (sim: Sim, cmd: CommandOf<K>) => void;
/** One handler per command type (ruling 9: each module exports a `Partial<CommandHandlerMap>`). */
export type CommandHandlerMap = { [K in CommandType]: CommandHandler<K> };

/** Behaviour lookup assembled from the modules' `behaviours` arrays (ruling 13). */
export interface BehaviourTable {
  /** Species-specific behaviour for the task if one exists, else the generic one; undefined when none. */
  get(task: Task, species: ColonySpeciesId): Behaviour | undefined;
}

export interface Sim {
  state: SimState;
  world: WorldData;
  field: WorldField;
  carve: CarveGrid;
  nestNav: NestNav;
  navGrid: NavGrid;
  phero: PheromoneField;
  index: EntityIndex;
  stores: SimStores;
  /** Behaviour state machines by task (assembled in systems.ts). */
  behaviours: BehaviourTable;
  /** Player's species. */
  species: SpeciesDef;
  getSpecies(id: ColonySpeciesId): SpeciesDef | undefined;
  /** Queued during a tick, flushed after it. */
  events: EventBus<SimEventMap>;
  /** Ordered systems this sim runs. */
  readonly systems: readonly System[];
  /** Advances one tick (0.1 game s). */
  tick(): void;
  /** Queues a command for the start of the next tick. */
  enqueue(cmd: Command): void;
  /** Applies queued commands now without advancing time (used while paused). */
  applyPendingCommands(): void;
  setPlayerIntent(intent: PlayerIntent): void;
  /** Per-frame movement of the possessed ant between ticks. */
  integratePossessed(dtSeconds: number): void;
  /** Queues an event for delivery after the current tick. */
  emit(ev: SimEvent): void;
  /** Named RNG sub-stream (created on first use, persisted in state.rngStreams). */
  stream(name: RngStreamName): RngState;
}
