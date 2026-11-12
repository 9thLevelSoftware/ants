// The world field f(p): signed pseudo-distance in mm, POSITIVE in free space (air or carved cavity), negative
// inside solids (docs/01-design-seed.md §3). Everything that walks, digs, looks or collides queries it.
//
//   f = smin( smax(fSoil, fCavity, k), fHard, k )          (nest spike formula, k = 0.375 BU)
//
// - fSoil  (DIGGABLE group): terrain (slope-corrected bilinear height, minus terrain holes) and primitives for
//          which isDiggablePrim() is true. Carved space opens only this group.
// - fCavity: carve grid pseudo-distance, > 0 inside carved space, saturating at +-ramp/2 (= 0.5 BU).
// - fHard  (HARD group): every other primitive. A tunnel under a paving slab gets the slab as its ceiling.
// The seed formula max(fSubstrate, fCavity) is the k -> 0 limit when everything is diggable.
// Terrain LAYERS (hard crusts, hard subsoil) are protected at carve time by the kernel's dig predicate rather
// than by the field grouping, so world-generation pre-carves (force) can open cracks through a crust
// (directions §K, "two kinds of pre-existing passage"). See docs/design/tdd/02-kernel.md.
//
// Gradients are analytic (terrain plane normal, primitive SDF gradients, trilinear carve derivative, chained
// through smin/smax). Hot paths (sample, gradient, project) allocate nothing.

import type { MaterialId, Primitive } from '@/sim/types/geom';
import { materialFromCode, PrimFlag } from '@/sim/types/geom';
import type { Vec3 } from '@/core/math/vec3';
import type { CarveGrid } from '@/sim/nest/carve/grid';
import type { KernelWorldInput } from '@/sim/kernel';
import { byteAt, dilateHoles, heightAt, heightSlope as heightSlopeImp, holeDistance as holeDistanceImp, type Grad2, type HeightSlope } from './terrainSample';
import { makePrimEntry, primEval, primEvalInto as primEvalIntoImp, PRIM_D as PRIM_DImp, PrimHash, type PrimEntry } from './primHash';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const heightSlope = heightSlopeImp, holeDistance = holeDistanceImp, primEvalInto = primEvalIntoImp, PRIM_D = PRIM_DImp;

/** Field tuning in BU (scaled by the species' body unit). Values from docs/research/spike-nest.md §4. */
export const FIELD_TUNING = {
  /** Smooth min/max width k (fillets concave corners; floats walkers <= k/4 higher in corners). */
  blendBU: 0.375,
  /** Primitive hash cell and margin (margin = guaranteed free distance from unlisted primitives). */
  hashCellBU: 8,
  hashMarginBU: 4,
  /** project(): convergence tolerance and iterations. */
  projTolBU: 0.001,
  projIters: 12,
  /** project(): extra Newton step allowance beyond 1.5 |f - offset|. */
  projSlackBU: 0.05,
  /** project(): search radius of the fallback probe used where the gradient vanishes (saturated cavity). */
  probeDistBU: 3,
  /**
   * Probe directions: the normalised points of the cube surface with coordinates in {-1, -c, 0, c, 1} (98 rays).
   * c = 0.4 leaves no direction more than 14.5 degrees from a ray, so a standard tunnel (level-set radius
   * ~0.85 BU) is hit from up to ~2.5 BU away from its level set. sqrt-only construction: bit-identical everywhere.
   */
  probeDirCoord: 0.4,
  /** sphereTrace(): step = safety * distance, minimum step, iteration cap. */
  traceSafety: 0.9,
  traceMinStepBU: 0.005,
  traceMaxIters: 512,
  /** materialAt(): a primitive within this distance decides the material. */
  materialPrimDistBU: 0.25,
  /** isHoleAt(): depth below the terrain surface that must be free. */
  holeProbeDepthBU: 0.1,
} as const;

export interface FieldParams {
  blend: number; hashCell: number; hashMargin: number;
  projTol: number; projIters: number; projSlack: number; probeDist: number;
  traceSafety: number; traceMinStep: number; traceMaxIters: number;
  materialPrimDist: number; holeProbeDepth: number;
}

