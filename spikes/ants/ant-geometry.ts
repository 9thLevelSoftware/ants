/**
 * Procedural ant generator (spike).
 *
 * Body frame (BINDING for the shader and the CPU): millimetres, +Y up, +Z forward (head), +X = the ant's LEFT,
 * origin on the ground plane directly below the mid coxae. Instance matrices place this frame in the world
 * (Object3D.lookAt convention: +Z points at the target).
 *
 * One merged indexed BufferGeometry per variant and LOD. Every vertex has
 *   position (vec3)  rest position in the body frame; for LEG vertices it is the SEGMENT-LOCAL position
 *                    (x along the segment from its proximal joint, y/z cross-section), see ant-shader.ts
 *   normal   (vec3)  rest normal (segment-local for LEG vertices)
 *   color    (vec3)  linear base colour
 *   aRig     (vec4)  x = part id (PART), y = side (+1 left / -1 right) or leg index 0..5,
 *                    z = segment (leg 0 coxa,1 femur,2 tibia,3 tarsus) or gaster band, w = aux (see PART docs)
 * Wings (alates) are a second geometry with the same layout plus uv (vein pattern) because they are blended.
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { AntParams } from './params';
import {
  MeshBuilder, type Ring, type V3, add, cross, len, lerp3, lin, norm, rotAxis, rotX, scl, sub,
} from './mesh-builder';

/** aRig.x part ids. aux (aRig.w): HEAD 0 cuticle / 1 compound eye / 2 ocellus; GASTER 0 sclerite / 1 intersegmental membrane; ITEM = roughness */
export const PART = { BODY: 0, HEAD: 1, MANDIBLE: 2, SCAPE: 3, FUNICULUS: 4, LEG: 5, GASTER: 6, WING: 7, ITEM: 8, PETIOLE: 9 } as const;

export type V4 = [number, number, number, number];

/** Per-variant rig constants (uploaded as uniforms; identical for all LODs of the variant). Body frame, mm. */
export interface AntRig {
  bodyLength: number;
  legA: V4[];      // [pair] xyz = LEFT coxa attachment, w = tarsus elevation angle (rad)
  foot: V4[];      // [pair] xyz = LEFT rest foot position (y = 0), w = coxa angle from vertical (rad)
  legLen: V4[];    // [pair] coxa, femur, tibia, tarsus length
  gait: V4;        // stride length (mm per cycle), swing lift (mm), duty factor, body bob amplitude (mm)
  neck: V3; headUp: V3; headFwd: V3; headTilt: number;
  mand: V3;        // LEFT mandible hinge
  socket: V3; elbow: V3; elbowAxis: V3; // LEFT antenna joints, elbow hinge axis
  gasterPivot: V3; gasterC: V3; gasterAxis: V3;
  gasterP: V4;     // radial swell gain, axial gap per band (mm), band count, petiole follow fraction
  petPivot: V3;
  grip: V3;        // where carried items are held (between the closed mandible tips)
  groom: V3;       // LEFT fore-tarsus target while grooming the antenna
  membrane: V3;    // linear colour of stretched intersegmental membrane
  facet: number;   // ommatidium diameter (mm) for the eye shader
}

export interface AntVariant {
  params: AntParams;
  rig: AntRig;
  lods: BufferGeometry[];      // LOD0 (near), LOD1 (mid), LOD2 (far), LOD3 (crowd dots)
  wings: BufferGeometry | null;
  tris: number[];              // per LOD (body), wings separately
  wingTris: number;
}

interface Lod {
  level: number; headRad: number; headRings: number; mesoRad: number; mesoRings: number; gasRad: number; ringsPerBand: number;
  petRad: number; legRad: number; legDetail: number; eyeRings: number; eyeRad: number; antRad: number; funRings: number;
  hairs: boolean; palps: boolean; teeth: boolean; ocelli: boolean; eyes: boolean; coxa: boolean; extras: boolean;
}
const LODS: Lod[] = [
  { level: 0, headRad: 16, headRings: 13, mesoRad: 14, mesoRings: 20, gasRad: 14, ringsPerBand: 3, petRad: 10, legRad: 5, legDetail: 2, eyeRings: 7, eyeRad: 9, antRad: 5, funRings: 2, hairs: true, palps: true, teeth: true, ocelli: true, eyes: true, coxa: true, extras: true },
  { level: 1, headRad: 7, headRings: 6, mesoRad: 6, mesoRings: 7, gasRad: 7, ringsPerBand: 0, petRad: 4, legRad: 3, legDetail: 1, eyeRings: 3, eyeRad: 4, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: true, coxa: false, extras: false },
  { level: 2, headRad: 4, headRings: 4, mesoRad: 4, mesoRings: 4, gasRad: 5, ringsPerBand: -1, petRad: 3, legRad: 3, legDetail: 0, eyeRings: 0, eyeRad: 0, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: false, coxa: false, extras: false },
  // LOD3: < ~9 px on screen. Ribbon legs (2-sided, no caps), no antennae, no petiole; still animated by the same shader
  { level: 3, headRad: 4, headRings: 2, mesoRad: 4, mesoRings: 2, gasRad: 4, ringsPerBand: -1, petRad: 3, legRad: 2, legDetail: -1, eyeRings: 0, eyeRad: 0, antRad: 3, funRings: 0, hairs: false, palps: false, teeth: false, ocelli: false, eyes: false, coxa: false, extras: false },
];

// ------------------------------------------------------------------ helpers
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** piecewise cubic (Catmull-Rom style tangents) through rows [s, v...]; returns the v columns at s */
function curve(rows: number[][], s: number): number[] {
  const n = rows.length; let i = 0;
  while (i < n - 2 && s > rows[i + 1]![0]!) i++;
  const r0 = rows[Math.max(i - 1, 0)]!, r1 = rows[i]!, r2 = rows[i + 1]!, r3 = rows[Math.min(i + 2, n - 1)]!;
  const h = r2[0]! - r1[0]!; const t = clamp((s - r1[0]!) / (h || 1), 0, 1);
  const out: number[] = [];
  for (let k = 1; k < r1.length; k++) {
    const m1 = (r2[k]! - r0[k]!) / ((r2[0]! - r0[0]!) || 1) * h, m2 = (r3[k]! - r1[k]!) / ((r3[0]! - r1[0]!) || 1) * h;
    const t2 = t * t, t3 = t2 * t;
    out.push((2 * t3 - 3 * t2 + 1) * r1[k]! + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * r2[k]! + (t3 - t2) * m2);
  }
  return out;
}
/** point + outward normal on a loft section (same formula as MeshBuilder.loft) */
function ringPoint(r: Ring, th: number, lat: V3): { p: V3; n: V3 } {
  const up = norm(cross(r.t, lat)), l2 = norm(cross(up, r.t)), e = r.e ?? 2;
  const c = Math.cos(th), s = Math.sin(th);
  const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
  const b = sy < 0 ? r.b * (r.lower ?? 1) : r.b;
  return { p: add(r.c, add(scl(l2, r.a * sx), scl(up, b * sy))), n: norm(add(scl(l2, c / Math.max(r.a, 1e-6)), scl(up, s / Math.max(b, 1e-6)))) };
}

