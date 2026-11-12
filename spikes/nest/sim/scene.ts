/**
 * Spike scene: ~700 x 700 mm terrain with gentle relief, solid primitives (paving slab, stone, plant stem, table,
 * wall) and a code-generated test nest. Pure TypeScript (no three).
 *
 * BU = 4 mm (Lasius niger worker) -> voxel 2 mm, chunk 32 mm (16^3 voxels), tunnels ~2 BU = 8 mm wide.
 */
import { World, rotY, IDENTITY_ROT, type Primitive, type TerrainDef } from './world';
import { CarveGrid } from './carve';
import { Field } from './field';
import { fbm2 } from './rng';

export const BU = 4;
export const VOXEL = BU / 2;
export const RAMP = 2 * VOXEL; // carve ramp width (mm): fCavity exact within +-2 mm of a carved surface
export const BLEND = 1.5; // smooth min/max width (mm) of the field
export const WORLD_SIZE = 700;
export const TUNNEL_R = BU; // 8 mm diameter

export interface Chamber { name: string; x: number; y: number; z: number; rx: number; ry: number; rz: number }
export interface NestInfo {
  entrance: [number, number, number];
  slabExit: [number, number, number];
  chambers: Chamber[];
  tunnels: { name: string; r: number; pts: [number, number, number][] }[];
}

export interface SpikeWorld { world: World; carve: CarveGrid; field: Field; nest: NestInfo; seed: number }

export function buildTerrain(seed: number): TerrainDef {
  const cell = 4 * BU, nx = Math.ceil(WORLD_SIZE / cell) + 1, nz = nx;
  const h = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = ix * cell, z = iz * cell;
    h[ix + iz * nx] = (fbm2(x / 220, z / 220, seed) - 0.5) * 16 + (fbm2(x / 60, z / 60, seed + 5) - 0.5) * 3;
  }
  return { x0: 0, z0: 0, cell, nx, nz, h };
}

export function buildWorld(seed = 7): SpikeWorld {
  const terrain = buildTerrain(seed);
  // temporary world for ground heights while placing primitives
  const tmp = new World(terrain, [], BLEND);
  const H = (x: number, z: number) => tmp.height(x, z);
  const minH = (x0: number, z0: number, x1: number, z1: number) => {
    let m = Infinity;
    for (let z = z0; z <= z1; z += 4) for (let x = x0; x <= x1; x += 4) m = Math.min(m, H(x, z));
    return m;
  };

  const prims: Primitive[] = [];
  // paving slab 300 x 40 x 300 mm (rounded box), bottom 2 mm below the lowest ground point under it
  {
    const cx = 500, cz = 470, hx = 150, hz = 150, hy = 20;
    const bottom = minH(cx - hx, cz - hz, cx + hx, cz + hz) - 2;
    prims.push({ name: 'slab', kind: 'roundbox', pos: [cx, bottom + hy, cz], rot: IDENTITY_ROT, size: [hx, hy, hz], round: 4, diggable: false, material: 'concrete' });
  }
  // stone: ellipsoid ~40 mm, half sunk
  prims.push({ name: 'stone', kind: 'ellipsoid', pos: [190, H(190, 170) + 5, 170], rot: rotY(0.6), size: [22, 14, 17], round: 0, diggable: false, material: 'stone' });
  // plant stem: vertical capsule r 2.5 mm, 150 mm above ground (continues 5 mm into the soil)
  {
    const x = 150, z = 400, g = H(x, z), top = g + 150, bot = g - 5;
    prims.push({ name: 'stem', kind: 'capsule', pos: [x, (top + bot) / 2, z], rot: IDENTITY_ROT, size: [2.5, (top - bot) / 2, 0], round: 0, diggable: false, material: 'plant' });
  }
  // small table: leg cylinder r 4 mm + top 70 x 6 x 70 mm (31 mm overhang all round), underside at ground + 50
  {
    const x = 250, z = 600, g = H(x, z);
    const legTop = g + 50, legBot = g - 4;
    prims.push({ name: 'table-leg', kind: 'cylinder', pos: [x, (legTop + legBot) / 2, z], rot: IDENTITY_ROT, size: [4, (legTop - legBot) / 2, 0], round: 0, diggable: false, material: 'wood' });
    prims.push({ name: 'table-top', kind: 'roundbox', pos: [x, legTop + 3, z], rot: IDENTITY_ROT, size: [35, 3, 35], round: 1, diggable: false, material: 'wood' });
  }
  // wall: tall box 24 x 150 x 500 mm, sunk 15 mm into the ground
  {
    const x = 45, z = 360, g = minH(x - 12, z - 250, x + 12, z + 250);
    prims.push({ name: 'wall', kind: 'roundbox', pos: [x, g - 15 + 75, z], rot: IDENTITY_ROT, size: [12, 75, 250], round: 2, diggable: false, material: 'plaster' });
  }

  const world = new World(terrain, prims, BLEND);
  const carve = new CarveGrid(VOXEL, RAMP);
  // breach = a carve sphere that crosses the SOIL surface (part inside, part outside)
  carve.breachTest = (x, y, z, r) => { const d = world.fSoil(x, y, z); return d > -r && d < r; };
  const field = new Field(world, carve, BLEND);
  const nest = generateNest(carve, H);
  return { world, carve, field, nest, seed };
}

