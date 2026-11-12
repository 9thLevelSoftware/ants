// Free-standing kitchen objects in object-local space (origin at the base centre on its support, Y up, front
// toward +z): table, chair, pedal bin, pet bowls on a mat, inner doormat, houseplant, and the counter items
// (fruit bowl, bread board, sugar bowl). Each comes with the climb route and POIs of GDD 04 §10.

import { rngChance, rngInt, rngPick, rngRange, type RngState } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import { PrimFlag, type MaterialId } from '@/sim/types';
import { dcos, dsin, drad, type ObjectTemplate, type PrimSpec } from '../../kit';
import { axisQ, ellipsoid, mulQ, ring, ringCentreY, spanBox, uprightCyl, yawQ, type RingSpec } from './prims';
import { BREAD_BOARD, CHAIR, DOORMAT_INSIDE, FRUIT_BOWL, HOUSEPLANT, PEDAL_BIN, PET_BOWL, SUGAR_BOWL, TABLE } from './dims';

const C = PrimFlag.CLIMBABLE;
const S = PrimFlag.CLIMBABLE | PrimFlag.SHELTER;

/** `kitchen-table`: top 1200 x 25 x 800 at 750 on four 50 mm legs; route leg -> underside -> edge lip -> top. */
export function tableTemplate(foot: number): ObjectTemplate {
  const [tw, tt, td] = TABLE.top, h = TABLE.height, hx = tw / 2, hz = td / 2, l = TABLE.leg / 2;
  const lx = hx - TABLE.legInset - l, lz = hz - TABLE.legInset - l;
  const prims: PrimSpec[] = [spanBox(-hx, hx, h - tt, h, -hz, hz, 'wood-sound', S, 2)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) prims.push(spanBox(sx * lx - l, sx * lx + l, 0, h - tt, sz * lz - l, sz * lz + l, 'wood-sound', C, 1));
  const o = foot, e = 0.7 * foot, under = h - tt, face = -lz - l;
  const x = -lx;
  const route: Vec3[] = [
    { x, y: o, z: face - 40 }, { x, y: o, z: face - o }, { x, y: 25, z: face - o }, { x, y: under - 25, z: face - o },
    { x, y: under - o, z: face - 10 }, { x, y: under - o, z: -hz + 5 }, { x, y: under - e, z: -hz - e },
    { x, y: h - tt / 2, z: -hz - o }, { x, y: h + e, z: -hz - e }, { x, y: h + o, z: -hz + 20 }, { x: 0, y: h + o, z: 0 },
  ];
  return {
    id: 'kitchen-table', tags: ['furniture', 'kitchen', 'rest-floor', 'table'], prims,
    routes: [{ kind: 'leg-to-top', points: route }],
    pois: [{ kind: 'food-spot', pos: { x: 0, y: h + o, z: 0 } }, { kind: 'food-spot', pos: { x: 0, y: o, z: 0 } }],
  };
}

/** `chair`: seat 420 x 20 x 420 at 450, legs 25, rear legs rising to 900 with a back rail; faces +z. */
export function chairTemplate(rng: RngState, foot: number): ObjectTemplate {
  const material: MaterialId = rngChance(rng, 0.7) ? 'wood-sound' : 'metal';
  const [sw, st, sd] = CHAIR.seat, top = CHAIR.seatTop, under = top - st, hx = sw / 2, hz = sd / 2;
  const r = CHAIR.legDiam / 2, k = hx - CHAIR.legInset;
  const prims: PrimSpec[] = [spanBox(-hx, hx, under, top, -hz, hz, material, S, 2)];
  for (const sx of [-1, 1]) {
    prims.push(uprightCyl(sx * k, 0, k, r, under, material, C));
    prims.push(uprightCyl(sx * k, 0, -k, r, CHAIR.backTop, material, C));
  }
  const [rw, rh, rd] = CHAIR.backRail;
  prims.push(spanBox(-rw / 2, rw / 2, CHAIR.backTop - rh, CHAIR.backTop, -k - rd / 2, -k + rd / 2, material, C, 2));
  const o = foot, e = 0.7 * foot, face = k + r;
  const route: Vec3[] = [
    { x: k, y: o, z: face + 40 }, { x: k, y: o, z: face + o }, { x: k, y: 25, z: face + o }, { x: k, y: under - 20, z: face + o },
    { x: k, y: under - o, z: face + 5 }, { x: k, y: under - e, z: hz + e }, { x: k, y: under + st / 2, z: hz + o },
    { x: k, y: top + e, z: hz + e }, { x: k, y: top + o, z: hz - 20 }, { x: 0, y: top + o, z: 0 },
  ];
  return { id: 'chair', tags: ['furniture', 'kitchen', 'rest-floor', 'chair'], prims, routes: [{ kind: 'leg-to-seat', points: route }] };
}

