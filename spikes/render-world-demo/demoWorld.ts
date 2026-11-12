/**
 * Hand-made demo world for the world renderer (render-world task): a standard-size Lasius world (16 m, 4 mm BU)
 * whose centre holds one patch of every habitat surface with its GDD 04 level steps, plus a variety of solid
 * primitives. Real world generation replaces this; the renderer must also draw whatever generateWorld returns.
 *
 * Layout around (8000, 8000) mm, ground level 0 (GDD 04 levels):
 *   lawn soil (loam + humus patches) x 6400..8000, z 7000..9000, nest entrance + mound near (7700, 8150)
 *   patio paving x 8000..9600 (slab tops +10, sand joints), kerb x 9600..9725, asphalt road x > 9725 at -110
 *   sand pit x 6500..7800, z 9000..10200 (+10, wooden edging boards)
 *   gravel path z 9000..9300, x 7800..9600
 *   forest floor (humus) x 6500..8000, z 5600..7000 with a log, twig, stones, plant stem and leaf
 *   kitchen interior x 4800..6400, z 7000..9000: floor +150 (tile, wood), brick house wall with a doorway,
 *     plaster wall, table leg, metal chair leg
 *   material sampler row z 10600..10900: one 300 mm square of every MaterialId
 */
import type { MaterialId, Mound, Primitive, PrimShape, WorldData, ZoneType } from '@/sim/types';
import { MATERIAL_IDS, materialCode, PrimFlag } from '@/sim/types';
import { fbm2 } from '@/core/math/noise';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';

export const BU = 4;
export const WORLD_SIZE = 16000;
export const C = 8000;

export const AREAS = {
  lawn: { x0: 6400, x1: 8000, z0: 7000, z1: 9000 },
  patio: { x0: 8000, x1: 9600, z0: 7000, z1: 9000 },
  kerb: { x0: 9600, x1: 9725 },
  road: { x0: 9725, x1: 11800 },
  sand: { x0: 6500, x1: 7800, z0: 9000, z1: 10200 },
  gravel: { x0: 7800, x1: 9600, z0: 9000, z1: 9300 },
  forest: { x0: 6500, x1: 8000, z0: 5600, z1: 7000 },
  interior: { x0: 4800, x1: 6400, z0: 7000, z1: 9000 },
  sampler: { x0: 5000, z0: 10600, z1: 10900, w: 300 },
} as const;

export const LEVEL = { patio: 10, road: -110, sand: 10, interior: 150 } as const;
export const ENTRANCE = { x: 7700, z: 8150 };

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;

/** Gentle natural relief (mm) away from built surfaces. */
function relief(x: number, z: number): number {
  return fbm2(x / 1800, z / 1800, 11, 4) * 30 + fbm2(x / 160, z / 160, 23, 3) * 3;
}

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Terrain height of the demo world (mm). */
export function demoHeight(x: number, z: number): number {
  const A = AREAS;
  const rowZ = z >= A.patio.z0 - 400 && z < A.patio.z1 + 400;
  // road and kerb step: the kerb face spans the kerb's width so the step sits under the kerb stones
  if (rowZ && x >= A.kerb.x0) {
    const t = smooth01((x - A.kerb.x0) / (A.kerb.x1 - A.kerb.x0));
    return LEVEL.patio - 12 + (LEVEL.road - (LEVEL.patio - 12)) * t;
  }
  if (inRect(x, z, A.patio) || (rowZ && x >= A.patio.x0)) return LEVEL.patio - 12; // bedding sand, 12 mm below slab tops
  if (inRect(x, z, A.interior)) return LEVEL.interior;
  if (inRect(x, z, A.sand)) return LEVEL.sand + fbm2(x / 90, z / 90, 5, 2) * 2;
  if (inRect(x, z, A.gravel)) return 2 + fbm2(x / 60, z / 60, 7, 2) * 1.5;
  const r = relief(x, z);
  // blend natural ground into the built levels over 150 mm
  const dPatio = Math.max(A.patio.x0 - x, 0, x - A.patio.x1, A.patio.z0 - z, z - A.patio.z1);
  const w = smooth01(1 - dPatio / 150);
  return r * (1 - w) + (LEVEL.patio - 12) * w;
}

