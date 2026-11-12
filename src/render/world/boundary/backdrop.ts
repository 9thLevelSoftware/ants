// Giant backdrop shapes beyond the map edge (GDD 04 §14: low-detail impostors continuing the edge treatment): trees
// beyond a forest edge, a hedge beyond the playground, a neighbouring garden's shrubs and fence, parked cars along a
// road, the rest of the house beyond an interior. Sizes are real-world millimetres; the haze turns them into soft
// silhouettes ("selling the scale", GDD 08 11.7). Deterministic from the world seed.
import { Color } from 'three';
import { rngFloat, rngFork, rngRange, type RngState } from '@/core/rng';
import { fbm3 } from '@/core/math/noise';
import type { WorldData, ZoneType } from '@/sim/types';
import { zoneTypeAt } from '../lighting/simAdapter';
import { MeshBuilder } from './meshBuilder';
import { makeSkirtHeight } from './skirt';
import { BACKDROP_BAND_MM, BACKDROP_DENSITY_PER_M, BACKDROP_HEX, BACKDROP_MARGIN_MM, BACKDROP_SIZE, FOLIAGE_LUMP, FOLIAGE_SHADE } from './tuning';

export type EdgeTreatment = 'woods' | 'garden' | 'park' | 'road' | 'house';

/** One side of the map: where it is, which way is outward and which way runs along it. */
export interface Side {
  index: 0 | 1 | 2 | 3;
  /** Point on the edge at along-coordinate u (mm). */
  at(u: number): { x: number; z: number };
  /** Outward unit normal (x, z). */
  out: { x: number; z: number };
}

export function sides(size: number): Side[] {
  return [
    { index: 0, at: (u) => ({ x: u, z: 0 }), out: { x: 0, z: -1 } },
    { index: 1, at: (u) => ({ x: size, z: u }), out: { x: 1, z: 0 } },
    { index: 2, at: (u) => ({ x: u, z: size }), out: { x: 0, z: 1 } },
    { index: 3, at: (u) => ({ x: 0, z: u }), out: { x: -1, z: 0 } },
  ];
}

const TREATMENT: Record<ZoneType, EdgeTreatment> = {
  forest: 'woods', lawn: 'garden', 'garden-bed': 'garden', pavement: 'garden', asphalt: 'road', sand: 'park', rubber: 'park', interior: 'house',
};

/** A run of one treatment along a side, [u0, u1] mm. */
export interface EdgeRun { side: Side; treatment: EdgeTreatment; u0: number; u1: number }

/** Samples the zones just inside each edge and merges neighbours with the same treatment into runs. */
export function edgeRuns(world: WorldData, samplesPerSide = 24): EdgeRun[] {
  const S = world.size, inset = Math.max(world.maps.zone.cell * 0.5, world.bu);
  const runs: EdgeRun[] = [];
  for (const side of sides(S)) {
    let cur: EdgeRun | null = null;
    for (let i = 0; i < samplesPerSide; i++) {
      const u0 = (i / samplesPerSide) * S, u1 = ((i + 1) / samplesPerSide) * S, p = side.at((u0 + u1) / 2);
      const t = TREATMENT[zoneTypeAt(world, p.x - side.out.x * inset, p.z - side.out.z * inset)] ?? 'garden';
      if (cur && cur.treatment === t) cur.u1 = u1;
      else { cur = { side, treatment: t, u0, u1 }; runs.push(cur); }
    }
  }
  return runs;
}

export interface BackdropStats { shapes: number; triangles: number }

const _c = new Color();
const hex = (h: string, rng: RngState, vary = 0.12) => {
  _c.set(h);
  const k = 1 - vary + 2 * vary * rngFloat(rng);
  return _c.multiplyScalar(k);
};

