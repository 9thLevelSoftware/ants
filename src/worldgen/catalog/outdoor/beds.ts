// Garden-bed catalogue (GDD 04 §5.3): mulch chip, perennial, shrub, bean row [T2], raised-bed board, plant pot
// (+ saucer), dry-stone garden wall, fence section, shed, compost bin [T2], water butt, bird table [T2], fruit
// tree. Windfall fruit [T2] is seasonal food (ecology) and is not placed by the generator.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { C, chain, cy, D, el, NB, rb, ring, rollQ, S, v } from './prims';
import { dcos, dsin } from '../../kit/dmath';
import { densify } from './routes';
import { growPlant, type PlantTemplate } from './plant';
import { standingTree } from './forest';
import type { Built, Env, LocalMicro } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;

export const BEDS = {
  mulch: { l: [20, 50], w: [10, 30], t: [3, 10], r: [1, 2] },
  board: { thick: 25, decayedP: 0.4, decayedH: 50, aboveSoil: 20 },
  pot: { dia: [100, 400], hK: [0.8, 1.1], wall: [8, 12], staves: [10, 16], fillBelowRim: 20, footGap: [3, 8], saucerP: 0.5, ceramicP: 0.5 },
  saucer: { extra: 40, h: [20, 30], staves: 12, wall: 6 },
  wall: { h: [200, 600], thick: [300, 450], stone: [100, 300], gap: [5, 30], course: [100, 200] },
  fence: { postSq: [75, 100], postH: 1800, postEmbed: 300, panelW: 1830, panelT: 20, boardH: 150, boardT: 22, boardEmbed: 30,
    postDecayedP: 0.3, postFootH: 300, boardConcreteP: 0.5, gapP: 0.4, gapMm: [10, 50], gapLen: [200, 900] },
  shed: { w: 1800, h: 2000, d: 1200, floor: 18, wall: 18, bearerGap: [30, 150], bearerDecayedP: 0.5, roofOver: 60 },
  compost: { w: 1000, h: 900, d: 1000, slatH: 100, slatT: 18, gap: [10, 20], post: 50, heapH: [100, 250], voids: [3, 6], voidBu: [2, 4] },
  butt: { dia: 600, h: 900, stand: 300, standW: 520, tapDia: 20, tapLen: 60 },
  birdTable: { post: 50, h: 1500, top: 300, topT: 20, footW: 400 },
  fruitTree: { trunkDia: [80, 200] as [number, number], height: 1500, branches: [3, 5] as [number, number], canopyR: [1500, 2500] },
  beanRow: { canes: [5, 7], spacing: 300, caneDia: [10, 15], caneH: [1500, 2000], stemDia: [4, 8] },
};

export const PERENNIAL: PlantTemplate = {
  stems: 4, stemDiamMm: [3, 8], stemLenMm: [200, 600], segmentMm: [40, 80], branchLevels: 0, branchAngleDeg: [25, 45],
  leavesPerStem: [3, 6], leafMm: { w: [15, 60], l: [30, 120] }, leafThicknessMm: 0.8, flowerMm: [20, 60], woody: false,
  waxyP: 0.2, hostP: { aphid: 0.4, nectar: 1 }, hostClass: 'herb', leanDeg: [3, 18], droopDeg: [10, 35],
};
export const SHRUB: PlantTemplate = {
  stems: 2, stemDiamMm: [8, 25], stemLenMm: [400, 1200], segmentMm: [150, 300], branchLevels: 2, branchAngleDeg: [25, 55],
  leavesPerStem: [4, 6], leafMm: { w: [25, 60], l: [40, 100] }, leafThicknessMm: 0.8, flowerMm: [0, 0], woody: true,
  waxyP: 0, hostP: { aphid: 0.6, scale: 0.2 }, hostClass: 'shrub', leanDeg: [3, 20], droopDeg: [5, 25],
};

export const perennial = (rng: RngState, env: Env): Built => growPlant('perennial-plant', PERENNIAL, rng, env);
export const shrub = (rng: RngState, env: Env): Built => growPlant('shrub', SHRUB, rng, env);

export function mulchChip(rng: RngState): Built {
  const M = BEDS.mulch;
  const l = R(rng, M.l[0], M.l[1]), w = R(rng, M.w[0], M.w[1]), t = R(rng, M.t[0], M.t[1]);
  return { tpl: { id: 'mulch-chip', tags: ['prop'], prims: [rb(v(0, t / 2, 0), l, t, w, R(rng, M.r[0], M.r[1]), 'bark', C | S)] } };
}