/** `pedal-bin`: body, lid over a 1-2 mm seam, pedal at +z; route base -> side -> seam -> lid; bin-gap POI. */
export function pedalBinTemplate(rng: RngState, foot: number): ObjectTemplate {
  const material: MaterialId = rngChance(rng, 0.5) ? 'plastic' : 'metal';
  const R = PEDAL_BIN.diam / 2, seam = rngRange(rng, PEDAL_BIN.seam[0], PEDAL_BIN.seam[1]);
  const bodyTop = PEDAL_BIN.height - PEDAL_BIN.lidHeight - seam, lidR = R + 2;
  const [pw, ph, pd] = PEDAL_BIN.pedal;
  const prims: PrimSpec[] = [
    uprightCyl(0, 0, 0, R, bodyTop, material, S, 3),
    uprightCyl(0, bodyTop + seam, 0, lidR, PEDAL_BIN.lidHeight, material, C, 3),
    spanBox(-pw / 2, pw / 2, 0, ph, R - 10, R + pd, material, C, 2),
  ];
  const o = foot, e = 0.7 * foot, y = PEDAL_BIN.height;
  const route: Vec3[] = [
    { x: -R - 40, y: o, z: 0 }, { x: -R - o, y: o, z: 0 }, { x: -R - o, y: 25, z: 0 }, { x: -R - o, y: bodyTop - 15, z: 0 },
    { x: -lidR - o, y: bodyTop + seam + 8, z: 0 }, { x: -lidR - o, y: y - 8, z: 0 }, { x: -lidR - e, y: y + e, z: 0 },
    { x: -lidR + 25, y: y + o, z: 0 },
  ];
  return {
    id: 'pedal-bin', tags: ['furniture', 'kitchen', 'rest-floor', 'bin'], prims,
    routes: [{ kind: 'bin-to-rim', points: route }],
    pois: [{ kind: 'bin-gap', pos: { x: -R - o, y: bodyTop + seam / 2, z: 0 } }],
  };
}

/**
 * Points on the outer face, rim and inner face of the stave of a ring facing -z (stave index n/2), with corner
 * nodes where the outer face meets the support and the inner face meets the base, down to the inner floor (or
 * to a level on the inner face, e.g. the water). Nodes sit `foot` off the surfaces.
 */