// mesosoma side profiles: [s (0 front .. 1 back), top (frac of height above bottom), bottom, half width (frac)]
const MESO: Record<string, number[][]> = {
  worker: [[0, 0.5, 0.3, 0.32], [0.07, 0.74, 0.12, 0.75], [0.2, 0.95, 0.0, 1.0], [0.34, 1.0, 0.0, 0.93], [0.5, 0.88, 0.03, 0.72],
    [0.6, 0.76, 0.06, 0.6], [0.67, 0.66, 0.08, 0.55], [0.75, 0.74, 0.1, 0.63], [0.87, 0.68, 0.16, 0.62], [1.0, 0.36, 0.3, 0.38]],
  alate: [[0, 0.4, 0.3, 0.3], [0.07, 0.62, 0.12, 0.72], [0.17, 0.88, 0.02, 0.93], [0.34, 1.0, 0.0, 1.0], [0.5, 0.98, 0.0, 0.95],
    [0.6, 0.95, 0.02, 0.84], [0.68, 0.8, 0.05, 0.7], [0.76, 0.72, 0.08, 0.66], [0.88, 0.58, 0.14, 0.6], [1.0, 0.3, 0.3, 0.38]],
  male: [[0, 0.42, 0.32, 0.3], [0.07, 0.62, 0.14, 0.7], [0.17, 0.9, 0.03, 0.92], [0.34, 1.0, 0.0, 1.0], [0.5, 0.97, 0.0, 0.94],
    [0.6, 0.92, 0.03, 0.82], [0.68, 0.78, 0.06, 0.68], [0.78, 0.68, 0.1, 0.62], [0.9, 0.55, 0.16, 0.56], [1.0, 0.3, 0.3, 0.36]],
};

// standard worker leg lengths as fraction of body length [coxa, femur, tibia, tarsus] for front/mid/hind
const LEG_LEN = [[0.085, 0.19, 0.155, 0.19], [0.06, 0.205, 0.18, 0.205], [0.065, 0.245, 0.235, 0.265]];
const LEG_DIR = [0.75, 0.07, -0.75];   // rest foot direction from lateral, radians (+ = forward)
const COXA_ANG = [0.62, 0.45, 0.5];     // from vertical toward the foot
const TARSUS_ANG = 0.48;               // tarsus rises toward the tibia at this angle above horizontal
const TARSOMERES = [0.4, 0.16, 0.13, 0.11, 0.2];

// ------------------------------------------------------------------ main entry
export function buildAnt(p: AntParams): AntVariant {
  // pass 1 (LOD0) measures the assembled length, then everything is scaled to exactly p.bodyLength
  const raw = assemble(p, LODS[0]!, 1);
  const k = p.bodyLength / raw.length;
  const lods: BufferGeometry[] = []; const tris: number[] = [];
  let rig: AntRig | null = null; let wings: BufferGeometry | null = null; let wingTris = 0;
  for (const lod of LODS) {
    const a = assemble(p, lod, k);
    if (!rig) rig = a.rig;
    lods.push(a.body.toGeometry({ bounds: new Sphere(new Vector3(0, p.bodyLength * 0.1, 0), p.bodyLength * 0.95) }));
    tris.push(a.body.idx.length / 3);
    if (lod.level === 0 && a.wings) { wings = a.wings.toGeometry({ uv: true, bounds: new Sphere(new Vector3(0, 0, 0), p.bodyLength * 1.6) }); wingTris = a.wings.idx.length / 3; }
  }
  return { params: p, rig: rig!, lods, wings, tris, wingTris };
}

interface Assembled { body: MeshBuilder; wings: MeshBuilder | null; rig: AntRig; length: number }

