// Forest-floor catalogue (GDD 04 §5.1): standing tree (also park and fruit trees), log, stump, fallen branch,
// twig, flat stone, pebble, moss cushion, curled leaf, fungus cap [T2], nut [T2], herb plant. Dimensions are the
// chapter's; the builders turn one RNG sub-stream into one object.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRouteKind, MaterialId, PoiKind } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, chain, cy, D, dirYaw, el, NB, norm, pitchQ, rb, rollQ, S, scale, sub, v } from './prims';
import { arc, besideAxis, densify, dedupe } from './routes';
import { growPlant, type PlantTemplate } from './plant';
import type { Built, Env, LocalCavity, LocalMicro } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;
const TAU = 2 * Math.PI;

export const FOREST = {
  tree: {
    trunkDia: [300, 800], height: 2400, segments: 3, taper: 0.9, rootCount: [4, 6], rootDiaK: [0.18, 0.3],
    rootDia: [60, 200], rootLen: [400, 1200], branchCount: [2, 3], branchY: [900, 2200], branchLen: [600, 1500],
    branchDia: [40, 120], branchBendDeg: [10, 25], canopyR: [2000, 4000], canopyY: 3000, heartRotP: 0.15,
    /** Root channels (GDD 04 §6.2): arches per tree, probability, gap under the arch (BU) and buried galleries. */
    rootChannels: 2, rootChannelP: 0.6, archGapBu: [1.2, 3], galleryDiaBu: [1, 2.5], galleryLenBu: [60, 150],
    galleryDepthBu: [5, 30], shaftBu: 3,
  },
  log: { dia: [150, 400], len: [1000, 2500], embedK: [0.1, 0.2], decayedP: 0.6, barkSlabs: [0, 3], barkGapBu: [1, 3], galleryP: 0.7 },
  stump: { dia: [300, 800], h: [150, 500], roots: [4, 5], decayedP: 0.7, galleryP: 0.7 },
  /** Gallery inside decayed wood (GDD 04 §7 log-gallery): tube diameter, total length, chambers. */
  gallery: { tubeDiaBu: [1.5, 2], lenBu: [30, 120], chambers: [1, 2], chamberBu: [4, 6] },
  branch: { dia: [20, 60], len: [500, 1500], segs: [2, 4], bendDeg: [10, 25], twigs: [0, 2], decayedP: 0.5 },
  twig: { dia: [2, 20], len: [50, 300] },
  stone: { len: [40, 200], smallShare: 0.7, smallMax: 80, thickK: [0.25, 0.4], widthK: [0.6, 0.9], elP: 0.6, embedK: [0.3, 0.5],
    /** under-stone lens (GDD 04 §7): share of stones >= minLenBu, footprint share, height (BU), radius cap (BU). */
    cavityP: 0.4, cavityMinLenBu: 6, cavityFoot: [0.6, 0.9], lensBu: [0.5, 1], lensMaxRBu: 10 },
  pebble: { size: [10, 30] },
  moss: { len: [60, 200], h: [10, 40] },
  leaf: { len: [60, 120], w: [40, 70] },
  fungus: { cap: [30, 150], stemDia: [8, 20], stemH: [30, 100] },
  nut: { acorn: [20, 12], round: 15 },
};