/** Surface material at (x, z). */
export function demoSurface(x: number, z: number): MaterialId {
  const A = AREAS;
  if (z >= A.sampler.z0 && z < A.sampler.z1 && x >= A.sampler.x0) {
    const i = Math.floor((x - A.sampler.x0) / A.sampler.w);
    if (i < MATERIAL_IDS.length) return MATERIAL_IDS[i];
  }
  const rowZ = z >= A.patio.z0 - 400 && z < A.patio.z1 + 400;
  if (rowZ && x >= A.kerb.x1) return 'asphalt';
  if (rowZ && x >= A.kerb.x0) return 'concrete';
  if (inRect(x, z, A.patio) || (rowZ && x >= A.patio.x0)) return 'sand';
  if (inRect(x, z, A.interior)) return x < 5600 ? 'wood-sound' : 'tile';
  if (inRect(x, z, A.sand)) return 'sand';
  if (inRect(x, z, A.gravel)) return 'gravel';
  if (inRect(x, z, A.forest)) return fbm2(x / 300, z / 300, 3, 2) > 0.35 ? 'loam' : 'humus';
  if (inRect(x, z, A.lawn)) return fbm2(x / 250, z / 250, 9, 3) > 0.25 ? 'humus' : fbm2(x / 90, z / 90, 4, 2) > 0.55 ? 'clay' : 'loam';
  return fbm2(x / 700, z / 700, 13, 3) > 0.3 ? 'humus' : 'loam';
}

function zoneAt(x: number, z: number): ZoneType {
  const A = AREAS;
  const rowZ = z >= A.patio.z0 - 400 && z < A.patio.z1 + 400;
  if (rowZ && x >= A.kerb.x1) return 'asphalt';
  if (inRect(x, z, A.patio) || (rowZ && x >= A.patio.x0)) return 'pavement';
  if (inRect(x, z, A.interior)) return 'interior';
  if (inRect(x, z, A.sand)) return 'sand';
  if (inRect(x, z, A.forest)) return 'forest';
  return 'lawn';
}

const ZONE_LIST: ZoneType[] = ['lawn', 'pavement', 'asphalt', 'sand', 'forest', 'interior'];

class PrimBuilder {
  list: Primitive[] = [];
  private nextId = 1;
  add(shape: PrimShape, material: MaterialId, pos: [number, number, number], size: [number, number, number], o: { round?: number; rotY?: number; rotX?: number; rotZ?: number; flags?: number; tint?: number } = {}): Primitive {
    const q = eulerQuat(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0);
    const p: Primitive = {
      id: this.nextId++, shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, rot: q, size: { x: size[0], y: size[1], z: size[2] },
      round: o.round ?? 0, material, flags: o.flags ?? PrimFlag.CLIMBABLE, objectId: -1, tint: o.tint,
    };
    this.list.push(p);
    return p;
  }
}

/** Quaternion from XYZ Euler angles (radians), applied X then Y then Z. */
export function eulerQuat(ax: number, ay: number, az: number): { x: number; y: number; z: number; w: number } {
  const cx = Math.cos(ax / 2), sx = Math.sin(ax / 2), cy = Math.cos(ay / 2), sy = Math.sin(ay / 2), cz = Math.cos(az / 2), sz = Math.sin(az / 2);
  return {
    x: sx * cy * cz - cx * sy * sz, y: cx * sy * cz + sx * cy * sz, z: cx * cy * sz - sx * sy * cz, w: cx * cy * cz + sx * sy * sz,
  };
}