function assemble(p: AntParams, lod: Lod, k: number): Assembled {
  const BL = p.bodyLength * k; // nominal; real length after scaling = p.bodyLength
  const rnd = mulberry32(1234 + Math.round(p.bodyLength * 100));
  const C = p.colors;
  const col = { head: lin(C.head), meso: lin(C.mesosoma), gaster: lin(C.gaster), legs: lin(C.legs), tarsi: lin(C.tarsi), ant: lin(C.antenna), mand: lin(C.mandible), teeth: lin(C.teeth), eye: lin(C.eye), hair: lin(C.hair), mem: lin(C.membrane) };
  const body = new MeshBuilder();
  const hairLen = 0.024 * BL, hairR = 0.00085 * BL;

  // ---------------------------------------------------------------- mesosoma
  const ML = p.mesosoma.length * BL, MW = p.mesosoma.width * BL, MH = p.mesosoma.height * BL;
  const yb = 0.075 * BL * p.legs.length * (p.mesosoma.profile === 'worker' ? 1 : 1.05);
  const zF = ML * 0.5, zB = -ML * 0.5;
  const prof = MESO[p.mesosoma.profile]!;
  const mesoRings: Ring[] = [];
  const mesoAt = (s: number) => { const [top, bot, hw] = curve(prof, s) as [number, number, number]; const y0 = yb + bot * MH, y1 = yb + top * MH; return { yc: (y0 + y1) / 2, b: Math.max((y1 - y0) / 2, 1e-4), a: hw * MW / 2, top: y1, bot: y0 }; };
  {
    const n = lod.mesoRings; const back = mesoAt(1), front = mesoAt(0);
    mesoRings.push({ c: [0, back.yc, zB - 0.012 * BL], t: [0, 0, 1], a: 0, b: 0 });
    for (let i = 0; i <= n; i++) {
      const s = 1 - i / n; const m = mesoAt(s);
      mesoRings.push({ c: [0, m.yc, zF + (zB - zF) * s], t: [0, 0, 1], a: m.a, b: m.b, e: 2.5, color: col.meso });
    }
    mesoRings.push({ c: [0, front.yc, zF + 0.01 * BL], t: [0, 0, 1], a: 0, b: 0 });
    body.color = col.meso; body.rigV = [PART.BODY, 0, 0, 0];
    body.loft(mesoRings, lod.mesoRad);
  }
  // neck collar
  const neck: V3 = [0, yb + 0.6 * MH, zF + 0.025 * BL];
  if (lod.level < 2) body.ellipsoid([0, neck[1] - 0.01 * BL, zF], [0.06 * BL * (MW / BL / 0.145) * 0.8, 0.045 * BL, 0.05 * BL], 4, Math.max(lod.mesoRad / 2, 5));

  // spines
  if (p.spines.propodeal > 0 && lod.level < 2) {
    const m = mesoAt(0.8); const base: V3 = [m.a * 0.55, m.top - 0.01 * BL, zF + (zB - zF) * 0.8];
    const dir = norm([0.35, 0.75, -0.6]); const L = p.spines.propodeal * BL;
    for (const s of [1, -1]) {
      const b0: V3 = [base[0] * s, base[1], base[2]]; const d: V3 = [dir[0] * s, dir[1], dir[2]];
      body.color = col.meso; body.tubePath([b0, add(b0, scl(d, L * 0.5)), add(b0, scl(d, L))], [0.022 * BL, 0.011 * BL, 0.002 * BL], Math.max(lod.legRad, 3), true, true);
    }
  }
  if (p.spines.pronotal > 0 && lod.level < 2) {
    const m = mesoAt(0.2); const L = p.spines.pronotal * BL;
    for (const s of [1, -1]) {
      const b0: V3 = [m.a * 0.8 * s, m.top - 0.02 * BL, zF + (zB - zF) * 0.2]; const d = norm([0.7 * s, 0.6, 0.2]);
      body.tubePath([b0, add(b0, scl(d, L * 0.5)), add(b0, scl(d, L))], [0.02 * BL, 0.01 * BL, 0.002 * BL], 4, true, true);
    }
  }
  // wing stubs (dealate queen)
  if (p.wings === 'stubs' && lod.level < 2) {
    for (const [s0, zz] of [[0.3, 0.33], [0.52, 0.45]] as [number, number][]) {
      const m = mesoAt(s0);
      for (const s of [1, -1]) {
        const c: V3 = [m.a * 0.92 * s, m.top - 0.25 * (m.top - m.yc), zF + (zB - zF) * s0];
        body.color = lin('#3a2a1e'); body.rigV = [PART.BODY, 0, 0, 0];
        body.ellipsoid(c, [0.018 * BL, 0.012 * BL, 0.03 * BL * zz * 3], 3, 6);
      }
    }
  }

  // ---------------------------------------------------------------- legs (segment-local geometry)
  const legA: V4[] = [], foot: V4[] = [], legLen: V4[] = [];
  const attachS = [0.17, 0.5, 0.76];
  for (let pair = 0; pair < 3; pair++) {
    const m = mesoAt(attachS[pair]!);
    const A: V3 = [Math.max(m.a * 0.42, 0.02 * BL), m.bot + 0.04 * MH, zF + (zB - zF) * attachS[pair]!];
    const L = LEG_LEN[pair]!.map((x) => x * BL * p.legs.length) as V4;
    const reach = L[0] * Math.sin(COXA_ANG[pair]!) + L[3] * Math.cos(TARSUS_ANG) + 0.74 * (L[1] + L[2]);
    const dirA = LEG_DIR[pair]!;
    const F: V3 = [A[0] + Math.cos(dirA) * reach, 0, A[2] + Math.sin(dirA) * reach];
    legA.push([A[0], A[1], A[2], TARSUS_ANG]); foot.push([F[0], 0, F[2], COXA_ANG[pair]!]); legLen.push(L);
  }
  const rL = 0.0155 * BL * p.legs.thickness;
  for (let pair = 0; pair < 3; pair++) {
    const left = new MeshBuilder(); const [Lc, Lf, Lt, Lta] = legLen[pair]!;
    const R = lod.legRad;
    const D = lod.legDetail;
    // coxa
    if (lod.coxa) {
      left.color = col.legs; left.rigV = [PART.LEG, pair, 0, 0];
      const rc = rL * (pair === 0 ? 1.25 : 1.0);
      left.tubeX(D > 0 ? [[0, rc * 0.8, rc * 0.8], [Lc * 0.35, rc, rc], [Lc * 0.8, rc * 0.85, rc * 0.85], [Lc, rc * 0.6, rc * 0.6]] : [[0, rc, rc], [Lc, rc * 0.7, rc * 0.7]], R);
    }
    // femur (+ trochanter)
    left.color = col.legs; left.rigV = [PART.LEG, pair, 1, 0];
    const fr: [number, number, number][] = D === 2
      ? [[0, rL * 0.6, rL * 0.6], [Lf * 0.06, rL * 0.82, rL * 0.82], [Lf * 0.13, rL * 0.66, rL * 0.66], [Lf * 0.3, rL * 1.02, rL * 0.82], [Lf * 0.6, rL * 0.95, rL * 0.76], [Lf * 0.88, rL * 0.8, rL * 0.66], [Lf, rL * 0.62, rL * 0.55]]
      : D === 1 ? [[0, rL * 0.75, rL * 0.75], [Lf * 0.35, rL * 1.0, rL * 0.85], [Lf, rL * 0.65, rL * 0.6]] : D === 0 ? [[0, rL * 1.1, rL * 1.1], [Lf, rL * 0.9, rL * 0.9]] : [[0, rL * 1.6, rL * 1.6], [Lf, rL * 1.3, rL * 1.3]];
    left.tubeX(fr, R, D > 0);
    // tibia
    left.rigV = [PART.LEG, pair, 2, 0];
    const tr: [number, number, number][] = D === 2
      ? [[0, rL * 0.5, rL * 0.5], [Lt * 0.1, rL * 0.55, rL * 0.55], [Lt * 0.5, rL * 0.6, rL * 0.58], [Lt * 0.92, rL * 0.72, rL * 0.66], [Lt, rL * 0.55, rL * 0.5]]
      : D === 1 ? [[0, rL * 0.55, rL * 0.55], [Lt, rL * 0.7, rL * 0.65]] : D === 0 ? [[0, rL * 0.75, rL * 0.75], [Lt, rL * 0.75, rL * 0.75]] : [[0, rL * 1.2, rL * 1.2], [Lt + Lta * 0.6, rL * 1.0, rL * 1.0]];
    left.tubeX(tr, R, D > 0);
    if (D === 2) { // apical spur (front leg: the antenna-cleaning calcar)
      const sp = pair === 0 ? 0.11 : 0.07;
      left.tubePath([[Lt * 0.94, -rL * 0.45, 0], [Lt + sp * Lt * 0.5, -rL * 0.75, 0], [Lt + sp * Lt, -rL * 0.9, 0]], [rL * 0.18, rL * 0.1, rL * 0.02], 3);
      // erect setae along the tibia (L. niger: abundant erect hairs on tibiae)
      if (lod.hairs) for (let h = 0; h < 5; h++) {
        const u = Lt * (0.15 + 0.17 * h); const th = (rnd() - 0.5) * 2.4;
        const n: V3 = [0, Math.cos(th), Math.sin(th)];
        left.color = col.hair; left.hair(add([u, 0, 0], scl(n, rL * 0.55)), add(n, [0.8, 0, 0]), hairLen * 0.7, hairR * 0.8, n);
      }
      left.color = col.legs;
    }
    // tarsus (5 tarsomeres) + claws
    left.color = col.tarsi; left.rigV = [PART.LEG, pair, 3, 0];
    const rt = rL * 0.4;
    if (D === 2) {
      const prof: [number, number, number][] = []; let u = 0;
      TARSOMERES.forEach((f, i) => {
        const l = f * Lta; const r = rt * (1 - i * 0.09);
        prof.push([u + l * 0.04, r * 0.82, r * 0.82], [u + l * 0.4, r, r], [u + l * 0.96, r * 0.88, r * 0.88]);
        u += l;
      });
      left.tubeX(prof, 4);
      for (const cz of [1, -1]) left.tubePath([[Lta * 0.98, 0, cz * rt * 0.3], [Lta + rt * 1.2, -rt * 0.6, cz * rt * 0.55], [Lta + rt * 1.4, -rt * 1.6, cz * rt * 0.6]], [rt * 0.32, rt * 0.2, rt * 0.04], 3);
    } else if (D >= 0) {
      left.tubeX(D === 1 ? [[0, rt * 0.9, rt * 0.9], [Lta, rt * 0.7, rt * 0.7]] : [[0, rt * 1.2, rt * 1.2], [Lta, rt, rt]], R, D > 0);
    }
    body.append(left);
    body.append(left.mirrored(2, (r) => [r[0]!, r[1]! + 3, r[2]!, r[3]!])); // right legs: mirrored in local z, legs 3..5
  }

  // ---------------------------------------------------------------- petiole
  const petBaseY = yb + 0.08 * MH;
  const petZ = zB - 0.03 * BL;
  const petPivot: V3 = [0, yb + 0.22 * MH, zB - 0.005 * BL];
  body.rigV = [PART.PETIOLE, 0, 0, 0]; body.color = col.meso;
  const GW = p.gaster.width * BL, GH = p.gaster.height * BL, GL = p.gaster.length * BL;
  const PH = p.petiole.height * BL;
  let gasterFrontZ: number;
  if (lod.level === 3) {
    gasterFrontZ = zB - 0.04 * BL;
  } else if (p.petiole.shape === 'scale') {
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
    // stalk joining propodeum and gaster
    if (lod.level < 2) body.ellipsoid([0, petBaseY + 0.02 * BL, petZ], [0.035 * BL, 0.028 * BL, 0.05 * BL], 4, Math.max(lod.petRad / 2, 4));
    gasterFrontZ = petZ - 0.025 * BL;
  } else {
    // myrmicine: petiole (peduncle + node) and, if nodes == 2, a postpetiole
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
    gasterFrontZ = zz + 0.02 * BL;
  }

  // ---------------------------------------------------------------- gaster (banded, with hidden intersegmental membranes)
  const full = p.gaster.fullness;
  const gPitch = 0.1;
  const axis: V3 = [0, -Math.sin(gPitch), -Math.cos(gPitch)];
  const gCy = Math.max(GH / 2 + 0.03 * BL, yb + 0.35 * MH);
  const gC: V3 = [0, gCy, gasterFrontZ - GL / 2];
  const G0 = sub(gC, scl(axis, GL / 2));
  const nb = p.gaster.segments;
  const bw = [1.25, 1.1, 0.95, 0.8, 0.6, 0.45].slice(0, nb); const bsum = bw.reduce((a, b) => a + b, 0);
  const R = (t: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.3)), 1 / 2.3);
  const gasterRings: Ring[] = [];
  const ga = GW / 2 * (1 + full * 0.15), gb = GH / 2 * (1 + full * 0.12);
  const ringAt = (t: number, rs: number, band: number, mem: number): Ring => ({
    c: add(G0, scl(axis, t * GL)), t: axis, a: Math.max(ga * R(t) * rs, 1e-4), b: Math.max(gb * R(t) * rs, 1e-4), e: 2.15, lower: 0.88,
    color: col.gaster, rig: [PART.GASTER, 0, band, mem],
  });
  gasterRings.push({ c: G0, t: axis, a: 0, b: 0, color: col.gaster, rig: [PART.GASTER, 0, 0, 0] });
  const t0 = 0.0, t1 = 0.985;
  let tc = t0; const bands: { a: number; b: number }[] = [];
  for (let i = 0; i < nb; i++) { const w = (bw[i]! / bsum) * (t1 - t0); bands.push({ a: tc, b: tc + w }); tc += w; }
  bands.forEach((bd, i) => {
    const rp = lod.ringsPerBand;
    if (rp < 0) { if (i === Math.floor(nb / 2) || i === nb - 1) gasterRings.push(ringAt(i === nb - 1 ? 0.85 : 0.45, 1.0, i, 0)); if (i === 0) gasterRings.push(ringAt(0.12, 0.92, 0, 0)); return; }
    if (rp === 0) {
      gasterRings.push(ringAt(Math.max(bd.a + 0.02, 0.03), 0.97, i, 0), ringAt(bd.b, 1.0, i, 0));
      return;
    }
    const first = i === 0 ? 0.02 : bd.a + 0.009;
    for (let r = 0; r <= rp; r++) {
      const t = first + (bd.b - first) * (r / rp);
      const lip = r === rp ? 1.012 : 0.975 + 0.03 * smooth(r / rp + 0.2);
      gasterRings.push(ringAt(t, i === 0 && r === 0 ? 0.92 : lip, i, 0));
    }
    if (i < nb - 1) {
      gasterRings.push(ringAt(bd.b + 0.003, 0.955, i + 0.3, 1));
      if (rp > 1) gasterRings.push(ringAt(bd.b + 0.006, 0.955, i + 0.7, 1));
    }
  });
  gasterRings.push({ c: add(G0, scl(axis, GL * 0.995)), t: axis, a: 0, b: 0, color: col.gaster, rig: [PART.GASTER, 0, nb - 1, 0] });
  body.loft(gasterRings, lod.gasRad, [-1, 0, 0]);
  // acidopore nozzle with its fringe of hairs (coronula)
  if (lod.level === 0) {
    const tip = add(G0, scl(axis, GL * 0.975));
    body.color = col.gaster; body.rigV = [PART.GASTER, 0, nb - 1, 0];
    body.tubePath([sub(tip, scl(axis, 0.01 * BL)), add(tip, scl(axis, 0.02 * BL)), add(add(tip, scl(axis, 0.032 * BL)), [0, -0.004 * BL, 0])], [0.03 * BL, 0.018 * BL, 0.008 * BL], 6, false, true);
    if (lod.hairs) for (let h = 0; h < 8; h++) {
      const th = (h / 8) * Math.PI * 2; const n: V3 = norm([Math.cos(th), Math.sin(th) * 0.8, 0]);
      body.color = col.hair; body.hair(add(add(tip, scl(axis, 0.026 * BL)), scl(n, 0.012 * BL)), add(axis, scl(n, 0.6)), hairLen * 0.6, hairR * 0.7, n);
    }
  }
  // gaster setae on the posterior tergite margins + sparse elsewhere
  if (lod.hairs) {
    const nh = Math.round(p.hairs * 0.4);
    for (let h = 0; h < nh; h++) {
      const bi = Math.floor(rnd() * nb); const bd = bands[bi]!; const t = bd.a + (bd.b - bd.a) * (0.55 + 0.4 * rnd());
      const rg = ringAt(t, 1.0, bi, 0); const th = Math.PI / 2 + (rnd() - 0.5) * 2.6;
      const sp = ringPoint(rg, th, [-1, 0, 0]);
      body.color = col.hair; body.rigV = [PART.GASTER, 0, bi, 0];
      body.hair(sp.p, add(sp.n, scl(axis, 0.55)), hairLen * (0.7 + 0.6 * rnd()), hairR, sp.n);
    }
  }
  // mesosoma setae (dorsum)
  if (lod.hairs) {
    const nh = Math.round(p.hairs * 0.22);
    for (let h = 0; h < nh; h++) {
      const s = 0.08 + 0.85 * rnd(); const m = mesoAt(s);
      const rg: Ring = { c: [0, m.yc, zF + (zB - zF) * s], t: [0, 0, 1], a: m.a, b: m.b, e: 2.5 };
      const sp = ringPoint(rg, Math.PI / 2 + (rnd() - 0.5) * 1.6, [1, 0, 0]);
      body.color = col.hair; body.rigV = [PART.BODY, 0, 0, 0];
      body.hair(sp.p, add(sp.n, [0, 0, -0.4]), hairLen * (0.7 + 0.6 * rnd()), hairR, sp.n);
    }
  }

  // ---------------------------------------------------------------- head (built in head-local frame, then tilted onto the neck)
  const HL = p.head.length * BL, HW = p.head.width * BL, HH = HW * p.head.height, A = HW / 2;
  const head = new MeshBuilder();
  head.rigV = [PART.HEAD, 0, 0, 0]; head.color = col.head;
  const hz0 = -0.06 * HL, hz1 = 0.94 * HL;
  // dorsal-view width and side-view height profiles along the head (s 0 occiput .. 1 clypeus)
  const HW_PROF = [[0, 0.0, 0.0], [0.03, 0.62, 0.6], [0.12, 0.9, 0.88], [0.3, 1.0, 1.0], [0.5, 0.99, 0.97], [0.7, 0.92, 0.88], [0.86, 0.8, 0.72], [0.95, 0.66, 0.55], [1.0, 0.0, 0.0]];
  const headCY = (s: number) => 0.08 * HH - 0.14 * HH * s * s;
  const headRings: Ring[] = [];
  for (let i = 0; i <= lod.headRings; i++) {
    const s = i / lod.headRings; const [wf, hf] = curve(HW_PROF, s) as [number, number];
    headRings.push({ c: [0, headCY(s), hz0 + s * (hz1 - hz0)], t: [0, 0, 1], a: Math.max(A * wf, 0), b: Math.max(HH / 2 * hf, 0), e: p.head.squareness, lower: 0.92 });
  }
  head.loft(headRings, lod.headRad);
  // posterior emargination (heart-shaped heads): pull the midline of the occiput forward
  if (p.head.notch > 0) {
    head.transform((q) => {
      const s = (q[2] - hz0) / (hz1 - hz0); if (s > 0.35) return q;
      const w = 1 - Math.min(1, Math.abs(q[0]) / (A * 0.9)); const f = (1 - s / 0.35);
      return [q[0], q[1], q[2] + p.head.notch * 0.16 * HL * w * w * f * f];
    }, (n) => n);
  }
  const headSurf = (s: number, th: number) => { const [wf, hf] = curve(HW_PROF, s) as [number, number]; return ringPoint({ c: [0, headCY(s), hz0 + s * (hz1 - hz0)], t: [0, 0, 1], a: A * wf, b: HH / 2 * hf, e: p.head.squareness, lower: 0.92 }, th, [1, 0, 0]); };
  // clypeus plate
  // compound eyes (aux 1)
  if (lod.eyes) {
    const es = p.eye.size * HL; const s = p.eye.position;
    const sp = headSurf(s, 0.28); // a little above the equator on the left side
    const out = norm([sp.n[0], sp.n[1] * 0.4, sp.n[2] * 0.3]);
    const c = add(sp.p, scl(out, -es * 0.16));
    head.rigV = [PART.HEAD, 0, 0, 1]; head.color = col.eye;
    const fwd = norm([0, 0.12, 1]); const up = norm(cross(fwd, out));
    for (const sgn of [1, -1]) {
      const cc: V3 = [c[0] * sgn, c[1], c[2]];
      const lat: V3 = [out[0] * sgn, out[1], out[2]];
      head.ellipsoid(cc, [es * 0.36, es * 0.36, es * 0.5], lod.eyeRings, lod.eyeRad, { lat, up: sgn > 0 ? up : norm(cross(fwd, lat)), fwd }, 2.2);
    }
    head.rigV = [PART.HEAD, 0, 0, 0];
  }
  // ocelli (aux 2)
  if (p.ocelli && lod.ocelli) {
    head.rigV = [PART.HEAD, 0, 0, 2]; head.color = lin('#3a3530');
    const s0 = 0.3; const top = headSurf(s0, Math.PI / 2).p; const r = 0.035 * HL;
    head.ellipsoid(add(top, [0, -r * 0.3, 0.07 * HL]), [r, r * 0.7, r], 4, 6);
    for (const sgn of [1, -1]) { const q = headSurf(s0 - 0.05, Math.PI / 2 - 0.35 * sgn).p; head.ellipsoid(add(q, [0, -r * 0.3, 0]), [r * 0.9, r * 0.65, r * 0.9], 4, 6); }
    head.rigV = [PART.HEAD, 0, 0, 0];
  }
  // head setae
  if (lod.hairs) {
    const nh = Math.round(p.hairs * 0.18);
    for (let h = 0; h < nh; h++) {
      const s = 0.1 + 0.85 * rnd(); const th = Math.PI / 2 + (rnd() - 0.5) * 2.2; const sp = headSurf(s, th);
      if (p.head.notch > 0 && s < 0.35) continue;
      head.color = col.hair; head.hair(sp.p, add(sp.n, [0, 0, 0.35]), hairLen * (0.6 + 0.5 * rnd()), hairR, sp.n);
    }
    // clypeal fringe
    for (let h = 0; h < 6; h++) { const sp = headSurf(0.97, Math.PI / 2 + (h - 2.5) * 0.35); head.hair(sp.p, add(sp.n, [0, -0.4, 1]), hairLen * 0.8, hairR * 0.8, sp.n); }
  }
  // maxillary palps (6-segmented in Formicinae, here a bent tube)
  if (lod.palps) {
    head.color = col.tarsi; head.rigV = [PART.HEAD, 0, 0, 0];
    const pl = 0.55 * HL * (p.mandible.length / 0.36);
    for (const sgn of [1, -1]) {
      const b0: V3 = [0.22 * A * sgn, headCY(0.85) - HH * 0.38, hz0 + 0.82 * (hz1 - hz0)];
      const pts: V3[] = [b0, add(b0, [0.05 * pl * sgn, -0.3 * pl, 0.12 * pl]), add(b0, [0.08 * pl * sgn, -0.55 * pl, 0.05 * pl]), add(b0, [0.1 * pl * sgn, -0.72 * pl, -0.15 * pl]), add(b0, [0.11 * pl * sgn, -0.8 * pl, -0.35 * pl])];
      head.tubePath(pts, [0.03 * HL, 0.026 * HL, 0.024 * HL, 0.022 * HL, 0.016 * HL], 4);
    }
  }

  // mandibles (built for the left side then mirrored), still in head-local frame
  const mandB = new MeshBuilder();
  const mlen = p.mandible.length * HL;
  const mandPivotL: V3 = [0.5 * A, headCY(0.95) - HH * 0.12, hz0 + 0.955 * (hz1 - hz0)];
  let mandTipL: V3 = [0, 0, 0];
  {
    mandB.rigV = [PART.MANDIBLE, 1, 0, 0]; mandB.color = col.mand;
    const P0 = mandPivotL; const reach = P0[0] + 0.04 * A; // tip crosses the midline slightly
    const fwd = mlen;
    const outer: V3[] = []; const inner: V3[] = [];
    const nO = lod.level === 0 ? 7 : 3;
    for (let i = 0; i <= nO; i++) { // outer (lateral) margin: base -> tip, convex
      const t = i / nO; const x = P0[0] - reach * Math.pow(t, 1.8); const z = P0[2] + fwd * Math.sin(t * Math.PI * 0.5) * 0.95;
      outer.push([x, P0[1] - 0.05 * HH * t, z]);
    }
    const tip = outer[nO]!; mandTipL = tip;
    const basal: V3 = [P0[0] - p.mandible.width * A * 0.75, P0[1] - 0.05 * HH, P0[2] + fwd * 0.18];
    const teeth = lod.teeth ? p.mandible.teeth : 0;
    const nM = Math.max(teeth * 2, 2);
    for (let i = 1; i < nM; i++) { // masticatory margin tip -> basal angle, with teeth
      const t = i / nM; const q = lerp3(tip, basal, t);
      const tooth = teeth > 0 && i % 2 === 1 ? 0.07 * mlen * (1 - 0.5 * t) : 0;
      const dir = norm(cross(sub(basal, tip), [0, 1, 0]));
      inner.push(add(q, scl(dir, -tooth)));
    }
    const outline = [...outer, ...inner, basal, lerp3(basal, P0, 0.5)];
    const center = lerp3(lerp3(P0, tip, 0.45), basal, 0.3);
    const thick = (i: number) => (i < outer.length ? 0.1 * HH * (1 - 0.7 * i / nO) : 0.045 * HH);
    const plane = norm([0, 1, 0.1]);
    const before = mandB.vcount;
    mandB.slab(center, outline, plane, thick, 0.09 * HH);
    // darken the teeth row
    for (let v = before; v < mandB.vcount; v++) {
      const q = mandB.p(v); const dTip = len(sub(q, tip));
      if (q[0] < P0[0] - p.mandible.width * A * 0.2 && dTip < mlen * 0.9 && v - before > 2 + 0 && q[2] > basal[2] - 0.01) {
        const f = smooth(1 - dTip / mlen) * 0.6;
        const c = lerp3(col.mand, col.teeth, Math.min(1, 0.4 + f));
        mandB.col[v * 3] = c[0]; mandB.col[v * 3 + 1] = c[1]; mandB.col[v * 3 + 2] = c[2];
      }
    }
  }
  const mandR = mandB.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]);

  // antennae: scape + funiculus (left, head-local), mirrored for the right
  const antB = new MeshBuilder();
  const SL = p.antenna.scape * HL, FL = p.antenna.funiculus * HL, nSeg = p.antenna.segments;
  const sockS = 0.66; const sockTop = headSurf(sockS, Math.PI / 2 - 0.55);
  const socketL: V3 = add(sockTop.p, scl(sockTop.n, -0.02 * HL));
  const scDir = norm([0.6, 0.6, 0.5]);
  const elbowL: V3 = add(socketL, scl(scDir, SL));
  const fuDir = norm([0.3, -0.08, 1.0]);
  const ar = 0.0092 * BL * p.antenna.thickness * (HL / (0.235 * BL)) ** 0.3;
  {
    antB.color = col.ant; antB.rigV = [PART.SCAPE, 1, 0, 0];
    // scape: slender base (condyle bulb), slightly curved, thickening to the apex
    const bend = norm(cross(scDir, [0, 1, 0]));
    const sp: V3[] = []; const sr: number[] = [];
    const nS = lod.level === 0 ? 7 : 2;
    for (let i = 0; i <= nS; i++) {
      const t = i / nS; sp.push(add(add(socketL, scl(scDir, SL * t)), scl(bend, -Math.sin(t * Math.PI) * 0.04 * SL)));
      sr.push(ar * (i === 0 ? 0.75 : lod.level === 0 && i === 1 ? 0.5 : 0.48 + 0.3 * t));
    }
    if (lod.level === 0) { antB.ellipsoid(socketL, [ar * 0.9, ar * 0.9, ar * 0.9], 4, 6); }
    antB.tubePath(sp, sr, lod.antRad);
    if (lod.hairs) for (let h = 0; h < 5; h++) { const t = 0.2 + 0.15 * h; const q = lerp3(socketL, elbowL, t); const n = norm(cross(scDir, [Math.sin(h * 2.1), Math.cos(h * 2.1), 0.3])); antB.color = col.hair; antB.hair(add(q, scl(n, ar * 0.6)), add(n, scl(scDir, 0.9)), hairLen * 0.6, hairR * 0.7, n); }
    // funiculus: pedicel + segments, gradually thickening (no distinct club in Lasius)
    antB.color = col.ant; antB.rigV = [PART.FUNICULUS, 1, 0, 0];
    const fp: V3[] = []; const fr: number[] = [];
    const segLen = (i: number) => (i === 0 ? 1.5 : 1) * (i === nSeg - 1 ? 1.4 : 1);
    const total = Array.from({ length: nSeg }, (_, i) => segLen(i)).reduce((a, b) => a + b, 0);
    const down: V3 = [0, -1, 0];
    let u = 0;
    const along = (uu: number) => { const t = uu / FL; return add(add(elbowL, scl(fuDir, uu)), scl(down, Math.sin(t * Math.PI * 0.8) * 0.08 * FL)); };
    if (lod.funRings > 0) {
      for (let i = 0; i < nSeg; i++) {
        const l = (segLen(i) / total) * FL; const r = ar * (0.55 + 0.35 * (i / (nSeg - 1)));
        fp.push(along(u + l * 0.03)); fr.push(r * 0.72);
        fp.push(along(u + l * 0.5)); fr.push(r);
        u += l;
      }
      fp.push(along(FL * 0.995)); fr.push(ar * 0.5);
    } else {
      fp.push(along(0), along(FL * 0.5), along(FL)); fr.push(ar * 0.55, ar * 0.7, ar * 0.6);
    }
    antB.tubePath(fp, fr, lod.antRad);
  }
  const antR = antB.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]);

  // ---------------------------------------------------------------- place head-local parts into the body frame
  const tilt = p.head.tilt;
  const toBody = (q: V3): V3 => add(neck, rotX(q, tilt));
  const toBodyN = (n: V3): V3 => rotX(n, tilt);
  for (const b of lod.level < 2 ? [head, mandB, mandR, antB, antR] : lod.level < 3 ? [head, antB, antR] : [head]) { b.transform(toBody, toBodyN); body.append(b); }

  // ---------------------------------------------------------------- wings (alates)
  let wings: MeshBuilder | null = null;
  if (p.wings === 'full') wings = buildWings(p, BL, mesoAt, zF, zB, gC, GL, gb);

  // ---------------------------------------------------------------- rig
  const mT = toBody(mandTipL);
  const grip: V3 = [0, mT[1] - 0.012 * BL, mT[2] + 0.005 * BL];
  const sockB = toBody(socketL), elbB = toBody(elbowL);
  const scB = norm(sub(elbB, sockB)), fuB = rotX(fuDir, tilt);
  const rig: AntRig = {
    bodyLength: p.bodyLength,
    legA, foot, legLen,
    gait: [p.gait.stride * BL, p.gait.lift * BL, p.gait.duty, 0.012 * BL],
    neck, headUp: rotX([0, 1, 0], tilt), headFwd: rotX([0, 0, 1], tilt), headTilt: tilt,
    mand: toBody(mandPivotL), socket: sockB, elbow: elbB, elbowAxis: norm(cross(scB, fuB)),
    gasterPivot: [0, gC[1] - GH * 0.28, gasterFrontZ + 0.01 * BL], gasterC: gC, gasterAxis: axis,
    gasterP: [0.38, 0.055 * GL, nb, 0.45],
    petPivot,
    grip,
    groom: add(sockB, [0.02 * BL, -0.02 * BL, 0.06 * BL]),
    membrane: col.mem,
    facet: Math.max(p.eye.size * HL / 17, 0.003 * BL),
  };

  const length = mT[2] + 0.004 * BL - (G0[2] + axis[2] * GL);
  return { body, wings, rig, length };
}

