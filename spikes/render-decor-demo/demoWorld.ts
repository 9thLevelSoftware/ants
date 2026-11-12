/**
 * Hand-made world for the decor demo (Lasius, BU 4, 8 m square), around four habitats:
 *   lawn      x 2000..4000, z 2000..4000 (mown; a rough strip z 4000..4600), relief 3 mm micro
 *   forest    x 4000..6000, z 2000..4600 (deciduous; a tree, a log, stones; litter map 1; canopy shade)
 *   patio     x 2000..4000, z  600..2000: 450 mm slabs, 8 mm sand joints, a house wall at z 600 (shade), a
 *             flowering shrub (petals in spring), a glazed pet water bowl with water
 *   car park  x 4000..6000, z  600..2000 (asphalt at -5 with a puddle hollow, a litter bin)
 */
import type { MaterialId, Primitive, PrimShape, WaterBody, WorldData, WorldObject, ZoneType, ZoneVariant } from '@/sim/types';
import { materialCode, PrimFlag } from '@/sim/types';
import { fbm2 } from '@/core/math/noise';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';

export const BU = 4;
export const SIZE = 8192;
type R = { x0: number; x1: number; z0: number; z1: number };
export const AREA = {
  lawn: { x0: 2000, x1: 4000, z0: 2000, z1: 4000 },
  rough: { x0: 2000, x1: 4000, z0: 4000, z1: 4600 },
  forest: { x0: 4000, x1: 6000, z0: 2000, z1: 4600 },
  patio: { x0: 2000, x1: 4000, z0: 600, z1: 2000 },
  carpark: { x0: 4000, x1: 6000, z0: 600, z1: 2000 },
} as const;
export const SLAB = { size: 450, joint: 8, top: 10, x0: 2100, z0: 700, nx: 4, nz: 3 } as const;
export const PUDDLE = { x: 4700, z: 1300, r: 260, depth: 7 } as const;
export const BOWL = { x: 3700, z: 1650, rIn: 80, depth: 50, wall: 9 } as const;
export const TREE = { x: 5200, z: 3300, r: 260 } as const;
export const SHRUB = { x: 3300, z: 1950 } as const;
export const BIN = { x: 5500, z: 1600 } as const;

const inR = (x: number, z: number, r: R) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const smooth01 = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export function demoHeight(x: number, z: number): number {
  if (inR(x, z, AREA.patio)) return SLAB.top - 12;
  if (inR(x, z, AREA.carpark)) {
    const d = Math.hypot(x - PUDDLE.x, z - PUDDLE.z);
    return -5 - PUDDLE.depth * (1 - smooth01(d / PUDDLE.r)) + fbm2(x / 90, z / 90, 3, 2) * 0.6;
  }
  const forest = inR(x, z, AREA.forest) ? 1 : 0;
  return fbm2(x / 1500, z / 1500, 11, 3) * 30 + fbm2(x / 48, z / 48, 23, 1) * (3 + 5 * forest);
}

function zoneOf(x: number, z: number): { type: ZoneType; variant: ZoneVariant | null; mat: MaterialId } {
  if (inR(x, z, AREA.patio)) return { type: 'pavement', variant: 'patio', mat: 'sand' };
  if (inR(x, z, AREA.carpark)) return { type: 'asphalt', variant: 'car-park', mat: 'asphalt' };
  if (inR(x, z, AREA.forest)) return { type: 'forest', variant: 'deciduous', mat: 'humus' };
  if (inR(x, z, AREA.rough)) return { type: 'lawn', variant: 'rough', mat: 'loam' };
  return { type: 'lawn', variant: 'mown', mat: 'loam' };
}

const ZONES: { type: ZoneType; variant: ZoneVariant | null }[] = [
  { type: 'lawn', variant: 'mown' }, { type: 'lawn', variant: 'rough' }, { type: 'forest', variant: 'deciduous' },
  { type: 'pavement', variant: 'patio' }, { type: 'asphalt', variant: 'car-park' },
];

function quatY(a: number) { return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }; }
function quatZ(a: number) { return { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }; }