export function fieldParamsForBU(bu: number): FieldParams {
  const T = FIELD_TUNING;
  return {
    blend: T.blendBU * bu, hashCell: T.hashCellBU * bu, hashMargin: T.hashMarginBU * bu,
    projTol: T.projTolBU * bu, projIters: T.projIters, projSlack: T.projSlackBU * bu, probeDist: T.probeDistBU * bu,
    traceSafety: T.traceSafety, traceMinStep: T.traceMinStepBU * bu, traceMaxIters: T.traceMaxIters,
    materialPrimDist: T.materialPrimDistBU * bu, holeProbeDepth: T.holeProbeDepthBU * bu,
  };
}

export interface FieldOptions {
  /** Primitives in the diggable group. Default: the DIGGABLE flag is set. */
  isDiggablePrim?: (p: Primitive) => boolean;
  params?: Partial<FieldParams>;
}

/** The world field service (contract). All lengths mm; "free" distances are > 0 in open space. */
export interface WorldField {
  readonly bu: number;
  /** World edge length, mm. */
  readonly size: number;
  readonly params: FieldParams;
  readonly carve: CarveGrid | null;
  /** Lowest terrain height, mm (for out-of-world guards). */
  readonly minHeight: number;
  /** Number of field evaluations so far (profiling). */
  evals: number;
  /** Terrain height (bilinear) plus the registered height overlays (mounds), mm. */
  height(x: number, z: number): number;
  /** Free distance to all solids, carve grid ignored: smin(fSoil, fHard). > 0 in open air. */
  substrate(p: Vec3): number;
  substrateXYZ(x: number, y: number, z: number): number;
  /** Free distance to the diggable group only (terrain + diggable primitives). */
  soil(p: Vec3): number;
  soilXYZ(x: number, y: number, z: number): number;
  /** Free distance to the hard group only (saturates at the hash margin away from primitives). */
  hard(p: Vec3): number;
  hardXYZ(x: number, y: number, z: number): number;
  /** Carve pseudo-distance: > 0 inside carved space (-ramp/2 when there is no grid). */
  cavity(p: Vec3): number;
  /** f(p). */
  sample(p: Vec3): number;
  sampleXYZ(x: number, y: number, z: number): number;
  /** Returns f(p) and writes the (unnormalised, |grad| ~ 1 near surfaces) gradient into out. */
  gradient(p: Vec3, out: Vec3): number;
  gradientXYZ(x: number, y: number, z: number, out: Vec3): number;
  /** Unit normal (direction of increasing f) into out; returns |grad| (0: degenerate, out = +Y). */
  normal(p: Vec3, out: Vec3): number;
  /**
   * Moves p onto the level set f = offset (Newton along the gradient, step-clamped; where the gradient
   * vanishes, a 98-ray sphere-trace probe finds the nearest crossing first). Writes the result into out
   * and the unit normal into outNormal. Returns false (out unchanged) if it did not converge.
   */
  project(p: Vec3, offset: number, out: Vec3, outNormal?: Vec3 | null): boolean;
  /**
   * Local Newton projection of q (in place) onto f = offset, each step clamped to maxMove, at most `iters`
   * iterations, stopping below stopTol. Gradient at the final point into outGrad. True if |f - offset| < acceptTol.
   * No fallback probe (the walker's substep projection; the other boolean predicates below exist for the same
   * reason: hot callers get no number back, so V8 never has to box one).
   */
  newtonProject(q: Vec3, offset: number, maxMove: number, iters: number, stopTol: number, acceptTol: number, outGrad: Vec3): boolean;
  /** |f(x, y, z) - offset| <= tol. */
  isNearLevel(x: number, y: number, z: number, offset: number, tol: number): boolean;
  /** f(x, y, z) > min. */
  isClear(x: number, y: number, z: number, min: number): boolean;
  /** substrate(x, y, z) < 0 (inside where solids would be, i.e. in carved space when f > 0). */
  isInSubstrate(x: number, y: number, z: number): boolean;
  /** Distance along unit dir until a sphere of `radius` touches solid (f = radius), or maxDist. Never overshoots. */
  sphereTrace(origin: Vec3, dir: Vec3, maxDist: number, radius: number): number;
  /** True if a sphere of `radius` swept from a to b stays in free space. */
  segmentFree(a: Vec3, b: Vec3, radius: number): boolean;
  /** Material at a point: the nearest primitive within materialPrimDist, else the ground layer by depth. */
  materialAt(p: Vec3): MaterialId;
  /** Nearest primitive whose surface is within maxDist of p (or that contains p), else null. */
  primAt(p: Vec3, maxDist: number): Primitive | null;
  /** True if p lies in carved space inside the substrate (underground). */
  isUnderground(p: Vec3): boolean;
  /** True if the terrain at (x, z) is opened by carved space or a terrain hole (renderers: hole mask). */
  isHoleAt(x: number, z: number): boolean;
  /**
   * Dynamic primitives (mounds, moved objects). Walkers nearby should call walkerSurfaceChanged. Prefer the
   * kernel's wrappers, which also refresh nest-nav passability and mesh discard attributes.
   */
  addPrim(p: Primitive): void;
  removePrim(id: number): boolean;
  updatePrim(p: Primitive): void;
  /** World AABB (mm) and group of a registered primitive into out; false if the id is not in the field. */
  primBounds(id: number, out: PrimBounds): boolean;
  /**
   * Registers (or replaces, by id) a height overlay: its heights are added to the terrain height in height()
   * and in the terrain term of f, with the analytic gradient. The grid is read live, so editing `h` in place
   * takes effect at once (call it again to change origin, size or material). Prefer the kernel's wrapper, which
   * also marks the carve meshes over the overlay dirty. Walkers on it should call walkerSurfaceChanged.
   */
  setHeightOverlay(o: HeightOverlay): void;
  removeHeightOverlay(id: number): boolean;
  /** The registered overlay with this id, or undefined. */
  heightOverlay(id: number): HeightOverlay | undefined;
}