/** The trunk -> branch route and the heart-rot / root-channel sockets of a standing tree. */
export function standingTree(rng: RngState, env: Env, opts: { id?: string; trunkDia?: [number, number]; height?: number; branches?: [number, number]; rootLen?: [number, number] } = {}): Built {
  const T = FOREST.tree, { bu, foot } = env;
  const g = env.ground ?? (() => 0);
  const D0 = R(rng, ...(opts.trunkDia ?? (T.trunkDia as [number, number])));
  const H = opts.height ?? T.height;
  const prims: PrimSpec[] = [];
  const heartRot = env.woodNester && chance(rng, T.heartRotP);
  // trunk: stacked cylinders tapering 10 % each, the lowest sunk 100 mm below the lowest ground under it
  const segH = H / T.segments;
  let gMin = 0;
  for (let a = 0; a < 8; a++) gMin = Math.min(gMin, g((D0 / 2) * dcos((a * TAU) / 8), (D0 / 2) * dsin((a * TAU) / 8)));
  const dias: number[] = [];
  for (let s = 0; s < T.segments; s++) {
    const d = D0 * T.taper ** s;
    dias.push(d);
    const y0 = s === 0 ? gMin - 100 : s * segH, y1 = (s + 1) * segH;
    const mat: MaterialId = s === 0 && heartRot ? 'wood-decayed' : 'bark';
    prims.push(cy(v(0, (y0 + y1) / 2, 0), d, y1 - y0, mat, C | NB | (s === 0 && heartRot ? D : 0), undefined, 4));
  }
  // branches first (their yaws decide where roots and the route go)
  const nB = rngInt(rng, ...(opts.branches ?? (T.branchCount as [number, number])));
  const branches: { yaw: number; axis: Vec3[]; dia: number }[] = [];
  for (let b = 0; b < nB; b++) {
    const yaw = (b * TAU) / nB + R(rng, -0.5, 0.5);
    const y = R(rng, T.branchY[0], Math.min(T.branchY[1], H - 300));
    const seg = Math.min(T.segments - 1, Math.floor(y / segH));
    const r0 = dias[seg] / 2;
    const dia = Math.min(R(rng, T.branchDia[0], T.branchDia[1]), dias[seg] * 0.4);
    const lenB = R(rng, T.branchLen[0], T.branchLen[1]);
    const n = rngInt(rng, 2, 3);
    let dir = norm(add(dirYaw(yaw), v(0, R(rng, 0.15, 0.5), 0)));
    const axis = [add(v(0, y, 0), scale(dirYaw(yaw), r0 * 0.6))];
    for (let i = 0; i < n; i++) {
      const bend = (R(rng, T.branchBendDeg[0], T.branchBendDeg[1]) * Math.PI) / 180;
      const side = rngFloat(rng) < 0.5 ? -1 : 1;
      dir = norm(add(dir, add(scale(dirYaw(yaw + (side * Math.PI) / 2), dsin(bend)), v(0, 0.05, 0))));
      const next = add(axis[axis.length - 1], scale(dir, lenB / n));
      next.y = Math.min(next.y, H - 60);
      axis.push(next);
    }
    const taper = (i: number) => dia * (1 - (0.4 * i) / n);
    prims.push(...chain(axis, taper, 'bark', C));
    branches.push({ yaw, axis, dia });
  }
  // roots: flares radiating between the route corridors
  const nR = rngInt(rng, T.rootCount[0], T.rootCount[1]);
  const rootYaw0 = R(rng, 0, TAU);
  const cavities: LocalCavity[] = [];
  const micro: LocalMicro[] = [];
  let channels = 0;
  const rootYaws: number[] = [];
  for (let k = 0; k < nR; k++) {
    const yaw = rootYaw0 + (k * TAU) / nR + R(rng, -0.25, 0.25);
    rootYaws.push(yaw);
    const rd = Math.min(0.6 * D0, Math.max(T.rootDia[0], Math.min(T.rootDia[1], D0 * R(rng, T.rootDiaK[0], T.rootDiaK[1]))));
    const rl = R(rng, ...(opts.rootLen ?? (T.rootLen as [number, number])));
    const d = dirYaw(yaw);
    const start = add(v(0, 0.12 * D0 + g(0, 0), 0), scale(d, D0 * 0.2));
    const endR = D0 / 2 + rl;
    const end = add(v(0, g(d.x * endR, d.z * endR) - 0.45 * rd, 0), scale(d, endR));
    if (channels < T.rootChannels && chance(rng, T.rootChannelP)) {
      // arched root: its middle lifts clear of the ground (the arch), a gallery runs down from under it
      const ar = D0 / 2 + rl * 0.45;
      const ax = d.x * ar, az = d.z * ar;
      const gap = R(rng, T.archGapBu[0], T.archGapBu[1]) * bu;
      const ga = g(ax, az);
      const apex = v(ax, ga + gap + rd / 2, az);
      prims.push(ca(start, apex, rd, 'bark', C | S), ca(apex, end, rd * 0.85, 'bark', C | S));
      const tr = (R(rng, T.galleryDiaBu[0], T.galleryDiaBu[1]) * bu) / 2;
      const shaftEnd = v(ax, ga - T.shaftBu * bu, az);
      const depth = R(rng, T.galleryDepthBu[0], T.galleryDepthBu[1]) * bu;
      const lenG = R(rng, T.galleryLenBu[0], T.galleryLenBu[1]) * bu;
      const tail = add(add(shaftEnd, scale(d, lenG)), v(0, -depth, 0));
      cavities.push({
        kind: 'root-gallery',
        carves: [{ shape: 'capsule', a: v(ax, ga + tr * 0.3, az), b: shaftEnd, r: tr }, { shape: 'capsule', a: shaftEnd, b: tail, r: tr }],
        openings: [{ pos: v(ax, ga, az), normal: v(0, 1, 0), radius: tr }],
      });
      micro.push({
        kind: 'root-channel', a: v(ax, ga + gap / 2, az), b: add(shaftEnd, v(0, -tr * 0.2, 0)),
        gapMm: gap, clearMm: Math.min(gap, 2 * tr), lengthMm: gap / 2 + T.shaftBu * bu + lenG, cavity: cavities.length - 1,
      });
      channels++;
    } else prims.push(ca(start, end, rd, 'bark', C | S));
  }
  // heart-rot hollow (Camponotus founding wood): a chamber inside the decayed base with a mouth at the foot
  if (heartRot) {
    const hr = D0 * 0.18, my = Math.max(gMin, 0) + 60;
    const d = dirYaw(rootYaw0 + Math.PI / nR);
    cavities.push({
      kind: 'log-gallery',
      carves: [
        { shape: 'capsule', a: v(0, my + 100, 0), b: v(0, Math.min(segH - 150, my + 450), 0), r: hr },
        { shape: 'capsule', a: add(v(0, my, 0), scale(d, D0 / 2 + bu)), b: v(0, my + 100, 0), r: 0.9 * bu },
      ],
      openings: [{ pos: add(v(0, my, 0), scale(d, D0 / 2)), normal: d, radius: 0.9 * bu }],
    });
  }
  // routes: ground between two roots -> up the trunk (ledges at the taper steps) -> around above the branch -> along it
  const routes: { kind: ClimbRouteKind; points: Vec3[] }[] = [];
  const pois: { kind: PoiKind; pos: Vec3 }[] = [];
  for (const br of branches) {
    const ry = freestAngle(rootYaws, br.yaw + Math.PI / 2);
    const sd = dirYaw(ry);
    const pts: Vec3[] = [];
    const g0 = g(sd.x * (D0 / 2 + 3 * bu), sd.z * (D0 / 2 + 3 * bu));
    pts.push(add(v(0, g0 + foot, 0), scale(sd, D0 / 2 + foot + 3 * bu)));
    pts.push(add(v(0, g(sd.x * D0 / 2, sd.z * D0 / 2) + 2 * bu, 0), scale(sd, D0 / 2 + foot)));
    const by = br.axis[0].y;
    const topY = by + br.dia / 2 + 3 * bu;
    const seg = Math.min(T.segments - 1, Math.floor(by / segH));
    for (let s = 1; s <= seg; s++) {
      const yb = s * segH, r1 = dias[s - 1] / 2, r2 = dias[s] / 2;
      pts.push(add(v(0, yb - 2 * bu, 0), scale(sd, r1 + foot)));
      pts.push(add(v(0, yb + foot, 0), scale(sd, (r1 + r2) / 2)));
      pts.push(add(v(0, yb + 2 * bu, 0), scale(sd, r2 + foot)));
    }
    const rTop = dias[seg] / 2 + foot;
    pts.push(add(v(0, topY, 0), scale(sd, rTop)));
    let da = br.yaw - ry;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    pts.push(...arc(0, 0, topY, rTop, ry, ry + da, 3 * bu).slice(1));
    const along = besideAxis(br.axis.slice(1), (i) => (br.dia * (1 - (0.4 * (i + 1)) / br.axis.length)) / 2, v(0, 1, 0), foot);
    pts.push(...along);
    routes.push({ kind: 'trunk-to-branch', points: dedupe(densify(pts, 6 * bu)) });
    const mid = br.axis[Math.floor(br.axis.length / 2)];
    pois.push({ kind: 'aphid-site', pos: add(mid, v(0, br.dia / 2 + foot, 0)) });
  }
  const vy = Math.min(2000, H - 100), vs = Math.min(T.segments - 1, Math.floor(vy / segH));
  pois.push({ kind: 'vantage', pos: add(v(0, vy, 0), scale(dirYaw(freestAngle(rootYaws, 0)), dias[vs] / 2 + foot)) });
  return {
    tpl: { id: opts.id ?? 'standing-tree', prims, routes, pois, tags: ['tree', 'structure'] },
    tilt: false, cavities, micro,
    canopy: { y: T.canopyY, r: R(rng, T.canopyR[0], T.canopyR[1]) },
    host: { hostFlags: 0, hostClass: 'tree' },
  };
}

