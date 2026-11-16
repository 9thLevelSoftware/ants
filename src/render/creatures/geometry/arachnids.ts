/**
 * Spiders and mites (8 legs, alternating tetrapods L1 R2 L3 R4 / R1 L2 R3 L4; GDD 08 §11.9). Three spiders
 * (jumping, wolf, ant-specialist) share one parametric builder; `softened` is the comfort level of GDD 08 §12:
 * no hairs and no detailed eyes (the leg amplitude is halved per instance). The abstract comfort body is in
 * comfortBodies.ts and has no legs at all.
 */
import { lin, type V3 } from '@/render/ants/geometry/meshBuilder';
import { mulberry32, vnoise3 } from '@/render/ants/geometry/curves';
import { CreatureBuilder, PART, bilateral, blob, body, feeler, leg, setae, type Detail } from './builder';
import { row, type Built } from './types';

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface SpiderLook {
  /** Carapace and abdomen: length, half width, half height (mm). */
  carapace: [number, number, number];
  abdomen: [number, number, number];
  /** Leg reach per pair (mm) and knee height above the hip (mm); leg radius. */
  reach: [number, number, number, number];
  kneeUp: number; legR: number;
  /** Front legs stouter (jumping spiders). */
  frontThick: number;
  colors: { carapace: string; carapaceBand: string; abdomen: string; abdomenMark: string; legs: string; legBand: string; eye: string; palp: string };
  eyes: 'salticid' | 'lycosid' | 'small';
  pattern: 'zebra' | 'wolf' | 'spots';
  hairs: number;
}

export const JUMPING_SPIDER: SpiderLook = {
  carapace: [2.6, 1.0, 0.72], abdomen: [3.1, 1.05, 0.85], reach: [2.6, 2.1, 2.0, 2.5], kneeUp: 0.75, legR: 0.15, frontThick: 1.4,
  colors: { carapace: '#1b1a19', carapaceBand: '#d8d4ca', abdomen: '#1d1c1a', abdomenMark: '#e2ddd0', legs: '#2a2724', legBand: '#8f887a', eye: '#0b0d10', palp: '#d9d3c4' },
  eyes: 'salticid', pattern: 'zebra', hairs: 1,
};
export const WOLF_SPIDER: SpiderLook = {
  carapace: [4.4, 1.7, 1.0], abdomen: [5.2, 1.75, 1.35], reach: [7.6, 7.0, 6.8, 8.6], kneeUp: 1.9, legR: 0.2, frontThick: 1.05,
  colors: { carapace: '#4e3c2b', carapaceBand: '#a88d68', abdomen: '#4a3a2a', abdomenMark: '#2a2018', legs: '#5b4632', legBand: '#2f241a', eye: '#090a0c', palp: '#4e3c2b' },
  eyes: 'lycosid', pattern: 'wolf', hairs: 1,
};
export const ANT_SPIDER: SpiderLook = {
  carapace: [1.3, 0.48, 0.36], abdomen: [1.6, 0.55, 0.45], reach: [2.0, 1.7, 1.6, 2.1], kneeUp: 0.5, legR: 0.05, frontThick: 1.0,
  colors: { carapace: '#6a2c18', carapaceBand: '#6a2c18', abdomen: '#2a1c16', abdomenMark: '#c8b48e', legs: '#b38a52', legBand: '#8a6236', eye: '#0b0b0c', palp: '#b38a52' },
  eyes: 'small', pattern: 'spots', hairs: 0.4,
};