/**
 * A small heightfield patch added to the terrain (mounds and spoil heaps, GDD 03 §1.4). Grid point (ix, iz) sits
 * at (x0 + ix cell, z0 + iz cell); the added height is bilinear between points and 0 outside the grid, so the
 * border points should be 0 for a continuous field. Heights should be >= 0 (piles); negative values dig the
 * terrain down and also lower `minHeight`.
 */
export interface HeightOverlay {
  /** Caller's id (mound id). */
  id: number;
  /** World x / z of grid point (0, 0), mm. */
  x0: number;
  z0: number;
  /** Grid spacing, mm. */
  cell: number;
  /** Grid points along x and z (>= 2). */
  nx: number;
  nz: number;
  /** Added height per grid point, mm, index iz * nx + ix. */
  h: Float32Array;
  /** Material of the pile (materialAt between the terrain and the overlay top); null keeps the ground layers. */
  material: MaterialId | null;
}

/** Bounds of a primitive as registered in the field. */
export interface PrimBounds {
  minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number;
  /** In the diggable (soil) group. */
  diggable: boolean;
}

export function createWorldField(world: KernelWorldInput, carve: CarveGrid | null, opts: FieldOptions = {}): WorldField {
  return new FieldImpl(world, carve, opts);
}

const FAR = 1e6;
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
/** project()'s probe rays (see FIELD_TUNING.probeDirCoord), flat x, y, z; the six axes first (-Y leading). */
const PROBE_DIRS: number[] = (() => {
  const c = FIELD_TUNING.probeDirCoord;
  const d: number[] = [0, -1, 0, 0, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1];
  const coords = [-1, -c, 0, c, 1];
  for (const x of coords) for (const y of coords) for (const z of coords) {
    const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    const axis = (x !== 0 ? 1 : 0) + (y !== 0 ? 1 : 0) + (z !== 0 ? 1 : 0) === 1;
    if (m !== 1 || axis) continue; // interior points, and the axes already listed
    const l = Math.sqrt(x * x + y * y + z * z);
    d.push(x / l, y / l, z / l);
  }
  return d;
})();