/** four hyaline wings folded flat over the gaster; uv = (span 0..1 from the base, chord 0 trailing .. 1 leading) */
function buildWings(p: AntParams, BL: number, mesoAt: (s: number) => { yc: number; b: number; a: number; top: number; bot: number }, zF: number, zB: number, gC: V3, GL: number, gHalfH: number): MeshBuilder {
  const w = new MeshBuilder(); w.color = lin(p.colors.wingMembrane);
  const S = p.wingLength * BL;
  const specs = [ // [s along mesosoma, span, chord ratio, fore=1/hind=0, lift]
    { s: 0.42, span: S, chord: 0.3, fore: 1, lift: 0.03 },
    { s: 0.62, span: S * 0.72, chord: 0.24, fore: 0, lift: 0.012 },
  ];
  for (const sp of specs) {
    const m = mesoAt(sp.s);
    for (const side of [1, -1]) {
      const left = new MeshBuilder(); left.color = w.color; left.rigV = [PART.WING, 1, sp.fore, 0];
      const base: V3 = [m.a * 0.7, m.top - 0.01 * BL + sp.lift * BL, zF + (zB - zF) * sp.s];
      // span runs backward, slightly toward the midline; the costa (leading edge) faces outward
      const spanDir = norm([-0.05, -0.08, -1]); const chordDir = norm([1, 0.1, -0.05]); const nrm = norm(cross(spanDir, chordDir));
      const N = 18; const top: number[] = [], bot: number[] = [], top2: number[] = [], bot2: number[] = [];
      const C = sp.chord * sp.span;
      for (let i = 0; i <= N; i++) {
        const u = i / N; const x = u * sp.span;
        // outline: narrow at the base, broadest ~60 %, rounded tip
        const wdt = C * Math.pow(Math.sin(Math.min(1, u * 1.05) * Math.PI * 0.5 + 0.05), 0.8) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 6)));
        const lead = wdt * 0.38, trail = -wdt * 0.62;
        const droop = -0.06 * BL * u * u; // wings follow the gaster curvature
        const centre = add(add(base, scl(spanDir, x)), [0, droop, 0]);
        // lie on top of the gaster (queens have a tall gaster), forewing above the hindwing
        const zr = (centre[2] - gC[2]) / (GL / 2); const gTop = gC[1] + gHalfH * Math.sqrt(Math.max(0, 1 - zr * zr)) * 1.02;
        centre[1] = Math.max(centre[1], gTop + (sp.fore ? 0.03 : 0.016) * BL);
        const pl = add(centre, scl(chordDir, lead + (sp.fore ? -0.25 : -0.05) * C)); const pt = add(centre, scl(chordDir, trail + (sp.fore ? -0.25 : -0.05) * C));
        // two faces (single-sided material is fine; we render the wing material double-sided anyway)
        top.push(left.vert(pl, nrm, [u, 1])); bot.push(left.vert(pt, nrm, [u, 0]));
        top2.push(left.vert(pl, scl(nrm, -1), [u, 1])); bot2.push(left.vert(pt, scl(nrm, -1), [u, 0]));
      }
      for (let i = 0; i < N; i++) {
        left.tri(bot[i]!, bot[i + 1]!, top[i]!); left.tri(top[i]!, bot[i + 1]!, top[i + 1]!);
        left.tri(bot2[i]!, top2[i]!, bot2[i + 1]!); left.tri(top2[i]!, top2[i + 1]!, bot2[i + 1]!);
      }
      if (side > 0) w.append(left);
      else w.append(left.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]));
    }
  }
  return w;
}