function staveRoute(s: RingSpec, foot: number, toLevelY: number | null): Vec3[] {
  const f = s.flare, cf = dcos(f), sf = dsin(f), w = s.wall, slant = s.height / cf;
  const rMid = s.rBottom - w / 2 + (s.height / 2) * (sf / cf), yc = ringCentreY(s);
  /** Point at outward offset q from the stave's mid plane and t along it (radial distance, height). */
  const P = (q: number, t: number): Vec3 => ({ x: s.x, y: yc - q * sf + t * cf, z: s.z - (rMid + q * cf + t * sf) });
  const at = (rad: number, y: number): Vec3 => ({ x: s.x, y, z: s.z - rad });
  const rad = (v: Vec3) => s.z - v.z;
  const out = w / 2 + foot, e = 0.7 * foot;
  // outer foot: the face meets the support (wedge of 90 - flare); node on the bisector, foot from both
  const foot0 = P(w / 2, -slant / 2);
  const half = (Math.PI / 2 - f) / 2, d0 = foot / dsin(half);
  const bx = cf, by = 1 - sf, bl = Math.sqrt(bx * bx + by * by);
  const pts: Vec3[] = [
    at(s.rBottom + 30, s.y0 + foot),
    at(rad(foot0) + (bx / bl) * d0, foot0.y + (by / bl) * d0),
    P(out, -slant / 2 + 10), P(out, slant / 2 - 4), P(w / 2 + e, slant / 2 + e), P(0, slant / 2 + foot),
    P(-w / 2 - e, slant / 2 + e), P(-out, slant / 2 - 4),
  ];
  const tAt = (y: number) => (y - yc - out * sf) / cf; // t on the inner offset line at height y
  if (toLevelY !== null) { pts.push(P(-out, tAt(toLevelY))); return pts; }
  const floorY = s.y0 + w;
  pts.push(P(-out, tAt(floorY + 6)));
  // inner foot: face meets the base top (110 deg); node on the bisector of the two normals
  const ib = P(-w / 2, (floorY - yc - (w / 2) * sf) / cf);
  const ih = (Math.PI / 2 + f) / 2, d1 = foot / dsin(ih), nx = -cf, ny = 1 + sf, nl = Math.sqrt(nx * nx + ny * ny);
  pts.push(at(rad(ib) + (nx / nl) * d1, ib.y + (ny / nl) * d1));
  pts.push(at(0.35 * s.rBottom, floorY + foot));
  return pts;
}

export interface BowlPairInfo { template: ObjectTemplate; water: { x: number; z: number; radius: number; levelMm: number; capMm: number } }

/** `pet-bowl-pair`: two glazed (or metal) flared bowls on a rubber mat; one holds water. */
export function bowlPairTemplate(rng: RngState, foot: number): BowlPairInfo {
  const material: MaterialId = rngChance(rng, 0.7) ? 'ceramic' : 'metal';
  const d = rngRange(rng, PET_BOWL.diam[0], PET_BOWL.diam[1]), h = rngRange(rng, PET_BOWL.height[0], PET_BOWL.height[1]);
  const flare = drad(PET_BOWL.flareDeg), rTop = d / 2, rb = rTop - h * (dsin(flare) / dcos(flare));
  const [mw0, mt, md] = PET_BOWL.mat, mw = Math.max(mw0, 4 * rTop + 40);
  const prims: PrimSpec[] = [spanBox(-mw / 2, mw / 2, 0, mt, -md / 2, md / 2, 'rubber', C, 1)];
  const waterLeft = rngChance(rng, 0.5);
  const routes: ObjectTemplate['routes'] = [];
  const pois: ObjectTemplate['pois'] = [];
  let water = { x: 0, z: 0, radius: 0, levelMm: 0, capMm: 0 };
  for (const side of [-1, 1]) {
    const bx = side * (rTop + 8);
    const spec: RingSpec = { n: PET_BOWL.staves, x: bx, y0: mt, z: 0, rBottom: rb, height: h, wall: PET_BOWL.wall, flare, material, flags: C };
    prims.push(uprightCyl(bx, mt, 0, rb - 2, PET_BOWL.wall, material, C), ...ring(spec));
    const inner = h - PET_BOWL.wall, floorY = mt + PET_BOWL.wall;
    const isWater = (side < 0) === waterLeft;
    if (isWater) {
      const level = PET_BOWL.fill * inner;
      water = { x: bx, z: 0, radius: rb + level * (dsin(flare) / dcos(flare)), levelMm: level, capMm: 0.8 * inner };
      routes.push({ kind: 'bowl-to-rim', points: staveRoute(spec, foot, floorY + level) });
      pois.push({ kind: 'water-spot', pos: routes[routes.length - 1].points[routes[routes.length - 1].points.length - 1] });
    } else {
      routes.push({ kind: 'bowl-to-rim', points: staveRoute(spec, foot, null) });
      pois.push({ kind: 'food-spot', pos: { x: bx, y: floorY + foot, z: 0 } });
    }
  }
  return { template: { id: 'pet-bowl-pair', tags: ['furniture', 'kitchen', 'rest-floor', 'bowls'], prims, routes, pois }, water };
}