// ---- smooth min / max with analytic gradients (exported for tests and tools) ---------------------------------

/** Polynomial smooth minimum of width k; deviates from min by at most k/4. */
export function smin(a: number, b: number, k: number): number {
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - (h * h) / (4 * k);
}

export function smax(a: number, b: number, k: number): number {
  const h = k - Math.abs(a - b);
  if (h <= 0) return a > b ? a : b;
  return (a > b ? a : b) + (h * h) / (4 * k);
}

/**
 * Result register for the gradient blends below and other scalar helpers. Hot helpers write their scalar result
 * here instead of returning it: V8 must box a double returned from a call it did not inline (a heap allocation),
 * while typed-array stores and loads never allocate.
 */
const R = new Float64Array(4);

/** smin of (a, ga) and (b, gb) into R[0]; gradient into out (may alias). Convex weights keep Lipschitz-1. */
function sminG(a: number, ga: Vec3, b: number, gb: Vec3, k: number, out: Vec3): void {
  const lo = a < b ? ga : gb, hi = a < b ? gb : ga;
  const h = k - Math.abs(a - b);
  const w = h > 0 ? h / (2 * k) : 0;
  out.x = lo.x + (hi.x - lo.x) * w; out.y = lo.y + (hi.y - lo.y) * w; out.z = lo.z + (hi.z - lo.z) * w;
  R[0] = (a < b ? a : b) - (h > 0 ? (h * h) / (4 * k) : 0);
}

/** smax of (a, ga) and (b, gb) into R[0]; gradient into out (may alias). */
function smaxG(a: number, ga: Vec3, b: number, gb: Vec3, k: number, out: Vec3): void {
  const big = a > b ? ga : gb, small = a > b ? gb : ga;
  const h = k - Math.abs(a - b);
  const w = h > 0 ? h / (2 * k) : 0;
  out.x = big.x + (small.x - big.x) * w; out.y = big.y + (small.y - big.y) * w; out.z = big.z + (small.z - big.z) * w;
  R[0] = (a > b ? a : b) + (h > 0 ? (h * h) / (4 * k) : 0);
}

class FieldImpl implements WorldField {
  readonly bu: number;
  readonly size: number;
  readonly params: FieldParams;
  readonly carve: CarveGrid | null;
  minHeight: number;
  evals = 0;
  private readonly world: KernelWorldInput;
  private readonly k: number;
  private readonly margin: number;
  private readonly cavitySkip: number;
  private readonly hash: PrimHash;
  private readonly isDiggablePrim: (p: Primitive) => boolean;
  private readonly holesNear: Uint8Array | null;
  private readonly terrainMin: number;
  private overlays: HeightOverlay[] = [];
  // scratch (never escapes)
  private readonly hs: HeightSlope = { h: 0, gx: 0, gz: 0 };
  private readonly g2: Grad2 = { d: 0, gx: 0, gz: 0 };
  private readonly gSoil = zero(); private readonly gHard = zero(); private readonly gPrim = zero();
  private readonly gAcc = zero(); private readonly gCav = zero(); private readonly gTmp = zero();
  private readonly q = zero(); private readonly qg = zero(); private readonly pq = zero();
  private readonly queryOut: PrimEntry[] = [];
  /** Results of the last parts() call. */
  private soilV = 0;
  private hardV = 0;

  constructor(world: KernelWorldInput, carve: CarveGrid | null, opts: FieldOptions) {
    this.world = world;
    this.bu = world.bu;
    this.size = world.size;
    this.params = { ...fieldParamsForBU(world.bu), ...opts.params };
    this.carve = carve;
    this.k = this.params.blend;
    this.margin = this.params.hashMargin;
    // smax(soil, cavity) == soil exactly once soil - cavity >= k; cavity <= ramp/2
    this.cavitySkip = (carve ? carve.ramp * 0.5 : 0) + this.k;
    this.hash = new PrimHash(this.params.hashCell, this.params.hashMargin);
    this.isDiggablePrim = opts.isDiggablePrim ?? ((p) => (p.flags & PrimFlag.DIGGABLE) !== 0);
    for (const p of world.prims) this.addPrim(p);
    const holes = world.terrainHoles;
    this.holesNear = holes && holes.data.some((b) => b !== 0) ? dilateHoles(holes) : null;
    let minH = Infinity;
    for (const h of world.terrain.data) minH = Math.min(minH, h);
    this.terrainMin = minH;
    this.minHeight = minH;
  }

