// Lawn catalogue (GDD 04 §5.2): dandelion, clover patch, daisy, seed grass [T2], stepping stone, lost ball,
// garden hose, sprinkler head [T2], lawn edge, stone. The sward itself is a surface layer plus decor (§9).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, chain, cy, dirYaw, el, rb, rollQ, S, scale, compose, v, yawQ } from './prims';
import { growPlant, type PlantTemplate } from './plant';
import { flatStone, FOREST } from './forest';
import type { Built, Env, LocalCavity } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const TAU = 2 * Math.PI;

export const LAWN = {
  dandelion: { rosette: [150, 250], leaves: [5, 9], leafW: [20, 40] },
  clover: { patch: [150, 400], leaves: [2, 3], petiole: [30, 80], leaflet: [10, 25], heads: [2, 6], headStalk: [60, 120] },
  stepping: { dia: [300, 450], square: 450, thick: 40, topAbove: 5, roundP: 0.5, concreteP: 0.5, spacing: [600, 700], count: [3, 8] },
  ball: { dia: [65, 220] },
  hose: { dia: [15, 20], coil: [500, 1000], segs: [12, 30] },
  sprinkler: { body: [150, 40, 80] },
  lawnEdge: { thick: 3, depth: 100, metalP: 0.5 },
  stone: [40, 120] as [number, number],
};

export const DANDELION: PlantTemplate = {
  stems: 1, stemDiamMm: [3, 5], stemLenMm: [100, 250], segmentMm: [40, 80], branchLevels: 0, branchAngleDeg: [0, 0],
  leavesPerStem: [0, 0], leafMm: { w: [20, 40], l: [100, 200] }, leafThicknessMm: 0.8, flowerMm: [30, 40], woody: false,
  waxyP: 0, hostP: { nectar: 1, seed: 1 }, hostClass: 'herb', leanDeg: [0, 6], droopDeg: [0, 0], seedHead: true,
};

export function dandelion(rng: RngState, env: Env): Built {
  const D = LAWN.dandelion;
  const ros = R(rng, D.rosette[0], D.rosette[1]);
  const n = rngInt(rng, D.leaves[0], D.leaves[1]);
  const t = Math.max(0.8, 0.15 * env.bu);
  const extra: PrimSpec[] = [];
  const y0 = R(rng, 0, TAU);
  for (let i = 0; i < n; i++) {
    const a = y0 + (i * TAU) / n, l = (ros / 2) * R(rng, 0.8, 1), w = R(rng, D.leafW[0], D.leafW[1]);
    const c = scale(dirYaw(a), l / 2);
    c.y = t / 2 + 0.3;
    extra.push(el(c, l, t, w, 'plant', C | S, compose(rollQ(0.05), yawQ(-a))));
  }
  return growPlant('dandelion', DANDELION, rng, env, { extra, baseY: t });
}

export const DAISY: PlantTemplate = {
  stems: 1, stemDiamMm: [1.5, 1.5], stemLenMm: [40, 80], segmentMm: [20, 40], branchLevels: 0, branchAngleDeg: [0, 0],
  leavesPerStem: [2, 3], leafMm: { w: [6, 10], l: [15, 30] }, leafThicknessMm: 0.8, flowerMm: [15, 25], woody: false,
  waxyP: 0, hostP: { nectar: 1 }, hostClass: 'herb', leanDeg: [0, 8], droopDeg: [40, 60],
};
export const daisy = (rng: RngState, env: Env): Built => growPlant('daisy', DAISY, rng, env);

export const CLOVER_HEAD: PlantTemplate = {
  stems: 1, stemDiamMm: [1.5, 1.5], stemLenMm: [60, 120], segmentMm: [30, 60], branchLevels: 0, branchAngleDeg: [0, 0],
  leavesPerStem: [0, 0], leafMm: { w: [0, 0], l: [0, 0] }, leafThicknessMm: 0.8, flowerMm: [20, 20], woody: false,
  waxyP: 0, hostP: { nectar: 1 }, hostClass: 'herb', leanDeg: [0, 6], droopDeg: [0, 0],
};

export function cloverPatch(rng: RngState, env: Env): Built {
  const K = LAWN.clover;
  const patch = R(rng, K.patch[0], K.patch[1]);
  const t = Math.max(0.8, 0.15 * env.bu);
  const extra: PrimSpec[] = [];
  // trifoliate leaves on petioles (the rest of the patch is decor)
  const nl = rngInt(rng, K.leaves[0], K.leaves[1]);
  for (let i = 0; i < nl; i++) {
    const a = R(rng, 0, TAU), rr = R(rng, 0.15, 0.45) * patch;
    const base = add(scale(dirYaw(a), rr), v(0, 0, 0));
    const h = R(rng, K.petiole[0], K.petiole[1]);
    const top = add(base, v(R(rng, -5, 5), h, R(rng, -5, 5)));
    extra.push(ca(v(base.x, -1, base.z), top, 1.2, 'plant', C));
    for (let k = 0; k < 3; k++) {
      const la = R(rng, 0, TAU) + (k * TAU) / 3, ls = R(rng, K.leaflet[0], K.leaflet[1]);
      const c = add(top, add(scale(dirYaw(la), ls / 2), v(0, 0, 0)));
      extra.push(el(c, ls, t, ls * 0.8, 'plant', C | S, yawQ(-la)));
    }
  }
  // extra flower heads on stalks (one head carries the route, grown by growPlant)
  const nh = Math.min(2, rngInt(rng, K.heads[0], K.heads[1]) - 1);
  for (let i = 0; i < nh; i++) {
    const a = R(rng, 0, TAU), rr = R(rng, 0.1, 0.4) * patch, h = R(rng, K.headStalk[0], K.headStalk[1]);
    const b = scale(dirYaw(a), rr);
    extra.push(ca(v(b.x, -1, b.z), v(b.x, h, b.z), 1.5, 'plant', C), el(v(b.x, h + 3, b.z), 20, 8, 20, 'plant', C | S));
  }
  return growPlant('clover-patch', CLOVER_HEAD, rng, env, { extra });
}

