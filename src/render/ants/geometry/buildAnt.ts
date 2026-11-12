// buildAntVariant(morphology): four LOD geometries + wing geometry + rig constants. Everything is assembled at a
// nominal size, measured, then rebuilt so mandible tip to gaster tip equals morphology.bodyLength exactly.
import { BufferGeometry, Sphere, Vector3 } from 'three';
import type { AntMorphology } from '../morph/types';
import { MeshBuilder, add, cross, norm, rotX, scl, sub, type V3 } from './meshBuilder';
import { mulberry32 } from './curves';
import { partColors, type Assembly } from './context';
import { buildMesosoma, buildPetiole, mesoFrame } from './thorax';
import { buildLegs } from './legs';
import { buildGaster } from './gaster';
import { buildHead } from './head';
import { buildWings } from './wings';
import { LODS, type AntRig, type AntVariant, type Lod } from './rig';

export function buildAntVariant(m: AntMorphology, id = 0): AntVariant {
  const raw = assemble(m, LODS[0]!, 1);
  const k = m.bodyLength / raw.length;
  const lods: BufferGeometry[] = []; const tris: number[] = [];
  let rig: AntRig | null = null; let wings: BufferGeometry | null = null; let wingTris = 0;
  const L = m.bodyLength;
  for (const lod of LODS) {
    const a = assemble(m, lod, k);
    rig ??= a.rig;
    lods.push(a.body.toGeometry({ bounds: new Sphere(new Vector3(0, L * 0.1, 0), L * 0.95) }));
    tris.push(a.body.idx.length / 3);
    if (lod.level === 0 && a.wings) {
      wings = a.wings.toGeometry({ uv: true, bounds: new Sphere(new Vector3(0, 0, 0), L * 1.6) });
      wingTris = a.wings.idx.length / 3;
    }
  }
  return { id, key: m.name, morph: m, rig: rig!, lods, wings, tris, wingTris };
}

interface Assembled { body: MeshBuilder; wings: MeshBuilder | null; rig: AntRig; length: number }

function assemble(p: AntMorphology, lod: Lod, k: number): Assembled {
  const BL = p.bodyLength * k;
  const frame = mesoFrame({ p, BL });
  const A: Assembly = {
    p, lod, BL, col: partColors(p), rnd: mulberry32(1234 + Math.round(p.bodyLength * 100)), body: new MeshBuilder(),
    hairLen: 0.024 * BL, hairR: 0.00085 * BL, ...frame,
  };
  const { neck } = buildMesosoma(A);
  const legs = buildLegs(A);
  const { gasterFrontZ, petPivot } = buildPetiole(A);
  const g = buildGaster(A, gasterFrontZ);
  if (lod.hairs) {
    // mesosoma dorsum setae
    const nh = Math.round(p.hairs * 0.22);
    for (let h = 0; h < nh; h++) {
      const s = 0.08 + 0.85 * A.rnd(); const m = A.mesoAt(s); const th = Math.PI / 2 + (A.rnd() - 0.5) * 1.6;
      const lat = Math.cos(th), up = Math.sin(th);
      const pos: V3 = [m.a * lat, m.yc + m.b * up, A.zF + (A.zB - A.zF) * s];
      const n = norm([lat / m.a, up / m.b, 0]);
      A.body.color = A.col.hair; A.body.rigV = [0, 0, 0, 0];
      A.body.hair(pos, add(n, [0, 0, -0.4]), A.hairLen * (0.7 + 0.6 * A.rnd()), A.hairR, n);
    }
  }
  const H = buildHead(A);
  const tilt = p.head.tilt;
  const toBody = (q: V3): V3 => add(neck, rotX(q, tilt));
  const parts = lod.level < 2 ? [H.head, H.mandL, H.mandR, H.antL, H.antR] : lod.level < 3 ? [H.head, H.antL, H.antR] : [H.head];
  for (const b of parts) { b.transform(toBody, (n) => rotX(n, tilt)); A.body.append(b); }
  const wings = p.wings === 'full' ? buildWings(A, g) : null;

  const mT = toBody(H.mandTipL);
  const sockB = toBody(H.socketL), elbB = toBody(H.elbowL);
  const scB = norm(sub(elbB, sockB)), fuB = rotX(H.fuDir, tilt);
  const gasterTip = add(g.G0, scl(g.axis, g.GL));
  const rig: AntRig = {
    bodyLength: p.bodyLength,
    legA: legs.legA, foot: legs.foot, legLen: legs.legLen,
    gait: [p.gait.stride * BL, p.gait.lift * BL, p.gait.duty, 0.012 * BL],
    neck, headUp: rotX([0, 1, 0], tilt), headFwd: rotX([0, 0, 1], tilt), headTilt: tilt,
    mand: toBody(H.mandPivotL), socket: sockB, elbow: elbB, elbowAxis: norm(cross(scB, fuB)),
    gasterPivot: [0, g.gC[1] - g.GH * 0.28, gasterFrontZ + 0.01 * BL], gasterC: g.gC, gasterAxis: g.axis,
    gasterP: [0.38, 0.055 * g.GL, g.nb, 0.45],
    petPivot,
    grip: [0, mT[1] - 0.012 * BL, mT[2] + 0.005 * BL],
    groom: add(sockB, [0.02 * BL, -0.02 * BL, 0.06 * BL]),
    membrane: A.col.mem, callow: A.col.callow,
    facet: Math.max(p.eye.size * p.head.length * BL / 17, 0.003 * BL),
    gasterTip,
  };
  const length = mT[2] + 0.004 * BL - gasterTip[2];
  return { body: A.body, wings, rig, length };
}
