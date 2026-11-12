// Playground catalogue (GDD 04 §5.6): sand-pit edging board, toy bucket and spade [T2 dynamic, placed static],
// slide (posts, rungs, platform, chute), swing frame, spring rider, bench, litter bin, picnic table [T2], park tree
// (a standing tree). Play sand and rubber mats are strata, not objects.

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, cy, cyAB, D, el, NB, pitchQ, rb, ring, rollQ, S, scale, v } from './prims';
import { densify } from './routes';
import type { Built, Env, LocalCavity, LocalMicro } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;
const deg = (d: number) => (d * Math.PI) / 180;

export const PLAYGROUND = {
  edging: { w: 100, h: 200, above: 100, board: 2400, round: 5, decayedP: 0.3 },
  bucket: { dia: [150, 200] as [number, number], h: 150, wall: 3, staves: 14, count: [0, 2] as [number, number] },
  spade: { blade: [150, 2, 120] as [number, number, number], handleDia: 20, handleLen: 250, count: [0, 2] as [number, number] },
  slide: { postDia: 76, postH: 1500, embed: 300, platform: 600, platformT: 40, platformY: 1200, rungs: 4, rungDia: 30,
    chuteW: 450, chuteT: 10, sideH: 100, chuteLen: 2400, chuteDeg: 32, inset: 80 },
  sleeve: { p: 0.5, gap: [2, 5] as [number, number], depthBu: [20, 60] as [number, number] },
  swing: { legDia: 76, leanDeg: 15, height: 2200, span: 2400, seat: [450, 30, 170] as [number, number, number], seatY: 400, chainDia: 8, p: 0.7 },
  rider: { plate: [400, 10, 400] as [number, number, number], gap: [2, 4] as [number, number], springDia: 150, springH: 300, body: [700, 400, 250] as [number, number, number], bodyY: 500, p: 0.5 },
  bench: { len: 1800, slat: [30, 90] as [number, number], slats: 3, gap: [10, 15] as [number, number], seatY: 450, leg: [60, 450] as [number, number] },
  bin: { dia: 400, h: 800, lid: 20, feetGap: 5, metalP: 0.5 },
  picnic: { len: 1800, topW: 750, topY: 720, slats: 5, gap: 10, slatT: 30, benchW: 250, benchY: 450, benchOff: 550 },
};

/** Sand-pit edging board of length `len` along local X: 100 wide x 200 high, its top 100 above the surround. */
export function sandEdging(rng: RngState, len: number): Built {
  const E = PLAYGROUND.edging;
  const prims: PrimSpec[] = [];
  const y0 = E.above - E.h;
  if (chance(rng, E.decayedP)) {
    prims.push(rb(v(0, y0 + E.h / 4, 0), len, E.h / 2, E.w, E.round, 'wood-decayed', C | S | D));
    prims.push(rb(v(0, y0 + (3 * E.h) / 4, 0), len, E.h / 2, E.w, E.round, 'wood-sound', C | S));
  } else prims.push(rb(v(0, y0 + E.h / 2, 0), len, E.h, E.w, E.round, 'wood-sound', C | S));
  return { tpl: { id: 'sand-edging', prims, tags: ['structure', 'edging'] }, tilt: false };
}

export function toyBucket(rng: RngState): Built {
  const B = PLAYGROUND.bucket;
  const d = R(rng, B.dia[0], B.dia[1]);
  const prims: PrimSpec[] = [cy(v(0, 2, 0), d * 0.85, 4, 'plastic', C), ...ring(B.staves, v(0, 0, 0), d / 2, B.wall, B.h, 'plastic', C | S, deg(6))];
  return { tpl: { id: 'toy-bucket', prims, tags: ['prop', 'toy'] }, embed: 3 };
}

export function toySpade(rng: RngState): Built {
  const S0 = PLAYGROUND.spade;
  const [bl, bt, bw] = S0.blade;
  const hr = S0.handleDia / 2;
  void rng;
  return {
    tpl: {
      id: 'toy-spade', tags: ['prop', 'toy'],
      prims: [rb(v(-bl / 2, hr, 0), bl, bt, bw, 0.5, 'plastic', C | S), ca(v(0, hr, 0), v(S0.handleLen - hr, hr, 0), S0.handleDia, 'plastic', C)],
    },
  };
}

