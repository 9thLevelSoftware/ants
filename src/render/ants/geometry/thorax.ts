// Mesosoma (with neck collar, spines and dealate wing stubs) and the waist: one formicine scale or one/two myrmicine
// nodes. Ported from the ants spike, extended with the evenly arched Camponotus profile and Atta's three spine pairs.
import { type Ring, type V3, add, lin, norm, scl } from './meshBuilder';
import { curve, smooth } from './curves';
import type { Assembly, MesoSection } from './context';
import { PART } from './rig';

// side profiles: [s (0 front .. 1 back), top (fraction of height above bottom), bottom, half width (fraction)]
const MESO: Record<string, number[][]> = {
  worker: [[0, 0.5, 0.3, 0.32], [0.07, 0.74, 0.12, 0.75], [0.2, 0.95, 0.0, 1.0], [0.34, 1.0, 0.0, 0.93], [0.5, 0.88, 0.03, 0.72],
    [0.6, 0.76, 0.06, 0.6], [0.67, 0.66, 0.08, 0.55], [0.75, 0.74, 0.1, 0.63], [0.87, 0.68, 0.16, 0.62], [1.0, 0.36, 0.3, 0.38]],
  // Camponotus: dorsum evenly convex in profile, no metanotal groove
  arched: [[0, 0.5, 0.3, 0.32], [0.07, 0.74, 0.12, 0.75], [0.2, 0.93, 0.0, 0.98], [0.36, 1.0, 0.0, 0.92], [0.5, 0.97, 0.03, 0.78],
    [0.64, 0.88, 0.06, 0.64], [0.78, 0.74, 0.1, 0.6], [0.9, 0.58, 0.16, 0.56], [1.0, 0.34, 0.3, 0.38]],
  alate: [[0, 0.4, 0.3, 0.3], [0.07, 0.62, 0.12, 0.72], [0.17, 0.88, 0.02, 0.93], [0.34, 1.0, 0.0, 1.0], [0.5, 0.98, 0.0, 0.95],
    [0.6, 0.95, 0.02, 0.84], [0.68, 0.8, 0.05, 0.7], [0.76, 0.72, 0.08, 0.66], [0.88, 0.58, 0.14, 0.6], [1.0, 0.3, 0.3, 0.38]],
  male: [[0, 0.42, 0.32, 0.3], [0.07, 0.62, 0.14, 0.7], [0.17, 0.9, 0.03, 0.92], [0.34, 1.0, 0.0, 1.0], [0.5, 0.97, 0.0, 0.94],
    [0.6, 0.92, 0.03, 0.82], [0.68, 0.78, 0.06, 0.68], [0.78, 0.68, 0.1, 0.62], [0.9, 0.55, 0.16, 0.56], [1.0, 0.3, 0.3, 0.36]],
};

/** Builds the mesosoma frame and the section function used by every other part. */
export function mesoFrame(a: Pick<Assembly, 'p' | 'BL'>): Pick<Assembly, 'zF' | 'zB' | 'yb' | 'MH' | 'MW' | 'mesoAt'> {
  const { p, BL } = a;
  const ML = p.mesosoma.length * BL, MW = p.mesosoma.width * BL, MH = p.mesosoma.height * BL;
  const yb = 0.075 * BL * p.legs.length * (p.mesosoma.profile === 'alate' || p.mesosoma.profile === 'male' ? 1.05 : 1);
  const prof = MESO[p.mesosoma.profile]!;
  const mesoAt = (s: number): MesoSection => {
    const [top, bot, hw] = curve(prof, s) as [number, number, number];
    const y0 = yb + bot * MH, y1 = yb + top * MH;
    return { yc: (y0 + y1) / 2, b: Math.max((y1 - y0) / 2, 1e-4), a: hw * MW / 2, top: y1, bot: y0 };
  };
  return { zF: ML * 0.5, zB: -ML * 0.5, yb, MH, MW, mesoAt };
}

const zAt = (A: Assembly, s: number) => A.zF + (A.zB - A.zF) * s;

export function buildMesosoma(A: Assembly): { neck: V3 } {
  const { p, lod, BL, body, col, zF, zB, MH, MW, mesoAt } = A;
  const rings: Ring[] = [];
  const n = lod.mesoRings; const back = mesoAt(1), front = mesoAt(0);
  rings.push({ c: [0, back.yc, zB - 0.012 * BL], t: [0, 0, 1], a: 0, b: 0 });
  for (let i = 0; i <= n; i++) {
    const s = 1 - i / n; const m = mesoAt(s);
    rings.push({ c: [0, m.yc, zAt(A, s)], t: [0, 0, 1], a: m.a, b: m.b, e: 2.5, color: col.meso });
  }
  rings.push({ c: [0, front.yc, zF + 0.01 * BL], t: [0, 0, 1], a: 0, b: 0 });
  body.color = col.meso; body.rigV = [PART.BODY, 0, 0, 0];
  body.loft(rings, lod.mesoRad);
  const neck: V3 = [0, A.yb + 0.6 * MH, zF + 0.025 * BL];
  if (lod.level < 2) body.ellipsoid([0, neck[1] - 0.01 * BL, zF], [0.06 * BL * (MW / BL / 0.145) * 0.8, 0.045 * BL, 0.05 * BL], 4, Math.max(lod.mesoRad / 2, 5));
  if (lod.level < 2) buildSpines(A);
  if (p.wings === 'stubs' && lod.level < 2) {
    for (const [s0, zz] of [[0.3, 0.33], [0.52, 0.45]] as [number, number][]) {
      const m = mesoAt(s0);
      for (const sd of [1, -1]) {
        const c: V3 = [m.a * 0.92 * sd, m.top - 0.25 * (m.top - m.yc), zAt(A, s0)];
        body.color = lin('#3a2a1e');
        body.ellipsoid(c, [0.018 * BL, 0.012 * BL, 0.03 * BL * zz * 3], 3, 6);
      }
    }
  }
  return { neck };
}