function prims(): Primitive[] {
  const out: Primitive[] = [];
  let id = 1;
  const add = (shape: PrimShape, material: MaterialId, pos: [number, number, number], size: [number, number, number], round = 0, rot = { x: 0, y: 0, z: 0, w: 1 }) =>
    out.push({ id: id++, shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, rot, size: { x: size[0], y: size[1], z: size[2] }, round, material, flags: PrimFlag.CLIMBABLE, objectId: -1 });
  const pitch = SLAB.size + SLAB.joint;
  for (let j = 0; j < SLAB.nz; j++) for (let i = 0; i < SLAB.nx; i++) {
    add('box', 'concrete', [SLAB.x0 + SLAB.size / 2 + i * pitch, SLAB.top - 20, SLAB.z0 + SLAB.size / 2 + j * pitch], [SLAB.size / 2, 20, SLAB.size / 2], 2);
  }
  add('box', 'brick', [3000, 600, 560], [1000, 600, 50]); // house wall: shade on the patio's south edge
  // pet water bowl on a slab: ring of 14 staves + base
  const top = SLAB.top;
  add('cylinder', 'ceramic', [BOWL.x, top + 5, BOWL.z], [BOWL.rIn + BOWL.wall, 5, 0], 3);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = BOWL.rIn + BOWL.wall / 2;
    add('box', 'ceramic', [BOWL.x + Math.cos(a) * r, top + 5 + BOWL.depth / 2, BOWL.z + Math.sin(a) * r], [BOWL.wall / 2, BOWL.depth / 2, (Math.PI * r) / 14 + 1], 2, quatY(-a));
  }
  // forest: trunk, log, stones
  add('cylinder', 'bark', [TREE.x, 1200, TREE.z], [TREE.r, 1300, 0], 20);
  add('cylinder', 'wood-decayed', [4700, demoHeight(4700, 2700) + 60, 2700], [75, 600, 0], 10, quatZ(Math.PI / 2));
  for (const [x, z, r] of [[4560, 3020, 30], [4620, 2960, 14], [4480, 3150, 22]] as const) add('ellipsoid', 'stone', [x, demoHeight(x, z) + r * 0.25, z], [r, r * 0.55, r * 0.8]);
  return out;
}

function objects(): WorldObject[] {
  const o = (id: number, templateId: string, x: number, z: number): WorldObject => ({ id, templateId, pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 0, tags: [], routeIds: [], poiIds: [] });
  return [o(1, 'standing-tree', TREE.x, TREE.z), o(2, 'shrub', SHRUB.x, SHRUB.z), o(3, 'litter-bin', BIN.x, BIN.z)];
}

export function buildDecorDemoWorld(): WorldData {
  const world = buildWorld({ params: defaultWorldParams('lasius-niger', 7), size: SIZE, bu: BU, height: demoHeight, prims: prims(), objects: objects() });
  world.zones = ZONES.map((z, id) => ({ id, type: z.type, variant: z.variant, rects: [], areaMm2: 0 }));
  const zm = world.maps.zone;
  const shade = world.maps.shade, litter = { cell: zm.cell, nx: zm.nx, nz: zm.nz, data: new Uint8Array(zm.nx * zm.nz) };
  for (let k = 0; k < zm.nz; k++) for (let i = 0; i < zm.nx; i++) {
    const x = (i + 0.5) * zm.cell, z = (k + 0.5) * zm.cell, q = zoneOf(x, z), c = k * zm.nx + i;
    zm.data[c] = ZONES.findIndex((zz) => zz.type === q.type && zz.variant === q.variant);
    const forest = q.type === 'forest';
    litter.data[c] = forest ? 255 : 0;
    // shade: canopy over the forest, the house wall's shadow over the patio's first metre
    shade.data[c] = forest ? 200 : inR(x, z, AREA.patio) && z < 1500 ? 140 : 20;
  }
  world.maps.litter = litter;
  const g = world.ground.surface;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) g.data[k * g.nx + i] = materialCode(zoneOf((i + 0.5) * g.cell, (k + 0.5) * g.cell).mat);
  const puddle: WaterBody = { id: 0, kind: 'puddle', vesselObjectId: -1, pos: { x: PUDDLE.x, y: demoHeight(PUDDLE.x, PUDDLE.z), z: PUDDLE.z }, radius: PUDDLE.r, levelMm: 5, capMm: PUDDLE.depth };
  const bowl: WaterBody = { id: 1, kind: 'bowl-water', vesselObjectId: -1, pos: { x: BOWL.x, y: SLAB.top + 10, z: BOWL.z }, radius: BOWL.rIn, levelMm: 32, capMm: BOWL.depth * 0.8 };
  world.waterBodies = [puddle, bowl];
  return world;
}

export function sampleH(world: WorldData, x: number, z: number): number {
  const hf = world.terrain;
  const fx = Math.min(hf.nx - 1.001, Math.max(0, x / hf.cell)), fz = Math.min(hf.nz - 1.001, Math.max(0, z / hf.cell));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, n = hf.nx, d = hf.data;
  return (d[iz * n + ix] * (1 - tx) + d[iz * n + ix + 1] * tx) * (1 - tz) + (d[(iz + 1) * n + ix] * (1 - tx) + d[(iz + 1) * n + ix + 1] * tx) * tz;
}
