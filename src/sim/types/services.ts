// Runtime services on Sim (contracts guidance §7). Derived caches, never persisted: createSim(state, world)
// rebuilds them (src/sim/services.ts). The geometric services ARE the kernel's (task F2, wired by F-int):
// WorldField = src/sim/world/field.ts (+ diggability), CarveGrid = src/sim/nest/carve, NestNav = src/sim/nest/nav
// (+ nest-level helpers), built together by createKernel (src/sim/kernel.ts) and exposed as `sim.kernel`.
// NavGrid (loco) and PheromoneField (phero) are owned by their modules.

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
import type { ColonySpeciesId, PheroChannel, SpeciesId, Task } from './ids';
import type { NestFieldKind } from './ids/nest';
import type { NavClass } from './ids/world';
import type { RngStreamName } from './ids/progression';
import type { PlayerIntent } from './intent';
import type { Item } from './item';
import type { Marker } from './marker';
import type { Behaviour } from './moduleApi';
import type { Nest } from './nest';
import type {
  PheroCellTest, PheroCellVisitor, PheroChannelFactors, PheroHooks, PheroRegion, PheroWipeOptions,
} from './pheromone';
import type { Herd, PlantState } from './plant';
import type { FoodSource } from './source';
import type { SpeciesDef } from './species';
import type { SimState } from './state';
import type { WorldData } from './world';
import type { CarveGrid } from '@/sim/nest/carve';
import type { NestNav as KernelNestNav } from '@/sim/nest/nav';
import type { Kernel } from '@/sim/kernel';
import type { WorldField as KernelWorldField } from '@/sim/world/field';

/**
 * The solid/free field f(p): mm, POSITIVE in free space (docs/01-design-seed.md §3). This IS the kernel's field
 * (src/sim/world/field.ts, API in docs/design/tdd/02-kernel.md §4) plus one species query the contracts had
 * before the kernel existed. `height(x, z)` includes the registered mound height overlays.
 */
export interface WorldField extends KernelWorldField {
  /** Dig-speed multiplier for this species at p (material table, GDD 03 §2.1); 0 = not diggable. */
  diggability(p: Vec3, species: SpeciesId): number;
}

export type { FieldParams, HeightOverlay, PrimBounds } from '@/sim/world/field';

/**
 * Carve grid over SimState.worldDelta.carve: the kernel's own interface (src/sim/nest/carve), re-exported so
 * modules import it from the contracts barrel.
 */
export type {
  BrushOptions, BrushResult, CarveChange, CarveGrid, CarveListener, ChunkMesh, DigPredicate,
} from '@/sim/nest/carve';

export type { NavSeeds, NavStats } from '@/sim/nest/nav';
export type { Kernel, KernelOptions } from '@/sim/kernel';
export type { WalkerKin, WalkStatus } from '@/sim/locomotion/walker';
export type { WalkerParams } from '@/sim/locomotion/walkerParams';

export interface NestFieldTarget {
  kind: NestFieldKind;
  /** Chamber or plan id; -1 for exit/seal fields. */
  id: number;
}

/**
 * Name of a nest's distance field in the kernel's NestNav (`setTarget(id, seeds)`): one field per nest and
 * target (exit, seal, chamber id, plan id). Fields are derived caches: createSim registers them for every nest
 * in the state (src/sim/services.ts registerNestTargets); the nest module re-registers them when entrances,
 * chambers or plans change.
 */
export function nestFieldId(nestId: number, target: NestFieldTarget): string {
  return `nest:${nestId}:${target.kind}:${target.id}`;
}

/**
 * BFS distance fields over open voxels: the kernel's NestNav (src/sim/nest/nav, keyed by field name, distances
 * Infinity when unreachable) plus nest-level helpers keyed by (nestId, NestFieldTarget) via nestFieldId().
 */
export interface NestNav extends KernelNestNav {
  /** Path distance from p to the target, mm; -1 if unreachable, unknown, or p is not in open nest space. */
  distance(nestId: number, target: NestFieldTarget, p: Vec3): number;
  /** Unit downhill direction toward the target into out; false if none (unknown, unreachable, at the target). */
  descend(nestId: number, target: NestFieldTarget, p: Vec3, out: Vec3): boolean;
  /** No-op kept for compatibility: the kernel's nav listens to the carve grid and updates lazily. */
  onCarve(keys: readonly number[]): void;
  /** Rebuilds every field of the nav from the carve grid (after load or bulk edits); nestId is not needed. */
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
  /**
   * The geometric kernel the field, carve grid and nest nav belong to: brushes with the species' dig predicate
   * (canDigAt), dynamic primitives (addPrim / updatePrim / removePrim keep nav and meshes in step), height
   * overlays (mounds), chunk meshing, walker parameters. Additive to guidance §7.
   */
  kernel: Kernel;
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
