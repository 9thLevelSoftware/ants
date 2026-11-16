/**
 * Where each aphid of a herd sits (GDD 05 §1.4: a herd is an abstract population on a stem or leaf; up to 200 are
 * drawn as instances). Spots are laid out once per herd on the surface of its plant's primitives, nearest to the
 * herd's aphid site first, so a growing herd keeps its first aphids where they were and spreads along the stem
 * (and onto the next stem segment, or the underside of a leaf). Pure maths on the primitive list; no three.
 */
import type { Primitive } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { quatRotateVec3, quatConjugate, type Quat } from '@/core/math/quat';
import { hash3 } from '@/render/ants/geometry/curves';
import { HERD_LOOK } from './tuning';

/** One aphid's place: surface point, outward normal (its up) and heading, unit vectors. */
export interface AphidSpot { pos: Vec3; up: Vec3; fwd: Vec3 }

const j = (i: number, k: number, seed: number) => hash3(i, k, seed) * 2 - 1;

function rot(q: Quat, v: Vec3): Vec3 { return quatRotateVec3({ x: 0, y: 0, z: 0 }, q, v); }
function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function addS(a: Vec3, b: Vec3, s: number): Vec3 { return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function norm(a: Vec3): Vec3 { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }

interface Surface { prim: Primitive; dist: number }

/** Distance from p to a primitive's surface (approximate for ellipsoids), mm. */
function surfaceDistance(p: Prim, q: Vec3): number {
  const l = rot(quatConjugate({ x: 0, y: 0, z: 0, w: 1 }, p.rot), sub(q, p.pos));
  if (p.shape === 'capsule' || p.shape === 'cylinder') {
    const h = p.size.y, y = Math.max(-h, Math.min(h, l.y));
    return Math.hypot(l.x, l.y - y, l.z) - p.size.x;
  }
  if (p.shape === 'ellipsoid') {
    const k = Math.hypot(l.x / p.size.x, l.y / p.size.y, l.z / p.size.z);
    return (k - 1) * Math.min(p.size.x, p.size.y, p.size.z);
  }
  return Infinity;
}
type Prim = Pick<Primitive, 'shape' | 'pos' | 'rot' | 'size'>;

/**
 * Up to `max` spots for a herd at `site` on `prims` (the host plant's primitives), deterministic for `seed`.
 * Capsules / cylinders (stems) are wrapped ring by ring outward from the site; ellipsoids (leaves) get a grid on
 * the underside.
 */
export function herdSpots(prims: readonly Prim[], site: Vec3, max: number, seed: number): AphidSpot[] {
  const cands: Surface[] = [];
  for (const p of prims) {
    if (p.shape !== 'capsule' && p.shape !== 'cylinder' && p.shape !== 'ellipsoid') continue;
    const d = surfaceDistance(p, site);
    if (Number.isFinite(d)) cands.push({ prim: p as Primitive, dist: d });
  }
  cands.sort((a, b) => a.dist - b.dist);
  const out: AphidSpot[] = [];
  for (const c of cands) {
    if (out.length >= max) break;
    if (c.dist > 30) break; // other parts of a big plant: keep the herd together
    if (c.prim.shape === 'ellipsoid') leafSpots(c.prim, site, max - out.length, seed + out.length, out);
    else stemSpots(c.prim, site, max - out.length, seed + out.length, out);
  }
  return out;
}

function stemSpots(p: Prim, site: Vec3, n: number, seed: number, out: AphidSpot[]): void {
  const axis = norm(rot(p.rot, { x: 0, y: 1, z: 0 }));
  const h = p.size.y, r = p.size.x;
  const l = rot(quatConjugate({ x: 0, y: 0, z: 0, w: 1 }, p.rot), sub(site, p.pos));
  const t0 = Math.max(-h, Math.min(h, l.y));
  // reference direction around the stem: toward the site (or any perpendicular)
  const e1 = norm(cross(axis, Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
  const e2 = cross(axis, e1);
  const radial = { x: l.x, z: l.z };
  const a0 = Math.atan2(dot(rot(p.rot, { x: radial.x, y: 0, z: radial.z }), e2), dot(rot(p.rot, { x: radial.x, y: 0, z: radial.z }), e1));
  const perRing = Math.max(3, Math.floor((2 * Math.PI * r) / HERD_LOOK.around));
  const down = axis.y > 0 ? -1 : 1; // heading: down the stem, as aphids on stems usually face
  const centre = addS(p.pos, axis, t0);
  for (let ring = 0; n > 0; ring++) {
    const k = ring === 0 ? 0 : (ring % 2 === 1 ? (ring + 1) / 2 : -ring / 2);
    const t = t0 + k * HERD_LOOK.along;
    if (t < -h - r * 0.5 || t > h + r * 0.5) { if (Math.abs(k) * HERD_LOOK.along > 2 * h + r) return; continue; }
    for (let m = 0; m < perRing && n > 0; m++) {
      const mk = m === 0 ? 0 : (m % 2 === 1 ? (m + 1) / 2 : -m / 2);
      const i = out.length;
      const a = a0 + (mk + 0.5 * (ring % 2)) * ((2 * Math.PI) / perRing) + j(i, 1, seed) * 0.15;
      const nrm = norm(addS({ x: e1.x * Math.cos(a), y: e1.y * Math.cos(a), z: e1.z * Math.cos(a) }, e2, Math.sin(a)));
      const tt = Math.max(-h, Math.min(h, t + j(i, 2, seed) * HERD_LOOK.jitterMm));
      const c = addS(centre, axis, tt - t0);
      const pos = addS(c, nrm, r);
      const fwd0 = addS({ x: axis.x * down, y: axis.y * down, z: axis.z * down }, cross(nrm, axis), j(i, 3, seed) * HERD_LOOK.headingJitter);
      out.push({ pos, up: nrm, fwd: norm(addS(fwd0, nrm, -dot(fwd0, nrm))) });
      n--;
    }
  }
}

function leafSpots(p: Prim, site: Vec3, n: number, seed: number, out: AphidSpot[]): void {
  // the thin axis is the leaf normal; aphids sit on the side facing down (the underside)
  const s = p.size;
  const thin = s.y <= s.x && s.y <= s.z ? 'y' : s.x <= s.z ? 'x' : 'z';
  const axes = { x: rot(p.rot, { x: 1, y: 0, z: 0 }), y: rot(p.rot, { x: 0, y: 1, z: 0 }), z: rot(p.rot, { x: 0, y: 0, z: 1 }) };
  let nrm = norm(axes[thin]);
  if (nrm.y > 0) nrm = { x: -nrm.x, y: -nrm.y, z: -nrm.z };
  const [ua, va] = thin === 'y' ? (['x', 'z'] as const) : thin === 'x' ? (['y', 'z'] as const) : (['x', 'y'] as const);
  const U = norm(axes[ua]), V = norm(axes[va]), ru = s[ua], rv = s[va], rt = s[thin];
  const l = sub(site, p.pos);
  const u0 = Math.max(-ru * 0.6, Math.min(ru * 0.6, dot(l, U))), v0 = Math.max(-rv * 0.6, Math.min(rv * 0.6, dot(l, V)));
  const step = HERD_LOOK.along;
  for (let ringR = 0; n > 0 && ringR < 40; ringR++) {
    const ringPts = ringR === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * ringR * step) / HERD_LOOK.around));
    for (let m = 0; m < ringPts && n > 0; m++) {
      const i = out.length, a = (m / ringPts) * Math.PI * 2 + j(i, 4, seed) * 0.2;
      const u = u0 + Math.cos(a) * ringR * step, v = v0 + Math.sin(a) * ringR * step;
      const e = (u / ru) ** 2 + (v / rv) ** 2;
      if (e > 0.85) continue;
      const lift = rt * Math.sqrt(Math.max(0, 1 - e));
      const pos = addS(addS(addS(p.pos, U, u), V, v), nrm, lift);
      const f0 = addS(U, V, j(i, 5, seed) * 0.6);
      out.push({ pos, up: nrm, fwd: norm(addS(f0, nrm, -dot(f0, nrm))) });
      n--;
    }
    if (ringR * step > Math.max(ru, rv)) return;
  }
}

/** Herd colour: black bean aphid or soft green, chosen per herd id (GDD 08 §11.6). */
export function herdIsBlack(herdId: number): boolean {
  return hash3(herdId, 91, 3) < 0.4;
}

/** Whether aphid i of a herd is drawn as a parasitoid mummy (GDD 05 §1.4: a fraction of instances). */
export function isMummy(herdId: number, i: number): boolean {
  return hash3(herdId, i, 17) < HERD_LOOK.mummyShare;
}
