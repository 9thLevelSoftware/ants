// Forest-floor catalogue (GDD 04 §5.1): standing tree (also park and fruit trees), log, stump, fallen branch,
// twig, flat stone, pebble, moss cushion, curled leaf, fungus cap [T2], nut [T2], herb plant. Dimensions are the
// chapter's; the builders turn one RNG sub-stream into one object.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';
import { add, C, ca, chain, compose, cy, D, datan2, dirYaw, el, NB, pitchQ, rb, rollQ, S, scale, sub, v } from './prims';
import { densify } from './routes';
import { growPlant, type PlantTemplate } from './plant';
import type { Built, Env, LocalCavity } from './types';

const R = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);
const chance = (rng: RngState, p: number) => rngFloat(rng) < p;
const TAU = 2 * Math.PI;

export const FOREST = {
  tree: {
    trunkDia: [300, 800], height: 2400, segments: 3, taper: 0.9, rootCount: [4, 6], rootDiaK: [0.18, 0.3],
    rootDia: [60, 200], rootLen: [400, 1200], branchCount: [2, 3], branchY: [900, 2200], branchLen: [600, 1500],
    branchDia: [40, 120], branchBendDeg: [10, 25], canopyR: [2000, 4000], canopyY: 3000, heartRotP: 0.15,
    /** Root channels (GDD 04 §6.2): arches per tree, probability, gap under the arch (BU) and buried galleries. */
    rootChannels: 2, rootChannelP: 0.6, archGapBu: [1.2, 3], galleryDiaBu: [1.2, 2.5], galleryLenBu: [80, 150],
    galleryDepthBu: [5, 30], shaftBu: 3,
    /** Roots keep this far (BU, beyond their radius) out of each branch's climb corridor at the trunk foot. */
    corridorClearBu: 6,
  },
  log: { dia: [150, 400], len: [1000, 2500], embedK: [0.1, 0.2], decayedP: 0.6, barkSlabs: [0, 3], barkGapBu: [1, 3], galleryP: 0.7,
    /** Loose bark slabs: angle off the crest (rad), thickness, size (along x across, mm), keep-off from the ends and the route section. */
    barkPhi: [0.35, 1.1] as [number, number], barkT: [5, 20] as [number, number], barkSize: [200, 100] as [number, number], barkEndMm: 150, barkRouteMm: 200 },
  stump: { dia: [300, 800], h: [150, 500], roots: [4, 5], decayedP: 0.7, galleryP: 0.7,
    /** Root flares: largest diameter (mm), share of the stump diameter, reach beyond the rim (mm). */
    rootDiaMax: 200, rootDiaK: 0.25, rootReach: [200, 500] as [number, number] },
  /** Gallery inside decayed wood (GDD 04 §7 log-gallery): tube diameter, total length, chambers. */
  gallery: { tubeDiaBu: [1.5, 2], lenBu: [30, 120], chambers: [1, 2], chamberBu: [4, 6] },
  branch: { dia: [20, 60], len: [500, 1500], segs: [2, 4], bendDeg: [10, 25], twigs: [0, 2], decayedP: 0.5 },
  twig: { dia: [2, 20], len: [50, 300], straightP: 0.5, bendX: 0.1, bendZ: 0.15 },
  stone: { len: [40, 200], smallShare: 0.7, smallMax: 80, thickK: [0.25, 0.4], widthK: [0.6, 0.9], elP: 0.6, embedK: [0.3, 0.5],
    /** under-stone lens (GDD 04 §7): share of stones >= minLenBu, footprint share, height (BU), radius cap (BU). */
    cavityP: 0.4, cavityMinLenBu: 6, cavityFoot: [0.6, 0.9], lensBu: [0.5, 1], lensMaxRBu: 10 },
  pebble: { size: [10, 30] },
  moss: { len: [60, 200], h: [10, 40] },
  leaf: { len: [60, 120], w: [40, 70] },
  fungus: { cap: [30, 150], stemDia: [8, 20], stemH: [30, 100] },
  nut: { acorn: [20, 12], round: 15 },
};

