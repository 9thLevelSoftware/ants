// Pavement and patio catalogue (GDD 04 §5.4): paving slab, cracked slab, block paver, edging kerb, back step,
// patio table, patio chair, planter, outside doormat, linear drain, cigarette butt (joint weed [T2] uses the
// seed-grass plant on a smaller scale). Slabs and pavers are placed in grids by place/outdoor/paving.ts.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { C, ca, cy, D, pitchQ, rb, S, v } from './prims';
import { densify, onCircle } from './routes';
import type { Built, Env } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;

export const PAVEMENT = {
  slab: { sizes: [[450, 50, 450], [600, 50, 450], [600, 40, 600]] as [number, number, number][], round: 2, stoneP: 0.3 },
  joint: { sand: [3, 8] as [number, number], mortar: [5, 10] as [number, number], sandP: 0.7, depth: [3, 5] as [number, number] },
  crack: { share: 0.06, gap: [2, 5] as [number, number] },
  paver: { size: [200, 60, 100] as [number, number, number], round: 3, joint: [3, 5] as [number, number], pathP: 0.4, maxCount: 1500 },
  edgingKerb: { size: [50, 150, 915] as [number, number, number], joint: 4, pathP: 0.5, above: 30 },
  backStep: { size: [1000, 75, 300] as [number, number, number] },
  table: { roundP: 0.5, topDia: [800, 1000], rect: [1200, 800], topY: 720, topT: 25, legDia: [25, 40], inset: 90, pedestalP: 0.2, p: 0.6 },
  chair: { seat: 450, seatY: 450, seatT: 20, legDia: [20, 25], backY: 850, count: [2, 4] },
  planter: { side: [400, 800], h: 400, wall: 30, fillBelow: 30, count: [0, 3], concreteP: 0.5 },
  doormat: { size: [750, 20, 450] as [number, number, number], curlBu: [1, 2] },
  drain: { len: 1000, w: 100, depth: 100, wall: 12, slot: [8, 12] as [number, number], bars: 4, p: 0.5 },
  butt: { dia: 8, len: [30, 55] },
};

/** Paving slab (w x t x d), concrete or stone; `crack` splits it in two halves along its width. */
export function pavingSlab(rng: RngState, w: number, t: number, d: number, mat: MaterialId, crack: number): Built {
  const P = PAVEMENT.slab;
  if (crack > 0) {
    const cut = R(rng, -0.25, 0.25) * w;
    const a = w / 2 + cut - crack / 2, b = w / 2 - cut - crack / 2;
    return {
      tpl: {
        id: 'cracked-slab', tags: ['structure', 'paving'],
        prims: [rb(v(-w / 2 + a / 2, t / 2, 0), a, t, d, P.round, mat, C | S), rb(v(w / 2 - b / 2, t / 2, 0), b, t, d, P.round, mat, C | S)],
      },
      tilt: true,
    };
  }
  return { tpl: { id: 'paving-slab', tags: ['structure', 'paving'], prims: [rb(v(0, t / 2, 0), w, t, d, P.round, mat, C | S)] }, tilt: true };
}

export function blockPaver(): Built {
  const [w, h, d] = PAVEMENT.paver.size;
  return { tpl: { id: 'block-paver', tags: ['structure', 'paving'], prims: [rb(v(0, h / 2, 0), w, h, d, PAVEMENT.paver.round, 'concrete', C | S)] } };
}

/** Edging kerb unit along local X, top `above` mm over the path, embedded the rest. */
export function edgingKerb(len = PAVEMENT.edgingKerb.size[2]): Built {
  const [w, h] = PAVEMENT.edgingKerb.size;
  return { tpl: { id: 'edging-kerb', tags: ['structure', 'kerb'], prims: [rb(v(0, h / 2, 0), len, h, w, 4, 'concrete', C | S)] }, embed: h - PAVEMENT.edgingKerb.above, tilt: true };
}

export function backStep(rng: RngState): Built {
  const [w, h, d] = PAVEMENT.backStep.size;
  const mat: MaterialId = chance(rng, 0.5) ? 'concrete' : 'stone';
  return { tpl: { id: 'back-step', tags: ['structure'], prims: [rb(v(0, h / 2, 0), w, h, d, 6, mat, C)] }, tilt: false };
}