  // ---- core evaluation -------------------------------------------------------------------------------------

  /** Computes soilV / hardV (and their gradients in gSoil / gHard when want). */
  private parts(x: number, y: number, z: number, want: boolean): void {
    const k = this.k;
    const T = heightSlope(this.world.terrain, x, z, this.hs);
    if (this.overlays.length !== 0) addOverlays(this.overlays, x, z, T);
    const invS = 1 / Math.sqrt(1 + T.gx * T.gx + T.gz * T.gz);
    let soil = (y - T.h) * invS;
    const gs = this.gSoil;
    gs.x = -T.gx * invS; gs.y = invS; gs.z = -T.gz * invS;
    const holes = this.world.terrainHoles;
    if (this.holesNear !== null && holes && this.holesNear[this.holeCellIndex(x, z)] === 1) {
      holeDistance(holes, x, z, this.g2);
      const gHole = this.gTmp;
      gHole.x = this.g2.gx; gHole.y = 0; gHole.z = this.g2.gz;
      smaxG(soil, gs, this.g2.d, gHole, k, gs);
      soil = R[0];
    }
    let hard = this.margin;
    const gh = this.gHard;
    gh.x = 0; gh.y = 0; gh.z = 0;
    const list = this.hash.at(x, y, z);
    if (list !== undefined) {
      let ds = FAR, dh = FAR;
      const ga = this.gAcc, gp = this.gPrim;
      ga.x = 0; ga.y = 0; ga.z = 0;
      for (let n = 0; n < list.length; n++) {
        const e = list[n];
        primEvalInto(e, x, y, z, want ? gp : null);
        const d = PRIM_D[0];
        if (e.diggable) {
          if (ds === FAR) { ds = d; copy3(ga, gp); } else { sminG(ds, ga, d, gp, k, ga); ds = R[0]; }
        } else if (dh === FAR) { dh = d; copy3(gh, gp); } else { sminG(dh, gh, d, gp, k, gh); dh = R[0]; }
      }
      // unlisted primitives are >= margin away: clamp to the bound (keeps f continuous across cells)
      if (dh < this.margin) hard = dh; else { gh.x = 0; gh.y = 0; gh.z = 0; }
      if (ds < this.margin) sminG(soil, gs, ds, ga, k, gs);
      else sminG(soil, gs, this.margin, this.zeroG(), k, gs);
    } else {
      sminG(soil, gs, this.margin, this.zeroG(), k, gs);
    }
    soil = R[0];
    this.soilV = soil;
    this.hardV = hard;
  }

  private zeroG(): Vec3 {
    const g = this.gTmp;
    g.x = 0; g.y = 0; g.z = 0;
    return g;
  }

  private holeCellIndex(x: number, z: number): number {
    const m = this.world.terrainHoles!;
    let ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
    ix = ix < 0 ? 0 : ix >= m.nx ? m.nx - 1 : ix;
    iz = iz < 0 ? 0 : iz >= m.nz ? m.nz - 1 : iz;
    return iz * m.nx + ix;
  }

  /** f at the last run() (kept in a field: returning a double from a large function would box it). */
  private fv = 0;

  /** f(x, y, z) via run(); small enough to be inlined, so the result never needs boxing. */
  private evalF(x: number, y: number, z: number, g: Vec3 | null): number {
    this.run(x, y, z, g);
    return this.fv;
  }