/** Sleeve gap around a post footing: a slot of >= 1 BU beside the post down into the soil under the mat. */
function sleeveGap(rng: RngState, env: Env, px: number, pz: number, postR: number, yaw: number): { cav: LocalCavity; micro: LocalMicro } {
  const G = PLAYGROUND.sleeve, bu = env.bu;
  const real = R(rng, G.gap[0], G.gap[1]);
  const r = Math.max(real, bu) / 2 + 0.1 * bu;
  const depth = R(rng, G.depthBu[0], G.depthBu[1]) * bu;
  const d = v(dcos(yaw), 0, dsin(yaw));
  const c = add(v(px, 0, pz), scale(d, postR + r));
  const top = add(c, v(0, 0.3 * r, 0)), bot = add(c, v(0, -depth, 0));
  return {
    cav: { kind: 'crack-slot', carves: [{ shape: 'capsule', a: top, b: bot, r }], openings: [{ pos: top, normal: v(0, 1, 0), radius: r }] },
    micro: { kind: 'sleeve-gap', a: add(c, v(0, 2 * bu, 0)), b: add(bot, v(0, r, 0)), gapMm: real, clearMm: 2 * r, lengthMm: depth + 2 * bu, cavity: 0 },
  };
}

/**
 * Slide: four corner posts (the two ladder posts run on to 1500 as handrails), four rungs, the platform at 1200
 * and a 32 deg chute with side walls toward +Z. Routes `ladder-to-platform` (up a ladder post's back, under the
 * platform lip, onto it) and `chute` (platform -> chute bed -> bottom). Sleeve gaps (p 0.5) at the ladder posts.
 */
export function slide(rng: RngState, env: Env): Built {
  const L = PLAYGROUND.slide, { bu, foot } = env;
  const P = L.platform, pr = L.postDia / 2, y1 = L.platformY, y0 = y1 - L.platformT;
  const k = P / 2 - L.inset;
  const prims: PrimSpec[] = [];
  const posts: [number, number, number][] = [[-k, -k, L.postH], [k, -k, L.postH], [-k, k, y1], [k, k, y1]];
  for (const [x, z, h] of posts) prims.push(cy(v(x, (h - L.embed) / 2, z), L.postDia, h + L.embed, 'metal', C | NB, undefined, 3));
  for (let i = 1; i <= L.rungs; i++) {
    const y = (i * y0) / (L.rungs + 1);
    prims.push(ca(v(-k + pr, y, -k), v(k - pr, y, -k), L.rungDia, 'metal', C));
  }
  prims.push(rb(v(0, y1 - L.platformT / 2, 0), P, L.platformT, P, 4, 'wood-sound', C | S));
  // chute from the platform's +Z edge down at 32 deg
  const a = deg(L.chuteDeg), run = L.chuteLen * dcos(a), drop = L.chuteLen * dsin(a);
  const start = v(0, y1 - L.chuteT / 2, P / 2);
  const dir = v(0, -dsin(a), dcos(a));
  const mid = add(start, scale(dir, L.chuteLen / 2));
  const up = v(0, dcos(a), dsin(a));
  const rot = pitchQ(a);
  prims.push(rb(mid, L.chuteW, L.chuteT, L.chuteLen, 2, 'metal', C, rot));
  for (const sx of [-1, 1]) prims.push(rb(add(add(mid, v((sx * (L.chuteW + 10)) / 2, 0, 0)), scale(up, L.sideH / 2 - L.chuteT / 2)), 10, L.sideH, L.chuteLen, 2, 'metal', C, rot));
  // runout at the foot if the chute ends above the ground
  const endY = y1 - drop;
  if (endY > 5) prims.push(rb(v(0, endY / 2, P / 2 + run + 60), L.chuteW, endY, 120, 4, 'metal', C));
  // routes
  const zb = -k - pr - foot;
  const ladder = [v(-k, foot, zb - 3 * bu), v(-k, 2 * bu, zb), v(-k, y0 - 2 * bu, zb), v(-k, y0 - foot, -P / 2 + 2 * bu), v(-k, y0 - foot, -P / 2 + bu),
    v(-k, y1 - L.platformT / 2, -P / 2 - foot), v(-k, y1 + foot, -P / 2 + 3 * bu), v(0, y1 + foot, 0)];
  const bed = (t: number) => add(add(start, scale(dir, t)), scale(up, L.chuteT / 2 + foot));
  const chute = [v(0, y1 + foot, 0), v(0, y1 + foot, P / 2 - 3 * bu), bed(4 * bu), bed(L.chuteLen / 2), bed(L.chuteLen - 3 * bu)];
  const cavities: LocalCavity[] = [];
  const micro: LocalMicro[] = [];
  for (const [x, z] of [[-k, -k], [k, -k]] as const) {
    if (!chance(rng, PLAYGROUND.sleeve.p)) continue;
    const s = sleeveGap(rng, env, x, z, pr, x < 0 ? Math.PI : 0);
    s.micro.cavity = cavities.length;
    cavities.push(s.cav);
    micro.push(s.micro);
  }
  return {
    tpl: {
      id: 'slide', prims, tags: ['structure', 'play'],
      routes: [{ kind: 'ladder-to-platform', points: densify(ladder, 6 * bu) }, { kind: 'chute', points: densify(chute, 6 * bu) }],
      pois: [{ kind: 'vantage', pos: v(0, y1 + foot, 0) }, { kind: 'shelter', pos: v(0, foot, 0) }],
    },
    tilt: false, cavities, micro,
  };
}