/** Builds a spider; `softened` drops hairs and eye detail (comfort level, GDD 08 §12). */
export function buildSpider(s: SpiderLook, softened = false) {
  return (d: Detail): Built => {
    const b = new CreatureBuilder();
    const C = Object.fromEntries(Object.entries(s.colors).map(([k, v]) => [k, lin(v)])) as Record<keyof SpiderLook['colors'], V3>;
    const [cl, cw, ch] = s.carapace, [al, aw, ah] = s.abdomen;
    const total = cl + al;
    const zFront = total / 2, zJoin = zFront - cl, zBack = zJoin - al;
    const yc = s.kneeUp * 0.42 + ch * 0.4;
    // abdomen
    body(b, d, {
      zTail: zBack, zHead: zJoin + al * 0.05, rings: 14, radial: [14, 8, 5], lower: 0.85,
      rows: [row(0, aw * 0.25, ah * 0.25, yc + ah * 0.1), row(0.2, aw * 0.85, ah * 0.85, yc + ah * 0.2), row(0.55, aw, ah, yc + ah * 0.25), row(0.9, aw * 0.75, ah * 0.7, yc + ah * 0.1), row(1, aw * 0.25, ah * 0.25, yc)],
      color: (p, _n, u) => abdomenColor(s.pattern, C, p, u, aw, yc),
    });
    // pedicel + carapace (cephalothorax), squarer at the front for salticids
    body(b, d, {
      zTail: zJoin - 0.05 * cl, zHead: zFront, rings: 12, radial: [14, 8, 5], e: s.eyes === 'salticid' ? 2.8 : 2.2, lower: 0.55,
      rows: [row(0, cw * 0.25, ch * 0.3, yc), row(0.15, cw * 0.75, ch * 0.75, yc + ch * 0.1), row(0.5, cw, ch, yc + ch * 0.2), row(0.85, cw * 0.95, ch * 0.95, yc + ch * 0.25), row(1, cw * 0.6, ch * 0.6, yc + ch * 0.15)],
      color: (p) => (s.pattern === 'wolf' && Math.abs(p[0]) < cw * 0.22 && p[1] > yc + ch * 0.4 ? C.carapaceBand
        : s.pattern === 'zebra' && Math.abs(Math.abs(p[0]) - cw * 0.85) < cw * 0.12 ? C.carapaceBand : C.carapace),
    });
    if (!softened && d < 2) spiderEyes(b, d, s, C.eye, zFront, yc + ch * 0.2, cw, ch);
    // chelicerae (part JAW, small opening) and palps
    bilateral(b, (L) => {
      L.part(PART.JAW, [cw * 0.25, yc - ch * 0.1, zFront - 0.05], 1, 0, zFront);
      blob(L, d, [cw * 0.25, yc - ch * 0.35, zFront + 0.04 * total], [cw * 0.22, ch * 0.42, cl * 0.12], C.carapace, 5, 6);
      if (d < 2) feeler(L, d, [cw * 0.45, yc - ch * 0.3, zFront - 0.05 * cl], [[cw * 0.7, yc + ch * 0.1, zFront + 0.12 * cl], [cw * 0.65, yc - ch * 0.2, zFront + 0.25 * cl]], s.legR * 0.8, C.palp);
    });
    // legs: four pairs from the carapace sides
    const hipZ = [zFront - cl * 0.2, zFront - cl * 0.42, zFront - cl * 0.62, zFront - cl * 0.8];
    const yaws = [62, 28, -18, -52];
    bilateral(b, (L) => {
      for (let i = 0; i < 4; i++) {
        const r = s.legR * (i === 0 ? s.frontThick : 1);
        const v0 = L.vcount;
        leg(L, d, {
          hip: [cw * 0.8, yc, hipZ[i]!], yawDeg: yaws[i]!, reach: s.reach[i]!, kneeAt: 0.33, kneeUp: s.kneeUp, ankleAt: 0.72,
          ankleY: s.kneeUp * 0.35, radius: r, phase: (i % 2) * 0.5, raise: i === 0 ? 1 : i === 1 ? 0.35 : 0, color: C.legs,
        });
        // banded legs (annuli), per vertex by distance from the hip
        const hip: V3 = [cw * 0.8, yc, hipZ[i]!];
        L.recolor(v0, (p) => (Math.sin(Math.hypot(p[0] - hip[0], p[2] - hip[2]) / s.reach[i]! * 22) > 0.55 ? C.legBand : C.legs));
        if (!softened && d === 0 && s.hairs > 0) legHairs(L, s, hip, yaws[i]!, s.reach[i]!, C.legs);
      }
    });
    if (!softened && d === 0 && s.hairs > 0) bodyHairs(b, s, zBack, zJoin, aw, ah, yc, C.abdomen);
    return { body: b };
  };
}

function abdomenColor(pattern: SpiderLook['pattern'], C: Record<string, V3>, p: V3, u: number, aw: number, yc: number): V3 {
  const top = p[1] > yc;
  if (pattern === 'zebra') return top && Math.sin(u * Math.PI * 7) > 0.35 ? C.abdomenMark! : C.abdomen!;
  if (pattern === 'wolf') {
    const heart = top && Math.abs(p[0]) < aw * (0.25 - 0.15 * Math.abs(u - 0.75)) && u > 0.45;
    const side = Math.abs(p[0]) > aw * 0.75;
    return heart ? C.abdomenMark! : side ? mix3(C.abdomen!, lin('#8c7356'), 0.6) : mix3(C.abdomen!, C.abdomenMark!, 0.35 * vnoise3(p[0] * 3, p[1] * 3, p[2] * 3));
  }
  const spot = top && (Math.abs(u - 0.3) < 0.07 || Math.abs(u - 0.6) < 0.06) && Math.abs(p[0]) > aw * 0.3 && Math.abs(p[0]) < aw * 0.7;
  return spot ? C.abdomenMark! : C.abdomen!;
}