  /** Computes f(x, y, z) into this.fv; gradient into g when g is given. */
  private run(x: number, y: number, z: number, g: Vec3 | null): void {
    this.evals++;
    const want = g !== null;
    this.parts(x, y, z, want);
    const k = this.k, gs = this.gSoil;
    let a = this.soilV;
    if (this.carve !== null && a < this.cavitySkip) {
      const gc = this.gCav;
      this.carve.cavityTo(R, 1, x, y, z, want ? gc : null);
      smaxG(a, gs, R[1], gc, k, gs);
      a = R[0];
    }
    sminG(a, gs, this.hardV, this.gHard, k, g ?? this.gTmp);
    this.fv = R[0];
  }

  // ---- public queries ------------------------------------------------------------------------------------

  height(x: number, z: number): number {
    const h = heightAt(this.world.terrain, x, z);
    if (this.overlays.length === 0) return h;
    const T = this.hs;
    T.h = h; T.gx = 0; T.gz = 0;
    addOverlays(this.overlays, x, z, T);
    return T.h;
  }

  substrateXYZ(x: number, y: number, z: number): number {
    this.parts(x, y, z, false);
    return smin(this.soilV, this.hardV, this.k);
  }
  substrate(p: Vec3): number {
    return this.substrateXYZ(p.x, p.y, p.z);
  }
  soilXYZ(x: number, y: number, z: number): number {
    this.parts(x, y, z, false);
    return this.soilV;
  }
  soil(p: Vec3): number {
    return this.soilXYZ(p.x, p.y, p.z);
  }
  hardXYZ(x: number, y: number, z: number): number {
    this.parts(x, y, z, false);
    return this.hardV;
  }
  hard(p: Vec3): number {
    return this.hardXYZ(p.x, p.y, p.z);
  }
  cavity(p: Vec3): number {
    return this.carve ? this.carve.cavity(p.x, p.y, p.z) : -FAR;
  }

  sampleXYZ(x: number, y: number, z: number): number {
    return this.evalF(x, y, z, null);
  }
  sample(p: Vec3): number {
    return this.evalF(p.x, p.y, p.z, null);
  }
  gradientXYZ(x: number, y: number, z: number, out: Vec3): number {
    return this.evalF(x, y, z, out);
  }
  gradient(p: Vec3, out: Vec3): number {
    return this.evalF(p.x, p.y, p.z, out);
  }

  normal(p: Vec3, out: Vec3): number {
    this.evalF(p.x, p.y, p.z, out);
    const l = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
    if (l < 1e-9) { out.x = 0; out.y = 1; out.z = 0; return 0; }
    out.x /= l; out.y /= l; out.z /= l;
    return l;
  }

  project(p: Vec3, offset: number, out: Vec3, outNormal: Vec3 | null = null): boolean {
    const P = this.params, q = this.q, g = this.qg;
    q.x = p.x; q.y = p.y; q.z = p.z;
    let probed = false;
    for (let it = 0; it <= P.projIters; it++) {
      const v = this.evalF(q.x, q.y, q.z, g) - offset;
      if (!Number.isFinite(v)) return false;
      const gl2 = g.x * g.x + g.y * g.y + g.z * g.z;
      if (Math.abs(v) < P.projTol && gl2 > 1e-8) {
        out.x = q.x; out.y = q.y; out.z = q.z;
        if (outNormal) {
          const l = Math.sqrt(gl2);
          outNormal.x = g.x / l; outNormal.y = g.y / l; outNormal.z = g.z / l;
        }
        return true;
      }
      if (it === P.projIters) break;
      if (gl2 < 0.01) {
        // gradient vanished (saturated cavity interior, deep solid): find the nearest crossing first
        if (probed || !this.probeNearest(q, offset, v)) return false;
        probed = true;
        continue;
      }
      let s = -v / gl2;
      const move = Math.abs(s) * Math.sqrt(gl2), maxMove = 1.5 * Math.abs(v) + P.projSlack;
      if (move > maxMove) s *= maxMove / move;
      q.x += g.x * s; q.y += g.y * s; q.z += g.z * s;
    }
    return false;
  }