/** Raised-bed board of length `len` standing on the outside ground; its top `lift + 20` above that ground. */
export function raisedBedBoard(rng: RngState, len: number, lift: number): Built {
  const B = BEDS.board;
  const h = lift + B.aboveSoil + 40;
  const prims: PrimSpec[] = [];
  if (chance(rng, B.decayedP)) {
    prims.push(rb(v(0, B.decayedH / 2, 0), len, B.decayedH, B.thick, 2, 'wood-decayed', C | S | D));
    prims.push(rb(v(0, (B.decayedH + h) / 2, 0), len, h - B.decayedH, B.thick, 3, 'wood-sound', C | S));
  } else prims.push(rb(v(0, h / 2, 0), len, h, B.thick, 3, 'wood-sound', C | S));
  return { tpl: { id: 'raised-bed-board', tags: ['structure', 'wood'], prims }, embed: 40, tilt: false };
}

/** Plant pot (ring of staves, base on small feet, loam fill 20 below the rim); optionally standing in a saucer. */
export function plantPot(rng: RngState, env: Env, forceSaucer?: boolean): Built {
  const P = BEDS.pot, SA = BEDS.saucer, { bu, foot } = env;
  const dia = R(rng, P.dia[0], P.dia[1]), h = dia * R(rng, P.hK[0], P.hK[1]), wall = R(rng, P.wall[0], P.wall[1]);
  const n = rngInt(rng, P.staves[0], P.staves[1]);
  const mat: MaterialId = chance(rng, P.ceramicP) ? 'ceramic' : 'plastic';
  const saucer = forceSaucer ?? chance(rng, P.saucerP);
  const prims: PrimSpec[] = [];
  const pts: Vec3[] = [];
  let y0 = 0;
  const R0 = dia / 2;
  const water: Built['water'] = [];
  if (saucer) {
    const sd = dia + SA.extra, sh = R(rng, SA.h[0], SA.h[1]), sr = sd / 2;
    prims.push(cy(v(0, 2, 0), sd - 4, 4, mat, C), ...ring(SA.staves, v(0, 0, 0), sr, SA.wall, sh, mat, C));
    y0 = 4;
    pts.push(v(sr + foot + 2 * bu, foot, 0), v(sr + foot, 2 * bu, 0), v(sr + foot, sh - bu, 0), v(sr - SA.wall / 2, sh + foot, 0), v(sr - SA.wall - foot, sh - bu, 0), v(sr - SA.wall - foot, y0 + 1.5 * bu, 0), v((sr - SA.wall + R0) / 2, y0 + foot, 0));
    water.push({ kind: 'bowl-water', pos: v(0, y0, 0), radius: sr - SA.wall, levelMm: 0, capMm: 0.8 * (sh - y0) });
  }
  const gap = R(rng, P.footGap[0], P.footGap[1]);
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 + 0.5;
    prims.push(rb(v(0.6 * R0 * dcos(a), y0 + gap / 2, 0.6 * R0 * dsin(a)), 30, gap, 30, 2, mat, C));
  }
  const bottom = y0 + gap;
  prims.push(cy(v(0, bottom + 5, 0), dia - 2 * wall + 4, 10, mat, C | S));
  prims.push(...ring(n, v(0, bottom, 0), R0, wall, h, mat, C | S));
  const fillTop = bottom + h - P.fillBelowRim;
  prims.push(cy(v(0, (bottom + 10 + fillTop) / 2, 0), dia - 2 * wall + 2, fillTop - bottom - 10, 'loam', C | D));
  if (!saucer) pts.push(v(R0 + foot + 2 * bu, foot, 0));
  pts.push(v(R0 + foot, bottom + 2 * bu, 0), v(R0 + foot, bottom + h - 2 * bu, 0), v(R0 - wall / 2, bottom + h + foot, 0),
    v(R0 - wall - foot, bottom + h - 2 * bu, 0), v(R0 - wall - foot, fillTop + 1.5 * bu, 0), v(R0 - wall - 3 * bu, fillTop + foot, 0), v(0, fillTop + foot, 0));
  return {
    tpl: {
      id: 'plant-pot', prims, tags: ['prop', 'pot'],
      routes: [{ kind: 'pot-to-soil', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'nest-site', pos: v(0, fillTop + foot, 0) }],
    },
    tilt: false, water,
  };
}