export function doormatTemplate(): ObjectTemplate {
  const [w, t, d] = DOORMAT_INSIDE.size;
  return { id: 'doormat-inside', tags: ['furniture', 'kitchen', 'rest-floor', 'mat'], prims: [spanBox(-w / 2, w / 2, 0, t, -d / 2, d / 2, 'fabric', S, 2)] };
}

/** `houseplant`: glazed pot with soil 20 below the rim and a few leafy stems; route pot -> rim -> soil. */
export function houseplantTemplate(rng: RngState, foot: number, bu: number): ObjectTemplate {
  const D = rngRange(rng, HOUSEPLANT.potDiam[0], HOUSEPLANT.potDiam[1]), h = 0.85 * D, flare = drad(8);
  const rTop = D / 2, rb = rTop - h * (dsin(flare) / dcos(flare)), w = HOUSEPLANT.potWall;
  const spec: RingSpec = { n: HOUSEPLANT.staves, x: 0, y0: 0, z: 0, rBottom: rb, height: h, wall: w, flare, material: 'ceramic', flags: S };
  const soilY = h - 20;
  const prims: PrimSpec[] = [uprightCyl(0, 0, 0, rb - 2, w, 'ceramic', C), ...ring(spec)];
  // soil in three tiers following the flared wall: each meets the wall at its top (no gap at the soil surface) and
  // reaches less than a wall thickness into it at its bottom (one cylinder would poke out through the wall)
  const tan = dsin(flare) / dcos(flare), tier = (soilY - w) / 3;
  for (let i = 0; i < 3; i++) prims.push(uprightCyl(0, w + i * tier, 0, rb - w + (w + (i + 1) * tier) * tan - 0.5, tier, 'loam', C | PrimFlag.DIGGABLE));
  const soilR = rb - w + soilY * tan - 0.5;
  const leafT = Math.max(0.8, 0.15 * bu);
  const n = rngInt(rng, HOUSEPLANT.stems[0], HOUSEPLANT.stems[1]);
  for (let i = 0; i < n; i++) {
    const yaw = (2 * Math.PI * (i + rngRange(rng, 0, 0.6))) / n, tilt = drad(rngRange(rng, 8, 28));
    const len = rngRange(rng, HOUSEPLANT.stemLen[0], HOUSEPLANT.stemLen[1]), r = rngRange(rng, HOUSEPLANT.stemDiam[0], HOUSEPLANT.stemDiam[1]) / 2;
    const rot = mulQ(yawQ(yaw), axisQ({ x: 1, y: 0, z: 0 }, tilt));
    const dx = dsin(yaw) * dsin(tilt), dy = dcos(tilt), dz = dcos(yaw) * dsin(tilt);
    const c = { x: dx * len / 2, y: soilY + dy * len / 2, z: dz * len / 2 };
    prims.push({ shape: 'capsule', pos: c, rot, size: { x: r, y: len / 2 - r, z: 0 }, material: 'plant', flags: C });
    const L = rngRange(rng, HOUSEPLANT.leaf[0], HOUSEPLANT.leaf[1]);
    const tip = { x: dx * len, y: soilY + dy * len, z: dz * len };
    prims.push({ shape: 'ellipsoid', pos: { x: tip.x + dsin(yaw) * L * 0.4, y: tip.y, z: tip.z + dcos(yaw) * L * 0.4 }, rot: yawQ(yaw), size: { x: L * 0.22, y: leafT / 2, z: L / 2 }, material: 'plant', flags: C });
  }
  // up the pot (local -z side faces the room when placed), over the rim, down to the soil
  const route = staveRoute(spec, foot, null).slice(0, 8);
  const inner = rb - w + (soilY - 2) * (dsin(flare) / dcos(flare));
  route.push({ x: 0, y: soilY + 8, z: -(inner - foot) }, { x: 0, y: soilY + foot, z: -(inner - 1.7 * foot) }, { x: 0, y: soilY + foot, z: -0.6 * soilR });
  return {
    id: 'houseplant', tags: ['furniture', 'kitchen', 'plant'], prims,
    routes: [{ kind: 'pot-to-soil', points: route }],
    pois: [{ kind: 'nest-site', pos: { x: 0, y: soilY + foot, z: -0.3 * soilR } }],
  };
}