export const SEED_GRASS: PlantTemplate = {
  stems: 1, stemDiamMm: [1.5, 3], stemLenMm: [150, 300], segmentMm: [40, 80], branchLevels: 0, branchAngleDeg: [0, 0],
  leavesPerStem: [1, 3], leafMm: { w: [3, 6], l: [60, 150] }, leafThicknessMm: 0.8, flowerMm: [30, 80], woody: false,
  waxyP: 0, hostP: { seed: 1 }, hostClass: 'herb', leanDeg: [2, 12], droopDeg: [20, 50], seedHead: true,
};
export const seedGrass = (rng: RngState, env: Env): Built => growPlant('seed-grass', SEED_GRASS, rng, env);

/** Stepping stone: disc or square slab, 40 thick, top 5 mm above the lawn; under-stone lens like flat stones. */
export function steppingStone(rng: RngState, env: Env): Built {
  const T = LAWN.stepping, bu = env.bu;
  const round = rngFloat(rng) < T.roundP;
  const mat: MaterialId = rngFloat(rng) < T.concreteP ? 'concrete' : 'stone';
  const d = round ? R(rng, T.dia[0], T.dia[1]) : T.square;
  const prim = round ? cy(v(0, T.thick / 2, 0), d, T.thick, mat, C | S, undefined, 4) : rb(v(0, T.thick / 2, 0), d, T.thick, d, 10, mat, C | S);
  const cavities: LocalCavity[] = [];
  const F = FOREST.stone;
  if (rngFloat(rng) < F.cavityP) {
    const rr = Math.min(F.lensMaxRBu * bu, (d / 2) * R(rng, F.cavityFoot[0], F.cavityFoot[1]));
    cavities.push({ kind: 'under-stone', carves: [{ shape: 'ellipsoid', a: v(0, 0, 0), b: v(rr, 0.5 * bu, rr), r: 0 }], openings: [] });
  }
  return {
    tpl: { id: 'stepping-stone', prims: [prim], tags: ['prop', 'stone'], pois: [{ kind: 'shelter', pos: v(0, T.thick + env.foot, 0) }] },
    embed: T.thick - T.topAbove, cavities,
  };
}

export function lostBall(rng: RngState): Built {
  const d = R(rng, LAWN.ball.dia[0], LAWN.ball.dia[1]);
  const mat: MaterialId = rngFloat(rng) < 0.5 ? 'plastic' : 'rubber';
  return { tpl: { id: 'lost-ball', prims: [el(v(0, d / 2, 0), d, d, d, mat, C | S)], tags: ['prop'] }, embed: Math.min(3, d * 0.03) };
}

/** Garden hose coiled flat: a spiral of 12-30 capsules, loops a few mm apart. */
export function gardenHose(rng: RngState): Built {
  const H = LAWN.hose;
  const dia = R(rng, H.dia[0], H.dia[1]), coil = R(rng, H.coil[0], H.coil[1]);
  const segs = rngInt(rng, H.segs[0], H.segs[1]);
  const turns = 2 + (segs > 22 ? 1 : 0);
  const pitch = dia + 4;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = t * turns * TAU, r = coil / 2 - t * turns * pitch;
    pts.push(v(r * dcos(a), dia / 2, r * dsin(a)));
  }
  return { tpl: { id: 'garden-hose', prims: chain(pts, dia, 'rubber', C | S), tags: ['prop'] } };
}

export function sprinklerHead(): Built {
  const [w, h, d] = LAWN.sprinkler.body;
  return {
    tpl: { id: 'sprinkler-head', tags: ['prop'], prims: [rb(v(0, h / 2, 0), w, h, d, 6, 'plastic', C), cy(v(0, h + 10, 0), 20, 20, 'plastic', C)] },
  };
}

/** Lawn edge strip of length `len` (3 thick x 100 deep, top flush with the ground). */
export function lawnEdge(rng: RngState, len: number): Built {
  const E = LAWN.lawnEdge;
  const mat: MaterialId = rngFloat(rng) < E.metalP ? 'metal' : 'plastic';
  return { tpl: { id: 'lawn-edge', tags: ['structure'], prims: [rb(v(0, E.depth / 2, 0), len, E.depth, E.thick, 1, mat, C)] }, embed: E.depth - 1 };
}

export const lawnStone = (rng: RngState, env: Env): Built => flatStone(rng, env, 'stone', LAWN.stone);