/** The angle closest to `want` that is at least as far from every root as possible (8 candidates). */
function freestAngle(roots: readonly number[], want: number): number {
  let best = want, bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = want + (i * TAU) / 16;
    let m = Infinity;
    for (const r of roots) {
      let d = Math.abs(a - r) % TAU;
      if (d > Math.PI) d = TAU - d;
      m = Math.min(m, d);
    }
    let dw = Math.abs(a - want) % TAU;
    if (dw > Math.PI) dw = TAU - dw;
    const score = m - 0.3 * dw;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

/** Gallery inside decayed wood: tube from a mouth inward along `dir` plus 1-2 chambers (log-gallery). */
function woodGallery(rng: RngState, env: Env, mouth: Vec3, dir: Vec3, maxLen: number, outward: Vec3): LocalCavity {
  const G = FOREST.gallery, bu = env.bu;
  const r = (R(rng, G.tubeDiaBu[0], G.tubeDiaBu[1]) * bu) / 2;
  const L = Math.min(maxLen, R(rng, G.lenBu[0], G.lenBu[1]) * bu);
  const end = add(mouth, scale(dir, L));
  const carves: LocalCavity['carves'] = [{ shape: 'capsule', a: sub(mouth, scale(dir, r)), b: end, r }];
  const n = rngInt(rng, G.chambers[0], G.chambers[1]);
  for (let i = 0; i < n; i++) {
    const c = add(mouth, scale(dir, L * (0.5 + 0.5 * i / Math.max(1, n))));
    const cr = (R(rng, G.chamberBu[0], G.chamberBu[1]) * bu) / 2;
    carves.push({ shape: 'ellipsoid', a: c, b: v(cr, Math.min(cr * 0.6, r * 1.6), cr), r: 0 });
  }
  return { kind: 'log-gallery', carves, openings: [{ pos: mouth, normal: outward, radius: r }] };
}

export function log(rng: RngState, env: Env): Built {
  const L = FOREST.log, { bu, foot } = env;
  const d = R(rng, L.dia[0], L.dia[1]), len = R(rng, L.len[0], L.len[1]), r = d / 2;
  const decayed = chance(rng, L.decayedP);
  const mat: MaterialId = decayed ? 'wood-decayed' : 'wood-sound';
  const flags = C | S | (decayed ? D : 0);
  const embed = d * R(rng, L.embedK[0], L.embedK[1]);
  const prims: PrimSpec[] = [cy(v(0, r, 0), d, len, mat, flags, rollQ(Math.PI / 2), 6)];
  // log-over: one cross-section from the ground on -Z over the crest to the ground on +Z (kept free of bark slabs)
  const xs = R(rng, -len * 0.3, len * 0.3), ro = r + foot;
  const nb = rngInt(rng, L.barkSlabs[0], L.barkSlabs[1]);
  for (let i = 0; i < nb; i++) {
    const phi = R(rng, 0.35, 1.1) * (rngFloat(rng) < 0.5 ? -1 : 1);
    const t = R(rng, 5, 20), gap = R(rng, L.barkGapBu[0], L.barkGapBu[1]) * bu;
    const x = R(rng, -len / 2 + 150, len / 2 - 150), rr = r + gap + t / 2;
    if (Math.abs(x - xs) < 200 + 4 * bu) continue;
    prims.push(rb(v(x, r + rr * dcos(phi), -rr * dsin(phi)), 200, t, 100, 3, 'bark', C | S, pitchQ(-phi)));
  }
  const pts: Vec3[] = [v(xs, embed + foot, -(ro + 3 * bu))];
  const n = Math.max(8, Math.ceil((Math.PI * ro) / (3 * bu)));
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    const p = v(xs, r + ro * dcos(a), ro * dsin(a));
    if (p.y >= embed + foot + bu) pts.push(p);
  }
  pts.push(v(xs, embed + foot, ro + 3 * bu));
  const cavities: LocalCavity[] = [];
  if (decayed && chance(rng, L.galleryP)) {
    const side = rngFloat(rng) < 0.5 ? -1 : 1;
    const mouth = v((side * len) / 2, r * 0.8, 0);
    cavities.push(woodGallery(rng, env, mouth, v(-side, 0, 0), len * 0.6, v(side, 0, 0)));
  }
  return {
    tpl: {
      id: 'log', prims, tags: ['prop', 'wood'],
      routes: [{ kind: 'log-over', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'vantage', pos: v(xs, d + foot, 0) }, { kind: 'shelter', pos: v(xs, embed + foot, r * 0.9) }],
    },
    embed, cavities,
  };
}