function spiderEyes(b: CreatureBuilder, d: Detail, s: SpiderLook, eye: V3, zF: number, y: number, cw: number, ch: number): void {
  b.part(PART.BODY);
  if (s.eyes === 'salticid') {
    // two large forward-facing anterior median eyes, smaller laterals, posterior eyes on top
    bilateral(b, (L) => {
      blob(L, d, [cw * 0.27, y, zF - 0.06], [cw * 0.24, cw * 0.24, cw * 0.14], eye, 8, 10);
      blob(L, d, [cw * 0.68, y + ch * 0.05, zF - 0.12], [cw * 0.11, cw * 0.11, cw * 0.08], eye, 5, 6);
      blob(L, d, [cw * 0.72, y + ch * 0.55, zF - s.carapace[0] * 0.45], [cw * 0.09, cw * 0.09, cw * 0.09], eye, 4, 6);
    });
  } else if (s.eyes === 'lycosid') {
    bilateral(b, (L) => {
      for (const x of [0.12, 0.32]) blob(L, d, [cw * x, y - ch * 0.15, zF - 0.05], [cw * 0.06, cw * 0.06, cw * 0.05], eye, 4, 6);
      blob(L, d, [cw * 0.2, y + ch * 0.4, zF - s.carapace[0] * 0.12], [cw * 0.13, cw * 0.13, cw * 0.12], eye, 6, 8);
      blob(L, d, [cw * 0.4, y + ch * 0.55, zF - s.carapace[0] * 0.35], [cw * 0.1, cw * 0.1, cw * 0.1], eye, 5, 6);
    });
  } else {
    bilateral(b, (L) => { for (const x of [0.15, 0.4]) blob(L, d, [cw * x, y + ch * 0.35, zF - 0.08], [cw * 0.08, cw * 0.08, cw * 0.07], eye, 4, 6); });
  }
}

function legHairs(L: CreatureBuilder, s: SpiderLook, hip: V3, yawDeg: number, reach: number, color: V3): void {
  const yaw = (yawDeg * Math.PI) / 180, dir: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const bases: { p: V3; n: V3 }[] = [];
  for (let k = 1; k <= 6; k++) {
    const f = 0.15 + k * 0.12;
    const y = f < 0.33 ? hip[1] + s.kneeUp * (f / 0.33) : s.kneeUp * (1 - (f - 0.33) / 0.67) * 0.9 + hip[1] * 0.2;
    bases.push({ p: [hip[0] + dir[0] * reach * f, y + s.legR * 0.8, hip[2] + dir[2] * reach * f], n: [dir[0] * 0.9, 0.45, dir[2] * 0.9] });
  }
  setae(L, bases, s.legR * 1.8 * s.hairs, s.legR * 0.18, color);
}

function bodyHairs(b: CreatureBuilder, s: SpiderLook, zBack: number, zJoin: number, aw: number, ah: number, yc: number, color: V3): void {
  const r = mulberry32(3); const bases: { p: V3; n: V3 }[] = [];
  for (let i = 0; i < 40; i++) {
    const u = 0.15 + r() * 0.75, th = r() * Math.PI;
    const z = zBack + (zJoin - zBack) * u, w = Math.sin(Math.PI * Math.min(1, u * 1.1));
    const n: V3 = [Math.cos(th), Math.sin(th), 0];
    bases.push({ p: [n[0] * aw * w * 0.95, yc + ah * 0.2 + n[1] * ah * w * 0.95, z], n: [n[0], n[1], -0.3] });
  }
  setae(b, bases, ah * 0.35 * s.hairs, ah * 0.04, color);
}

// ---------------------------------------------------------------- mite (0.5 mm; oribatid, glossy dark brown)

export function buildMite(d: Detail): Built {
  const b = new CreatureBuilder();
  const brown = lin('#3b2016'), leg8 = lin('#6a4a34');
  body(b, d, {
    zTail: -0.25, zHead: 0.2, rings: 10, radial: [12, 8, 4], lower: 0.5,
    rows: [row(0, 0.06, 0.05, 0.16), row(0.25, 0.19, 0.15, 0.17), row(0.6, 0.2, 0.15, 0.17), row(0.9, 0.12, 0.09, 0.15), row(1, 0.04, 0.03, 0.14)],
    color: (p) => mix3(brown, lin('#5c3422'), 0.3 * vnoise3(p[0] * 40, p[1] * 40, p[2] * 40)),
  });
  blob(b, d, [0, 0.12, 0.23], [0.05, 0.04, 0.05], leg8, 4, 6);
  const yaws = [60, 25, -20, -55];
  bilateral(b, (L) => {
    for (let i = 0; i < 4; i++) {
      leg(L, d, { hip: [0.12, 0.1, 0.12 - i * 0.08], yawDeg: yaws[i]!, reach: 0.22, kneeAt: 0.4, kneeUp: 0.06, radius: 0.016, phase: (i % 2) * 0.5, color: leg8 });
    }
  });
  return { body: b };
}
