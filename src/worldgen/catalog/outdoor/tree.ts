// Standing tree (GDD 04 §5.1; also park, fruit and tree-pit trees): stacked tapering trunk, root flares (some
// arched over a root channel with a gallery below), 2-3 branch chains, heart-rot hollow for wood nesters, canopy
// disc, and one trunk-to-branch climb route per branch.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRouteKind, MaterialId, PoiKind } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, chain, cy, D, datan2, dirYaw, NB, norm, S, scale, sub, v } from './prims';
import { arc, besideAxis, densify, dedupe } from './routes';
import { FOREST } from './forest';
import type { Built, Env, LocalCavity, LocalMicro } from './types';

/** x * x (not **: DET-4). */
const sq = (x: number): number => x * x;

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;
const TAU = 2 * Math.PI;

/** Signed smallest angle a - b, in (-pi, pi]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

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
    // repeated multiplication, not **: stored sizes may not depend on an approximated pow (DET-4)
    const d = s === 0 ? D0 : dias[s - 1] * T.taper;
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
  // the climb corridor of each branch: up the trunk just beside the branch (the arc to it is short and meets no
  // other branch); roots keep out of it, so the route's ground start and first metre are clear
  const corridors = branches.map((b) => b.yaw + (b.dia / 2 + 4 * bu) / (0.4 * D0));
  for (let k = 0; k < nR; k++) {
    let yaw = rootYaw0 + (k * TAU) / nR + R(rng, -0.25, 0.25);
    const rd = Math.min(0.6 * D0, Math.max(T.rootDia[0], Math.min(T.rootDia[1], D0 * R(rng, T.rootDiaK[0], T.rootDiaK[1]))));
    const half = (rd / 2 + T.corridorClearBu * bu) / (D0 / 2);
    for (const c of corridors) {
      const d = angleDiff(yaw, c);
      if (Math.abs(d) < half) yaw = c + (d >= 0 ? half : -half);
    }
    rootYaws.push(yaw);
    const rl = R(rng, ...(opts.rootLen ?? (T.rootLen as [number, number])));
    const d = dirYaw(yaw);
    const start = add(v(0, 0.12 * D0 + g(0, 0), 0), scale(d, D0 * 0.2));
    const endR = D0 / 2 + rl;
    const end = add(v(0, g(d.x * endR, d.z * endR) - 0.45 * rd, 0), scale(d, endR));
    // arches only away from the branches (the climb routes run up the trunk beside the branches)
    const nearBranch = branches.some((b) => { let dd = Math.abs(b.yaw - yaw) % TAU; if (dd > Math.PI) dd = TAU - dd; return dd < 1.0; });
    if (!nearBranch && channels < T.rootChannels && chance(rng, T.rootChannelP)) {
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
    // climb the trunk just beside the branch (the arc to it is short and meets no other branch), on the side
    // farther from the roots
    const ry = corridors[branches.indexOf(br)];
    const sd = dirYaw(ry);
    const pts: Vec3[] = [];
    const g0 = g(sd.x * (D0 / 2 + 3 * bu), sd.z * (D0 / 2 + 3 * bu));
    pts.push(add(v(0, g0 + foot, 0), scale(sd, D0 / 2 + foot + 3 * bu)));
    pts.push(add(v(0, g(sd.x * D0 / 2, sd.z * D0 / 2) + 2 * bu, 0), scale(sd, D0 / 2 + foot)));
    // where the branch leaves the trunk: the first segment crosses the trunk surface
    const a0 = br.axis[0], a1 = br.axis[1];
    const hd = (p: Vec3) => Math.sqrt(p.x * p.x + p.z * p.z);
    const segAt = (y: number) => Math.max(0, Math.min(T.segments - 1, Math.floor(y / segH)));
    const rAt = (y: number) => dias[segAt(y)] / 2;
    const tAt = (radial: number) => Math.max(0, Math.min(1, (radial - hd(a0)) / Math.max(1e-6, hd(a1) - hd(a0))));
    const ts = tAt(rAt(a0.y)), junction = add(a0, scale(sub(a1, a0), ts));
    const arcY = junction.y + br.dia / 2 + 3 * bu;
    const seg = segAt(arcY);
    for (let s = 1; s <= seg; s++) {
      const yb = s * segH, r1 = dias[s - 1] / 2, r2 = dias[s] / 2;
      pts.push(add(v(0, yb - 2 * bu, 0), scale(sd, r1 + foot)));
      pts.push(add(v(0, yb + foot, 0), scale(sd, (r1 + r2) / 2)));
      pts.push(add(v(0, yb + 2 * bu, 0), scale(sd, r2 + foot)));
    }
    const rTop = dias[seg] / 2 + foot;
    pts.push(add(v(0, arcY, 0), scale(sd, rTop)));
    // the branch leaves the trunk where its first segment crosses the surface (a side bend moves it off br.yaw)
    const jy = datan2(junction.z, junction.x);
    let da = jy - ry;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    pts.push(...arc(0, 0, arcY, rTop, ry, ry + da, 2 * bu).slice(1));
    // down the trunk into the corner above the branch root, then out onto the branch (its top over the junction
    // is higher than dia / 2 when the branch rises)
    const d0 = norm(sub(a1, a0)), cosE = Math.sqrt(d0.x * d0.x + d0.z * d0.z);
    const out = dirYaw(jy), rj = rAt(junction.y), yTop = junction.y + br.dia / 2 / Math.max(0.5, cosE);
    pts.push(add(v(0, yTop + foot + bu, 0), scale(out, rj + foot + 0.5 * bu)));
    // along the branch top from just outside the trunk to the tip
    const n = br.axis.length - 1;
    const te = tAt(rAt(a0.y) + br.dia / 2 + 1.5 * bu);
    for (let i = 0; i < n; i++) {
      const p = br.axis[i], q = br.axis[i + 1], rr = (br.dia * (1 - (0.4 * i) / n)) / 2;
      const len = Math.sqrt(sq(q.x - p.x) + sq(q.y - p.y) + sq(q.z - p.z));
      const steps = Math.max(1, Math.ceil(len / (3 * bu)));
      for (let k = i === 0 ? Math.ceil(te * steps) : 1; k <= steps; k++) {
        const c = add(p, scale(sub(q, p), k / steps));
        pts.push(...besideAxis([p, c, q], () => rr, v(0, 1, 0), foot).slice(1, 2));
      }
    }
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
export function freestAngle(roots: readonly number[], want: number): number {
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

