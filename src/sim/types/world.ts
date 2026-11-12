// Static world (WorldData, regenerated from WorldParams + seed, never saved) and the dynamic world delta
// (WorldDelta, in SimState). GDD 04 App. A, GDD 03 App. A. Units: mm, Y up.
// Kernel contract: WorldData.size, .bu, .terrain, .ground, .prims and optional .terrainHoles are consumed
// structurally by src/sim/world/field.ts — never rename them.

import type { Quat } from '@/core/math/quat';
import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind, FoodKind, SpeciesId, ZoneType } from './ids';
import type { RivalSpeciesId } from './ids/ecology';
import type {
  CavityKind, ClimbRouteKind, MicroKind, PoiKind, WaterBodyKind, ZoneVariant,
} from './ids/world';
import type { ByteMap, CarveData, GroundLayers, HeightField, Primitive } from './geom';
import type { WorldParams } from './config';

export interface ZoneDef {
  /** Value used in the zone byte map. */
  id: number;
  type: ZoneType;
  variant: ZoneVariant | null;
  /** Axis-aligned rectangles [x0, z0, x1, z1] in mm (empty if polyline-defined). */
  rects: number[][];
  /** Area, mm^2. */
  areaMm2: number;
}

/** A point of interest on a world object (GDD 04 §10). */
export interface Poi {
  id: number;
  kind: PoiKind;
  pos: Vec3;
  objectId: number;
}

/** Authored climb route on a world object: AI follows its waypoints (GDD 04 §10). */
export interface ClimbRoute {
  id: number;
  kind: ClimbRouteKind;
  objectId: number;
  /** Waypoints on the object's surface, mm, bottom first. */
  points: Vec3[];
  /** BU */
  lengthBu: number;
}

/** Instance of a catalogue object (tree, slab, kerb, table ...) built from primitives. */
export interface WorldObject {
  id: number;
  /** Catalogue template id (GDD 04 §5; owned by the worldgen catalogue). */
  templateId: string;
  pos: Vec3;
  rot: Quat;
  /** Indices into WorldData.prims: [first, count). */
  primStart: number;
  primCount: number;
  tags: string[];
  routeIds: number[];
  poiIds: number[];
}

/** Micro-connection (GDD 04 §6): a narrow passage between two places. */
export interface MicroConn {
  id: number;
  kind: MicroKind;
  /** Mouth positions, mm. */
  posA: Vec3;
  posB: Vec3;
  gapMm: number;
  minClearanceBu: number;
  lengthBu: number;
  /** Passes the usefulness test (shortcut or shelter). */
  useful: boolean;
  reason: string;
}

/** Pre-existing cavity written to the carve grid at world creation (GDD 04 §7, GDD 03 §3). */
export interface NaturalCavity {
  id: number;
  kind: CavityKind;
  /** Bounding box min/max, mm. */
  min: Vec3;
  max: Vec3;
  openings: { pos: Vec3; normal: Vec3; radius: number }[];
}

/** A carve operation applied once to the carve grid when the game is created. */
export interface PreCarveOp {
  /** Brush shapes of the kernel carve grid (ellipsoids are axis-aligned). */
  shape: 'sphere' | 'capsule' | 'ellipsoid';
  /** Centre (or segment start for capsules), mm. */
  a: Vec3;
  /** Segment end for capsules; radii for ellipsoids; unused for spheres, mm. */
  b: Vec3;
  /** Radius, mm (sphere / capsule). */
  r: number;
  /** Mark voxels NATURAL (pre-existing). */
  natural: boolean;
  /** Owning NaturalCavity id, -1 none. */
  cavityId: number;
}

export interface WaterBody {
  id: number;
  kind: WaterBodyKind;
  /** Vessel object (bowl, gully), -1 none. */
  vesselObjectId: number;
  /** Footprint centre and radius, mm. */
  pos: Vec3;
  radius: number;
  /** Initial and maximum water level, mm (depth). */
  levelMm: number;
  capMm: number;
}

/** A place where food sources appear (GDD 04 §8). */
export interface FoodAnchor {
  id: number;
  kind: FoodKind;
  pos: Vec3;
  up: Vec3;
  hostObjectId: number;
  /** SEASONS bits in which it is active. */
  seasonMask: number;
  /** Initial state tag for the ecology module (e.g. 'full', 'empty'). */
  initialState: string;
}

export interface PlantPlacement {
  objectId: number;
  /** HOST_FLAGS bits. */
  hostFlags: number;
  hostClass: 'herb' | 'shrub' | 'tree';
}

export interface CreatureTerritorySeed {
  creatureKind: CreatureKind;
  center: Vec3;
  radiusMm: number;
  /** ZONE_TYPES bits. */
  zoneMask: number;
  cap: number;
}

export interface RivalSite {
  species: SpeciesId | RivalSpeciesId;
  origin: Vec3;
  incipient: boolean;
}

export interface WorldPlacements {
  foodAnchors: FoodAnchor[];
  plants: PlantPlacement[];
  territories: CreatureTerritorySeed[];
  rivalSites: RivalSite[];
}