  /** Sphere-traces the probe directions from q for the nearest point where f crosses offset; moves q there. */
  private probeNearest(q: Vec3, offset: number, v: number): boolean {
    const P = this.params, pq = this.pq;
    let best = Infinity, bx = 0, by = 0, bz = 0;
    for (let n = 0; n < PROBE_DIRS.length; n += 3) {
      const dx = PROBE_DIRS[n], dy = PROBE_DIRS[n + 1], dz = PROBE_DIRS[n + 2];
      const lim = Math.min(best, P.probeDist);
      let t = 0, hit = false;
      for (let it = 0; it < P.traceMaxIters && t <= lim; it++) {
        pq.x = q.x + dx * t; pq.y = q.y + dy * t; pq.z = q.z + dz * t;
        const d = (this.evalF(pq.x, pq.y, pq.z, null) - offset) * (v > 0 ? 1 : -1);
        if (d < P.traceMinStep) { hit = true; break; }
        t += Math.max(d * P.traceSafety, P.traceMinStep);
      }
      if (hit && t < best) { best = t; bx = dx; by = dy; bz = dz; }
    }
    if (best === Infinity) return false;
    q.x += bx * best; q.y += by * best; q.z += bz * best;
    return true;
  }

  newtonProject(q: Vec3, offset: number, maxMove: number, iters: number, stopTol: number, acceptTol: number, g: Vec3): boolean {
    for (let it = 0; it < iters; it++) {
      this.run(q.x, q.y, q.z, g);
      const v = this.fv - offset;
      if (Math.abs(v) < stopTol) return stopTol <= acceptTol;
      const gl2 = g.x * g.x + g.y * g.y + g.z * g.z;
      if (!(gl2 > 1e-6)) return false;
      let s = -v / gl2;
      const move = Math.abs(s) * Math.sqrt(gl2);
      if (move > maxMove) s *= maxMove / move;
      q.x += g.x * s; q.y += g.y * s; q.z += g.z * s;
    }
    this.run(q.x, q.y, q.z, g);
    return Math.abs(this.fv - offset) < acceptTol;
  }

  isNearLevel(x: number, y: number, z: number, offset: number, tol: number): boolean {
    this.run(x, y, z, null);
    return Math.abs(this.fv - offset) <= tol;
  }

  isClear(x: number, y: number, z: number, min: number): boolean {
    this.run(x, y, z, null);
    return this.fv > min;
  }

  isInSubstrate(x: number, y: number, z: number): boolean {
    this.parts(x, y, z, false);
    return smin(this.soilV, this.hardV, this.k) < 0;
  }

  sphereTrace(origin: Vec3, dir: Vec3, maxDist: number, radius: number): number {
    const P = this.params;
    let t = 0;
    for (let it = 0; it < P.traceMaxIters && t < maxDist; it++) {
      const d = this.evalF(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t, null) - radius;
      if (d < P.traceMinStep) return t;
      t += Math.max(d * P.traceSafety, P.traceMinStep);
    }
    return t < maxDist ? t : maxDist;
  }