export function stump(rng: RngState, env: Env): Built {
  const T = FOREST.stump, { bu, foot } = env;
  const g = env.ground ?? (() => 0);
  const d = R(rng, T.dia[0], T.dia[1]), h = R(rng, T.h[0], T.h[1]), r = d / 2;
  const decayed = chance(rng, T.decayedP);
  const mat: MaterialId = decayed ? 'wood-decayed' : 'wood-sound';
  const flags = C | S | NB | (decayed ? D : 0);
  let gMin = 0;
  for (let a = 0; a < 8; a++) gMin = Math.min(gMin, g(r * dcos((a * TAU) / 8), r * dsin((a * TAU) / 8)));
  const prims: PrimSpec[] = [cy(v(0, (gMin - 60 + h) / 2, 0), d, h - gMin + 60, mat, flags, undefined, 8)];
  const nr = rngInt(rng, T.roots[0], T.roots[1]), y0 = R(rng, 0, TAU);
  const rootYaws: number[] = [];
  for (let k = 0; k < nr; k++) {
    const a = y0 + (k * TAU) / nr;
    rootYaws.push(a);
    const dd = dirYaw(a), rd = Math.min(200, d * 0.25), out = r + R(rng, 200, 500);
    prims.push(ca(add(v(0, h * 0.25, 0), scale(dd, r * 0.4)), add(v(0, g(dd.x * out, dd.z * out) - 0.4 * rd, 0), scale(dd, out)), rd, mat, C | S | (decayed ? D : 0)));
  }
  const ra = freestAngle(rootYaws, R(rng, 0, TAU)), sd = dirYaw(ra);
  const ro = r + foot;
  const pts: Vec3[] = [
    add(v(0, g(sd.x * (r + 3 * bu), sd.z * (r + 3 * bu)) + foot, 0), scale(sd, ro + 3 * bu)),
    add(v(0, g(sd.x * r, sd.z * r) + 2 * bu, 0), scale(sd, ro)),
    add(v(0, h - 3 * bu, 0), scale(sd, ro)),
    add(v(0, h + foot, 0), scale(sd, r - 3 * bu)),
    v(0, h + foot, 0),
  ];
  const cavities: LocalCavity[] = [];
  if (decayed && chance(rng, T.galleryP)) {
    const mouth = add(v(0, Math.max(gMin, 0) + 1.5 * bu + 40, 0), scale(sd, r));
    const cav = woodGallery(rng, env, mouth, v(-sd.x, 0, -sd.z), d * 0.7, sd);
    cavities.push(cav);
  }
  return {
    tpl: {
      id: 'stump', prims, tags: ['structure', 'wood'],
      routes: [{ kind: 'stump-top', points: densify(pts, 6 * bu) }],
      pois: [{ kind: 'vantage', pos: v(0, h + foot, 0) }, { kind: 'shelter', pos: add(v(0, foot, 0), scale(sd, r + bu)) }],
    },
    tilt: false, cavities,
  };
}