/** `fruit-bowl`: flared ceramic bowl with 3-6 fruit; fruit anchor POI on the top fruit. */
export function fruitBowlTemplate(rng: RngState, foot: number): ObjectTemplate {
  const B = FRUIT_BOWL, flare = drad(25), rTop = B.diam / 2, rb = rTop - B.height * (dsin(flare) / dcos(flare));
  const spec: RingSpec = { n: B.staves, x: 0, y0: 0, z: 0, rBottom: rb, height: B.height, wall: B.wall, flare, material: 'ceramic', flags: S };
  const prims: PrimSpec[] = [uprightCyl(0, 0, 0, rb - 2, B.wall, 'ceramic', C), ...ring(spec)];
  const n = rngInt(rng, B.fruit[0], B.fruit[1]);
  let topY = B.wall;
  for (let i = 0; i < n; i++) {
    const r = rngRange(rng, B.fruitDiam[0], B.fruitDiam[1]) / 2;
    const a = (2 * Math.PI * i) / Math.max(1, n - 1);
    const onTop = i === n - 1 && n > 2;
    const ring0 = onTop ? 0 : Math.min(rb - B.wall - r * 0.6, 45);
    const y = onTop ? B.wall + 2 * r * 0.95 : B.wall + r * 0.92;
    prims.push(ellipsoid({ x: dsin(a) * ring0, y, z: dcos(a) * ring0 }, r, r * 0.95, r, 'food', C));
    topY = Math.max(topY, y + r * 0.95);
  }
  return { id: 'fruit-bowl', tags: ['furniture', 'kitchen', 'rest-counter', 'counter-item'], prims, pois: [{ kind: 'food-spot', pos: { x: 0, y: topY + foot, z: 0 } }] };
}

export function breadBoardTemplate(foot: number): ObjectTemplate {
  const [w, t, d] = BREAD_BOARD.size;
  return {
    id: 'bread-board', tags: ['furniture', 'kitchen', 'rest-counter', 'counter-item'],
    prims: [spanBox(-w / 2, w / 2, 0, t, -d / 2, d / 2, 'wood-sound', S, 3)],
    pois: [{ kind: 'food-spot', pos: { x: 0, y: t + foot, z: 0 } }],
  };
}

/** `sugar-bowl`: small ceramic ring with base and a flattened lid; sugar granules POI on the counter beside it. */
export function sugarBowlTemplate(rng: RngState, foot: number): ObjectTemplate {
  const B = SUGAR_BOWL, r = B.diam / 2;
  const spec: RingSpec = { n: B.staves, x: 0, y0: 0, z: 0, rBottom: r, height: B.height - B.lid[1] / 2, wall: B.wall, flare: 0, material: 'ceramic', flags: S };
  const prims: PrimSpec[] = [uprightCyl(0, 0, 0, r - 2, B.wall, 'ceramic', C), ...ring(spec)];
  prims.push(ellipsoid({ x: 0, y: B.height - B.lid[1] / 2, z: 0 }, B.lid[0] / 2, B.lid[1] / 2, B.lid[0] / 2, 'ceramic', C));
  const side = rngPick(rng, [-1, 1]);
  return {
    id: 'sugar-bowl', tags: ['furniture', 'kitchen', 'rest-counter', 'counter-item'], prims,
    pois: [{ kind: 'food-spot', pos: { x: side * (r + 30), y: foot, z: 0 } }],
  };
}