export function swingFrame(rng: RngState, env: Env): Built {
  const W = PLAYGROUND.swing;
  const lean = deg(W.leanDeg), H = W.height, half = W.span / 2;
  const spread = H * (dsin(lean) / dcos(lean));
  const prims: PrimSpec[] = [];
  for (const x of [-half, half]) {
    prims.push(cyAB(v(x, -200, -spread - 200 * (spread / H)), v(x, H, 0), W.legDia, 'metal', C | NB), cyAB(v(x, -200, spread + 200 * (spread / H)), v(x, H, 0), W.legDia, 'metal', C | NB));
  }
  prims.push(cy(v(0, H, 0), W.legDia, W.span + 80, 'metal', C, rollQ(Math.PI / 2), 3));
  const [sw, st, sd] = W.seat;
  for (const x of [-half / 2, half / 2]) {
    prims.push(rb(v(x, W.seatY, 0), sw, st, sd, 4, 'rubber', C | S));
    for (const cx of [x - sw / 2 + 20, x + sw / 2 - 20]) prims.push(cyAB(v(cx, W.seatY + st / 2, 0), v(cx, H - W.legDia / 2, 0), W.chainDia, 'metal', C));
  }
  void rng; void env;
  return { tpl: { id: 'swing-frame', prims, tags: ['structure', 'play'] }, tilt: false };
}

