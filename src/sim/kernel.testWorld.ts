// Small deterministic worlds for kernel tests and the kernel demo page (pure, no three).
// Port of the nest spike's scene (spikes/nest/sim/scene.ts) onto the shared geom types: ~700 mm terrain with
// gentle relief, a paving slab, a stone, a plant stem, a small table and a wall, plus a code-generated test
// nest (slanted entrance shaft, 2 BU tunnels, three flattened chambers, a blind branch, an exit under the slab).

import type { ByteMap, GroundLayers, HeightField, MaterialId, PrimShape, Primitive } from '@/sim/types/geom';
import { materialCode, PrimFlag } from '@/sim/types/geom';
import type { CarveData } from '@/sim/types/geom';
import type { Vec3 } from '@/core/math/vec3';
import { fbm2 } from '@/core/math/noise';
import type { KernelWorldInput } from './kernel';
import { heightAt } from './world/terrainSample';

export const TEST_BU = 4;

export function makeHeightField(size: number, cell: number, h: (x: number, z: number) => number): HeightField {
  const nx = Math.ceil(size / cell) + 1, nz = nx;
  const data = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = h(ix * cell, iz * cell);
  return { cell, nx, nz, data };
}

export function makeByteMap(size: number, cell: number, value: (x: number, z: number) => number): ByteMap {
  const nx = Math.ceil(size / cell), nz = nx;
  const data = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = value((ix + 0.5) * cell, (iz + 0.5) * cell);
  return { cell, nx, nz, data };
}

/** Uniform ground (optionally with a crust region given by a predicate). */
export function makeGround(size: number, cell: number, surface: MaterialId = 'loam', subsoil: MaterialId = 'loam',
  crust?: { where: (x: number, z: number) => boolean; material: MaterialId; mm: number }): GroundLayers {
  return {
    surface: makeByteMap(size, cell, (x, z) => materialCode(crust && crust.where(x, z) ? crust.material : surface)),
    crustMm: makeByteMap(size, cell, (x, z) => (crust && crust.where(x, z) ? crust.mm : 0)),
    subsoil: makeByteMap(size, cell, () => materialCode(subsoil)),
  };
}

/** Quaternion for a rotation of `a` radians about +Y. */
export function rotY(a: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}

export function makePrim(id: number, shape: PrimShape, pos: Vec3, size: Vec3,
  o: { round?: number; material?: MaterialId; flags?: number; yaw?: number; rot?: { x: number; y: number; z: number; w: number } } = {}): Primitive {
  return {
    id, shape, pos: { ...pos }, rot: o.rot ?? rotY(o.yaw ?? 0), size: { ...size }, round: o.round ?? 0,
    material: o.material ?? 'stone', flags: o.flags ?? PrimFlag.CLIMBABLE, objectId: -1,
  };
}

export function emptyCarve(bu: number): CarveData {
  return { voxel: bu / 2, keys: [], chunks: [], breaches: [] };
}

/** Flat world (ground at y = h0) with optional primitives. */
export function makeFlatWorld(o: { size?: number; bu?: number; h0?: number; prims?: Primitive[]; holes?: ByteMap } = {}): KernelWorldInput {
  const bu = o.bu ?? TEST_BU, size = o.size ?? 400, cell = 4 * bu, h0 = o.h0 ?? 0;
  return {
    size, bu, terrain: makeHeightField(size, cell, () => h0), ground: makeGround(size, cell),
    prims: o.prims ?? [], terrainHoles: o.holes,
  };
}

// ---- the spike scene ---------------------------------------------------------------------------------------

export interface TestChamber { name: string; c: Vec3; r: Vec3 }
export interface TestNest {
  entrance: Vec3;
  slabExit: Vec3;
  chambers: TestChamber[];
  tunnels: { name: string; r: number; pts: Vec3[] }[];
}

export interface SceneWorld {
  world: KernelWorldInput;
  nest: TestNest;
  /** Primitive ids by name. */
  ids: Record<'slab' | 'stone' | 'stem' | 'tableLeg' | 'tableTop' | 'wall', number>;
}

export const SCENE_SIZE = 700;