/** Small deterministic hash 0..1. */
function rnd(i: number, s: number): number {
  let h = Math.imul(i ^ Math.imul(s, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function buildPrims(scatter: number): Primitive[] {
  const b = new PrimBuilder();
  const A = AREAS, H = demoHeight;
  // patio: 450 mm slabs with 8 mm joints, tops at +10, 40 mm thick, slightly rounded arrises
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const x = A.kerb.x0 - 8 - 225 - i * 458, z = A.patio.z0 + 60 + 225 + j * 458;
    b.add('box', 'concrete', [x, LEVEL.patio - 20, z], [225, 20, 225], { round: 3, tint: rnd(i * 7 + j, 3) });
  }
  // kerb stones along the patio edge (top flush with the slabs, 125 wide, upstand to the road)
  for (let k = 0; k < 3; k++) {
    const z = A.patio.z0 - 200 + 915 / 2 + k * 920;
    b.add('box', 'stone', [(A.kerb.x0 + A.kerb.x1) / 2, (LEVEL.patio + LEVEL.road - 30) / 2, z], [62.5, (LEVEL.patio - LEVEL.road + 30) / 2, 457], { round: 6, tint: rnd(k, 5) });
  }
  // sand-pit edging boards (+100)
  b.add('box', 'wood-sound', [(A.sand.x0 + A.sand.x1) / 2, 55, A.sand.z0 + 12], [(A.sand.x1 - A.sand.x0) / 2, 50, 12], { round: 2 });
  b.add('box', 'wood-sound', [A.sand.x1 - 12, 55, (A.sand.z0 + A.sand.z1) / 2], [12, 50, (A.sand.z1 - A.sand.z0) / 2], { round: 2 });
  // interior: brick house wall with a doorway, plaster inner wall, table leg, metal chair leg, skirting
  const wx = A.interior.x1 + 120;
  b.add('box', 'brick', [wx, 450, 7400], [115, 600, 400], {});
  b.add('box', 'brick', [wx, 450, 8650], [115, 600, 350], {});
  b.add('box', 'brick', [wx, 1150, 8025], [115, 100, 275], {});
  b.add('box', 'tile', [wx, LEVEL.interior - 10, 8025], [115, 12, 275], { round: 2 }); // threshold
  b.add('box', 'plaster', [5000, 700, 8000], [20, 560, 900], {});
  b.add('box', 'wood-sound', [5022, LEVEL.interior + 40, 8000], [4, 40, 900], { round: 1 }); // skirting board
  b.add('cylinder', 'wood-sound', [5900, LEVEL.interior + 350, 7700], [22, 350, 0], { round: 3 }); // table leg
  b.add('cylinder', 'metal', [5750, LEVEL.interior + 220, 8150], [9, 220, 0], { round: 1 }); // chair leg
  b.add('box', 'wood-sound', [5900, LEVEL.interior + 720, 7900], [380, 18, 320], { round: 3 }); // table top
  // forest floor: log, twig, stones, plant stem, leaf
  const fx = 7300, fz = 6300;
  b.add('cylinder', 'bark', [fx, H(fx, fz) + 55, fz], [60, 320, 0], { rotZ: Math.PI / 2, rotY: 0.4, round: 8 });
  b.add('cylinder', 'wood-decayed', [fx + 290 * Math.cos(0.4), H(fx, fz) + 55, fz - 290 * Math.sin(0.4)], [52, 6, 0], { rotZ: Math.PI / 2, rotY: 0.4, round: 4 });
  b.add('capsule', 'bark', [fx - 200, H(fx - 200, fz + 150) + 3, fz + 150], [3, 90, 0], { rotZ: Math.PI / 2, rotY: -0.7 });
  // lawn: hero stones, a plant stem with a leaf, a twig near the nest entrance
  const lawnStones: [number, number, number, number][] = [
    [7740, 8120, 9, 5], [7655, 8190, 5, 3.5], [7760, 8200, 14, 7], [7600, 8080, 26, 13], [7820, 8050, 4, 3], [7690, 8250, 7, 4],
  ];
  lawnStones.forEach(([x, z, r, h], i) => b.add('ellipsoid', 'stone', [x, H(x, z) + h * 0.45, z], [r, h, r * 0.8], { rotY: i * 1.3, tint: rnd(i, 9) }));
  const sx = 7735, sz = 8215;
  b.add('cylinder', 'plant', [sx, H(sx, sz) + 60, sz], [1.3, 62, 0], { round: 0.5, rotZ: 0.12 });
  b.add('ellipsoid', 'leaf', [sx + 14, H(sx, sz) + 95, sz + 2], [18, 0.5, 7], { rotZ: 0.35, rotY: 0.3 });
  b.add('capsule', 'bark', [7660, H(7660, 8125) + 2, 8125], [1.8, 28, 0], { rotZ: Math.PI / 2, rotY: 0.9 });
  // asphalt: a bottle cap (metal) and a lost toy ball (plastic), a drink can on its side (metal)
  b.add('cylinder', 'metal', [9850, LEVEL.road + 3, 8000], [14, 3, 0], { round: 1 });
  b.add('ellipsoid', 'plastic', [9950, LEVEL.road + 35, 8250], [35, 35, 35], { tint: 0.3 });
  b.add('cylinder', 'rubber', [10200, LEVEL.road + 30, 8100], [30, 60, 0], { rotZ: Math.PI / 2, round: 4 });
  b.add('box', 'glass', [9830, LEVEL.road + 2, 7850], [12, 2, 7], { round: 1, rotY: 0.6 });
  // scattered pebbles over the whole world (budget test of a populated map)
  for (let i = 0; i < scatter; i++) {
    const x = 200 + rnd(i, 1) * (WORLD_SIZE - 400), z = 200 + rnd(i, 2) * (WORLD_SIZE - 400);
    if (inRect(x, z, { x0: A.interior.x0, x1: A.road.x1, z0: A.patio.z0 - 400, z1: A.patio.z1 + 400 })) continue;
    const r = 2 + rnd(i, 3) * 10;
    b.add('ellipsoid', rnd(i, 4) > 0.3 ? 'stone' : 'gravel', [x, H(x, z) + r * 0.25, z], [r, r * 0.55, r * 0.8], { rotY: rnd(i, 5) * 6, tint: rnd(i, 6), flags: PrimFlag.VISUAL_ONLY });
  }
  return b.list;
}

/** A crater mound around the entrance (GDD 03 1.4: 0.5 BU cells, kept clear inside the entrance radius). */
export function makeEntranceMound(world: WorldData, height: number): Mound {
  const n = 64, cell = 0.5 * BU;
  const base = new Float32Array(n * n), h = new Float32Array(n * n);
  const half = ((n - 1) * cell) / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = ENTRANCE.x - half + i * cell, z = ENTRANCE.z - half + j * cell;
    base[j * n + i] = sampleH(world, x, z);
    const r = Math.hypot(x - ENTRANCE.x, z - ENTRANCE.z);
    const ring = Math.exp(-(((r - 13) / 9) ** 2)) * height;
    h[j * n + i] = r < 6 ? 0 : Math.max(0, ring + fbm2(x / 3, z / 3, 31, 2) * 0.4 * height / 4 - 0.1);
  }
  return { id: 1, nestId: 1, entranceId: 1, centerX: ENTRANCE.x, centerZ: ENTRANCE.z, cell, n, base, h, material: 'loam', volume: height, absorbed: 0, lastBatchTick: 0 };
}

export function sampleH(world: WorldData, x: number, z: number): number {
  const hf = world.terrain;
  const fx = Math.min(hf.nx - 1.001, Math.max(0, x / hf.cell)), fz = Math.min(hf.nz - 1.001, Math.max(0, z / hf.cell));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, n = hf.nx, d = hf.data;
  return (d[iz * n + ix] * (1 - tx) + d[iz * n + ix + 1] * tx) * (1 - tz) + (d[(iz + 1) * n + ix] * (1 - tx) + d[(iz + 1) * n + ix + 1] * tx) * tz;
}

export function buildDemoWorld(scatter = 1500): WorldData {
  const params = defaultWorldParams('lasius-niger', 7);
  const world = buildWorld({ params, size: WORLD_SIZE, bu: BU, height: demoHeight, prims: buildPrims(scatter) });
  const g = world.ground.surface;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) g.data[k * g.nx + i] = materialCode(demoSurface((i + 0.5) * g.cell, (k + 0.5) * g.cell));
  world.zones = ZONE_LIST.map((type, id) => ({ id, type, variant: null, rects: [], areaMm2: 0 }));
  const zm = world.maps.zone;
  for (let k = 0; k < zm.nz; k++) for (let i = 0; i < zm.nx; i++) zm.data[k * zm.nx + i] = ZONE_LIST.indexOf(zoneAt((i + 0.5) * zm.cell, (k + 0.5) * zm.cell));
  return world;
}