/** Where the founding queen starts. */
export interface StartPose {
  /** mm, on the surface. */
  pos: Vec3;
  /** Unit forward, tangent. */
  fwd: Vec3;
}

/** Per-cell world maps for other systems (GDD 04 §2.4, §12, §13). Cell sizes vary per map (see ByteMap.cell). */
export interface WorldMaps {
  /** Zone id per terrain cell (ZoneDef.id). */
  zone: ByteMap;
  /** Base soil moisture 0..255 (= 0..1), 16 BU cells. */
  moisture: ByteMap;
  /** Shade 0..255 (0 = full sun) averaged over the day. */
  shade: ByteMap;
  /** Shelter from rain 0..255. */
  shelter: ByteMap;
  /** Flood risk 0..255 (= 0..1). */
  floodRisk: ByteMap;
  /** Exposure 0..255. */
  exposure: ByteMap;
  /** Nesting suitability 0..255 per species. */
  suitability: Record<string, ByteMap>;
}

/** Coarse 16 BU navigation grid data (GDD 04 §11). */
export interface NavGridData {
  /** NAV_CLASSES index per cell. */
  cls: ByteMap;
  /** Cost multiplier per cell, x10 (10 = 1.0). */
  cost: ByteMap;
}

export interface WorldMeta {
  /** uint32 */
  fingerprint: number;
  attempts: number;
  repairs: string[];
  disabledEvents: string[];
}

export interface WorldData {
  params: WorldParams;
  generatorVersion: number;
  /** World edge length, mm (X and Z span [0, size]). */
  size: number;
  /** Body unit of the played species, mm. */
  bu: number;
  terrain: HeightField;
  ground: GroundLayers;
  /** Static solid primitives (index = position in this array; Primitive.id is unique). */
  prims: Primitive[];
  /** Cells where the terrain term is removed (drains, holes): non-zero = hole. Same grid as terrain. */
  terrainHoles?: ByteMap;
  zones: ZoneDef[];
  maps: WorldMaps;
  nav: NavGridData;
  objects: WorldObject[];
  climbRoutes: ClimbRoute[];
  pois: Poi[];
  waterBodies: WaterBody[];
  micro: MicroConn[];
  cavities: NaturalCavity[];
  preCarve: PreCarveOp[];
  placements: WorldPlacements;
  queenStart: StartPose;
  meta: WorldMeta;
}

/** Mound heightfield around an entrance (GDD 03 §1.5). */
export interface Mound {
  id: number;
  nestId: number;
  entranceId: number;
  /** Grid centre in X/Z, mm. */
  centerX: number;
  centerZ: number;
  /** Cell edge, mm. */
  cell: number;
  /** Grid points per side. */
  n: number;
  /** Terrain height under the mound, mm; and pile height above it, mm. */
  base: Float32Array;
  h: Float32Array;
  material: string;
  /** BU^3 */
  volume: number;
  /** Pellets absorbed. */
  absorbed: number;
  lastBatchTick: number;
}

/** Runtime change of a static object (moved car, opened door, mown plant). */
export interface ObjectStateChange {
  objectId: number;
  state: string;
  /** New position / rotation if moved; null when unchanged. */
  pos: Vec3 | null;
  rot: Quat | null;
  tick: number;
}

export interface WorldDelta {
  /** Sparse carve grid (copy-on-write chunks; pre-existing chunks are flagged NATURAL). */
  carve: CarveData;
  /** Dynamic primitives (cars, toys, bait stations, moved objects); flag DYNAMIC; ids from SimState.nextId. */
  dynamicPrims: Primitive[];
  mounds: Mound[];
  objectStates: ObjectStateChange[];
  /** Food anchors used up (FoodAnchor ids). */
  consumedAnchors: number[];
  /** Natural cavity id (as string key) -> owning nest id. */
  naturalOwners: Record<string, number>;
  /** Sparse terrain deformation tiles (32x32 cells, 1/16 mm units). */
  heightDeltas: { tileIndex: number; data: Int16Array }[];
  /** Grass height per nav cell, mm (sward layer, GDD 04 V4). */
  grassHeightMm: Uint8Array;
  /** Micro-connection discovery state. */
  microState: { id: number; discovered: boolean; discoveredTick: number; open: boolean }[];
  /** Current water level per water body (WorldData.waterBodies order), mm. */
  waterLevels: Float32Array;
  /** Dynamic wood state per wood primitive (GDD 07 §6.2.1 / App. A.4). */
  wood: WoodState[];
}

/**
 * Dynamic state of one wood primitive (GDD 07 §6.2.1), single-segment form. The GDD's per-segment arrays
 * (`segments[i].mc / decay`, up to 4), `placement`, `grainAxis`, `thicknessBu`, `carvedFrac`, `sunExposure` and
 * `windowCount` are added by species-carpenter; `moisture` and `decay` then hold the values of segment 0.
 */
export interface WoodState {
  /** World primitive id (material wood-sound, wood-decayed or bark-covered). */
  primId: number;
  /** Moisture content, % (6..60). */
  moisture: number;
  /** Decay class, integer 0..4: 0 sound, 1 early, 2 moderate, 3 advanced (intact), 4 crumbling. */
  decay: number;
}
