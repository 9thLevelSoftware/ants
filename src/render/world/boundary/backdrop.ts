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
import { makeSkirtHeight } from './skirtHeight';
import { BACKDROP_BAND_MM, BACKDROP_DENSITY_PER_M, BACKDROP_FENCE_KEEP, BACKDROP_HEX, BACKDROP_MARGIN_MM, BACKDROP_SIZE, FENCE_GAP_P, FENCE_HEIGHT_VARY, FOLIAGE_LUMP, FOLIAGE_SHADE } from './tuning';

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

  /** Placement reach of a lumpy foliage mass of nominal radius `r`: its largest lump. */
  const foliage = (r: number) => r * (1 + FOLIAGE_LUMP);
  /**
   * A foliage mass as a cluster of clumps (a core and a ring of smaller ones at random heights) so its silhouette is
   * ragged rather than one balloon; it stays within the radii it was given (x (1 + FOLIAGE_LUMP)).
   */
  const clumps = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, colour: string, seg: number) => {
    mb.ellipsoid(cx, cy, cz, rx * 0.7, ry * 0.7, rz * 0.7, seg, Math.ceil(seg * 0.65), hex(colour, rng), lumpy(), FOLIAGE_SHADE);
    const n = 4 + Math.floor(rngFloat(rng) * 3), a0 = rngFloat(rng) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + rngRange(rng, -0.3, 0.3), k = rngRange(rng, 0.38, 0.52), dy = rngRange(rng, -0.35, 0.35);
      mb.ellipsoid(cx + Math.cos(a) * rx * 0.45, cy + dy * ry, cz + Math.sin(a) * rz * 0.45, rx * k, ry * k, rz * k, 10, 6, hex(colour, rng), lumpy(), FOLIAGE_SHADE);
    }
    return 1 + n;
  };
  /** A trunk with root flare and taper, crowned by two or three overlapping lumpy masses reaching down to its crown base. */
  const tree = (r: EdgeRun, off: number) => {
    const d = rngRange(rng, B.trunkDiameter[0], B.trunkDiameter[1]), h = rngRange(rng, B.trunkHeight[0], B.trunkHeight[1]);
    const cr = rngRange(rng, B.canopyRadius[0], B.canopyRadius[1]), base = h * rngRange(rng, B.crownBase[0], B.crownBase[1]);
    const p = place(r, rngRange(rng, r.u0, r.u1), off, foliage(cr));
    const bark = hex(BACKDROP_HEX.bark, rng);
    mb.cylinder(p.x, p.y - 50, p.z, (d / 2) * B.rootFlare, p.y + 300, 12, bark, d / 2);
    mb.cylinder(p.x, p.y + 300, p.z, d / 2, p.y + h * 0.9, 12, bark, (d / 2) * B.trunkTaper);
    const masses = 2 + Math.floor(rngFloat(rng) * 2), crownH = h - base;
    for (let i = 0; i < masses; i++) {
      // masses step down from the top, each a little off the trunk axis (within the reserved reach)
      const t = masses === 1 ? 0 : i / (masses - 1), rr = cr * (1 - 0.3 * t), ry = Math.max(rr * 0.55, (crownH / masses) * 0.8);
      const ox = rngRange(rng, -0.25, 0.25) * (cr - rr), oz = rngRange(rng, -0.25, 0.25) * (cr - rr);
      const cy = p.y + h - ry - t * (crownH - 2 * ry);
      shapes += clumps(p.x + ox, cy, p.z + oz, rr, ry, rr, BACKDROP_HEX.canopy, 14);
    }
    shapes += 2;
  };
  const shrub = (r: EdgeRun, off: number) => {
    const rr = rngRange(rng, B.shrubRadius[0], B.shrubRadius[1]), kx = rngRange(rng, 0.9, 1.4), kz = rngRange(rng, 0.9, 1.4);
    const p = place(r, rngRange(rng, r.u0, r.u1), off, foliage(rr * Math.max(kx, kz)));
    shapes += clumps(p.x, p.y + rr * 0.55, p.z, rr * kx, rr, rr * kz, BACKDROP_HEX.shrub, 12);
  };
  /** A sapling or understorey stem: thin trunk, small crown well above ant height (woods). */
  const sapling = (r: EdgeRun, off: number) => {
    const h = rngRange(rng, B.saplingHeight[0], B.saplingHeight[1]), cr = rngRange(rng, B.saplingCrown[0], B.saplingCrown[1]);
    const p = place(r, rngRange(rng, r.u0, r.u1), off, foliage(cr));
    mb.cylinder(p.x, p.y - 20, p.z, rngRange(rng, 15, 40), p.y + h * 0.85, 6, hex(BACKDROP_HEX.bark, rng), 8);
    shapes += 1 + clumps(p.x, p.y + h - cr * 0.8, p.z, cr, cr * 0.8, cr, BACKDROP_HEX.shrub, 10);
  };
  /** Yaw that lays a box's local X along the edge. */
  const alongYaw = (r: EdgeRun) => (r.side.out.x !== 0 ? Math.PI / 2 : 0);

  for (const r of edgeRuns(world)) {
    const len = r.u1 - r.u0;
    if (r.treatment === 'house') {
      // look pass 3: a bare box read as a pale slab. A dark body behind a thin wall skin with window openings (two storeys), a plinth and a
      // roof with eaves. Nothing is layered over a face (parts closer than the depth buffer resolves at that distance flicker, and the
      // picture then changes between two renders of the same frame): the skin has real gaps and the glass is the recessed body.
      mb.keepNow = 1; // the facade keeps part of its colour through the haze (BACKDROP_KEEP_HAZE)
      const yaw = alongYaw(r), face = band('facade'), D = B.facadeDepth, H = B.facadeHeight, SKIN = B.facadeSkin;
      const cu = (r.u0 + r.u1) / 2, hw = len / 2 + 600;
      /** A box between along-edge offsets [a, b] from the centre line, heights [y0, y1] and depths [d0, d1] beyond the face. */
      const slab = (a: number, b: number, y0: number, y1: number, d0: number, d1: number, col: string) => {
        const q = place(r, cu + (a + b) / 2, face + (d0 + d1) / 2, 0);
        mb.box(q.x, q.y + (y0 + y1) / 2, q.z, (b - a) / 2, (y1 - y0) / 2, (d1 - d0) / 2, yaw, hex(col, rng, 0.04));
        shapes++;
      };
      const nWin = Math.max(1, Math.round(len / B.facadeWindowPitch)), ww = B.facadeWindow[0], wh = B.facadeWindow[1];
      const centres = Array.from({ length: nWin }, (_, i) => -len / 2 + ((i + 0.5) / nWin) * len);
      const rows = B.facadeWindowY.map((y) => [y - wh / 2, y + wh / 2] as const);
      slab(-hw + 100, hw - 100, 0, H, SKIN, D, BACKDROP_HEX.glass);
      slab(-hw - 260, hw + 260, H, H + 320, -260, D + 260, BACKDROP_HEX.roof);
      slab(-hw, hw, 0, B.facadePlinth, 0, SKIN, BACKDROP_HEX.plinth);
      let y: number = B.facadePlinth;
      for (const [lo, hi] of rows) {
        slab(-hw, hw, y, lo, 0, SKIN, BACKDROP_HEX.facade); // the band under this row of windows
        let x = -hw;
        for (const c of centres) { slab(x, c - ww / 2, lo, hi, 0, SKIN, BACKDROP_HEX.facade); x = c + ww / 2; } // the piers between them
        slab(x, hw, lo, hi, 0, SKIN, BACKDROP_HEX.facade);
        y = hi;
      }
      slab(-hw, hw, y, H, 0, SKIN, BACKDROP_HEX.facade);
      mb.keepNow = 0;
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
        const p = place(r, r.u0 + ((i + 0.5) / n) * len, off, foliage(hd / 2));
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
      for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.understorey); i < n; i++) sapling(r, band('understorey'));
      continue;
    }
    // garden: the neighbour's shrubs, a fence line farther out, a few trees
    for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.shrubs * 0.7); i < n; i++) shrub(r, band('shrubs'));
    const f = B.fencePanel, fOff = band('fence'), panels = count(r, BACKDROP_DENSITY_PER_M.fence);
    /** One panel of upright boards with a gap between them, a post at each end: a fence reads as a fence, not as a slab. Returns the shape count. */
    const fencePanel = (p: { x: number; y: number; z: number }, halfW: number, along: boolean, height: number): number => {
      mb.keepNow = BACKDROP_FENCE_KEEP;
      const n = Math.max(1, Math.round((2 * halfW) / f.board)), pitch = (2 * halfW) / n, hw = Math.max(5, pitch / 2 - f.gap / 2);
      for (let j = 0; j < n; j++) {
        const o = -halfW + (j + 0.5) * pitch, h = height + rngRange(rng, -f.boardJitter, 0);
        mb.box(p.x + (along ? 0 : o), p.y + h / 2, p.z + (along ? o : 0), along ? f.thick : hw, h / 2, along ? hw : f.thick, 0, hex(BACKDROP_HEX.fence, rng, 0.1));
      }
      for (const o of [-halfW, halfW]) {
        mb.box(p.x + (along ? 0 : o), p.y + (height + 80) / 2, p.z + (along ? o : 0), along ? f.post / 2 : f.post / 2, (height + 80) / 2, f.post / 2, 0, hex(BACKDROP_HEX.fencePost, rng, 0.06));
      }
      mb.keepNow = 0;
      return n + 2;
    };
    for (let i = 0; i < panels; i++) {
      const p = place(r, r.u0 + ((i + 0.5) / panels) * len, fOff, f.thick);
      const pw = len / panels / 2;
      const along = r.side.out.x !== 0;
      // look-pass 2: a fence is not one ruler-straight band: panels differ a little in height and the odd one is missing
      const hk = rngRange(rng, FENCE_HEIGHT_VARY[0], FENCE_HEIGHT_VARY[1]), gone = rngFloat(rng) < FENCE_GAP_P;
      if (gone) continue;
      shapes += fencePanel(p, pw, along, f.height * hk);
    }
    for (let i = 0, n = count(r, BACKDROP_DENSITY_PER_M.trees * 0.4); i < n; i++) tree(r, band('gardenTrees'));
  }
  return { mesh: mb, stats: { shapes, triangles: mb.triangleCount } };
}
