/**
 * Test world for the nest renderer demo: a 1.6 m Lasius plot (BU 4 mm) with gentle loam relief, a decayed log lying on
 * the ground with a gallery carved through it, a stone and a buried stone, and a nest generated from a seed: a
 * slanted entrance shaft, 2 BU tunnels winding down to four flattened chambers, a blind branch, a second entrance,
 * and a tunnel up into the log. Everything is carved as a world-generation pre-carve (force) through the kernel.
 */
import type { Primitive, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { fbm2 } from '@/core/math/noise';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';
import { createKernel, type Kernel } from '@/sim/kernel';
import { emptyCarve } from '@/sim/kernel.testWorld';

export const BU = 4;
export const SIZE = 1600;

export interface Feature { name: string; pts: Vec3[]; r: number }
export interface Chamber { name: string; c: Vec3; r: Vec3 }

export interface DemoNest {
  entrance: Vec3;
  entrance2: Vec3;
  chambers: Chamber[];
  tunnels: Feature[];
  log: { a: Vec3; b: Vec3; r: number; gallery: Feature };
  /** Where the scripted dig starts (a chamber wall) and its direction. */
  digStart: Vec3;
  digDir: Vec3;
}

export function terrainHeight(x: number, z: number): number {
  return fbm2(x / 500, z / 500, 3, 4) * 10 + fbm2(x / 70, z / 70, 9, 3) * 1.2;
}

/** Small seeded generator (demo only; the simulation uses src/core/rng). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Tunnel polyline from a to b that wanders sideways (seeded), n segments. */
function wander(rnd: () => number, a: Vec3, b: Vec3, n: number, amp: number): Vec3[] {
  const pts: Vec3[] = [a];
  for (let i = 1; i < n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t);
    pts.push(v(a.x + (b.x - a.x) * t + (rnd() - 0.5) * amp * s, a.y + (b.y - a.y) * t + (rnd() - 0.5) * amp * 0.3 * s, a.z + (b.z - a.z) * t + (rnd() - 0.5) * amp * s));
  }
  pts.push(b);
  return pts;
}

export function planNest(seed: number): DemoNest {
  const rnd = mulberry(seed);
  const H = terrainHeight;
  const r = BU; // 2 BU wide tunnels
  const ex = 800, ez = 760, eg = H(ex, ez);
  const chambers: Chamber[] = [
    { name: 'C1', c: v(860, eg - 38, 800), r: v(22, 6.5, 18) },
    { name: 'C2', c: v(800, eg - 82, 870), r: v(24, 7, 20) },
    { name: 'C3', c: v(880, eg - 122, 930), r: v(20, 6.5, 22) },
    { name: 'C4', c: v(760, eg - 150, 980), r: v(26, 7, 18) },
  ];
  const floor = (c: Chamber) => v(c.c.x, c.c.y - c.r.y + r, c.c.z);
  const edge = (c: Chamber, dx: number, dz: number) => v(c.c.x + dx * c.r.x * 0.85, c.c.y - c.r.y + r, c.c.z + dz * c.r.z * 0.85);
  const [c1, c2, c3, c4] = chambers;
  const j1 = v(828, eg - 24, 778);
  const tunnels: Feature[] = [
    { name: 'shaft', r: r * 1.05, pts: [v(ex, eg + 3, ez), v(808, eg - 8, 766), v(818, eg - 16, 772), j1] },
    { name: 'to-C1', r, pts: wander(rnd, j1, edge(c1, -0.8, -0.3), 3, 6) },
    { name: 'C1-C2', r, pts: wander(rnd, edge(c1, -0.5, 0.8), edge(c2, 0.6, -0.7), 6, 14) },
    { name: 'C2-C3', r, pts: wander(rnd, edge(c2, 0.8, 0.4), edge(c3, -0.7, -0.6), 6, 14) },
    { name: 'C3-C4', r, pts: wander(rnd, edge(c3, -0.6, 0.7), edge(c4, 0.7, -0.2), 5, 12) },
    { name: 'branch', r, pts: wander(rnd, edge(c2, -0.7, 0.5), v(735, eg - 95, 905), 4, 10) },
    { name: 'exit2', r, pts: [edge(c1, 0.8, -0.6), v(895, eg - 26, 770), v(905, eg - 12, 742), v(910, H(910, 728) + 3, 728)] },
  ];
  // the decayed log lies across x 560..760 at z 900, half sunk into the ground; a gallery runs inside it
  const lz = 880, lx0 = 560, lx1 = 740, lr = 13;
  const lg = Math.min(H(lx0, lz), H(lx1, lz), H((lx0 + lx1) / 2, lz));
  const ly = lg + lr - 6;
  // the gallery is a dead end in the wood at its far end; it is entered from the soil below its near end
  const gallery: Feature = { name: 'log-gallery', r: r * 0.95, pts: [v(lx0 + 30, ly - 1, lz), v(640, ly + 0.5, lz + 2), v(lx1 - 30, ly, lz - 1)] };
  tunnels.push(
    gallery,
    { name: 'log-down', r, pts: [v(lx0 + 30, ly - 1, lz), v(lx0 + 34, ly - 22, lz - 4), v(700, eg - 50, 870), floor(c2)] },
  );
  const digStart = v(c3.c.x + c3.r.x * 0.8, c3.c.y - 1, c3.c.z + 4);
  return {
    entrance: v(ex, eg, ez), entrance2: v(910, H(910, 728), 728), chambers, tunnels,
    log: { a: v(lx0, ly, lz), b: v(lx1, ly, lz), r: lr, gallery }, digStart, digDir: v(1, -0.12, 0.25),
  };
}

export interface DemoWorld {
  world: WorldData;
  kernel: Kernel;
  nest: DemoNest;
}

export function buildDemoWorld(seed = 7): DemoWorld {
  const nest = planNest(seed);
  const L = nest.log;
  const half = (L.b.x - L.a.x) / 2;
  const s = Math.SQRT1_2;
  const prims: Primitive[] = [
    {
      id: 1, shape: 'cylinder', pos: v((L.a.x + L.b.x) / 2, L.a.y, L.a.z), rot: { x: 0, y: 0, z: s, w: s }, size: v(L.r, half, 0), round: 3,
      material: 'wood-decayed', flags: PrimFlag.DIGGABLE | PrimFlag.CLIMBABLE, objectId: -1,
    },
    {
      id: 2, shape: 'ellipsoid', pos: v(760, terrainHeight(760, 720) + 4, 720), rot: { x: 0, y: 0.3, z: 0, w: 0.954 }, size: v(18, 11, 14), round: 0,
      material: 'stone', flags: PrimFlag.CLIMBABLE, objectId: -1,
    },
    {
      id: 3, shape: 'ellipsoid', pos: v(838, nest.chambers[1].c.y + 12, 860), rot: { x: 0, y: 0, z: 0, w: 1 }, size: v(12, 8, 10), round: 0,
      material: 'stone', flags: 0, objectId: -1,
    },
  ];
  const world = buildWorld({ params: defaultWorldParams('lasius-niger', seed), size: SIZE, bu: BU, height: terrainHeight, prims, surface: 'loam', subsoil: 'loam' });
  const kernel = createKernel(world, emptyCarve(BU));
  for (const c of nest.chambers) kernel.carveEllipsoid(c.c, c.r, { force: true });
  for (const t of nest.tunnels) for (let i = 0; i + 1 < t.pts.length; i++) kernel.carveCapsule(t.pts[i], t.pts[i + 1], t.r, { force: true });
  return { world, kernel, nest };
}