/**
 * Dry-stone wall section of length `len` along local X (outer face at -Z): stacked stones with gaps 5-30, the
 * `wall-crevice` micro-connection through one gap, a `wall-face` route base -> top on the +Z face.
 */
export function dryStoneWall(rng: RngState, env: Env, len: number, height?: number, thick?: number): Built {
  const W = BEDS.wall, { bu, foot } = env;
  const g = env.ground ?? (() => 0);
  const H = height ?? R(rng, W.h[0], W.h[1]), T = thick ?? R(rng, W.thick[0], W.thick[1]);
  const prims: PrimSpec[] = [];
  const gapMin = Math.max(W.gap[0], 0.6 * bu);
  let y = -40, course = 0;
  let crevice: LocalMicro | null = null;
  while (y < H - 40 && prims.length < 60) {
    const ch = Math.min(H - y, R(rng, W.course[0], W.course[1]));
    let x = -len / 2 + (course % 2 ? R(rng, 40, 120) : 0);
    while (x < len / 2 - 40) {
      const sl = Math.min(len / 2 - x, R(rng, W.stone[0], W.stone[1]));
      const gap = gapMin <= W.gap[1] ? R(rng, gapMin, W.gap[1]) : W.gap[1];
      const cx = x + sl / 2;
      const isEl = chance(rng, 0.3);
      const sh = ch * R(rng, 0.9, 1), sd = T * R(rng, 0.9, 1);
      prims.push(isEl ? el(v(cx, y + sh / 2, 0), sl, sh, sd, 'stone', C | S) : rb(v(cx, y + sh / 2, 0), sl, sh, sd, Math.min(15, sh * 0.2), 'stone', C | S));
      if (!crevice && course === 1 && x + sl + gap < len / 2 - 40 && x > -len / 2 + 200) {
        const gx = x + sl + gap / 2, gy = y + ch / 2;
        crevice = { kind: 'wall-crevice', a: v(gx, gy, -T / 2 - 2 * bu), b: v(gx, gy, T / 2 + 2 * bu), gapMm: gap, clearMm: Math.min(gap, ch * 0.5), lengthMm: T + 4 * bu };
      }
      x += sl + gap;
    }
    y += ch;
    course++;
  }
  // wall-face route on the +Z face up to the top course
  const top = y;
  const rx = len * R(rng, -0.3, 0.3);
  const pts = [v(rx, g(rx, T / 2 + 3 * bu) + foot, T / 2 + foot + 3 * bu), v(rx, g(rx, T / 2) + 2 * bu, T / 2 * 0.9 + foot), v(rx, top - 2 * bu, T / 2 * 0.9 + foot), v(rx, top + foot, T / 4), v(rx, top + foot, 0)];
  return {
    tpl: {
      id: 'garden-wall', prims, tags: ['structure', 'wall'],
      routes: [{ kind: 'wall-face', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'vantage', pos: v(rx, top + foot, 0) }],
    },
    tilt: false, micro: crevice ? [crevice] : [],
  };
}

/**
 * One fence section along local X: the post at x = 0 and the panel + gravel board to the next post at
 * x = panelW (garden side +Z). With `gap`, a stretch of the board stands `gapMm` clear of the ground (fence-gap).
 * The fence-rail route climbs the post on the garden side and runs along the panel top to the next post.
 */
