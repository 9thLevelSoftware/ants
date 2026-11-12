// Head capsule (head-local frame, later tilted onto the neck) with compound eyes, ocelli, setae, palps, toothed
// mandibles and elbowed antennae. Mandibles and antennae are built for the left side and mirrored.
import { MeshBuilder, type Ring, type V3, add, cross, len, lerp3, lin, norm, scl, sub } from './meshBuilder';
import { curve, ringPoint, smooth } from './curves';
import type { Assembly } from './context';
import { PART } from './rig';

// dorsal-view width and side-view height profiles along the head (s 0 occiput .. 1 clypeus)
const HW_PROF = [[0, 0.0, 0.0], [0.03, 0.62, 0.6], [0.12, 0.9, 0.88], [0.3, 1.0, 1.0], [0.5, 0.99, 0.97], [0.7, 0.92, 0.88], [0.86, 0.8, 0.72], [0.95, 0.66, 0.55], [1.0, 0.0, 0.0]];

export interface HeadParts {
  head: MeshBuilder; mandL: MeshBuilder; mandR: MeshBuilder; antL: MeshBuilder; antR: MeshBuilder;
  /** head-local rig points (left side) */
  mandPivotL: V3; mandTipL: V3; socketL: V3; elbowL: V3; fuDir: V3;
}

export function buildHead(A: Assembly): HeadParts {
  const { p, lod, BL, col } = A;
  const HL = p.head.length * BL, HW = p.head.width * BL, HH = HW * p.head.height, hA = HW / 2;
  const head = new MeshBuilder();
  head.rigV = [PART.HEAD, 0, 0, 0]; head.color = col.head;
  const hz0 = -0.06 * HL, hz1 = 0.94 * HL;
  const headCY = (s: number) => 0.08 * HH - 0.14 * HH * s * s;
  const section = (s: number): Ring => {
    const [wf, hf] = curve(HW_PROF, s) as [number, number];
    return { c: [0, headCY(s), hz0 + s * (hz1 - hz0)], t: [0, 0, 1], a: Math.max(hA * wf, 0), b: Math.max(HH / 2 * hf, 0), e: p.head.squareness, lower: 0.92 };
  };
  const rings: Ring[] = [];
  for (let i = 0; i <= lod.headRings; i++) rings.push(section(i / lod.headRings));
  head.loft(rings, lod.headRad);
  if (p.head.notch > 0) {
    // posterior emargination (heart-shaped major heads): pull the midline of the occiput forward
    head.transform((q) => {
      const s = (q[2] - hz0) / (hz1 - hz0); if (s > 0.35) return q;
      const w = 1 - Math.min(1, Math.abs(q[0]) / (hA * 0.9)); const f = 1 - s / 0.35;
      return [q[0], q[1], q[2] + p.head.notch * 0.16 * HL * w * w * f * f];
    }, (n) => n);
  }
  const headSurf = (s: number, th: number) => ringPoint(section(s), th, [1, 0, 0]);

  if (lod.eyes) {
    const es = p.eye.size * HL; const sp = headSurf(p.eye.position, 0.28);
    const out = norm([sp.n[0], sp.n[1] * 0.4, sp.n[2] * 0.3]);
    const c = add(sp.p, scl(out, -es * 0.16));
    head.rigV = [PART.HEAD, 0, 0, 1]; head.color = col.eye;
    const fwd = norm([0, 0.12, 1]); const up = norm(cross(fwd, out));
    for (const sgn of [1, -1]) {
      const lat: V3 = [out[0] * sgn, out[1], out[2]];
      head.ellipsoid([c[0] * sgn, c[1], c[2]], [es * 0.36, es * 0.36, es * 0.5], lod.eyeRings, lod.eyeRad, { lat, up: sgn > 0 ? up : norm(cross(fwd, lat)), fwd }, 2.2);
    }
    head.rigV = [PART.HEAD, 0, 0, 0];
  }
  if (p.ocelli && lod.ocelli) {
    head.rigV = [PART.HEAD, 0, 0, 2]; head.color = lin('#3a3530');
    const s0 = 0.3; const top = headSurf(s0, Math.PI / 2).p; const r = 0.035 * HL;
    head.ellipsoid(add(top, [0, -r * 0.3, 0.07 * HL]), [r, r * 0.7, r], 4, 6);
    for (const sgn of [1, -1]) { const q = headSurf(s0 - 0.05, Math.PI / 2 - 0.35 * sgn).p; head.ellipsoid(add(q, [0, -r * 0.3, 0]), [r * 0.9, r * 0.65, r * 0.9], 4, 6); }
    head.rigV = [PART.HEAD, 0, 0, 0];
  }
  if (lod.hairs) {
    const nh = Math.round(p.hairs * 0.18);
    for (let h = 0; h < nh; h++) {
      const s = 0.1 + 0.85 * A.rnd(); const th = Math.PI / 2 + (A.rnd() - 0.5) * 2.2; const sp = headSurf(s, th);
      if (p.head.notch > 0 && s < 0.35) continue;
      head.color = col.hair; head.hair(sp.p, add(sp.n, [0, 0, 0.35]), A.hairLen * (0.6 + 0.5 * A.rnd()), A.hairR, sp.n);
    }
    for (let h = 0; h < 6; h++) { const sp = headSurf(0.97, Math.PI / 2 + (h - 2.5) * 0.35); head.hair(sp.p, add(sp.n, [0, -0.4, 1]), A.hairLen * 0.8, A.hairR * 0.8, sp.n); }
  }
  if (lod.palps) {
    head.color = col.tarsi;
    const pl = 0.55 * HL * (p.mandible.length / 0.36);
    for (const sgn of [1, -1]) {
      const b0: V3 = [0.22 * hA * sgn, headCY(0.85) - HH * 0.38, hz0 + 0.82 * (hz1 - hz0)];
      const pts: V3[] = [b0, add(b0, [0.05 * pl * sgn, -0.3 * pl, 0.12 * pl]), add(b0, [0.08 * pl * sgn, -0.55 * pl, 0.05 * pl]), add(b0, [0.1 * pl * sgn, -0.72 * pl, -0.15 * pl]), add(b0, [0.11 * pl * sgn, -0.8 * pl, -0.35 * pl])];
      head.tubePath(pts, [0.03 * HL, 0.026 * HL, 0.024 * HL, 0.022 * HL, 0.016 * HL], 4);
    }
  }
  const mand = buildMandible(A, HL, HH, hA, hz0, hz1, headCY);
  const ant = buildAntenna(A, HL, headSurf);
  return {
    head, mandL: mand.b, mandR: mand.b.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]),
    antL: ant.b, antR: ant.b.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]),
    mandPivotL: mand.pivot, mandTipL: mand.tip, socketL: ant.socket, elbowL: ant.elbow, fuDir: ant.fuDir,
  };
}

