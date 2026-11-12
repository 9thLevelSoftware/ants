// Parking and asphalt catalogue (GDD 04 §5.5): kerb unit (with the kerb-gap variant), wheel stop, bollard, lamp
// post, gully grate with its pot, manhole cover, parked car (static), drink can, bottle cap, tree-pit tree. Painted
// lines are decals (decor descriptors), verge weeds [T2] are not placed.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { C, cy, el, NB, rb, ring, rollQ, S, v, VIS } from './prims';
import { densify } from './routes';
import { standingTree } from './forest';
import type { Built, Env, LocalCavity, LocalMicro } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;

export const ASPHALT = {
  kerb: { width: 125, embed: 150, unit: 915, joint: [3, 6] as [number, number], round: 10, gapP: 0.15,
    /** kerb-gap: clear height under the kerb at the gutter (mm, >= 1.5 x the 0.6 BU minimum) and the tunnel (BU). */
    gapH: [5, 20] as [number, number], tunnelBu: [1, 1.5] as [number, number], riseRun: 1 },
  wheelStop: { size: [1650, 100, 150] as [number, number, number], gap: [0, 10] as [number, number], p: 0.5, rubberP: 0.5 },
  bollard: { dia: 150, h: 900, spacing: 1500, count: [0, 6] as [number, number], metalP: 0.5 },
  lamp: { baseDia: 200, baseH: 300, shaftDia: 150, top: 2400 },
  gully: { frame: 450, frameW: 40, bar: 25, gap: [10, 30] as [number, number], barT: 30, potDepth: 600, potWall: 25, potStaves: 12,
    waterBelow: 200, perM2: 1 / 50, kerbOffset: 380 },
  manhole: { dia: 600, t: 10, p: 0.4 },
  car: { body: [1800, 300, 4300] as [number, number, number], clearance: [150, 200] as [number, number], tyre: [630, 195] as [number, number],
    wheelInsetZ: 700, bodyVisualH: 900, share: [0.3, 0.7] as [number, number] },
  can: { dia: 66, h: 115, perM2: 0.03, lyingP: 0.6 },
  cap: { dia: 30, h: 6, perM2: 0.05 },
  treePit: { side: 1000, trunkDia: [100, 200] as [number, number], spacing: 3000, count: [0, 2] as [number, number] },
};

/**
 * Kerb unit along local X; local y = 0 is the kerb top (verge level at the kerb line), the road lies at -upstand on
 * the -Z side, the verge (or sidewalk) on +Z. With `gap`, the unit sits `gapH` clear of the gutter and a tunnel
 * runs through the haunching under it and up into the verge (kerb-gap + kerb-void), or into the sub-base below
 * paving (`paved`, the slab underside at -pavedDepth).
 */
export function kerbUnit(rng: RngState, env: Env, o: { len: number; upstand: number; gap: boolean; paved: boolean; pavedDepth: number }): Built {
  const K = ASPHALT.kerb, bu = env.bu;
  const W = K.width, road = -o.upstand;
  let bottom = road - K.embed;
  const cavities: LocalCavity[] = [];
  const micro: LocalMicro[] = [];
  if (o.gap) {
    const gMin = Math.max(K.gapH[0], 1.5 * 0.6 * bu);
    const gapH = gMin <= K.gapH[1] ? R(rng, gMin, K.gapH[1]) : K.gapH[1];
    bottom = road + gapH;
    const rt = Math.max(0.5 * bu, (R(rng, K.tunnelBu[0], K.tunnelBu[1]) * bu) / 2);
    const yt = Math.min(bottom - rt - 0.25 * bu, road + Math.max(rt * 0.8, gapH / 2));
    const x = R(rng, -0.25, 0.25) * o.len;
    const m0 = v(x, yt, -W - rt), m1 = v(x, yt, 0.5 * bu);
    const top = o.paved ? -o.pavedDepth - rt - 0.25 * bu : -0.3 * rt;
    const run = (top - yt) * K.riseRun;
    const m2 = v(x, top, Math.max(0.5 * bu + run, W * 0.3));
    cavities.push({
      kind: 'kerb-void',
      carves: [{ shape: 'capsule', a: m0, b: m1, r: rt }, { shape: 'capsule', a: m1, b: m2, r: rt }],
      openings: [{ pos: m0, normal: v(0, 0, -1), radius: rt }, ...(o.paved ? [] : [{ pos: m2, normal: v(0, 1, 0), radius: rt }])],
    });
    const a = v(x, road + Math.min(gapH, 2 * rt) / 2, -W - 2 * bu);
    const b = o.paved ? m2 : v(x, 0.6 * bu, m2.z);
    micro.push({ kind: 'kerb-gap', a, b, path: [m0, m1, ...(o.paved ? [] : [m2])], gapMm: gapH, clearMm: Math.min(gapH, 2 * rt), cavity: 0 });
  }
  const h = -bottom;
  const prims: PrimSpec[] = [rb(v(0, -h / 2, -W / 2), o.len, h, W, K.round, 'concrete', C | S)];
  return { tpl: { id: 'kerb', prims, tags: ['structure', 'kerb'] }, tilt: false, cavities, micro };
}