/** Patio table: round or rectangular top at 720 on 4 legs (or a pedestal); leg-to-top route, food-spot on top. */
export function patioTable(rng: RngState, env: Env): Built {
  const T = PAVEMENT.table, { bu, foot } = env;
  const mat: MaterialId = (['metal', 'plastic', 'wood-sound'] as const)[rngInt(rng, 0, 2)];
  const round = chance(rng, T.roundP);
  const dia = R(rng, T.topDia[0], T.topDia[1]);
  const [rw, rd] = T.rect;
  const y1 = T.topY, y0 = y1 - T.topT;
  const prims: PrimSpec[] = [round ? cy(v(0, y1 - T.topT / 2, 0), dia, T.topT, mat, C | S, undefined, 4) : rb(v(0, y1 - T.topT / 2, 0), rw, T.topT, rd, 4, mat, C | S)];
  const pts: Vec3[] = [];
  if (chance(rng, T.pedestalP)) {
    prims.push(cy(v(0, y0 / 2, 0), 60, y0, 'metal', C), cy(v(0, 10, 0), 500, 20, 'metal', C, undefined, 4));
    pts.push(v(250 + foot + 3 * bu, foot, 0), v(250 + foot, 10, 0), v(250 - 2 * bu, 20 + foot, 0), v(30 + foot, 20 + 2 * bu, 0), v(30 + foot, y0 - 2 * bu, 0));
    const edge = round ? dia / 2 : rw / 2;
    pts.push(v(edge - 3 * bu, y0 - foot, 0), v(edge + foot, y0 + T.topT / 2, 0), v(edge - 3 * bu, y1 + foot, 0), v(0, y1 + foot, 0));
  } else {
    const ld = R(rng, T.legDia[0], T.legDia[1]);
    const legs: [number, number][] = round
      ? [0, 1, 2, 3].map((k) => { const p = onCircle(0, 0, 0, dia / 2 - T.inset, (k * Math.PI) / 2 + Math.PI / 4); return [p.x, p.z] as [number, number]; })
      : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * (rw / 2 - T.inset), b * (rd / 2 - T.inset)] as [number, number]);
    for (const [x, z] of legs) prims.push(cy(v(x, y0 / 2, z), ld, y0 + 2, mat === 'plastic' ? 'plastic' : 'metal', C));
    // route on the first leg's outer side (radial), under the top to the edge, around the lip, to the centre
    const [lx, lz] = legs[0];
    const l = Math.sqrt(lx * lx + lz * lz), ux = lx / l, uz = lz / l;
    const edge = round ? dia / 2 : Math.min((rw / 2) / Math.abs(ux || 1e-9), (rd / 2) / Math.abs(uz || 1e-9));
    const at = (r: number, y: number) => v(ux * r, y, uz * r);
    pts.push(at(l + ld / 2 + foot + 3 * bu, foot), at(l + ld / 2 + foot, 2 * bu), at(l + ld / 2 + foot, y0 - 2 * bu), at(l + ld / 2 + 2 * bu, y0 - foot),
      at(edge - 2 * bu, y0 - foot), at(edge + foot, y0 + T.topT / 2), at(edge - 2 * bu, y1 + foot), v(0, y1 + foot, 0));
  }
  return {
    tpl: { id: 'patio-table', prims, tags: ['structure', 'furniture'], routes: [{ kind: 'leg-to-top', points: densify(pts, 5 * bu) }], pois: [{ kind: 'food-spot', pos: v(0, y1 + foot, 0) }] },
    tilt: false,
  };
}

/** Patio chair: seat 450 x 450 at 450, four legs, back to 850 on the -Z side; leg-to-seat route. */
export function patioChair(rng: RngState, env: Env): Built {
  const H = PAVEMENT.chair, { bu, foot } = env;
  const mat: MaterialId = chance(rng, 0.5) ? 'metal' : 'plastic';
  const s = H.seat, y1 = H.seatY, y0 = y1 - H.seatT, ld = R(rng, H.legDia[0], H.legDia[1]);
  const k = s / 2 - 40;
  const prims: PrimSpec[] = [rb(v(0, y1 - H.seatT / 2, 0), s, H.seatT, s, 3, mat, C | S)];
  for (const [x, z] of [[-k, -k], [k, -k], [-k, k], [k, k]]) prims.push(cy(v(x, y0 / 2, z), ld, y0 + 2, mat, C));
  prims.push(rb(v(0, (y1 + H.backY) / 2, -s / 2 + 10), s, H.backY - y1, 20, 3, mat, C));
  const pts = [v(k, foot, k + ld / 2 + foot + 3 * bu), v(k, 2 * bu, k + ld / 2 + foot), v(k, y0 - 2 * bu, k + ld / 2 + foot), v(k, y0 - foot, k + ld / 2 + 2 * bu),
    v(k, y0 - foot, s / 2 - 2 * bu), v(k, y1 - H.seatT / 2, s / 2 + foot), v(k, y1 + foot, s / 2 - 2 * bu), v(0, y1 + foot, 0)];
  return { tpl: { id: 'patio-chair', prims, tags: ['structure', 'furniture'], routes: [{ kind: 'leg-to-seat', points: densify(pts, 5 * bu) }] }, tilt: false };
}