export function fallenBranch(rng: RngState, env: Env): Built {
  const B = FOREST.branch;
  const dia = R(rng, B.dia[0], B.dia[1]), len = R(rng, B.len[0], B.len[1]);
  const n = rngInt(rng, B.segs[0], B.segs[1]);
  const decayed = chance(rng, B.decayedP);
  const mat: MaterialId = decayed ? 'wood-decayed' : 'wood-sound';
  let yaw = 0;
  const pts = [v(-len / 2, dia / 2, 0)];
  for (let i = 0; i < n; i++) {
    yaw += ((R(rng, B.bendDeg[0], B.bendDeg[1]) * Math.PI) / 180) * (rngFloat(rng) < 0.5 ? -1 : 1);
    pts.push(add(pts[pts.length - 1], scale(dirYaw(yaw), len / n)));
  }
  const prims = chain(pts, (i) => dia * (1 - 0.3 * (i / n)), mat, C | (decayed ? D : 0));
  const nt = rngInt(rng, B.twigs[0], B.twigs[1]);
  for (let t = 0; t < nt; t++) {
    const at = pts[1 + Math.min(n - 1, t)];
    const td = Math.max(2, dia * 0.3);
    const a = yaw + (t % 2 ? 1 : -1) * R(rng, 0.5, 1.1);
    prims.push(ca(v(at.x, td / 2, at.z), add(v(at.x, td / 2, at.z), scale(dirYaw(a), R(rng, 80, 250))), td, 'wood-sound', C));
  }
  return { tpl: { id: 'fallen-branch', prims, tags: ['prop', 'wood'] } };
}

