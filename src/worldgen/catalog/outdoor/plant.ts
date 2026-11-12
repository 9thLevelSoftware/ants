// Procedural plant template (GDD 04 §4.2 step 5, §5.3 PlantTemplate): stems as capsule chains of 20-80 mm
// segments with tropism noise, optional branches, leaves as thin ellipsoids, flowers as ellipsoids; at most
// PLANT_MAX_PRIMS primitives (segments get longer when a big plant would exceed it). The main stem carries the
// `stem` climb route (ground -> stem side -> flower top) on a side kept free of leaves and branches, and the POIs
// the ecology needs (aphid site near the top, nectar / seed site at the flower).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId, PoiKind } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, dirYaw, el, norm, rollQ, S, scale, SL, compose, v, yawQ } from './prims';
import { besideAxis, densify } from './routes';
import type { Built, Env } from './types';

/** GDD 04 §5.3 PlantTemplate (all lengths mm, angles deg). */
export interface PlantTemplate {
  stems: number;
  stemDiamMm: [number, number];
  stemLenMm: [number, number];
  segmentMm: [number, number];
  branchLevels: number;
  branchAngleDeg: [number, number];
  leavesPerStem: [number, number];
  /** Leaf width and length ranges. */
  leafMm: { w: [number, number]; l: [number, number] };
  leafThicknessMm: number;
  /** Flower diameter range; [0, 0] = no flower. */
  flowerMm: [number, number];
  woody: boolean;
  waxyP: number;
  /** Host flag probabilities (rolled per instance, GDD 04 §8.3). */
  hostP: { aphid?: number; efn?: number; nectar?: number; elaiosome?: number; seed?: number; scale?: number };
  hostClass: 'herb' | 'shrub' | 'tree';
  /** Lean of the stems from vertical, deg. */
  leanDeg: [number, number];
  /** Leaves droop below horizontal, deg. */
  droopDeg: [number, number];
  /** Flower material (plant) and whether the flower is a seed head (dandelion clock) too. */
  seedHead?: boolean;
}

export const PLANT_MAX_PRIMS = 24;
/** Route side kept clear: leaves and branches avoid this many radians either side of it. */
const CLEAR_SIDE = 1.05;

const R = (rng: RngState, r: readonly [number, number]) => r[0] + rngFloat(rng) * (r[1] - r[0]);
const HOST_BITS = { aphid: 1, efn: 2, nectar: 4, elaiosome: 8, seed: 16, scale: 32 } as const;

/** Yaw (dirYaw convention) away from the route side. */
function freeYaw(rng: RngState, routeYaw: number): number {
  return routeYaw + CLEAR_SIDE + rngFloat(rng) * (2 * Math.PI - 2 * CLEAR_SIDE);
}

/** Axis points of a stem: from `base`, total length `len`, `n` segments, initial direction `dir`, upward pull. */
function stemAxis(rng: RngState, base: Vec3, dir: Vec3, len: number, n: number, noise: number): Vec3[] {
  const pts = [base];
  let d = dir;
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const a = rngFloat(rng) * 2 * Math.PI;
    d = norm(add(d, v(noise * dcos(a), 0.12, noise * dsin(a))));
    pts.push(add(pts[pts.length - 1], scale(d, seg)));
  }
  return pts;
}

export interface PlantOptions {
  /** Extra prims (rosette, pot) added before the stems; they count against the cap. */
  extra?: PrimSpec[];
  /** Base height of the stems, mm (e.g. on a rosette or soil fill). */
  baseY?: number;
  /** Ground height for the route's first node (default 0). */
  groundY?: number;
  /** Route start offset beyond the stem, mm (default 2 BU) . */
  material?: MaterialId;
}