export { standingTree } from './tree';
import { freestAngle } from './tree';

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
    const phi = R(rng, L.barkPhi[0], L.barkPhi[1]) * (rngFloat(rng) < 0.5 ? -1 : 1);
    const t = R(rng, L.barkT[0], L.barkT[1]), gap = R(rng, L.barkGapBu[0], L.barkGapBu[1]) * bu;
    const x = R(rng, -len / 2 + L.barkEndMm, len / 2 - L.barkEndMm), rr = r + gap + t / 2;
    if (Math.abs(x - xs) < L.barkRouteMm + 4 * bu) continue;
    prims.push(rb(v(x, r + rr * dcos(phi), -rr * dsin(phi)), L.barkSize[0], t, L.barkSize[1], 3, 'bark', C | S, pitchQ(-phi)));
  }
  // litter banked along both sides fills the acute wedge under the log's bulge (an overhang no walker turns into)
  const rbm = 0.6 * (r - embed), zcb = Math.sqrt(Math.max(0, r * r - (r - embed) * (r - embed)));
  for (const sz of [-1, 1]) prims.push(ca(v(-len * 0.45, embed - rbm * 0.25, sz * (zcb + rbm * 0.35)), v(len * 0.45, embed - rbm * 0.25, sz * (zcb + rbm * 0.35)), 2 * rbm, 'humus', C | D));
  const cavities: LocalCavity[] = [];
  if (decayed && chance(rng, L.galleryP)) {
    const side = rngFloat(rng) < 0.5 ? -1 : 1;
    const mouth = v((side * len) / 2, r * 0.8, 0);
    cavities.push(woodGallery(rng, env, mouth, v(-side, 0, 0), len * 0.6, v(side, 0, 0)));
  }
  // Lay the log along the ground: pitch it to the line through the ground at its two ends and sink it so that it
  // is embedded `embed` where the ground is lowest relative to that line (it never floats over a dip).
  const g = env.ground ?? (() => 0);
  const g0 = g(-len / 2, 0), g1 = g(len / 2, 0), slope = (g1 - g0) / len;
  let low = Infinity;
  for (let i = 0; i <= 8; i++) { const x = -len / 2 + (len * i) / 8; low = Math.min(low, g(x, 0) - slope * x, g(x, -r * 0.7) - slope * x, g(x, r * 0.7) - slope * x); }
  const pitch = slope - (slope * slope * slope) / 3; // atan for a gentle grade
  const q = rollQ(pitch), lift = low - embed;
  const P = (p: Vec3): Vec3 => { const c = dcos(pitch), sn = dsin(pitch); const y = p.y - r; return v(p.x * c - y * sn, r + lift + p.x * sn + y * c, p.z); };
  for (const pr of prims) { pr.pos = P(pr.pos); pr.rot = compose(pr.rot ?? { x: 0, y: 0, z: 0, w: 1 }, q); }
  for (const c of cavities) for (const op of c.carves) { op.a = P(op.a); if (op.shape === 'capsule') op.b = P(op.b); }
  for (const c of cavities) for (const o of c.openings) o.pos = P(o.pos);
  // log-over: the section at xs above the ground, with ground nodes beside the contact lines (the wedge where a
  // walker turns onto the log). The section's outline is the union of the log's circle and the two litter berms:
  // nodes on that outline, a foot offset out, ordered by their angle round the log's axis.
  const pts = sectionRoute([{ z: 0, y: r, r: ro }, ...[-1, 1].map((sz) => ({ z: sz * (zcb + rbm * 0.35), y: embed - rbm * 0.25, r: rbm + foot }))],
    { z: 0, y: r }, 2 * bu, (z, y) => { const p = P(v(xs, y, z)); return p.y >= g(p.x, p.z) + 0.25 * foot; });
  const sec = pts.map((q) => P(v(xs, q.y, q.z)));
  if (sec.length >= 2) {
    const a0 = sec[0], a1 = sec[sec.length - 1];
    const z0 = a0.z - 3 * bu, z1 = a1.z + 3 * bu;
    sec.unshift(v(a0.x, g(a0.x, z0) + foot, z0));
    sec.push(v(a1.x, g(a1.x, z1) + foot, z1));
  }
  const top = P(v(xs, d + foot, 0));
  return {
    tpl: {
      id: 'log', prims, tags: ['prop', 'wood'],
      routes: sec.length >= 2 ? [{ kind: 'log-over', points: densify(sec, 6 * bu) }] : [],
      pois: [{ kind: 'vantage', pos: top }, { kind: 'shelter', pos: v(xs, g(xs, r * 1.1) + foot, r * 1.1) }],
    },
    tilt: false, cavities,
  };
}

/**
 * Points on the outline of a union of circles in a (z, y) section, every `step` along each circle, that lie on no
 * other circle's inside and pass `keep` (above the ground), ordered by angle round `c` from -Z over the top to +Z.
 */
function sectionRoute(circles: { z: number; y: number; r: number }[], c: { z: number; y: number }, step: number, keep: (z: number, y: number) => boolean): { z: number; y: number }[] {
  const out: { z: number; y: number; a: number }[] = [];
  circles.forEach((k, i) => {
    const n = Math.max(24, Math.ceil((2 * Math.PI * k.r) / step));
    for (let j = 0; j < n; j++) {
      const a = (2 * Math.PI * j) / n;
      const z = k.z + k.r * dcos(a), y = k.y + k.r * dsin(a);
      if (circles.some((o, m) => m !== i && (z - o.z) * (z - o.z) + (y - o.y) * (y - o.y) < o.r * o.r * 0.999)) continue;
      if (!keep(z, y)) continue;
      // angle from -Z (0) over the top (pi / 2) to +Z (pi), below the axis beyond those
      out.push({ z, y, a: datan2(y - c.y, -(z - c.z)) });
    }
  });
  // below the axis on -Z the angle is negative, on +Z beyond pi: put them at the two ends
  for (const p of out) if (p.a < -Math.PI / 2) p.a += 2 * Math.PI;
  out.sort((p, q) => p.a - q.a || p.z - q.z);
  return out;
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
    const dd = dirYaw(a), rd = Math.min(T.rootDiaMax, d * T.rootDiaK), out = r + R(rng, T.rootReach[0], T.rootReach[1]);
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
  if (chance(rng, T.straightP)) return { tpl: { id: 'twig', prims: [ca(v(-len / 2 + r, r, 0), v(len / 2 - r, r, 0), dia, 'wood-sound', C)], tags: ['prop'] } };
  const mid = v(R(rng, -len * T.bendX, len * T.bendX), r, R(rng, -len * T.bendZ, len * T.bendZ));
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