// ------------------------------------------------------------------ static poses (naked pupa)
/**
 * Bakes a STATIC folded "pupa" pose from a variant's LOD geometry: legs folded along the body, antennae down
 * along the face, head tucked, gaster curled. Output: a plain geometry in the body frame (no animation),
 * every vertex tagged PART.ITEM so it can be carried with the item shader path.
 */
export function bakePupa(v: AntVariant, lodIndex = 0, colorHex = '#dcd0b4', eyeHex = '#8a7660'): BufferGeometry {
  const g = v.lods[lodIndex]!; const rig = v.rig;
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), rg = g.getAttribute('aRig');
  const n = pos.count; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3), R = new Float32Array(n * 4);
  const base = lin(colorHex), eye = lin(eyeHex);
  const headPitch = 0.75; // tucked
  const rotAbout = (q: V3, pivot: V3, axis: V3, a: number) => add(pivot, rotAxis(sub(q, pivot), axis, a));
  // folded leg joints (left side), body frame
  const legJoints = (pair: number): V3[] => {
    const A = rig.legA[pair]!; const L = rig.legLen[pair]!;
    const a: V3 = [A[0], A[1], A[2]];
    // exarate pupa: legs pressed against the sides/venter, femur forward, tibia folded back under it, tarsus back
    const h = add(a, scl(norm([0.2, -1, 0.1]), L[0] * 0.7));
    const fdir = norm(pair === 0 ? [0.1, -0.12, 1] : pair === 1 ? [0.16, -0.1, 0.8] : [0.18, -0.08, 0.5]);
    const k = add(h, scl(fdir, L[1]));
    const t = add(k, scl(norm([-0.03, -0.06, -1]), L[2]));
    const f = add(t, scl(norm([-0.1, -0.02, -1]), L[3]));
    return [a, h, k, t, f];
  };
  for (let i = 0; i < n; i++) {
    let p: V3 = [pos.getX(i), pos.getY(i), pos.getZ(i)]; let q: V3 = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
    const part = rg.getX(i), side = rg.getY(i), seg = rg.getZ(i), aux = rg.getW(i);
    let c = base;
    if (part === PART.LEG) {
      const leg = Math.round(side); const pair = leg % 3; const s = leg < 3 ? 1 : -1;
      const J = legJoints(pair).map((j) => [j[0] * s, j[1], j[2]] as V3);
      const p0 = J[seg]!, p1 = J[seg + 1]!; const x = norm(sub(p1, p0));
      const ref: V3 = Math.abs(x[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      let z = norm(cross(x, ref)); if (s < 0) z = scl(z, -1);
      const y = cross(z, x);
      const fat = 1.7; // pupal appendages are plump, unsclerotised
      p = add(p0, add(add(scl(x, p[0]), scl(y, p[1] * fat)), scl(z, p[2] * fat)));
      q = add(add(scl(x, q[0]), scl(y, q[1])), scl(z, q[2]));
    } else if (part === PART.HEAD || part === PART.MANDIBLE || part === PART.SCAPE || part === PART.FUNICULUS) {
      if (part === PART.SCAPE || part === PART.FUNICULUS) {
        const sk: V3 = [rig.socket[0] * side, rig.socket[1], rig.socket[2]];
        // swing the antenna down and back along the side of the head
        // fold the antenna down over the face and back along the venter
        p = rotAbout(p, sk, [1, 0, 0], 2.25); q = rotAxis(q, [1, 0, 0], 2.25);
        p = rotAbout(p, sk, [0, 0, 1], -side * 0.5); q = rotAxis(q, [0, 0, 1], -side * 0.5);
      }
      p = rotAbout(p, rig.neck, [1, 0, 0], headPitch); q = rotAxis(q, [1, 0, 0], headPitch);
      if (part === PART.HEAD && aux === 1) c = eye;
    } else if (part === PART.GASTER) {
      p = rotAbout(p, rig.gasterPivot, [1, 0, 0], -0.25); q = rotAxis(q, [1, 0, 0], -0.25);
    }
    P.set(p, i * 3); N.set(q, i * 3); Cc.set(c, i * 3); R.set([PART.ITEM, 0, 0, 0.55], i * 4);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(P, 3));
  out.setAttribute('normal', new BufferAttribute(N, 3));
  out.setAttribute('color', new BufferAttribute(Cc, 3));
  out.setAttribute('aRig', new BufferAttribute(R, 4));
  out.setIndex(g.getIndex()!.clone());
  out.computeBoundingSphere();
  return out;
}