/** Builds every backdrop shape of a world into one MeshBuilder. */
export function buildBackdrop(world: WorldData): { mesh: MeshBuilder; stats: BackdropStats } {
  const S = world.size;
  const ground = makeSkirtHeight(world);
  const rng = rngFork(world.params.seed | 0, 'render-boundary-backdrop');
  const mb = new MeshBuilder();
  let shapes = 0;
  const band = (k: keyof typeof BACKDROP_BAND_MM) => rngRange(rng, BACKDROP_BAND_MM[k][0], BACKDROP_BAND_MM[k][1]);
  /** A point `off` mm beyond the edge, pushed out so a shape reaching `reach` mm toward the map stays outside it. */
  const place = (r: EdgeRun, u: number, off: number, reach = 0) => {
    off = Math.max(off, reach + BACKDROP_MARGIN_MM);
    const p = r.side.at(u);
    const x = p.x + r.side.out.x * off, z = p.z + r.side.out.z * off;
    return { x, z, y: ground(x, z) };
  };
  const count = (r: EdgeRun, perM: number) => Math.max(0, Math.round(((r.u1 - r.u0) / 1000) * perM));
  const B = BACKDROP_SIZE;
  /** Lumpy foliage: a per-shape noise seed, radius x (1 +- FOLIAGE_LUMP). */
  const lumpy = () => {
    const sd = Math.floor(rngFloat(rng) * 1e6);
    return (ux: number, uy: number, uz: number) => 1 + FOLIAGE_LUMP * fbm3(ux * 1.7, uy * 1.7, uz * 1.7, sd, 3);
  };

  const tree = (r: EdgeRun, off: number) => {
    const d = rngRange(rng, B.trunkDiameter[0], B.trunkDiameter[1]), h = rngRange(rng, B.trunkHeight[0], B.trunkHeight[1]);
    const cr = rngRange(rng, B.canopyRadius[0], B.canopyRadius[1]);
    const p = place(r, rngRange(rng, r.u0, r.u1), off, cr);
    mb.cylinder(p.x, p.y - 50, p.z, d / 2, p.y + h, 10, hex(BACKDROP_HEX.bark, rng));
    mb.ellipsoid(p.x, p.y + h * 0.85, p.z, cr, cr * 0.7, cr, 14, 9, hex(BACKDROP_HEX.canopy, rng), lumpy(), FOLIAGE_SHADE);
    shapes += 2;
  };
  const shrub = (r: EdgeRun, off: number) => {
    const rr = rngRange(rng, B.shrubRadius[0], B.shrubRadius[1]), kx = rngRange(rng, 0.9, 1.4), kz = rngRange(rng, 0.9, 1.4);
    const p = place(r, rngRange(rng, r.u0, r.u1), off, rr * Math.max(kx, kz));
    mb.ellipsoid(p.x, p.y + rr * 0.55, p.z, rr * kx, rr, rr * kz, 12, 8, hex(BACKDROP_HEX.shrub, rng), lumpy(), FOLIAGE_SHADE);
    shapes++;
  };
  /** Yaw that lays a box's local X along the edge. */
  const alongYaw = (r: EdgeRun) => (r.side.out.x !== 0 ? Math.PI / 2 : 0);

  for (const r of edgeRuns(world)) {
    const len = r.u1 - r.u0;
    if (r.treatment === 'house') {
      const p = place(r, (r.u0 + r.u1) / 2, band('facade') + B.facadeDepth / 2, B.facadeDepth / 2);
      const hw = len / 2 + 600, hh = B.facadeHeight / 2;
      mb.box(p.x, p.y + hh, p.z, hw, hh, B.facadeDepth / 2, alongYaw(r), hex(BACKDROP_HEX.facade, rng, 0.05));
      shapes++;
      continue;
    }
    if (r.treatment === 'road') {
      const n = count(r, BACKDROP_DENSITY_PER_M.cars);
      for (let i = 0; i < n; i++) {
        const car = B.car;
        const p = place(r, r.u0 + ((i + 0.5) / n) * len + rngRange(rng, -400, 400), band('cars'), car.width / 2 + 0.08 * car.length / 2); // yaw jitter swings a corner inward
        const cols = BACKDROP_HEX.car, col = cols[Math.floor(rngFloat(rng) * cols.length) % cols.length];
        const yaw = alongYaw(r) + rngRange(rng, -0.08, 0.08);
        mb.box(p.x, p.y + car.height * 0.32, p.z, car.length / 2, car.height * 0.3, car.width / 2, yaw, hex(col, rng, 0.06));
        mb.box(p.x, p.y + car.height * 0.78, p.z, car.length * 0.3, car.height * 0.2, car.width * 0.45, yaw, hex(col, rng, 0.06));
        shapes += 2;
      }
      for (let i = 0, n2 = count(r, BACKDROP_DENSITY_PER_M.trees * 0.5); i < n2; i++) tree(r, band('roadTrees'));
      continue;
    }
    if (r.treatment === 'park') {
      const n = count(r, BACKDROP_DENSITY_PER_M.hedge), off = band('hedge');
      const hh = rngRange(rng, B.hedgeHeight[0], B.hedgeHeight[1]), hd = rngRange(rng, B.hedgeDepth[0], B.hedgeDepth[1]);
      for (let i = 0; i < n; i++) {
        const p = place(r, r.u0 + ((i + 0.5) / n) * len, off, hd / 2);
        const rx = (len / n) * 0.75, cx = r.side.out.x !== 0 ? hd / 2 : rx, cz = r.side.out.x !== 0 ? rx : hd / 2;
        mb.ellipsoid(p.x, p.y + hh * 0.5, p.z, cx, hh * 0.55, cz, 12, 8, hex(BACKDROP_HEX.hedge, rng, 0.08), lumpy(), FOLIAGE_SHADE);
        shapes++;
      }
      for (let i = 0, n2 = count(r, BACKDROP_DENSITY_PER_M.trees * 0.6); i < n2; i++) tree(r, band('trees'));
      continue;
    }
    if (r.treatment === 'woods') {
      for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.trees); i < n; i++) tree(r, band('trees'));
      for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.shrubs); i < n; i++) shrub(r, band('shrubs'));
      continue;
    }
    // garden: the neighbour's shrubs, a fence line farther out, a few trees
    for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.shrubs * 0.7); i < n; i++) shrub(r, band('shrubs'));
    const f = B.fencePanel, fOff = band('fence'), panels = count(r, BACKDROP_DENSITY_PER_M.fence);
    for (let i = 0; i < panels; i++) {
      const p = place(r, r.u0 + ((i + 0.5) / panels) * len, fOff, f.thick);
      const pw = len / panels / 2;
      const along = r.side.out.x !== 0;
      mb.box(p.x, p.y + f.height / 2, p.z, along ? f.thick : pw, f.height / 2, along ? pw : f.thick, 0, hex(BACKDROP_HEX.fence, rng, 0.05));
      shapes++;
    }
    for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.trees * 0.4); i < n; i++) tree(r, band('gardenTrees'));
  }
  return { mesh: mb, stats: { shapes, triangles: mb.triangleCount } };
}
