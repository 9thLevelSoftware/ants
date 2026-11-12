// Standard primitives for test worlds: a wall, a table with a climb route, a stone and a plant stem. Positions are
// fractions of the world edge, sizes in BU, so the layout works for any species and world size >= 96 BU. The nest
// of testNest.ts sits east of the centre and never overlaps them.

import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRoute, MaterialId, Primitive, PrimShape, WorldObject } from '@/sim/types';
import { PrimFlag } from '@/sim/types';

export const TEST_FEATURES = ['wall', 'table', 'stone', 'stem'] as const;
export type TestFeature = (typeof TEST_FEATURES)[number];

/** Layout of the standard features, BU (positions as fractions of the world edge). */
const WALL = { fx: 0.2, fz: 0.5, halfThick: 1.5, halfHeight: 12, halfLength: 20, buried: 1 };
const TABLE = { fx: 0.3, fz: 0.75, legR: 1, legHeight: 12, buried: 1, topHalf: 9, topHalfThick: 0.75, round: 0.25 };
const STONE = { fx: 0.7, fz: 0.3, rx: 5, ry: 2.5, rz: 4 };
const STEM = { fx: 0.3, fz: 0.3, r: 0.6, height: 30, buried: 1 };
/** Climb route waypoint spacing limit (GDD 04 §10: <= 8 BU), BU. */
const ROUTE_STEP_BU = 4;

export interface FeatureSet {
  prims: Primitive[];
  objects: WorldObject[];
  climbRoutes: ClimbRoute[];
  /** Primitive id per feature part, for tests. */
  ids: Partial<Record<'wall' | 'tableLeg' | 'tableTop' | 'stone' | 'stem', number>>;
}

const ID_ROT = { x: 0, y: 0, z: 0, w: 1 };

function prim(id: number, shape: PrimShape, pos: Vec3, size: Vec3, material: MaterialId, flags: number, round = 0, objectId = -1): Primitive {
  return { id, shape, pos, rot: { ...ID_ROT }, size, round, material, flags, objectId };
}

/**
 * Builds the requested features. Primitive, object and route ids start at `firstId` and count up.
 * `height(x, z)` is the terrain height in mm.
 */
export function buildFeatures(features: readonly TestFeature[], size: number, bu: number,
  height: (x: number, z: number) => number, firstId: number): FeatureSet {
  const out: FeatureSet = { prims: [], objects: [], climbRoutes: [], ids: {} };
  let id = firstId;
  const want = new Set(features);
  const climb = PrimFlag.CLIMBABLE;
  if (want.has('wall')) {
    const x = WALL.fx * size, z = WALL.fz * size, g = height(x, z);
    const pos = { x, y: g - WALL.buried * bu + WALL.halfHeight * bu, z };
    out.ids.wall = id;
    out.prims.push(prim(id++, 'box', pos, { x: WALL.halfThick * bu, y: WALL.halfHeight * bu, z: WALL.halfLength * bu }, 'plaster', climb, 0.25 * bu));
  }
  if (want.has('table')) addTable(out, size, bu, height, () => id++);
  if (want.has('stone')) {
    const x = STONE.fx * size, z = STONE.fz * size;
    out.ids.stone = id;
    out.prims.push(prim(id++, 'ellipsoid', { x, y: height(x, z), z }, { x: STONE.rx * bu, y: STONE.ry * bu, z: STONE.rz * bu }, 'stone', climb | PrimFlag.SHELTER));
  }
  if (want.has('stem')) {
    const x = STEM.fx * size, z = STEM.fz * size, g = height(x, z);
    const half = (STEM.height + STEM.buried) * bu / 2;
    out.ids.stem = id;
    // capsule: size.x radius, size.y inner half length
    out.prims.push(prim(id++, 'capsule', { x, y: g - STEM.buried * bu + half, z }, { x: STEM.r * bu, y: half - STEM.r * bu, z: 0 }, 'plant', climb));
  }
  return out;
}

function addTable(out: FeatureSet, size: number, bu: number, height: (x: number, z: number) => number, nextId: () => number): void {
  const T = TABLE;
  const x = T.fx * size, z = T.fz * size, g = height(x, z);
  const legBot = g - T.buried * bu, legTop = g + T.legHeight * bu;
  const objectId = nextId(), legId = nextId(), topId = nextId(), routeId = nextId();
  const flags = PrimFlag.CLIMBABLE | PrimFlag.SHELTER;
  out.ids.tableLeg = legId;
  out.ids.tableTop = topId;
  // cylinder: size.x radius, size.y half height
  out.prims.push(prim(legId, 'cylinder', { x, y: (legTop + legBot) / 2, z }, { x: T.legR * bu, y: (legTop - legBot) / 2, z: 0 }, 'wood-sound', PrimFlag.CLIMBABLE, 0, objectId));
  const topY = legTop + T.topHalfThick * bu;
  out.prims.push(prim(topId, 'box', { x, y: topY, z }, { x: T.topHalf * bu, y: T.topHalfThick * bu, z: T.topHalf * bu }, 'wood-sound', flags, T.round * bu, objectId));
  // route: up the -x side of the leg, along the underside to the edge, round the edge, onto the top centre
  const legX = x - T.legR * bu, edgeX = x - T.topHalf * bu, under = legTop, top = topY + T.topHalfThick * bu;
  const pts: Vec3[] = [];
  for (let y = g; y < under; y += ROUTE_STEP_BU * bu) pts.push({ x: legX, y, z });
  pts.push({ x: legX, y: under, z });
  for (let px = legX - ROUTE_STEP_BU * bu; px > edgeX; px -= ROUTE_STEP_BU * bu) pts.push({ x: px, y: under, z });
  pts.push({ x: edgeX, y: topY, z }, { x: edgeX + 0.5 * bu, y: top, z });
  for (let px = edgeX + ROUTE_STEP_BU * bu; px < x; px += ROUTE_STEP_BU * bu) pts.push({ x: px, y: top, z });
  pts.push({ x, y: top, z });
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  out.climbRoutes.push({ id: routeId, kind: 'leg-to-top', objectId, points: pts, lengthBu: len / bu });
  out.objects.push({
    id: objectId, templateId: 'test-table', pos: { x, y: g, z }, rot: { ...ID_ROT }, primStart: -1, primCount: 2,
    tags: ['table'], routeIds: [routeId], poiIds: [],
  });
}
