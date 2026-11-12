// Six legs on the mesosoma, built in SEGMENT-LOCAL frames (x along the segment from its proximal joint) so the
// vertex shader can place each rigid segment by analytic IK. Left legs are built, right legs are mirrored (legs 3-5).
import { MeshBuilder, type V3, add, scl } from './meshBuilder';
import type { Assembly } from './context';
import { PART, type V4 } from './rig';

// standard worker leg lengths as fraction of body length [coxa, femur, tibia, tarsus] for front/mid/hind
const LEG_LEN = [[0.085, 0.19, 0.155, 0.19], [0.06, 0.205, 0.18, 0.205], [0.065, 0.245, 0.235, 0.265]];
const LEG_DIR = [0.75, 0.07, -0.75];   // rest foot direction from lateral, radians (+ = forward)
const COXA_ANG = [0.62, 0.45, 0.5];     // from vertical toward the foot
const TARSUS_ANG = 0.48;               // tarsus rises toward the tibia at this angle above horizontal
const TARSOMERES = [0.4, 0.16, 0.13, 0.11, 0.2];
const ATTACH_S = [0.17, 0.5, 0.76];

export interface LegRig { legA: V4[]; foot: V4[]; legLen: V4[] }

export function buildLegs(A: Assembly): LegRig {
  const { p, BL, body, mesoAt, zF, zB, MH } = A;
  const legA: V4[] = [], foot: V4[] = [], legLen: V4[] = [];
  for (let pair = 0; pair < 3; pair++) {
    const m = mesoAt(ATTACH_S[pair]!);
    const a: V3 = [Math.max(m.a * 0.42, 0.02 * BL), m.bot + 0.04 * MH, zF + (zB - zF) * ATTACH_S[pair]!];
    const L = LEG_LEN[pair]!.map((x) => x * BL * p.legs.length) as V4;
    const reach = L[0] * Math.sin(COXA_ANG[pair]!) + L[3] * Math.cos(TARSUS_ANG) + 0.74 * (L[1] + L[2]);
    const dirA = LEG_DIR[pair]!;
    legA.push([a[0], a[1], a[2], TARSUS_ANG]);
    foot.push([a[0] + Math.cos(dirA) * reach, 0, a[2] + Math.sin(dirA) * reach, COXA_ANG[pair]!]);
    legLen.push(L);
  }
  const rL = 0.0155 * BL * p.legs.thickness;
  for (let pair = 0; pair < 3; pair++) {
    const left = new MeshBuilder();
    buildLeg(A, left, pair, legLen[pair]!, rL);
    body.append(left);
    body.append(left.mirrored(2, (r) => [r[0]!, r[1]! + 3, r[2]!, r[3]!])); // right legs: mirrored in local z
  }
  return { legA, foot, legLen };
}

function buildLeg(A: Assembly, left: MeshBuilder, pair: number, len: V4, rL: number): void {
  const { lod, col, rnd, hairLen, hairR } = A;
  const [Lc, Lf, Lt, Lta] = len;
  const R = lod.legRad, D = lod.legDetail;
  if (lod.coxa) {
    left.color = col.legs; left.rigV = [PART.LEG, pair, 0, 0];
    const rc = rL * (pair === 0 ? 1.25 : 1.0);
    left.tubeX(D > 0 ? [[0, rc * 0.8, rc * 0.8], [Lc * 0.35, rc, rc], [Lc * 0.8, rc * 0.85, rc * 0.85], [Lc, rc * 0.6, rc * 0.6]] : [[0, rc, rc], [Lc, rc * 0.7, rc * 0.7]], R);
  }
  // femur (+ trochanter knob)
  left.color = col.legs; left.rigV = [PART.LEG, pair, 1, 0];
  const fr: [number, number, number][] = D === 2
    ? [[0, rL * 0.6, rL * 0.6], [Lf * 0.06, rL * 0.82, rL * 0.82], [Lf * 0.13, rL * 0.66, rL * 0.66], [Lf * 0.3, rL * 1.02, rL * 0.82], [Lf * 0.6, rL * 0.95, rL * 0.76], [Lf * 0.88, rL * 0.8, rL * 0.66], [Lf, rL * 0.62, rL * 0.55]]
    : D === 1 ? [[0, rL * 0.75, rL * 0.75], [Lf * 0.35, rL * 1.0, rL * 0.85], [Lf, rL * 0.65, rL * 0.6]]
      : D === 0 ? [[0, rL * 1.1, rL * 1.1], [Lf, rL * 0.9, rL * 0.9]] : [[0, rL * 1.6, rL * 1.6], [Lf, rL * 1.3, rL * 1.3]];
  left.tubeX(fr, R, D > 0);
  // tibia
  left.rigV = [PART.LEG, pair, 2, 0];
  const tr: [number, number, number][] = D === 2
    ? [[0, rL * 0.5, rL * 0.5], [Lt * 0.1, rL * 0.55, rL * 0.55], [Lt * 0.5, rL * 0.6, rL * 0.58], [Lt * 0.92, rL * 0.72, rL * 0.66], [Lt, rL * 0.55, rL * 0.5]]
    : D === 1 ? [[0, rL * 0.55, rL * 0.55], [Lt, rL * 0.7, rL * 0.65]]
      : D === 0 ? [[0, rL * 0.75, rL * 0.75], [Lt, rL * 0.75, rL * 0.75]] : [[0, rL * 1.2, rL * 1.2], [Lt + Lta * 0.6, rL * 1.0, rL * 1.0]];
  left.tubeX(tr, R, D > 0);
  if (D === 2) {
    // apical spur (front leg: the antenna-cleaning calcar)
    const sp = pair === 0 ? 0.11 : 0.07;
    left.tubePath([[Lt * 0.94, -rL * 0.45, 0], [Lt + sp * Lt * 0.5, -rL * 0.75, 0], [Lt + sp * Lt, -rL * 0.9, 0]], [rL * 0.18, rL * 0.1, rL * 0.02], 3);
    if (lod.hairs) {
      for (let h = 0; h < 5; h++) {
        const u = Lt * (0.15 + 0.17 * h); const th = (rnd() - 0.5) * 2.4;
        const n: V3 = [0, Math.cos(th), Math.sin(th)];
        left.color = col.hair; left.hair(add([u, 0, 0], scl(n, rL * 0.55)), add(n, [0.8, 0, 0]), hairLen * 0.7, hairR * 0.8, n);
      }
    }
    left.color = col.legs;
  }
  // tarsus: 5 tarsomeres + two claws
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
}
