// Nests: entrances, chambers, dig plans, architect, flood, founding dig, collapse (GDD 03 App. A).
// Mound heightfields are dynamic world data and live in WorldDelta.mounds (world.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberType, Material } from './ids';
import type {
  ArchitectMode, ArchitectNeed, ChamberSize, DesignatedBy, EntranceKind, EntranceStatus, FoundingDigState,
  NestKind, PlanBlockedReason, PlanKind, PlanPriority, PlanSource, PlanStatus,
} from './ids/nest';
import type { SurfaceRef } from './refs';

export interface Entrance {
  id: number;
  kind: EntranceKind;
  status: EntranceStatus;
  /** Opening centre on the surface, mm. */
  pos: Vec3;
  /** Unit direction out of the nest. */
  dir: Vec3;
  /** mm */
  radius: number;
  /** Mound id in WorldDelta.mounds, -1 none. */
  moundId: number;
  /** Target rim height, mm (raised against rain). */
  rimTarget: number;
  plugVoxelCount: number;
  createdTick: number;
  /** Rolling traffic counters (ants per game hour). */
  trafficIn: number;
  trafficOut: number;
}

/** Capacity or occupancy of a chamber in space units (GDD 03 §6.4). */
export interface ChamberLoad {
  adults: number;
  brood: number;
  /** Food loads. */
  food: number;
  other: number;
}

export interface Chamber {
  id: number;
  type: ChamberType;
  designatedBy: DesignatedBy;
  /** mm */
  center: Vec3;
  /** Ellipsoid radii, mm. */
  radii: Vec3;
  /** BU^3 */
  volume: number;
  /** BU^2 */
  floorArea: number;
  depthBu: number;
  depthMm: number;
  /** Thinnest roof above, BU. */
  roofMin: number;
  /** Solid cover (stone, slab) above. */
  covered: boolean;
  /** Voxel used to re-detect the chamber (packed voxel key). */
  seedVoxel: number;
  voxelCount: number;
  capacity: ChamberLoad;
  occupancy: ChamberLoad;
  /** °C */
  temp: number;
  /** Relative humidity 0..1. */
  humidity: number;
  wetUntilTick: number;
  /** Flooded fraction 0..1. */
  flooded: number;
  /** Predicted flood risk 0..1. */
  floodRisk: number;
  /** CHAMBER_FLAGS bits. */
  flags: number;
  createdTick: number;
}

export interface PlanSphere {
  /** Centre, mm. */
  c: Vec3;
  /** mm */
  r: number;
  done: boolean;
  obstructed: boolean;
}

export interface DigSlot {
  /** mm */
  pos: Vec3;
  /** Claiming ant, -1 free. */
  antId: number;
  sinceTick: number;
}

/** Geometry parameters of a plan (kind-dependent; unused fields are 0 / null). */
export interface PlanGeom {
  /** Tunnel/shaft end point, mm; null if not set. */
  end: Vec3 | null;
  /** Bend control point, mm; null for straight. */
  bend: Vec3 | null;
  /** BU */
  length: number;
  yawDeg: number;
  /** Entrance plans: where it should reach the surface, mm. */
  surfacePoint: Vec3 | null;
}

export interface DigPlan {
  id: number;
  nestId: number;
  kind: PlanKind;
  chamberType: ChamberType | null;
  size: ChamberSize | null;
  source: PlanSource;
  /** Architect need that proposed it, null for player plans. */
  need: ArchitectNeed | null;
  priority: PlanPriority;
  status: PlanStatus;
  blockedReason: PlanBlockedReason | null;
  /** Validation warnings accepted at creation. */
  warnings: string[];
  anchor: SurfaceRef;
  geom: PlanGeom;
  /** Ordered carve spheres. */
  spheres: PlanSphere[];
  /** Indices of spheres in the active frontier window. */
  window: number[];
  slots: DigSlot[];
  /** Where diggers stack pellets, mm. */
  spoilPoint: Vec3;
  /** BU^3 */
  targetVolume: number;
  removedVolume: number;
  createdTick: number;
  statusTick: number;
}

export interface ArchitectState {
  mode: ArchitectMode;
  needToggles: Record<ArchitectNeed, boolean>;
  lastEvalTick: number;
  blacklist: { pos: Vec3; untilTick: number }[];
  /** Last evaluated pressure per need (0.. ; > 1 means urgent). */
  needCache: Record<ArchitectNeed, number>;
  /**
   * Failed architect sites not yet blacklisted (additive, architect): anchor, failures counted there, and the tick
   * after which they are forgotten. Missing = none.
   */
  failures?: { pos: Vec3; count: number; untilTick: number }[];
}

export interface FloodState {
  /** Water volume in the nest, BU^3. */
  water: number;
  /** Water level, mm (world y); -1e9 when dry. */
  level: number;
  lastTick: number;
  /** -1 when not flooding. */
  floodingSinceTick: number;
}

export interface FoundingDig {
  state: FoundingDigState;
  /** Readiness 0..1 (GDD 03 §13). */
  readiness: number;
  cavitySeed: Vec3;
  /** Ids of abandoned burrows (plan ids). */
  abandoned: number[];
  readyTick: number;
  sealedTick: number;
}

export interface CollapseWarning {
  id: number;
  center: Vec3;
  /** mm */
  radius: number;
  voxelCount: number;
  startTick: number;
  dueTick: number;
}

export interface Nest {
  id: number;
  alive: boolean;
  colony: number;
  kind: NestKind;
  /** Parent nest for satellites, -1 none. */
  parentNestId: number;
  /** First entrance / founding point, mm. */
  origin: Vec3;
  /** Dominant substrate material. */
  substrate: Material;
  entrances: Entrance[];
  chambers: Chamber[];
  digPlans: DigPlan[];
  /** Mound ids in WorldDelta.mounds. */
  moundIds: number[];
  architect: ArchitectState;
  flood: FloodState;
  /** Founding dig state; null once established. */
  founding: FoundingDig | null;
  collapse: CollapseWarning[];
  /** Open volume, BU^3. */
  volumeOpen: number;
}