export function wheelStop(rng: RngState): Built {
  const [l, h, d] = ASPHALT.wheelStop.size;
  const mat: MaterialId = chance(rng, ASPHALT.wheelStop.rubberP) ? 'rubber' : 'concrete';
  const gap = R(rng, ASPHALT.wheelStop.gap[0], ASPHALT.wheelStop.gap[1]);
  const foot = 120;
  const prims: PrimSpec[] = [
    rb(v(-l / 2 + foot / 2, h / 2, 0), foot, h, d, 8, mat, C | S), rb(v(l / 2 - foot / 2, h / 2, 0), foot, h, d, 8, mat, C | S),
    rb(v(0, (gap + h) / 2, 0), l - 2 * foot + 4, h - gap, d, 8, mat, C | S),
  ];
  return { tpl: { id: 'wheel-stop', prims, tags: ['structure'] }, embed: 5 };
}

/** Upright post with an optional base drum and cap; post-to-top route on the +X side. */
function post(env: Env, id: string, parts: { dia: number; h: number; mat: MaterialId }[], cap: { dia: number; h: number; mat: MaterialId } | null): Built {
  const { bu, foot } = env;
  const prims: PrimSpec[] = [];
  const pts: Vec3[] = [];
  let y = -2;
  pts.push(v(parts[0].dia / 2 + foot + 3 * bu, foot, 0));
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    prims.push(cy(v(0, (y + p.h) / 2, 0), p.dia, p.h - y, p.mat, C | NB, undefined, 3));
    const r = p.dia / 2 + foot;
    pts.push(v(r, Math.max(y, 0) + 2 * bu, 0), v(r, p.h - 2 * bu, 0));
    const next = parts[i + 1];
    if (next) pts.push(v((p.dia / 2 + next.dia / 2) / 2, p.h + foot, 0));
    y = p.h;
  }
  const last = parts[parts.length - 1];
  let topY = last.h;
  if (cap) {
    prims.push(el(v(0, last.h, 0), cap.dia, cap.h, cap.dia, cap.mat, C));
    topY = last.h + cap.h / 2;
    pts.push(v(cap.dia / 2 + foot, last.h, 0), v(cap.dia / 4, last.h + cap.h * 0.45 + foot, 0));
  } else pts.push(v(last.dia / 2 - 2 * bu, last.h + foot, 0));
  pts.push(v(0, topY + foot, 0));
  return {
    tpl: { id, prims, tags: ['structure', 'post'], routes: [{ kind: 'post-to-top', points: densify(pts, 6 * bu) }], pois: [{ kind: 'vantage', pos: v(0, topY + foot, 0) }] },
    tilt: false,
  };
}

export function bollard(rng: RngState, env: Env): Built {
  const B = ASPHALT.bollard;
  const mat: MaterialId = chance(rng, B.metalP) ? 'metal' : 'concrete';
  return post(env, 'bollard', [{ dia: B.dia, h: B.h, mat }], { dia: B.dia * 1.05, h: 60, mat });
}

export function lampPost(env: Env): Built {
  const L = ASPHALT.lamp;
  return post(env, 'lamp-post', [{ dia: L.baseDia, h: L.baseH, mat: 'metal' }, { dia: L.shaftDia, h: L.top, mat: 'metal' }], null);
}

/** Generic play post (slide posts use their own builder; also usable for sleeve gaps). */
export function playPost(dia: number, h: number, env: Env): Built {
  return post(env, 'play-post', [{ dia, h, mat: 'metal' }], null);
}

/**
 * Gully grate flush with the road (local y = 0): frame, bars with 10-30 gaps, a pot of 12 staves below with a base,
 * a terrain hole over the opening, gully water 200 below the grate, and the drain-grille micro-connection.
 */