export function springRider(rng: RngState): Built {
  const K = PLAYGROUND.rider;
  const [pw, pt, pd] = K.plate, [bw, bh, bd] = K.body;
  const gap = R(rng, K.gap[0], K.gap[1]);
  const prims: PrimSpec[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prims.push(rb(v((x * pw) / 2.6, gap / 2, (z * pd) / 2.6), 30, gap, 30, 1, 'metal', C));
  prims.push(rb(v(0, gap + pt / 2, 0), pw, pt, pd, 2, 'metal', C | S));
  prims.push(cy(v(0, gap + pt + K.springH / 2, 0), K.springDia, K.springH, 'metal', C));
  prims.push(el(v(0, K.bodyY, 0), bw, bh, bd, 'plastic', C | S));
  return { tpl: { id: 'spring-rider', prims, tags: ['structure', 'play'] }, tilt: false };
}

/** Bench: 3 seat slats at 450 with 10-15 gaps on two end legs flush with the slat ends; leg-to-seat route. */
export function bench(rng: RngState, env: Env): Built {
  const B = PLAYGROUND.bench, { bu, foot } = env;
  const [st, sw] = B.slat, gap = R(rng, B.gap[0], B.gap[1]);
  const depth = B.slats * sw + (B.slats - 1) * gap;
  const prims: PrimSpec[] = [];
  for (let i = 0; i < B.slats; i++) prims.push(rb(v(0, B.seatY - st / 2, -depth / 2 + sw / 2 + i * (sw + gap)), B.len, st, sw, 3, 'wood-sound', C | S));
  const [lt, ld] = B.leg, lh = B.seatY - st;
  for (const sx of [-1, 1]) prims.push(rb(v(sx * (B.len / 2 - lt / 2), lh / 2 - 50, 0), lt, lh + 100, ld, 4, 'metal', C | NB));
  const zr = -depth / 2 + sw / 2 + Math.floor(B.slats / 2) * (sw + gap);
  const x = B.len / 2 + foot;
  const pts = [v(x + 3 * bu, foot, zr), v(x, 2 * bu, zr), v(x, B.seatY - 2 * bu, zr), v(B.len / 2 - 2 * bu, B.seatY + foot, zr), v(0, B.seatY + foot, zr)];
  return {
    tpl: { id: 'bench', prims, tags: ['structure', 'furniture'], routes: [{ kind: 'leg-to-seat', points: densify(pts, 6 * bu) }], pois: [{ kind: 'food-spot', pos: v(0, B.seatY + foot, zr) }] },
    tilt: false,
  };
}

/** Litter bin on four feet (5 mm base gap), lid lip; bin-to-rim route, bin-gap POI on the lid. */
export function litterBin(rng: RngState, env: Env): Built {
  const B = PLAYGROUND.bin, { bu, foot } = env;
  const mat: MaterialId = chance(rng, B.metalP) ? 'metal' : 'plastic';
  const r = B.dia / 2, g = B.feetGap;
  const prims: PrimSpec[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    prims.push(rb(v(r * 0.7 * dcos(a), g / 2, r * 0.7 * dsin(a)), 40, g, 40, 1, mat, C));
  }
  const bodyTop = B.h - B.lid;
  prims.push(cy(v(0, (g + bodyTop) / 2, 0), B.dia, bodyTop - g, mat, C | S | NB, undefined, 6));
  prims.push(cy(v(0, bodyTop + B.lid / 2, 0), B.dia + 16, B.lid, mat, C, undefined, 4));
  const pts = [v(r + foot + 3 * bu, foot, 0), v(r + foot, g + 2 * bu, 0), v(r + foot, bodyTop - 2 * bu, 0), v(r + 8 + foot, bodyTop + B.lid / 2, 0), v(r - 2 * bu, B.h + foot, 0), v(0, B.h + foot, 0)];
  return {
    tpl: { id: 'litter-bin', prims, tags: ['structure', 'bin'], routes: [{ kind: 'bin-to-rim', points: densify(pts, 6 * bu) }], pois: [{ kind: 'bin-gap', pos: v(0, B.h + foot, 0) }] },
    tilt: false,
  };
}

export function picnicTable(rng: RngState): Built {
  const P = PLAYGROUND.picnic;
  const prims: PrimSpec[] = [];
  const sw = (P.topW - (P.slats - 1) * P.gap) / P.slats;
  for (let i = 0; i < P.slats; i++) prims.push(rb(v(0, P.topY - P.slatT / 2, -P.topW / 2 + sw / 2 + i * (sw + P.gap)), P.len, P.slatT, sw, 3, 'wood-sound', C | S));
  for (const sz of [-1, 1]) prims.push(rb(v(0, P.benchY - P.slatT / 2, sz * P.benchOff), P.len, P.slatT, P.benchW, 3, 'wood-sound', C | S));
  for (const sx of [-1, 1]) {
    const x = sx * (P.len / 2 - 200);
    prims.push(cyAB(v(x, -100, -P.benchOff - 100), v(x, P.topY - P.slatT, -60), 70, 'wood-sound', C | NB), cyAB(v(x, -100, P.benchOff + 100), v(x, P.topY - P.slatT, 60), 70, 'wood-sound', C | NB));
    prims.push(rb(v(x, P.benchY - P.slatT - 30, 0), 60, 60, 2 * P.benchOff + P.benchW, 3, 'wood-sound', C));
  }
  void rng;
  return { tpl: { id: 'picnic-table', prims, tags: ['structure', 'furniture'], pois: [{ kind: 'food-spot', pos: v(0, P.topY + 1, 0) }] }, tilt: false };
}
