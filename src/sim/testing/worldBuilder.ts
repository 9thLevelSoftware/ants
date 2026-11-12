// Builds a minimal but complete WorldData: one zone, uniform ground layers, a heightfield from a function,
// optional primitives, empty catalogues. Used by the test world and by the placeholder world generator.

import { hashString } from '@/core/rng';
import type {
  ByteMap, ClimbRoute, HeightField, PreCarveOp, Primitive, StartPose, WorldData, WorldObject, WorldParams, ZoneType,
} from '@/sim/types';
import { materialCode, type MaterialId } from '@/sim/types';
import { terrainHeightAt as terrainAt } from '@/sim/entities/placement';
import { NAV_CELL_BU, PLACEHOLDER_MOISTURE, TERRAIN_CELL_BU } from '@/sim/balance';

export interface WorldBuildSpec {
  params: WorldParams;
  /** World edge, mm. */
  size: number;
  /** Body unit, mm. */
  bu: number;
  /** Terrain height at (x, z), mm. */
  height: (x: number, z: number) => number;
  prims?: Primitive[];
  objects?: WorldObject[];
  climbRoutes?: ClimbRoute[];
  preCarve?: PreCarveOp[];
  /** Default: the world centre on the terrain, facing +X. */
  queenStart?: StartPose;
  zone?: ZoneType;
  surface?: MaterialId;
  subsoil?: MaterialId;
}

/** Byte value meaning "neutral nav cost x1.0" (cost map stores x10). */
const NAV_COST_UNIT = 10;

function byteMap(cell: number, nx: number, nz: number, fill: number): ByteMap {
  const data = new Uint8Array(nx * nz);
  if (fill !== 0) data.fill(fill);
  return { cell, nx, nz, data };
}

export function buildWorld(spec: WorldBuildSpec): WorldData {
  const { size, bu } = spec;
  const cell = TERRAIN_CELL_BU * bu;
  const cells = Math.max(1, Math.ceil(size / cell));
  const nx = cells + 1;
  const data = new Float32Array(nx * nx);
  for (let iz = 0; iz < nx; iz++) for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = spec.height(ix * cell, iz * cell);
  const terrain: HeightField = { cell, nx, nz: nx, data };
  const navCell = NAV_CELL_BU * bu;
  const navN = Math.max(1, Math.ceil(size / navCell));
  const center = size / 2;
  const prims = spec.prims ?? [];
  return {
    params: spec.params,
    generatorVersion: spec.params.generatorVersion,
    size, bu, terrain,
    ground: {
      surface: byteMap(cell, cells, cells, materialCode(spec.surface ?? 'loam')),
      crustMm: byteMap(cell, cells, cells, 0),
      subsoil: byteMap(cell, cells, cells, materialCode(spec.subsoil ?? 'loam')),
    },
    prims,
    zones: [{ id: 0, type: spec.zone ?? 'lawn', variant: null, rects: [[0, 0, size, size]], areaMm2: size * size }],
    maps: {
      zone: byteMap(navCell, navN, navN, 0),
      moisture: byteMap(navCell, navN, navN, PLACEHOLDER_MOISTURE),
      shade: byteMap(navCell, navN, navN, 0),
      shelter: byteMap(navCell, navN, navN, 0),
      floodRisk: byteMap(navCell, navN, navN, 0),
      exposure: byteMap(navCell, navN, navN, 0),
      suitability: {},
    },
    nav: { cls: byteMap(navCell, navN, navN, 0), cost: byteMap(navCell, navN, navN, NAV_COST_UNIT) },
    objects: spec.objects ?? [], climbRoutes: spec.climbRoutes ?? [], pois: [], waterBodies: [], micro: [], cavities: [],
    preCarve: spec.preCarve ?? [],
    placements: { foodAnchors: [], plants: [], territories: [], rivalSites: [] },
    queenStart: spec.queenStart ?? { pos: { x: center, y: terrainAt(terrain, center, center), z: center }, fwd: { x: 1, y: 0, z: 0 } },
    meta: {
      fingerprint: hashString(`${spec.params.seed}|${size}|${bu}|${prims.length}|${spec.params.generatorVersion}`),
      attempts: 1, repairs: [], disabledEvents: [],
    },
  };
}