/** The nest spike's scene at BU = 4 (mm values are the spike's). The nest is carved by carveTestNest(). */
export function makeSceneWorld(seed = 7): SceneWorld {
  const bu = TEST_BU, cell = 4 * bu;
  const terrain = makeHeightField(SCENE_SIZE, cell, (x, z) =>
    fbm2(x / 220, z / 220, seed, 4) * 8 + fbm2(x / 60, z / 60, seed + 5, 3) * 1.5);
  const H = (x: number, z: number) => heightAt(terrain, x, z);
  const minH = (x0: number, z0: number, x1: number, z1: number) => {
    let m = Infinity;
    for (let z = z0; z <= z1; z += 4) for (let x = x0; x <= x1; x += 4) m = Math.min(m, H(x, z));
    return m;
  };
  const prims: Primitive[] = [];
  const v = (x: number, y: number, z: number) => ({ x, y, z });
  // paving slab 300 x 40 x 300 mm, bottom 2 mm below the lowest ground point under it
  const slabBottom = minH(350, 320, 650, 620) - 2;
  prims.push(makePrim(1, 'box', v(500, slabBottom + 20, 470), v(150, 20, 150), { round: 4, material: 'concrete', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER }));
  prims.push(makePrim(2, 'ellipsoid', v(190, H(190, 170) + 5, 170), v(22, 14, 17), { yaw: 0.6, material: 'stone' }));
  {
    const x = 150, z = 400, g = H(x, z), top = g + 150, bot = g - 5;
    prims.push(makePrim(3, 'capsule', v(x, (top + bot) / 2, z), v(2.5, (top - bot) / 2 - 2.5, 0), { material: 'plant' }));
  }
  {
    const x = 250, z = 600, g = H(x, z), legTop = g + 50, legBot = g - 4;
    prims.push(makePrim(4, 'cylinder', v(x, (legTop + legBot) / 2, z), v(4, (legTop - legBot) / 2, 0), { material: 'wood-sound' }));
    prims.push(makePrim(5, 'box', v(x, legTop + 3, z), v(35, 3, 35), { round: 1, material: 'wood-sound', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER }));
  }
  {
    const x = 45, z = 360, g = minH(x - 12, z - 250, x + 12, z + 250);
    prims.push(makePrim(6, 'box', v(x, g - 15 + 75, z), v(12, 75, 250), { round: 2, material: 'plaster' }));
  }
  // a hard asphalt crust in a strip at the far side, loam elsewhere
  const ground = makeGround(SCENE_SIZE, cell, 'loam', 'loam', { where: (x) => x > 620, material: 'asphalt', mm: 6 });
  const world: KernelWorldInput = { size: SCENE_SIZE, bu, terrain, ground, prims };
  return {
    world, nest: planTestNest(H),
    ids: { slab: 1, stone: 2, stem: 3, tableLeg: 4, tableTop: 5, wall: 6 },
  };
}

/** Geometry of the spike's test nest (mm, BU = 4). */
export function planTestNest(H: (x: number, z: number) => number): TestNest {
  const r = TEST_BU; // 2 BU wide tunnels
  const v = (x: number, y: number, z: number) => ({ x, y, z });
  const ex = 250, ez = 250, eg = H(ex, ez);
  const chambers: TestChamber[] = [
    { name: 'C1', c: v(312, -36, 280), r: v(20, 6, 20) },
    { name: 'C2', c: v(266, -80, 344), r: v(20, 6, 20) },
    { name: 'C3', c: v(306, -118, 402), r: v(20, 6, 20) },
  ];
  const fl = (c: TestChamber) => c.c.y - c.r.y + r; // tunnel-centre height for a floor-flush entry
  const slabEdgeX = 350, sg = H(slabEdgeX - 1, 352);
  const [c1, c2, c3] = chambers;
  const tunnels = [
    { name: 'shaft', r, pts: [v(ex, eg + 3, ez), v(262, eg - 10, 258), v(272, eg - 22, 264)] },
    { name: 'to-C1', r, pts: [v(272, eg - 22, 264), v(284, fl(c1) + 2, 270), v(298, fl(c1), 276)] },
    { name: 'C1-C2', r, pts: [v(310, fl(c1), 294), v(316, -52, 316), v(304, -66, 334), v(288, fl(c2) + 1, 342), v(276, fl(c2), 344)] },
    { name: 'branch', r, pts: [v(304, -66, 334), v(322, -70, 350), v(334, -73, 370)] },
    { name: 'C2-C3', r, pts: [v(262, fl(c2), 360), v(264, -98, 380), v(278, -110, 394), v(294, fl(c3), 400)] },
    { name: 'C1-slab', r, pts: [v(328, fl(c1), 284), v(338, -26, 302), v(345, -14, 322), v(348, -5, 338), v(slabEdgeX - 1, sg + 3, 352)] },
  ];
  return { entrance: v(ex, eg, ez), slabExit: v(slabEdgeX - 1, sg, 352), chambers, tunnels };
}

/** Minimal brush interface (kernel or carve grid) used to carve the test nest. */
export interface NestCarver {
  carveCapsule(a: Vec3, b: Vec3, r: number, opts?: { force?: boolean }): unknown;
  carveEllipsoid(c: Vec3, radii: Vec3, opts?: { force?: boolean }): unknown;
}

/** Carves the test nest as a world-generation pre-carve (force). */
export function carveTestNest(carver: NestCarver, nest: TestNest): void {
  for (const c of nest.chambers) carver.carveEllipsoid(c.c, c.r, { force: true });
  for (const t of nest.tunnels) for (let i = 0; i + 1 < t.pts.length; i++) carver.carveCapsule(t.pts[i], t.pts[i + 1], t.r, { force: true });
}