export function gullyGrate(rng: RngState, env: Env): Built {
  const G = ASPHALT.gully, bu = env.bu;
  const F = G.frame, fw = G.frameW, open = F - 2 * fw;
  const gMin = Math.max(G.gap[0], 0.6 * bu);
  const gap = gMin <= G.gap[1] ? R(rng, gMin, G.gap[1]) : G.gap[1];
  const n = Math.max(2, Math.floor((open - gap) / (G.bar + gap)));
  const g2 = (open - n * G.bar) / (n + 1);
  const prims: PrimSpec[] = [
    rb(v(0, -G.barT / 2, -F / 2 + fw / 2), F, G.barT, fw, 2, 'metal', C), rb(v(0, -G.barT / 2, F / 2 - fw / 2), F, G.barT, fw, 2, 'metal', C),
    rb(v(-F / 2 + fw / 2, -G.barT / 2, 0), fw, G.barT, open, 2, 'metal', C), rb(v(F / 2 - fw / 2, -G.barT / 2, 0), fw, G.barT, open, 2, 'metal', C),
  ];
  for (let i = 0; i < n; i++) {
    const x = -open / 2 + g2 + G.bar / 2 + i * (G.bar + g2);
    prims.push(rb(v(x, -G.barT / 2, 0), G.bar, G.barT, open + 2, 2, 'metal', C | S));
  }
  const potR = (open / 2) * Math.SQRT2 + G.potWall * 0.4;
  const potTop = -G.barT, potBot = -G.potDepth;
  prims.push(...ring(G.potStaves, v(0, potBot, 0), potR, G.potWall, potTop - potBot, 'concrete', C | S));
  prims.push(cy(v(0, potBot - 15, 0), 2 * potR, 30, 'concrete', C));
  const gx = -open / 2 + g2 / 2;
  return {
    tpl: { id: 'gully-grate', prims, tags: ['structure', 'drain'], pois: [{ kind: 'shelter', pos: v(gx, potTop - env.foot, 0) }] },
    tilt: false,
    holes: [{ x0: -open / 2, z0: -open / 2, x1: open / 2, z1: open / 2 }],
    water: [{ kind: 'gully-water', pos: v(0, potBot, 0), radius: open / 2, levelMm: G.potDepth - G.waterBelow, capMm: G.potDepth - 50 }],
    micro: [{ kind: 'drain-grille', a: v(gx, 2 * bu, open / 4), b: v(gx, potTop - 2 * bu, open / 4), gapMm: g2, clearMm: g2, lengthMm: G.barT + 4 * bu }],
  };
}

export function manholeCover(): Built {
  const M = ASPHALT.manhole;
  return { tpl: { id: 'manhole-cover', tags: ['structure'], prims: [cy(v(0, M.t / 2, 0), M.dia, M.t, 'metal', C)] }, embed: M.t - 1, tilt: true };
}

/** Parked car (static): underbody slab on 4 lying tyres, the body above it visual only; tyre-to-arch route. */
export function parkedCar(rng: RngState, env: Env): Built {
  const K = ASPHALT.car, { bu, foot } = env;
  const [bw, bh, bl] = K.body, [td, tw] = K.tyre;
  const c = R(rng, K.clearance[0], K.clearance[1]);
  const prims: PrimSpec[] = [rb(v(0, c + bh / 2, 0), bw, bh, bl, 40, 'metal', C | S)];
  const tx = bw / 2 - tw / 2, tz = bl / 2 - K.wheelInsetZ;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prims.push(cy(v(sx * tx, td / 2, sz * tz), td, tw, 'rubber', C | NB, rollQ(Math.PI / 2), 30));
  prims.push(rb(v(0, c + bh + K.bodyVisualH / 2, 0), bw, K.bodyVisualH, bl * 0.9, 120, 'metal', VIS));
  const ox = bw / 2 + foot;
  const pts = [v(ox + 3 * bu, foot, tz), v(ox, 2 * bu + 20, tz), v(ox, td / 2, tz), v(ox, c + bh - 2 * bu, tz), v(bw / 2 - 2 * bu, c + bh + foot, tz)];
  return {
    tpl: { id: 'parked-car', prims, tags: ['structure', 'car'], routes: [{ kind: 'tyre-to-arch', points: densify(pts, 6 * bu) }], pois: [{ kind: 'shelter', pos: v(0, foot, 0) }] },
    tilt: false,
  };
}

export function drinkCan(rng: RngState): Built {
  const K = ASPHALT.can;
  if (chance(rng, K.lyingP)) return { tpl: { id: 'drink-can', tags: ['prop'], prims: [cy(v(0, K.dia / 2, 0), K.dia, K.h, 'metal', C | S, rollQ(Math.PI / 2), 4)] } };
  return { tpl: { id: 'drink-can', tags: ['prop'], prims: [cy(v(0, K.h / 2, 0), K.dia, K.h, 'metal', C | S, undefined, 4)] } };
}

export function bottleCap(): Built {
  const K = ASPHALT.cap;
  return { tpl: { id: 'bottle-cap', tags: ['prop'], prims: [cy(v(0, K.h / 2, 0), K.dia, K.h, 'metal', C | S, undefined, 1)] } };
}

export function treePitTree(rng: RngState, env: Env): Built {
  const b = standingTree(rng, env, { id: 'tree-pit', trunkDia: ASPHALT.treePit.trunkDia, branches: [2, 3], rootLen: [150, 380] });
  b.canopy = { y: 2800, r: R(rng, 1500, 2500) };
  return b;
}