export function fenceSection(rng: RngState, env: Env, opt: { panel: boolean; gap: boolean; route: boolean; width?: number }): Built {
  const F = BEDS.fence, { bu, foot } = env;
  const g = env.ground ?? (() => 0);
  const ps = R(rng, F.postSq[0], F.postSq[1]);
  const W = opt.width ?? F.panelW;
  const prims: PrimSpec[] = [];
  const gMin = Math.min(g(0, 0), g(-ps / 2, 0), g(ps / 2, 0));
  const foot0 = gMin - F.postEmbed;
  if (chance(rng, F.postDecayedP)) {
    prims.push(rb(v(0, (foot0 + F.postFootH) / 2, 0), ps, F.postFootH - foot0, ps, 3, 'wood-decayed', C | D | NB));
    prims.push(rb(v(0, (F.postFootH + F.postH) / 2, 0), ps, F.postH - F.postFootH, ps, 3, 'wood-sound', C | NB));
  } else prims.push(rb(v(0, (foot0 + F.postH) / 2, 0), ps, F.postH - foot0, ps, 3, 'wood-sound', C | NB));
  const micro: LocalMicro[] = [];
  if (opt.panel) {
    const x0 = ps / 2, x1 = W - ps / 2, mid = (x0 + x1) / 2;
    const boardMat: MaterialId = chance(rng, F.boardConcreteP) ? 'concrete' : 'wood-sound';
    let gMax = -Infinity, gLow = Infinity;
    for (let i = 0; i <= 8; i++) { const gx = g(x0 + ((x1 - x0) * i) / 8, 0); gMax = Math.max(gMax, gx); gLow = Math.min(gLow, gx); }
    const bTop = gMax + F.boardH;
    const board = (a: number, b: number, bottom: number) => rb(v((a + b) / 2, (bottom + bTop) / 2, 0), b - a, bTop - bottom, F.boardT, 2, boardMat, C | S);
    if (opt.gap) {
      const gl = Math.min(R(rng, F.gapLen[0], F.gapLen[1]), (x1 - x0) * 0.7);
      const gm = Math.max(F.gapMm[0], 0.6 * bu * 1.5);
      const gapMm = gm <= F.gapMm[1] ? R(rng, gm, F.gapMm[1]) : F.gapMm[1];
      const ga = mid - gl / 2, gb = mid + gl / 2;
      let gTop = -Infinity;
      for (let i = 0; i <= 6; i++) gTop = Math.max(gTop, g(ga + ((gb - ga) * i) / 6, 0), g(ga + ((gb - ga) * i) / 6, F.boardT), g(ga + ((gb - ga) * i) / 6, -F.boardT));
      prims.push(board(x0, ga, gLow - F.boardEmbed), board(gb, x1, gLow - F.boardEmbed), board(ga, gb, gTop + gapMm));
      const yG = g(mid, 0) + (gTop + gapMm - g(mid, 0)) / 2;
      micro.push({ kind: 'fence-gap', a: v(mid, yG, F.boardT / 2 + 2 * bu), b: v(mid, yG, -F.boardT / 2 - 2 * bu), gapMm, clearMm: gTop + gapMm - Math.max(g(mid, 0), g(mid, F.boardT), g(mid, -F.boardT)), lengthMm: F.boardT + 4 * bu });
    } else prims.push(board(x0, x1, gLow - F.boardEmbed));
    prims.push(rb(v(mid, (bTop + F.postH) / 2, 0), x1 - x0, F.postH - bTop, F.panelT, 2, 'wood-sound', C | S | NB));
  }
  const routes: Built['tpl']['routes'] = [];
  if (opt.route && opt.panel) {
    const z = ps / 2 + foot;
    const pts = [v(0, g(0, z + 3 * bu) + foot, z + 3 * bu), v(0, g(0, ps / 2) + 2 * bu, z), v(0, F.postH - 2 * bu, z), v(0, F.postH + foot, ps / 4), v(ps / 2, F.postH + foot, 0), v(W - ps / 2, F.postH + foot, 0)];
    routes.push({ kind: 'fence-rail', points: densify(pts, 6 * bu) });
  }
  return {
    tpl: { id: 'fence', prims, tags: ['structure', 'fence'], routes, pois: opt.route ? [{ kind: 'vantage', pos: v(0, F.postH + foot, 0) }] : [] },
    tilt: false, micro,
  };
}