/** Test nest (docs: slanted entrance shaft, ~2 BU tunnel to ~120 mm depth, three flattened chambers, a side branch,
 *  and a tunnel surfacing under the west edge of the paving slab). */
export function generateNest(carve: CarveGrid, H: (x: number, z: number) => number): NestInfo {
  const r = TUNNEL_R;
  const ex = 250, ez = 250, eg = H(ex, ez);
  const chambers: Chamber[] = [
    { name: 'C1', x: 312, y: -36, z: 280, rx: 20, ry: 6, rz: 20 },
    { name: 'C2', x: 266, y: -80, z: 344, rx: 20, ry: 6, rz: 20 },
    { name: 'C3', x: 306, y: -118, z: 402, rx: 20, ry: 6, rz: 20 },
  ];
  // tunnel centre lines enter chambers 2 mm above the chamber centre minus (ry - r) so floors are flush
  const fl = (c: Chamber) => c.y - c.ry + r; // tunnel-centre height for a floor-flush entry
  const slabEdgeX = 350, sg = H(slabEdgeX - 1, 352);
  const tunnels: NestInfo['tunnels'] = [
    { name: 'shaft', r, pts: [[ex, eg + 3, ez], [262, eg - 10, 258], [272, eg - 22, 264]] },
    { name: 'to-C1', r, pts: [[272, eg - 22, 264], [284, fl(chambers[0]) + 2, 270], [298, fl(chambers[0]), 276]] },
    { name: 'C1-C2', r, pts: [[310, fl(chambers[0]), 294], [316, -52, 316], [304, -66, 334], [288, fl(chambers[1]) + 1, 342], [276, fl(chambers[1]), 344]] },
    { name: 'branch', r, pts: [[304, -66, 334], [322, -70, 350], [334, -73, 370]] },
    { name: 'C2-C3', r, pts: [[262, fl(chambers[1]), 360], [264, -98, 380], [278, -110, 394], [294, fl(chambers[2]), 400]] },
    { name: 'C1-slab', r, pts: [[328, fl(chambers[0]), 284], [338, -26, 302], [345, -14, 322], [348, -5, 338], [slabEdgeX - 1, sg + 3, 352]] },
  ];
  for (const c of chambers) carve.carveEllipsoid(c.x, c.y, c.z, c.rx, c.ry, c.rz);
  for (const t of tunnels) for (let i = 0; i + 1 < t.pts.length; i++) {
    const a = t.pts[i], b = t.pts[i + 1];
    carve.carveTunnel(a[0], a[1], a[2], b[0], b[1], b[2], t.r, 1.0);
  }
  return { entrance: [ex, eg, ez], slabExit: [slabEdgeX - 1, sg, 352], chambers, tunnels };
}