export function twig(rng: RngState): Built {
  const T = FOREST.twig;
  const dia = R(rng, T.dia[0], T.dia[1]), len = R(rng, T.len[0], T.len[1]);
  const r = dia / 2;
  if (chance(rng, 0.5)) return { tpl: { id: 'twig', prims: [ca(v(-len / 2 + r, r, 0), v(len / 2 - r, r, 0), dia, 'wood-sound', C)], tags: ['prop'] } };
  const mid = v(R(rng, -len * 0.1, len * 0.1), r, R(rng, -len * 0.15, len * 0.15));
  return { tpl: { id: 'twig', prims: chain([v(-len / 2 + r, r, 0), mid, v(len / 2 - r, r, 0)], dia, 'wood-sound', C), tags: ['prop'] } };
}

/** Flat stone (also lawn `stone`, 40-120): flattened ellipsoid or rounded box, embedded 30-50 %; under-stone lens. */
export function flatStone(rng: RngState, env: Env, id = 'flat-stone', lenRange?: [number, number]): Built {
  const T = FOREST.stone, bu = env.bu;
  const l = lenRange ? R(rng, lenRange[0], lenRange[1]) : chance(rng, T.smallShare) ? R(rng, T.len[0], T.smallMax) : R(rng, T.smallMax, T.len[1]);
  const w = l * R(rng, T.widthK[0], T.widthK[1]), t = l * R(rng, T.thickK[0], T.thickK[1]);
  const isEl = chance(rng, T.elP);
  const prim = isEl ? el(v(0, t / 2, 0), l, t, w, 'stone', C | S) : rb(v(0, t / 2, 0), l, t, w, 0.3 * t, 'stone', C | S);
  const embed = t * R(rng, T.embedK[0], T.embedK[1]);
  const cavities: LocalCavity[] = [];
  if (l >= T.cavityMinLenBu * bu && chance(rng, T.cavityP)) {
    const rr = Math.min(T.lensMaxRBu * bu, (Math.min(l, w) / 2) * R(rng, T.cavityFoot[0], T.cavityFoot[1]));
    const ry = Math.max(0.5 * bu, (R(rng, T.lensBu[0], T.lensBu[1]) * bu) / 2);
    cavities.push({ kind: 'under-stone', carves: [{ shape: 'ellipsoid', a: v(0, 0, 0), b: v(rr, ry, rr), r: 0 }], openings: [] });
  }
  return { tpl: { id, prims: [prim], tags: ['prop', 'stone'], pois: [{ kind: 'shelter', pos: v(0, t + env.foot, 0) }] }, embed, cavities };
}