  segmentFree(a: Vec3, b: Vec3, radius: number): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-9) return this.evalF(a.x, a.y, a.z, null) >= radius;
    const dir = this.pq; // sphereTrace does not use pq
    dir.x = dx / L; dir.y = dy / L; dir.z = dz / L;
    return this.sphereTrace(a, dir, L, radius) >= L;
  }

  primAt(p: Vec3, maxDist: number): Primitive | null {
    const list = this.hash.query(p.x - maxDist, p.y - maxDist, p.z - maxDist, p.x + maxDist, p.y + maxDist, p.z + maxDist, this.queryOut);
    let best: PrimEntry | null = null, bestD = Infinity;
    for (const e of list) {
      const d = primEval(e, p.x, p.y, p.z, null);
      if (d <= maxDist && d < bestD) { bestD = d; best = e; }
    }
    return best ? best.prim : null;
  }

  materialAt(p: Vec3): MaterialId {
    const prim = this.primAt(p, this.params.materialPrimDist);
    if (prim) return prim.material;
    const g = this.world.ground;
    const ground = heightAt(this.world.terrain, p.x, p.z);
    if (this.overlays.length !== 0 && p.y > ground) {
      const pile = overlayMaterialAt(this.overlays, p.x, p.z);
      if (pile !== null) return pile;
    }
    const depth = ground - p.y;
    const crust = byteAt(g.crustMm, p.x, p.z);
    return materialFromCode(depth < crust ? byteAt(g.surface, p.x, p.z) : byteAt(g.subsoil, p.x, p.z));
  }

  isUnderground(p: Vec3): boolean {
    return this.substrate(p) < 0 && this.sample(p) > 0;
  }

  isHoleAt(x: number, z: number): boolean {
    return this.evalF(x, this.height(x, z) - this.params.holeProbeDepth, z, null) > 0;
  }

  addPrim(p: Primitive): void {
    if ((p.flags & PrimFlag.VISUAL_ONLY) !== 0) { this.hash.remove(p.id); return; }
    this.hash.add(makePrimEntry(p, this.isDiggablePrim(p)));
  }
  removePrim(id: number): boolean {
    return this.hash.remove(id) !== undefined;
  }
  updatePrim(p: Primitive): void {
    this.addPrim(p);
  }
  setHeightOverlay(o: HeightOverlay): void {
    if (!(o.nx >= 2 && o.nz >= 2 && o.cell > 0 && o.h.length === o.nx * o.nz)) throw new Error(`height overlay ${o.id}: bad grid`);
    const i = this.overlays.findIndex((e) => e.id === o.id);
    if (i >= 0) this.overlays[i] = o; else this.overlays.push(o);
    this.updateMinHeight();
  }
  removeHeightOverlay(id: number): boolean {
    const i = this.overlays.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.overlays.splice(i, 1);
    this.updateMinHeight();
    return true;
  }
  heightOverlay(id: number): HeightOverlay | undefined {
    return this.overlays.find((e) => e.id === id);
  }
  private updateMinHeight(): void {
    let low = 0;
    for (const o of this.overlays) for (let i = 0; i < o.h.length; i++) if (o.h[i] < low) low = o.h[i];
    this.minHeight = this.terrainMin + low;
  }

  primBounds(id: number, out: PrimBounds): boolean {
    const e = this.hash.get(id);
    if (!e) return false;
    out.minX = e.minX; out.minY = e.minY; out.minZ = e.minZ;
    out.maxX = e.maxX; out.maxY = e.maxY; out.maxZ = e.maxZ;
    out.diggable = e.diggable;
    return true;
  }
}

function copy3(o: Vec3, a: Vec3): void {
  o.x = a.x; o.y = a.y; o.z = a.z;
}

/** Adds the overlays' bilinear heights and slopes at (x, z) to T (allocation-free). */
function addOverlays(list: HeightOverlay[], x: number, z: number, T: HeightSlope): void {
  for (let n = 0; n < list.length; n++) {
    const o = list[n], inv = 1 / o.cell;
    const fx = (x - o.x0) * inv, fz = (z - o.z0) * inv;
    if (!(fx >= 0 && fz >= 0 && fx < o.nx - 1 && fz < o.nz - 1)) continue;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const i = ix + iz * o.nx, d = o.h;
    const a = d[i], b = d[i + 1], c = d[i + o.nx], e = d[i + o.nx + 1];
    const cross = a - b - c + e;
    T.h += a + (b - a) * tx + (c - a) * tz + cross * tx * tz;
    T.gx += ((b - a) + cross * tz) * inv;
    T.gz += ((c - a) + cross * tx) * inv;
  }
}

/** Material of the overlay contributing the most height at (x, z), null if none with a material covers it. */
function overlayMaterialAt(list: HeightOverlay[], x: number, z: number): MaterialId | null {
  const T: HeightSlope = { h: 0, gx: 0, gz: 0 };
  let best = 0, mat: MaterialId | null = null;
  for (const o of list) {
    if (o.material === null) continue;
    T.h = 0;
    addOverlays([o], x, z, T);
    if (T.h > best) { best = T.h; mat = o.material; }
  }
  return mat;
}