/** Grows one plant. Returns the template with its route, POIs and host data. */
export function growPlant(id: string, p: PlantTemplate, rng: RngState, env: Env, opt: PlantOptions = {}): Built {
  const { bu, foot } = env;
  const prims: PrimSpec[] = [...(opt.extra ?? [])];
  const waxy = rngFloat(rng) < p.waxyP;
  const stemFlags = C | S | (waxy ? SL : 0);
  const routeYaw = rngFloat(rng) * 2 * Math.PI;
  const baseY = opt.baseY ?? 0;
  const nStems = rngInt(rng, 1, Math.max(1, p.stems));
  const flowerD = p.flowerMm[1] > 0 ? R(rng, p.flowerMm) : 0;
  const nLeaves = rngInt(rng, p.leavesPerStem[0], p.leavesPerStem[1]);
  // prim budget: segments first, then leaves, branches, flowers
  const budget = PLANT_MAX_PRIMS - prims.length;
  const perStemFixed = (flowerD > 0 ? 1 : 0);
  const branchCount = p.branchLevels > 0 ? Math.min(3, nStems + p.branchLevels) : 0;
  let leavesTotal = Math.min(nLeaves * nStems, Math.max(0, budget - nStems * (2 + perStemFixed) - branchCount * 2));
  const segBudget = Math.max(nStems * 2, budget - leavesTotal - nStems * perStemFixed - branchCount * 2);
  const segsPerStem = Math.max(2, Math.floor(segBudget / nStems));
  const pois: { kind: PoiKind; pos: Vec3 }[] = [];
  let mainAxis: Vec3[] = [];
  let mainDia = 0;
  let mainTop: Vec3 = v(0, baseY, 0);
  let mainFlower: { c: Vec3; d: number; h: number } | null = null;
  for (let s = 0; s < nStems; s++) {
    const dia = R(rng, p.stemDiamMm), len = R(rng, p.stemLenMm);
    const nSeg = Math.max(2, Math.min(segsPerStem, Math.ceil(len / p.segmentMm[0]), Math.max(2, Math.round(len / p.segmentMm[1]))));
    const lean = (R(rng, p.leanDeg) * Math.PI) / 180;
    // the main stem stands nearly upright; others lean away from the route side
    const ly = s === 0 ? routeYaw + Math.PI : freeYaw(rng, routeYaw);
    const off = s === 0 ? 0 : dia * 1.5;
    const base = add(v(0, baseY - dia, 0), scale(dirYaw(ly), off));
    const d0 = norm(add(v(0, 1, 0), scale(dirYaw(ly), s === 0 ? Math.min(0.08, lean) : lean)));
    const axis = stemAxis(rng, base, d0, len, nSeg, s === 0 ? 0.04 : 0.12);
    const taper = (i: number) => Math.max(0.8, dia * (1 - (0.35 * i) / nSeg));
    for (let i = 1; i < axis.length; i++) prims.push(ca(axis[i - 1], axis[i], taper(i - 1), p.woody && i < axis.length / 2 ? 'wood-sound' : 'plant', stemFlags));
    const top = axis[axis.length - 1];
    if (s === 0) { mainAxis = axis; mainDia = dia; mainTop = top; }
    if (flowerD > 0) {
      const fh = flowerD * 0.4;
      const c = add(top, v(0, fh * 0.35, 0));
      prims.push(el(c, flowerD, fh, flowerD, 'plant', C | S));
      if (s === 0) mainFlower = { c, d: flowerD, h: fh };
    }
  }
  // branches (woody shrubs): from mid nodes of the first stems, away from the route side
  for (let b = 0; b < branchCount && prims.length + 2 <= PLANT_MAX_PRIMS; b++) {
    const ax = mainAxis;
    const at = ax[Math.max(1, Math.min(ax.length - 2, Math.floor(ax.length * (0.35 + 0.15 * b))))];
    const ang = (R(rng, p.branchAngleDeg) * Math.PI) / 180;
    const y = freeYaw(rng, routeYaw);
    const dir = norm(add(scale(dirYaw(y), dsin(ang)), v(0, dcos(ang), 0)));
    const bl = R(rng, p.stemLenMm) * 0.45, bd = Math.max(1, mainDia * 0.6);
    const mid = add(at, scale(dir, bl / 2)), tip = add(mid, scale(norm(add(dir, v(0, 0.3, 0))), bl / 2));
    prims.push(ca(at, mid, bd, p.woody ? 'wood-sound' : 'plant', stemFlags), ca(mid, tip, bd * 0.7, 'plant', stemFlags));
    if (pois.length < 3 && rngFloat(rng) < 0.5) pois.push({ kind: 'aphid-site', pos: add(mid, v(0, bd / 2 + foot, 0)) });
  }
  // leaves on the main stem's nodes (and the others'), never on the route side
  const thick = Math.max(p.leafThicknessMm, 0.15 * bu);
  for (let i = 0; i < leavesTotal && prims.length < PLANT_MAX_PRIMS; i++) {
    const ax = mainAxis;
    const k = 1 + (i % Math.max(1, ax.length - 2));
    const node = ax[Math.min(ax.length - 1, k)];
    const yaw = freeYaw(rng, routeYaw);
    const w = R(rng, p.leafMm.w), l = R(rng, p.leafMm.l), droop = (R(rng, p.droopDeg) * Math.PI) / 180;
    const dir = dirYaw(yaw);
    const c = add(node, add(scale(dir, (l / 2 + mainDia / 2) * dcos(droop)), v(0, -(l / 2) * dsin(droop), 0)));
    prims.push(el(c, l, thick, w, 'plant', C | S | (waxy ? SL : 0), compose(rollQ(-droop), yawQ(-yaw))));
  }
  leavesTotal = 0;
  // route: ground beside the main stem -> up its route side -> over the flower rim to its top
  const side = dirYaw(routeYaw);
  const r = (i: number) => Math.max(0.4, (mainDia * (1 - (0.35 * Math.max(0, i - 1)) / Math.max(1, mainAxis.length - 1))) / 2);
  const g = opt.groundY ?? 0;
  const climb = besideAxis(mainAxis.map((q, i) => (i === 0 ? v(q.x, Math.max(q.y, g + mainDia), q.z) : q)), r, side, foot);
  const pts: Vec3[] = [add(v(0, g + foot, 0), scale(side, mainDia / 2 + foot + 2 * bu)), ...climb];
  if (mainFlower) {
    const f = mainFlower;
    pts.push(add(add(f.c, v(0, -f.h * 0.1, 0)), scale(side, f.d / 2 + foot)));
    pts.push(add(f.c, v(0, f.h / 2 + foot, 0)));
    const nectar = p.hostP.nectar ?? 0;
    if (nectar > 0) pois.push({ kind: 'nectar-site', pos: add(f.c, v(0, f.h / 2 + foot, 0)) });
    if (p.seedHead) pois.push({ kind: 'seed-site', pos: add(f.c, v(0, f.h / 2 + foot, 0)) });
  } else pts.push(add(mainTop, v(0, mainDia / 2 + foot, 0)));
  const topNode = climb[Math.max(0, climb.length - 2)];
  pois.push({ kind: 'aphid-site', pos: topNode });
  // host flags rolled per instance
  let hostFlags = 0;
  for (const [k, prob] of Object.entries(p.hostP) as [keyof typeof HOST_BITS, number][]) if (prob > 0 && rngFloat(rng) < prob) hostFlags |= HOST_BITS[k];
  return {
    tpl: { id, prims, tags: ['plant'], routes: [{ kind: 'stem', points: densify(pts, 6 * bu) }], pois },
    tilt: false,
    host: { hostFlags, hostClass: p.hostClass },
  };
}