export function pebble(rng: RngState): Built {
  const s = R(rng, FOREST.pebble.size[0], FOREST.pebble.size[1]);
  const h = s * R(rng, 0.5, 0.8), w = s * R(rng, 0.7, 1);
  return { tpl: { id: 'pebble', prims: [el(v(0, h / 2, 0), s, h, w, 'stone', C)], tags: ['prop'] }, embed: h * 0.2 };
}

export function mossCushion(rng: RngState): Built {
  const l = R(rng, FOREST.moss.len[0], FOREST.moss.len[1]), h = R(rng, FOREST.moss.h[0], FOREST.moss.h[1]);
  const w = l * R(rng, 0.6, 1);
  return { tpl: { id: 'moss-cushion', prims: [el(v(0, h, 0), l, 2 * h, w, 'plant', C | S)], tags: ['prop'] }, embed: h };
}

export function curledLeaf(rng: RngState, env: Env): Built {
  const l = R(rng, FOREST.leaf.len[0], FOREST.leaf.len[1]), w = R(rng, FOREST.leaf.w[0], FOREST.leaf.w[1]);
  const t = Math.max(1, 0.15 * env.bu), curl = R(rng, 0.15, 0.35);
  const lift = (w / 4) * dsin(curl);
  return {
    tpl: {
      id: 'curled-leaf', tags: ['prop'],
      prims: [
        el(v(0, t / 2 + lift, -w / 5), l, t, w * 0.6, 'leaf', C | S, pitchQ(curl)),
        el(v(0, t / 2 + lift, w / 5), l, t, w * 0.6, 'leaf', C | S, pitchQ(-curl)),
      ],
    },
  };
}

export function fungusCap(rng: RngState): Built {
  const F = FOREST.fungus;
  const cap = R(rng, F.cap[0], F.cap[1]), sd = R(rng, F.stemDia[0], F.stemDia[1]), sh = R(rng, F.stemH[0], F.stemH[1]);
  return { tpl: { id: 'fungus-cap', tags: ['prop'], prims: [cy(v(0, sh / 2, 0), sd, sh, 'plant', C), el(v(0, sh, 0), cap, cap * 0.35, cap, 'plant', C | S)] } };
}

export function nut(rng: RngState): Built {
  const acorn = chance(rng, 0.5);
  const [l, d] = acorn ? FOREST.nut.acorn : [FOREST.nut.round, FOREST.nut.round];
  return { tpl: { id: 'nut', tags: ['prop'], prims: [el(v(0, d / 2, 0), l, d, d, 'plant', C, rollQ(0))] } };
}

export const HERB_PLANT: PlantTemplate = {
  stems: 2, stemDiamMm: [1.5, 5], stemLenMm: [50, 400], segmentMm: [20, 80], branchLevels: 0, branchAngleDeg: [25, 55],
  leavesPerStem: [2, 6], leafMm: { w: [12, 30], l: [20, 60] }, leafThicknessMm: 0.8, flowerMm: [0, 0], woody: false,
  waxyP: 0.2, hostP: { aphid: 0.15, efn: 0.05, elaiosome: 0.2 }, hostClass: 'herb', leanDeg: [3, 15], droopDeg: [5, 30],
};

export function herbPlant(rng: RngState, env: Env): Built {
  return growPlant('herb-plant', HERB_PLANT, rng, env);
}