export function shed(rng: RngState, env: Env): Built {
  const H = BEDS.shed, foot = env.foot;
  const bg = R(rng, H.bearerGap[0], H.bearerGap[1]);
  const prims: PrimSpec[] = [];
  const bearerMat: MaterialId = chance(rng, H.bearerDecayedP) ? 'wood-decayed' : 'wood-sound';
  for (const z of [-H.d / 2 + 50, 0, H.d / 2 - 50]) prims.push(rb(v(0, bg / 2 - 10, z), H.w, bg + 20, 50, 3, bearerMat, C | S | (bearerMat === 'wood-decayed' ? D : 0)));
  const fy = bg;
  prims.push(rb(v(0, fy + H.floor / 2, 0), H.w, H.floor, H.d, 2, 'wood-sound', C | S));
  const wy = fy + H.floor, wh = H.h - wy - 40;
  prims.push(
    rb(v(0, wy + wh / 2, -H.d / 2 + H.wall / 2), H.w, wh, H.wall, 2, 'wood-sound', C | S | NB),
    rb(v(0, wy + wh / 2, H.d / 2 - H.wall / 2), H.w, wh, H.wall, 2, 'wood-sound', C | S | NB),
    rb(v(-H.w / 2 + H.wall / 2, wy + wh / 2, 0), H.wall, wh, H.d - 2 * H.wall, 2, 'wood-sound', C | S | NB),
    rb(v(H.w / 2 - H.wall / 2, wy + wh / 2, 0), H.wall, wh, H.d - 2 * H.wall, 2, 'wood-sound', C | S | NB),
    rb(v(0, H.h - 20, 0), H.w + 2 * H.roofOver, 40, H.d + 2 * H.roofOver, 4, 'wood-sound', C | S),
  );
  return { tpl: { id: 'shed', prims, tags: ['structure', 'shed'], pois: [{ kind: 'shelter', pos: v(0, foot, 0) }] }, embed: 20 };
}