function buildMandible(A: Assembly, HL: number, HH: number, hA: number, hz0: number, hz1: number, headCY: (s: number) => number) {
  const { p, lod, col } = A;
  const b = new MeshBuilder();
  const mlen = p.mandible.length * HL;
  const P0: V3 = [0.5 * hA, headCY(0.95) - HH * 0.12, hz0 + 0.955 * (hz1 - hz0)];
  b.rigV = [PART.MANDIBLE, 1, 0, 0]; b.color = col.mand;
  const reach = P0[0] + 0.04 * hA; // tip crosses the midline slightly
  const outer: V3[] = []; const inner: V3[] = [];
  const nO = lod.level === 0 ? 7 : 3;
  for (let i = 0; i <= nO; i++) { // outer (lateral) margin: base -> tip, convex
    const t = i / nO;
    outer.push([P0[0] - reach * Math.pow(t, 1.8), P0[1] - 0.05 * HH * t, P0[2] + mlen * Math.sin(t * Math.PI * 0.5) * 0.95]);
  }
  const tip = outer[nO]!;
  const basal: V3 = [P0[0] - p.mandible.width * hA * 0.75, P0[1] - 0.05 * HH, P0[2] + mlen * 0.18];
  const teeth = lod.teeth ? p.mandible.teeth : 0;
  const nM = Math.max(teeth * 2, 2);
  for (let i = 1; i < nM; i++) { // masticatory margin tip -> basal angle, with teeth
    const t = i / nM; const q = lerp3(tip, basal, t);
    const tooth = teeth > 0 && i % 2 === 1 ? 0.07 * mlen * (1 - 0.5 * t) : 0;
    inner.push(add(q, scl(norm(cross(sub(basal, tip), [0, 1, 0])), -tooth)));
  }
  const outline = [...outer, ...inner, basal, lerp3(basal, P0, 0.5)];
  const center = lerp3(lerp3(P0, tip, 0.45), basal, 0.3);
  const thick = (i: number) => (i < outer.length ? 0.1 * HH * (1 - 0.7 * i / nO) : 0.045 * HH);
  const before = b.vcount;
  b.slab(center, outline, norm([0, 1, 0.1]), thick, 0.09 * HH);
  for (let v = before; v < b.vcount; v++) { // darken the teeth row
    const q = b.p(v); const dTip = len(sub(q, tip));
    if (q[0] < P0[0] - p.mandible.width * hA * 0.2 && dTip < mlen * 0.9 && v - before > 2 && q[2] > basal[2] - 0.01) {
      const c = lerp3(col.mand, col.teeth, Math.min(1, 0.4 + smooth(1 - dTip / mlen) * 0.6));
      b.col[v * 3] = c[0]; b.col[v * 3 + 1] = c[1]; b.col[v * 3 + 2] = c[2];
    }
  }
  return { b, pivot: P0, tip };
}

