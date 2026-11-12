// A small hand-made world for decor tests (pure): a lawn, a forest with a tree, a paving field with sand joints and
// slabs, a car-park strip with a bin, and gentle relief. Mirrors the demo page's layout at a smaller size.
import type { Primitive, WorldData, WorldObject, ZoneType, ZoneVariant } from '@/sim/types';
import { materialCode, PrimFlag, type MaterialId } from '@/sim/types';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';

export const TEST_WORLD = {
  size: 4096,
  bu: 4,
  lawn: { x0: 0, x1: 2048, z0: 0, z1: 2048 },
  forest: { x0: 2048, x1: 4096, z0: 0, z1: 2048 },
  paving: { x0: 0, x1: 2048, z0: 2048, z1: 4096 },
  asphalt: { x0: 2048, x1: 4096, z0: 2048, z1: 4096 },
  slab: 450,
  joint: 8,
  slabTop: 10,
} as const;

type R = { x0: number; x1: number; z0: number; z1: number };
const inR = (x: number, z: number, r: R) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

export function testHeight(x: number, z: number): number {
  const T = TEST_WORLD;
  if (inR(x, z, T.paving)) return T.slabTop - 12; // joint sand 12 below the slab tops
  if (inR(x, z, T.asphalt)) return -5;
  return 6 * Math.sin(x / 210) * Math.cos(z / 170) + 2 * Math.sin((x + z) / 47);
}

function slabs(): Primitive[] {
  const T = TEST_WORLD, out: Primitive[] = [];
  const pitch = T.slab + T.joint;
  let id = 1;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = T.paving.x0 + 100 + T.slab / 2 + i * pitch, z = T.paving.z0 + 100 + T.slab / 2 + j * pitch;
    out.push({ id: id++, shape: 'box', pos: { x, y: T.slabTop - 20, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: T.slab / 2, y: 20, z: T.slab / 2 }, round: 2, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1 });
  }
  return out;
}

function obj(id: number, templateId: string, x: number, z: number): WorldObject {
  return { id, templateId, pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 0, tags: [], routeIds: [], poiIds: [] };
}

export function buildTestWorld(): WorldData {
  const T = TEST_WORLD;
  const world = buildWorld({
    params: defaultWorldParams('lasius-niger', 11), size: T.size, bu: T.bu, height: testHeight, prims: slabs(),
    objects: [obj(1, 'standing-tree', 3000, 1000), obj(2, 'litter-bin', 3000, 3000), obj(3, 'fruit-tree', 1500, 1500)],
  });
  const zones: { type: ZoneType; variant: ZoneVariant | null; r: R; mat: MaterialId }[] = [
    { type: 'lawn', variant: 'mown', r: T.lawn, mat: 'loam' },
    { type: 'forest', variant: 'deciduous', r: T.forest, mat: 'humus' },
    { type: 'pavement', variant: 'patio', r: T.paving, mat: 'sand' },
    { type: 'asphalt', variant: 'car-park', r: T.asphalt, mat: 'asphalt' },
  ];
  world.zones = zones.map((z, id) => ({ id, type: z.type, variant: z.variant, rects: [[z.r.x0, z.r.z0, z.r.x1, z.r.z1]], areaMm2: 0 }));
  const zm = world.maps.zone;
  for (let k = 0; k < zm.nz; k++) for (let i = 0; i < zm.nx; i++) {
    const x = (i + 0.5) * zm.cell, z = (k + 0.5) * zm.cell;
    zm.data[k * zm.nx + i] = Math.max(0, zones.findIndex((q) => inR(x, z, q.r)));
  }
  const g = world.ground.surface;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) {
    const x = (i + 0.5) * g.cell, z = (k + 0.5) * g.cell, q = zones.find((zz) => inR(x, z, zz.r));
    g.data[k * g.nx + i] = materialCode(q?.mat ?? 'loam');
  }
  return world;
}