export function compostBin(rng: RngState, env: Env): Built {
  const K = BEDS.compost, bu = env.bu;
  const prims: PrimSpec[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prims.push(rb(v((x * (K.w - K.post)) / 2, K.h / 2 - 50, (z * (K.d - K.post)) / 2), K.post, K.h + 100, K.post, 3, 'wood-sound', C | NB));
  const gap = R(rng, K.gap[0], K.gap[1]);
  for (let y = 10; y + K.slatH <= K.h; y += K.slatH + gap) {
    const cy0 = y + K.slatH / 2;
    prims.push(rb(v(0, cy0, -K.d / 2 + K.slatT / 2), K.w - 2 * K.post, K.slatH, K.slatT, 2, 'wood-sound', C | S));
    prims.push(rb(v(0, cy0, K.d / 2 - K.slatT / 2), K.w - 2 * K.post, K.slatH, K.slatT, 2, 'wood-sound', C | S));
    prims.push(rb(v(-K.w / 2 + K.slatT / 2, cy0, 0), K.slatT, K.slatH, K.d - 2 * K.post, 2, 'wood-sound', C | S));
    prims.push(rb(v(K.w / 2 - K.slatT / 2, cy0, 0), K.slatT, K.slatH, K.d - 2 * K.post, 2, 'wood-sound', C | S));
  }
  const heapH = R(rng, K.heapH[0], K.heapH[1]);
  const nv = rngInt(rng, K.voids[0], K.voids[1]);
  const carves: NonNullable<Built['cavities']>[number]['carves'] = [];
  for (let i = 0; i < nv; i++) {
    const r = (R(rng, K.voidBu[0], K.voidBu[1]) * bu) / 2;
    carves.push({ shape: 'sphere', a: v(R(rng, -0.3, 0.3) * K.w, heapH * R(rng, 0.2, 0.6), R(rng, -0.3, 0.3) * K.d), b: v(0, 0, 0), r });
  }
  return {
    tpl: { id: 'compost-bin', prims, tags: ['structure', 'compost'], pois: [{ kind: 'shelter', pos: v(0, heapH + env.foot, 0) }] },
    tilt: false, embed: 50,
    cavities: [{ kind: 'compost-void', carves, openings: [] }],
    mound: { w: K.w - 2 * K.slatT, d: K.d - 2 * K.slatT, h: heapH },
  };
}

export function waterButt(env: Env): Built {
  const B = BEDS.butt, { bu, foot } = env;
  const r = B.dia / 2;
  const tapY = B.stand + 80;
  const prims: PrimSpec[] = [
    rb(v(0, B.stand / 2, 0), B.standW, B.stand, B.standW, 6, 'plastic', C | S),
    cy(v(0, B.stand + B.h / 2, 0), B.dia, B.h, 'plastic', C | NB, undefined, 10),
    cy(v(r + B.tapLen / 2 - 5, tapY, 0), B.tapDia, B.tapLen, 'plastic', C, rollQ(Math.PI / 2)),
  ];
  const sw = B.standW / 2;
  const pts = [v(sw + foot + 3 * bu, foot, 0), v(sw + foot, 2 * bu, 0), v(sw + foot, B.stand - 2 * bu, 0), v(sw - 2 * bu, B.stand + foot, 0), v(r + foot, B.stand + 2 * bu, 0), v(r + foot, tapY - B.tapDia, 0), v(r + B.tapLen - 10, tapY - B.tapDia / 2 - foot, 0)];
  return {
    tpl: {
      id: 'water-butt', prims, tags: ['structure', 'water'],
      routes: [{ kind: 'side-to-tap', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'water-spot', pos: v(r + B.tapLen - 10, tapY - B.tapDia / 2 - foot, 0) }, { kind: 'shelter', pos: v(0, foot, 0) }],
    },
    tilt: false,
    water: [{ kind: 'wet-patch', pos: v(0, 0, 0), radius: r, levelMm: 0, capMm: 0 }],
  };
}

export function birdTable(rng: RngState, env: Env): Built {
  const B = BEDS.birdTable, { bu, foot } = env;
  const p = B.post;
  const prims: PrimSpec[] = [
    rb(v(0, B.h / 2 - 100, 0), p, B.h + 200, p, 3, 'wood-sound', C | NB),
    rb(v(0, 15, 0), B.footW, 30, 60, 3, 'wood-sound', C),
    rb(v(0, 15, 0), 60, 30, B.footW, 3, 'wood-sound', C),
    rb(v(0, B.h + B.topT / 2, 0), B.top, B.topT, B.top, 3, 'wood-sound', C),
  ];
  const z = p / 2 + foot;
  const pts = [v(0, foot + 30, B.footW / 2 + foot + 3 * bu), v(0, 30 + foot, z + 2 * bu), v(0, 30 + 2 * bu, z), v(0, B.h - 2 * bu, z), v(0, B.h - foot, B.top / 2 - 3 * bu), v(0, B.h + B.topT / 2, B.top / 2 + foot), v(0, B.h + B.topT + foot, B.top / 2 - 3 * bu), v(0, B.h + B.topT + foot, 0)];
  void rng;
  return {
    tpl: {
      id: 'bird-table', prims, tags: ['structure'],
      routes: [{ kind: 'post-to-top', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'food-spot', pos: v(0, B.h + B.topT + foot, 0) }],
    },
    tilt: false,
  };
}

export function fruitTree(rng: RngState, env: Env): Built {
  const F = BEDS.fruitTree;
  const b = standingTree(rng, env, { id: 'fruit-tree', trunkDia: F.trunkDia, height: F.height, branches: F.branches });
  b.canopy = { y: 2600, r: R(rng, F.canopyR[0], F.canopyR[1]) };
  return b;
}

/** Bean row [T2]: canes in a row along local X with climbing stems; the stem route climbs the first cane. */
export function beanRow(rng: RngState, env: Env): Built {
  const B = BEDS.beanRow, { bu, foot } = env;
  const n = rngInt(rng, B.canes[0], B.canes[1]);
  const prims: PrimSpec[] = [];
  const x0 = (-(n - 1) * B.spacing) / 2;
  let route: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * B.spacing, cd = R(rng, B.caneDia[0], B.caneDia[1]), ch = R(rng, B.caneH[0], Math.min(B.caneH[1], 2350));
    prims.push(cy(v(x, ch / 2 - 75, 0), cd, ch + 150, 'wood-sound', C));
    const sd = R(rng, B.stemDia[0], B.stemDia[1]), off = cd / 2 + sd / 2;
    const pts = [v(x + off, -2, 0), v(x, ch * 0.3, off), v(x - off, ch * 0.6, 0), v(x, ch * 0.85, -off)];
    prims.push(...chain(pts, sd, 'plant', C | S));
    if (i === 0) route = [v(x - cd / 2 - foot - 3 * bu, foot, -cd), v(x - cd / 2 - foot, 2 * bu, -cd / 2), v(x - cd / 2 - foot, ch * 0.45, -cd / 2)];
  }
  return {
    tpl: { id: 'bean-row', prims, tags: ['plant'], routes: [{ kind: 'stem', points: densify(route, 6 * bu) }], pois: [{ kind: 'aphid-site', pos: route[route.length - 1] }] },
    tilt: false, host: { hostFlags: chance(rng, 0.7) ? 1 | 2 : 2, hostClass: 'herb' },
  };
}
