/**
 * Static poses baked on the CPU from a variant's LOD geometry, using the same segment-local leg frames as the
 * shader: the naked (exarate) pupa of myrmicines and the dead adult (corpse). The output is a plain geometry in the
 * body frame, every vertex tagged PART.ITEM (aux = roughness), so it renders through the item paths.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { type V3, add, cross, lin, norm, rotAxis, scl, sub } from './meshBuilder';
import { PART, type AntRig, type AntVariant } from './rig';

export type StaticPose = 'pupa' | 'corpse';

interface PoseSpec {
  /** Folded leg joints for the LEFT side: [attachment, coxa end, knee, tarsus start, foot]. */
  legJoints(rig: AntRig, pair: number): V3[];
  headPitch: number;
  gasterPitch: number;
  /** Antenna fold about the socket: pitch (x axis) and inward yaw. */
  antFold: [number, number];
  limbFat: number;
  color: (base: V3, part: number, aux: number) => V3;
  roughness: number;
}

const rotAbout = (q: V3, pivot: V3, axis: V3, a: number): V3 => add(pivot, rotAxis(sub(q, pivot), axis, a));

const PUPA: PoseSpec = {
  legJoints(rig, pair) {
    const A = rig.legA[pair]!; const L = rig.legLen[pair]!; const a: V3 = [A[0], A[1], A[2]];
    // exarate pupa: legs appressed to the venter, femur forward and inward, tibia folded back, tarsus along the body
    const h = add(a, scl(norm([0.1, -1, 0.05]), L[0] * 0.6));
    const k = add(h, scl(norm([-0.18 - 0.05 * pair, -0.22, pair === 0 ? 1 : pair === 1 ? 0.9 : 0.8]), L[1]));
    const t = add(k, scl(norm([-0.04, -0.12, -1]), L[2]));
    return [a, h, k, t, add(t, scl(norm([0.02, -0.04, -1]), L[3]))];
  },
  headPitch: 0.75, gasterPitch: -0.25, antFold: [2.25, 0.5], limbFat: 1.35,
  color: (_b, part, aux) => (part === PART.HEAD && aux === 1 ? lin('#7a6450') : lin('#d4bf98')),
  roughness: 0.5,
};

const CORPSE: PoseSpec = {
  legJoints(rig, pair) {
    const A = rig.legA[pair]!; const L = rig.legLen[pair]!; const a: V3 = [A[0], A[1], A[2]];
    // death curl: femora raised and drawn in, tibiae and tarsi folded tight under the body
    const h = add(a, scl(norm([0.6, -0.5, pair === 0 ? 0.4 : pair === 1 ? 0 : -0.4]), L[0]));
    const k = add(h, scl(norm([0.7, 0.45, pair === 0 ? 0.5 : pair === 1 ? 0.05 : -0.45]), L[1]));
    const t = add(k, scl(norm([-0.55, -0.8, pair === 2 ? -0.2 : 0.15]), L[2]));
    return [a, h, k, t, add(t, scl(norm([-0.7, -0.4, -0.3]), L[3] * 0.9))];
  },
  headPitch: 0.45, gasterPitch: -0.35, antFold: [1.4, 0.9], limbFat: 1.0,
  color: (b) => [b[0] * 0.85, b[1] * 0.82, b[2] * 0.8],
  roughness: 0.7,
};

/** Bakes a static pose from one LOD of the variant (callers use LOD0: items lie next to LOD0 ants up close). */
export function bakeStaticPose(v: AntVariant, pose: StaticPose, lodIndex = 1): BufferGeometry {
  const spec = pose === 'pupa' ? PUPA : CORPSE;
  const g = v.lods[lodIndex]!; const rig = v.rig;
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), col = g.getAttribute('color'), rg = g.getAttribute('aRig');
  const n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), R = new Float32Array(n * 4);
  const joints = [0, 1, 2].map((pair) => spec.legJoints(rig, pair));
  for (let i = 0; i < n; i++) {
    let p: V3 = [pos.getX(i), pos.getY(i), pos.getZ(i)]; let q: V3 = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)];
    const part = Math.round(rg.getX(i)), side = rg.getY(i), seg = Math.round(rg.getZ(i)), aux = Math.round(rg.getW(i));
    if (part === PART.LEG) {
      const leg = Math.round(side); const pair = leg % 3; const s = leg < 3 ? 1 : -1;
      const J = joints[pair]!.map((j) => [j[0] * s, j[1], j[2]] as V3);
      const p0 = J[seg]!, p1 = J[seg + 1]!; const x = norm(sub(p1, p0));
      const ref: V3 = Math.abs(x[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      let z = norm(cross(x, ref)); if (s < 0) z = scl(z, -1);
      const y = cross(z, x);
      p = add(p0, add(add(scl(x, p[0]), scl(y, p[1] * spec.limbFat)), scl(z, p[2] * spec.limbFat)));
      q = add(add(scl(x, q[0]), scl(y, q[1])), scl(z, q[2]));
    } else if (part === PART.HEAD || part === PART.MANDIBLE || part === PART.SCAPE || part === PART.FUNICULUS) {
      if (part === PART.SCAPE || part === PART.FUNICULUS) {
        const sk: V3 = [rig.socket[0] * side, rig.socket[1], rig.socket[2]];
        p = rotAbout(p, sk, [1, 0, 0], spec.antFold[0]); q = rotAxis(q, [1, 0, 0], spec.antFold[0]);
        p = rotAbout(p, sk, [0, 0, 1], -side * spec.antFold[1]); q = rotAxis(q, [0, 0, 1], -side * spec.antFold[1]);
      }
      p = rotAbout(p, rig.neck, [1, 0, 0], spec.headPitch); q = rotAxis(q, [1, 0, 0], spec.headPitch);
    } else if (part === PART.GASTER) {
      p = rotAbout(p, rig.gasterPivot, [1, 0, 0], spec.gasterPitch); q = rotAxis(q, [1, 0, 0], spec.gasterPitch);
    }
    const c = spec.color([col.getX(i), col.getY(i), col.getZ(i)], part, aux);
    P.set(p, i * 3); N.set(q, i * 3); C.set(c, i * 3); R.set([PART.ITEM, 0, 0, spec.roughness], i * 4);
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(P, 3));
  out.setAttribute('normal', new BufferAttribute(N, 3));
  out.setAttribute('color', new BufferAttribute(C, 3));
  out.setAttribute('aRig', new BufferAttribute(R, 4));
  out.setIndex(g.getIndex()!.clone());
  out.computeBoundingSphere();
  return out;
}