function buildAntenna(A: Assembly, HL: number, headSurf: (s: number, th: number) => { p: V3; n: V3 }) {
  const { p, lod, BL, col } = A;
  const b = new MeshBuilder();
  const SL = p.antenna.scape * HL, FL = p.antenna.funiculus * HL, nSeg = p.antenna.segments;
  const sockTop = headSurf(0.66, Math.PI / 2 - 0.55);
  const socket: V3 = add(sockTop.p, scl(sockTop.n, -0.02 * HL));
  const scDir = norm([0.6, 0.6, 0.5]);
  const elbow: V3 = add(socket, scl(scDir, SL));
  const fuDir = norm([0.3, -0.08, 1.0]);
  const ar = 0.0092 * BL * p.antenna.thickness * (HL / (0.235 * BL)) ** 0.3;
  b.color = col.ant; b.rigV = [PART.SCAPE, 1, 0, 0];
  // scape: slender base (condyle bulb), slightly curved, thickening to the apex
  const bend = norm(cross(scDir, [0, 1, 0]));
  const sp: V3[] = []; const sr: number[] = [];
  const nS = lod.level === 0 ? 7 : 2;
  for (let i = 0; i <= nS; i++) {
    const t = i / nS; sp.push(add(add(socket, scl(scDir, SL * t)), scl(bend, -Math.sin(t * Math.PI) * 0.04 * SL)));
    sr.push(ar * (i === 0 ? 0.75 : lod.level === 0 && i === 1 ? 0.5 : 0.48 + 0.3 * t));
  }
  if (lod.level === 0) b.ellipsoid(socket, [ar * 0.9, ar * 0.9, ar * 0.9], 4, 6);
  b.tubePath(sp, sr, lod.antRad);
  if (lod.hairs) {
    for (let h = 0; h < 5; h++) {
      const q = lerp3(socket, elbow, 0.2 + 0.15 * h); const n = norm(cross(scDir, [Math.sin(h * 2.1), Math.cos(h * 2.1), 0.3]));
      b.color = col.hair; b.hair(add(q, scl(n, ar * 0.6)), add(n, scl(scDir, 0.9)), A.hairLen * 0.6, A.hairR * 0.7, n);
    }
  }
  // funiculus: pedicel + segments, gradually thickening; `club` thickens the last three segments
  b.color = col.ant; b.rigV = [PART.FUNICULUS, 1, 0, 0];
  const fp: V3[] = []; const fr: number[] = [];
  const segLen = (i: number) => (i === 0 ? 1.5 : 1) * (i === nSeg - 1 ? 1.4 : 1);
  let total = 0; for (let i = 0; i < nSeg; i++) total += segLen(i);
  const along = (uu: number) => add(add(elbow, scl(fuDir, uu)), scl([0, -1, 0], Math.sin(uu / FL * Math.PI * 0.8) * 0.08 * FL));
  const clubAt = (i: number) => 1 + p.antenna.club * smooth((i - (nSeg - 4)) / 2.5);
  if (lod.funRings > 0) {
    let u = 0;
    for (let i = 0; i < nSeg; i++) {
      const l = (segLen(i) / total) * FL; const r = ar * (0.55 + 0.35 * (i / (nSeg - 1))) * clubAt(i);
      fp.push(along(u + l * 0.03)); fr.push(r * 0.72);
      fp.push(along(u + l * 0.5)); fr.push(r);
      u += l;
    }
    fp.push(along(FL * 0.995)); fr.push(ar * 0.5);
  } else {
    fp.push(along(0), along(FL * 0.5), along(FL)); fr.push(ar * 0.55, ar * 0.7, ar * 0.6 * clubAt(nSeg));
  }
  b.tubePath(fp, fr, lod.antRad);
  return { b, socket, elbow, fuDir };
}