/** Tapered spine pairs: propodeal (back, up-out), mesonotal (mid, short) and pronotal (front, lateral). */
function buildSpines(A: Assembly): void {
  const { p, BL, body, col, lod, mesoAt } = A;
  const pairs: [len: number, s: number, dir: V3, topInset: number, xIn: number][] = [
    [p.spines.propodeal, 0.8, [0.35, 0.75, -0.6], 0.01, 0.55],
    [p.spines.mesonotal, 0.46, [0.45, 0.85, -0.25], 0.012, 0.5],
    [p.spines.pronotal, 0.2, [0.7, 0.6, 0.2], 0.02, 0.8],
  ];
  for (const [len, s, dir0, inset, xIn] of pairs) {
    if (len <= 0) continue;
    const m = mesoAt(s); const L = len * BL; const dir = norm(dir0);
    for (const sd of [1, -1]) {
      const b0: V3 = [m.a * xIn * sd, m.top - inset * BL, zAt(A, s)];
      const d: V3 = [dir[0] * sd, dir[1], dir[2]];
      body.color = col.meso; body.rigV = [PART.BODY, 0, 0, 0];
      body.tubePath([b0, add(b0, scl(d, L * 0.5)), add(b0, scl(d, L))], [0.022 * BL, 0.011 * BL, 0.002 * BL], Math.max(lod.legRad, 3), true, true);
    }
  }
}

/** Petiole (and postpetiole). Returns the z where the gaster starts and the petiole pivot. */
export function buildPetiole(A: Assembly): { gasterFrontZ: number; petPivot: V3 } {
  const { p, lod, BL, body, col, yb, MH, MW, zB } = A;
  const petBaseY = yb + 0.08 * MH;
  const petZ = zB - 0.03 * BL;
  const petPivot: V3 = [0, yb + 0.22 * MH, zB - 0.005 * BL];
  body.rigV = [PART.PETIOLE, 0, 0, 0]; body.color = col.meso;
  const GW = p.gaster.width * BL, PH = p.petiole.height * BL;
  if (lod.level === 3) return { gasterFrontZ: zB - 0.04 * BL, petPivot };
  if (p.petiole.shape === 'scale') {
    // formicine squama: an upright, thin, broad plate on a short stalk
    const n = Math.max(lod.level === 0 ? 7 : 3, 3); const rings: Ring[] = [];
    const W = Math.min(GW * 0.36, MW * 0.55), T = 0.024 * BL;
    rings.push({ c: [0, petBaseY - 0.01 * BL, petZ], t: [0, 1, 0], a: 0, b: 0 });
    for (let i = 0; i <= n; i++) {
      const s = i / n; const close = Math.pow(Math.max(0, 1 - Math.pow(s, 5)), 0.5);
      rings.push({ c: [0, petBaseY + s * PH, petZ + 0.012 * BL * s], t: [0, 1, 0], a: Math.max(W * (0.45 + 0.55 * smooth(s * 1.4)) * close, 1e-4), b: Math.max(T * (1.4 - 0.6 * s) * close, 1e-4), e: 2.2 });
    }
    rings.push({ c: [0, petBaseY + PH * 1.005, petZ + 0.012 * BL], t: [0, 1, 0], a: 0, b: 0 });
    body.loft(rings, lod.petRad);
    if (lod.level < 2) body.ellipsoid([0, petBaseY + 0.02 * BL, petZ], [0.035 * BL, 0.028 * BL, 0.05 * BL], 4, Math.max(lod.petRad / 2, 4));
    return { gasterFrontZ: petZ - 0.025 * BL, petPivot };
  }
  // myrmicine: petiole (peduncle + node) and, with two nodes, a wider postpetiole behind it
  const nodeR = PH * 0.42;
  const z1 = zB - 0.06 * BL;
  body.tubePath([[0, petBaseY + 0.02 * BL, zB + 0.005 * BL], [0, petBaseY + 0.03 * BL, zB - 0.035 * BL], [0, petBaseY + 0.05 * BL, z1]], [0.022 * BL, 0.02 * BL, 0.03 * BL], Math.max(lod.petRad / 2, 4), true, false);
  body.ellipsoid([0, petBaseY + PH * 0.55, z1 - nodeR * 0.3], [nodeR * 1.0, nodeR * 1.15, nodeR * 0.9], Math.max(lod.petRad / 2, 3), lod.petRad);
  let zz = z1 - nodeR * 1.2;
  if (p.petiole.nodes === 2) {
    const r2 = PH * 0.4;
    body.ellipsoid([0, petBaseY + PH * 0.38, zz - r2 * 0.6], [r2 * 1.25, r2 * 0.95, r2 * 0.95], Math.max(lod.petRad / 2, 3), lod.petRad);
    zz -= r2 * 1.6;
  }
  return { gasterFrontZ: zz + 0.02 * BL, petPivot };
}