/** Square planter (four walls + loam fill 30 below the rim); pot-to-soil route. */
export function planter(rng: RngState, env: Env): Built {
  const P = PAVEMENT.planter, { bu, foot } = env;
  const s = R(rng, P.side[0], P.side[1]), w = P.wall, h = P.h;
  const mat: MaterialId = chance(rng, P.concreteP) ? 'concrete' : 'wood-sound';
  const prims: PrimSpec[] = [
    rb(v(0, h / 2, -s / 2 + w / 2), s, h, w, 4, mat, C | S), rb(v(0, h / 2, s / 2 - w / 2), s, h, w, 4, mat, C | S),
    rb(v(-s / 2 + w / 2, h / 2, 0), w, h, s - 2 * w + 2, 4, mat, C | S), rb(v(s / 2 - w / 2, h / 2, 0), w, h, s - 2 * w + 2, 4, mat, C | S),
  ];
  const fill = h - P.fillBelow;
  prims.push(rb(v(0, fill / 2, 0), s - 2 * w + 2, fill, s - 2 * w + 2, 0, 'loam', C | D));
  const pts = [v(s / 2 + foot + 3 * bu, foot, 0), v(s / 2 + foot, 2 * bu, 0), v(s / 2 + foot, h - 2 * bu, 0), v(s / 2 - w / 2, h + foot, 0), v(s / 2 - w - foot, h - 2 * bu, 0),
    v(s / 2 - w - foot, fill + 1.5 * bu, 0), v(s / 2 - w - 3 * bu, fill + foot, 0), v(0, fill + foot, 0)];
  return {
    tpl: { id: 'planter', prims, tags: ['structure', 'pot'], routes: [{ kind: 'pot-to-soil', points: densify(pts, 6 * bu) }], pois: [{ kind: 'nest-site', pos: v(0, fill + foot, 0) }] },
    embed: 10,
  };
}

/** Outside doormat with one curled edge leaving a 1-2 BU gap. */
export function doormatOutside(rng: RngState, env: Env): Built {
  const [w, t, d] = PAVEMENT.doormat.size;
  const gap = R(rng, PAVEMENT.doormat.curlBu[0], PAVEMENT.doormat.curlBu[1]) * env.bu;
  const strip = 60;
  return {
    tpl: {
      id: 'doormat-outside', tags: ['prop'],
      prims: [rb(v(0, t / 2, -strip / 2), w, t, d - strip, 3, 'fabric', C | S), rb(v(0, t / 2 + gap, d / 2 - strip / 2), w, t, strip, 3, 'fabric', C | S, pitchQ(-0.05))],
    },
    tilt: true,
  };
}

/**
 * Linear drain along local X: channel walls and base below the surface (local y = 0 = paving level), a terrain hole
 * over the channel, and a grate of longitudinal bars with 8-12 mm slots (drain-grille micro-connection).
 */
export function linearDrain(rng: RngState, env: Env): Built {
  const P = PAVEMENT.drain, bu = env.bu;
  const L = P.len, W = P.w, Dp = P.depth, wl = P.wall;
  const slotMin = Math.max(P.slot[0], 0.6 * bu);
  const slot = slotMin <= P.slot[1] ? R(rng, slotMin, P.slot[1]) : P.slot[1];
  const barW = (W - (P.bars - 1) * slot) / P.bars;
  const prims: PrimSpec[] = [
    rb(v(0, -Dp - 10, 0), L + 2 * wl, 20, W + 2 * wl, 2, 'concrete', C),
    rb(v(0, -Dp / 2, -W / 2 - wl / 2), L + 2 * wl, Dp, wl, 1, 'concrete', C),
    rb(v(0, -Dp / 2, W / 2 + wl / 2), L + 2 * wl, Dp, wl, 1, 'concrete', C),
    rb(v(-L / 2 - wl / 2, -Dp / 2, 0), wl, Dp, W, 1, 'concrete', C),
    rb(v(L / 2 + wl / 2, -Dp / 2, 0), wl, Dp, W, 1, 'concrete', C),
  ];
  for (let i = 0; i < P.bars; i++) {
    const z = -W / 2 + barW / 2 + i * (barW + slot);
    prims.push(rb(v(0, -4, z), L, 8, barW, 1, 'metal', C | S));
  }
  for (const x of [-L / 4, L / 4]) prims.push(rb(v(x, -10, 0), 8, 12, W, 1, 'metal', C));
  const sz = -W / 2 + barW + slot / 2;
  return {
    tpl: { id: 'linear-drain', prims, tags: ['structure', 'drain'], pois: [{ kind: 'shelter', pos: v(0, -Dp + env.foot, 0) }] },
    tilt: false,
    holes: [{ x0: -L / 2, z0: -W / 2, x1: L / 2, z1: W / 2 }],
    micro: [{ kind: 'drain-grille', a: v(L / 8, 2 * bu, sz), b: v(L / 8, -Dp / 2, sz), gapMm: slot, clearMm: slot, lengthMm: Dp / 2 + 2 * bu }],
  };
}

export function cigaretteButt(rng: RngState): Built {
  const B = PAVEMENT.butt, l = R(rng, B.len[0], B.len[1]), r = B.dia / 2;
  return { tpl: { id: 'cigarette-butt', tags: ['prop'], prims: [ca(v(-l / 2 + r, r, 0), v(l / 2 - r, r, 0), B.dia, 'paper', C)] } };
}


