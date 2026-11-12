/**
 * Brood and carried items (spike). Item-local frame: mm, +Z = forward away from the carrier, +Y up,
 * origin = the point held between the mandibles. Every vertex: position, normal, colour, aRig = [PART.ITEM, 0, 0, roughness].
 * Lasius niger sizes (worker brood): egg ~0.5 x 0.35 mm (laid in sticky clumps), mature larva ~2.5-3 mm,
 * worker cocoon ~3.5 x 1.4 mm (formicine pupae spin silk cocoons; the dark meconium spot marks the posterior end),
 * soil pellet ~0.8-1 mm, honeydew droplet ~0.9 mm (0.4 uL).
 */
import { BufferGeometry, Matrix4, Vector3 } from 'three';
import { MeshBuilder, type Ring, type V3, add, lin, norm, rotX, scl } from './mesh-builder';
import { PART, bakePupa, type AntVariant } from './ant-geometry';

export type ItemKind = 'eggs' | 'larva' | 'cocoon' | 'pupa' | 'crumb' | 'pellet' | 'seed' | 'leaf' | 'droplet';
export const ITEM_KINDS: ItemKind[] = ['eggs', 'larva', 'cocoon', 'pupa', 'crumb', 'pellet', 'seed', 'leaf', 'droplet'];

export interface ItemDef {
  kind: ItemKind;
  geometry: BufferGeometry;
  /** carry pose: extra pitch (rad, + = tip down) relative to the head axis, mandible gape 0..1, head raise 0..1 */
  carry: { pitch: number; gape: number; raise: number };
  /** resting on the ground: y offset so it sits on y = 0 */
  restY: number;
  transparent?: boolean;
  tris: number;
}

function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash3 = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) r += hash3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  return r;
}

function rough(mb: MeshBuilder, r: number) { for (let i = 3; i < mb.rig.length; i += 4) { mb.rig[i - 3] = PART.ITEM; mb.rig[i] = r; } }

/** displaced sphere (crumbs, pellets) */
function lump(mb: MeshBuilder, r: V3, rings: number, radial: number, amp: number, freq: number, seed: number, colorFn: (p: V3, n: number) => V3) {
  const start = mb.vcount; mb.ellipsoid([0, 0, 0], r, rings, radial);
  for (let i = start; i < mb.vcount; i++) {
    const p = mb.p(i); const n = norm(p);
    const d = (vnoise3(p[0] * freq + seed, p[1] * freq, p[2] * freq) - 0.5) * 2 + (vnoise3(p[0] * freq * 2.7, p[1] * freq * 2.7 + seed, p[2] * freq * 2.7) - 0.5);
    const q = add(p, scl(n, d * amp));
    mb.pos[i * 3] = q[0]; mb.pos[i * 3 + 1] = q[1]; mb.pos[i * 3 + 2] = q[2];
    const c = colorFn(q, d); mb.col[i * 3] = c[0]; mb.col[i * 3 + 1] = c[1]; mb.col[i * 3 + 2] = c[2];
  }
  // recompute normals for the displaced piece
  mb.beginPieceAt(start); mb.endPiece();
}

export function buildItems(worker: AntVariant): Record<ItemKind, ItemDef> {
  const out = {} as Record<ItemKind, ItemDef>;
  const R = rng(99);
  const done = (kind: ItemKind, mb: MeshBuilder, carry: ItemDef['carry'], restY: number, transparent = false) => {
    const g = mb.toGeometry(); out[kind] = { kind, geometry: g, carry, restY, transparent, tris: mb.idx.length / 3 };
  };

  // ---- egg clump: sticky cluster of ellipsoidal eggs
  {
    const mb = new MeshBuilder(); const white = lin('#e9e1cc');
    const pts: V3[] = [];
    for (let i = 0; i < 16; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const p: V3 = [(R() - 0.5) * 0.8, (R() - 0.5) * 0.55, (R() - 0.5) * 0.8 + 0.25];
        if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.26)) { pts.push(p); break; }
      }
    }
    for (const p of pts) {
      const ax = norm([R() - 0.5, R() - 0.5, R() - 0.5]); const up = norm([R() - 0.5, 1, R() - 0.5]);
      const lat = norm([ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]);
      const up2 = norm([lat[1] * ax[2] - lat[2] * ax[1], lat[2] * ax[0] - lat[0] * ax[2], lat[0] * ax[1] - lat[1] * ax[0]]);
      mb.color = [white[0] * (0.95 + R() * 0.05), white[1] * (0.95 + R() * 0.05), white[2] * (0.9 + R() * 0.05)];
      mb.ellipsoid(p, [0.17, 0.17, 0.26], 6, 8, { lat, up: up2, fwd: ax });
    }
    rough(mb, 0.18); done('eggs', mb, { pitch: 0.2, gape: 0.25, raise: 0.6 }, 0.45);
  }

  // ---- larva: curved (crook-neck), segmented, pale, small head capsule at the narrow end
  {
    const mb = new MeshBuilder(); const pale = lin('#e8dfc8'), gut = lin('#cdb98c');
    const n = 13; const rings: Ring[] = []; const Lr = 2.4;
    const spine = (t: number): V3 => { const a = -0.25 + t * 3.4; const rad = 0.75; return [0, rad * Math.cos(a) - 0.1, rad * Math.sin(a) * 1.15]; };
    const steps = n * 3;
    rings.push({ c: spine(0), t: norm(add(spine(0.01), scl(spine(0), -1))), a: 0, b: 0, color: pale });
    for (let i = 0; i <= steps; i++) {
      const t = i / steps; const p = spine(t); const tg = norm(add(spine(Math.min(1, t + 0.01)), scl(spine(Math.max(0, t - 0.01)), -1)));
      const seg = 0.94 + 0.06 * Math.cos((i % 3) / 3 * Math.PI * 2);
      const body = 0.36 * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92 + 0.12), 0.7) * (1 - 0.55 * Math.max(0, t - 0.7) / 0.3);
      const g = Math.max(0, Math.sin(t * Math.PI) - 0.3);
      rings.push({ c: p, t: tg, a: body * seg, b: body * seg * 0.92, color: [pale[0] + (gut[0] - pale[0]) * g * 0.6, pale[1] + (gut[1] - pale[1]) * g * 0.6, pale[2] + (gut[2] - pale[2]) * g * 0.6] });
    }
    rings.push({ c: spine(1), t: norm(add(spine(1), scl(spine(0.99), -1))), a: 0, b: 0, color: pale });
    mb.loft(rings, 14);
    const hp = spine(1.0);
    mb.color = lin('#efe2c4'); mb.ellipsoid(add(hp, [0, 0.04, 0.05]), [0.12, 0.1, 0.11], 5, 8);
    mb.color = lin('#8a5a2a'); mb.ellipsoid(add(hp, [0.05, -0.02, 0.13]), [0.03, 0.02, 0.04], 3, 5); mb.ellipsoid(add(hp, [-0.05, -0.02, 0.13]), [0.03, 0.02, 0.04], 3, 5);
    void Lr; rough(mb, 0.28);
    // held by the middle of the body, hanging below the mandibles
    mb.transform((p) => [p[0], p[1] - 0.45, p[2] - 0.15], (q) => q);
    done('larva', mb, { pitch: -0.2, gape: 0.3, raise: 0.85 }, 0.95);
  }

  // ---- cocoon: silk, spindle with rounded ends, dark meconium spot at the posterior pole
  {
    const mb = new MeshBuilder(); const silk = lin('#b49c74'), silk2 = lin('#9c835e'), mec = lin('#2a2018');
    const L = 3.5, Rr = 0.7; const rings: Ring[] = [];
    const n = 20;
    rings.push({ c: [0, 0, 0], t: [0, 0, 1], a: 0, b: 0, color: silk });
    for (let i = 1; i < n; i++) {
      const t = i / n; const r = Rr * Math.pow(Math.sin(t * Math.PI), 0.62) * (1 - 0.06 * t);
      rings.push({ c: [0, 0, t * L], t: [0, 0, 1], a: r, b: r * 0.96, color: silk });
    }
    rings.push({ c: [0, 0, L], t: [0, 0, 1], a: 0, b: 0, color: silk });
    const s0 = mb.vcount; mb.loft(rings, 16);
    for (let i = s0; i < mb.vcount; i++) {
      const p = mb.p(i); const f = vnoise3(p[0] * 9, p[1] * 9, p[2] * 2.5); const z = p[2] / L;
      let c: V3 = [silk[0] + (silk2[0] - silk[0]) * f, silk[1] + (silk2[1] - silk[1]) * f, silk[2] + (silk2[2] - silk[2]) * f];
      const spot = Math.max(0, 1 - Math.hypot(p[0], p[1] + 0.15, (p[2] - L) * 1.2) / 0.38);
      if (spot > 0) c = [c[0] + (mec[0] - c[0]) * Math.min(1, spot * 2.2), c[1] + (mec[1] - c[1]) * Math.min(1, spot * 2.2), c[2] + (mec[2] - c[2]) * Math.min(1, spot * 2.2)];
      const fz = 1 + (f - 0.5) * 0.04; mb.pos[i * 3] = p[0] * fz; mb.pos[i * 3 + 1] = p[1] * fz;
      void z; mb.col[i * 3] = c[0]; mb.col[i * 3 + 1] = c[1]; mb.col[i * 3 + 2] = c[2];
    }
    mb.beginPieceAt(s0); mb.endPiece();
    rough(mb, 0.82);
    // gripped at the anterior end, projecting forward
    mb.transform((p) => [p[0], p[1], p[2] - 0.12], (q) => q);
    done('cocoon', mb, { pitch: 0.05, gape: 0.45, raise: 1.0 }, 0.7);
  }

  // ---- naked (exarate) pupa: baked from the worker mesh in a folded pose, cream white
  {
    const g = bakePupa(worker, 1); // LOD1 detail is plenty for brood
    // held by the waist, the pupa lies lengthwise ahead of the carrier (head forward)
    g.applyMatrix4(new Matrix4().makeTranslation(0, -0.62, 1.15));
    g.computeBoundingSphere();
    out.pupa = { kind: 'pupa', geometry: g, carry: { pitch: -0.3, gape: 0.4, raise: 1.0 }, restY: 0.62, tris: g.index!.count / 3 };
  }

  // ---- food crumb: porous irregular lump (bread/biscuit)
  {
    const mb = new MeshBuilder(); const a = lin('#c9944e'), b = lin('#ecd4a2');
    lump(mb, [0.72, 0.52, 0.6], 10, 14, 0.18, 3.2, 3, (p, d) => { const f = Math.min(1, Math.max(0, 0.5 + d * 0.9 + vnoise3(p[0] * 8, p[1] * 8, p[2] * 8) * 0.3 - 0.15)); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; });
    rough(mb, 0.86); mb.transform((p) => [p[0], p[1], p[2] + 0.55], (q) => q);
    done('crumb', mb, { pitch: 0.1, gape: 0.6, raise: 0.7 }, 0.5);
  }

  // ---- soil pellet: moist, granular
  {
    const mb = new MeshBuilder(); const a = lin('#3d2b1c'), b = lin('#7a6449');
    lump(mb, [0.42, 0.38, 0.42], 8, 12, 0.07, 9, 7, (p) => { const g = vnoise3(p[0] * 30, p[1] * 30, p[2] * 30); const f = g > 0.72 ? 1 : g * 0.25; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; });
    rough(mb, 0.7); mb.transform((p) => [p[0], p[1], p[2] + 0.35], (q) => q);
    done('pellet', mb, { pitch: 0.0, gape: 0.4, raise: 0.4 }, 0.38);
  }

  // ---- seed with elaiosome (myrmecochory: Lasius carries such seeds by the fatty appendage)
  {
    const mb = new MeshBuilder(); const sc = lin('#4f321c'), el = lin('#f0e0a8');
    const s0 = mb.vcount; mb.ellipsoid([0, 0, 0.95], [0.42, 0.36, 0.72], 10, 14);
    for (let i = s0; i < mb.vcount; i++) { const p = mb.p(i); const ridge = Math.exp(-Math.pow(p[0] / 0.05, 2)) * 0.03 * Math.max(0, p[1]); mb.pos[i * 3 + 1] = p[1] + ridge; }
    mb.beginPieceAt(s0); mb.endPiece(); for (let i = s0; i < mb.vcount; i++) { const c = sc; mb.col[i * 3] = c[0]; mb.col[i * 3 + 1] = c[1]; mb.col[i * 3 + 2] = c[2]; mb.rig[i * 4] = PART.ITEM; mb.rig[i * 4 + 3] = 0.3; }
    const e0 = mb.vcount; mb.color = el; mb.ellipsoid([0, 0.02, 0.18], [0.3, 0.24, 0.22], 6, 10);
    for (let i = e0; i < mb.vcount; i++) { mb.rig[i * 4] = PART.ITEM; mb.rig[i * 4 + 3] = 0.45; }
    done('seed', mb, { pitch: 0.15, gape: 0.35, raise: 0.6 }, 0.36);
  }

  // ---- leaf fragment: thin, irregular, curled, two-sided with midrib and veins
  {
    const mb = new MeshBuilder(); const top = lin('#5c8a2c'), bot = lin('#86a85a'), vein = lin('#a9c278');
    const nx = 9, nz = 9; const W = 2.2, Hh = 2.6;
    const shape = (u: number, v: number): V3 => { const x = (u - 0.5) * W, z = v * Hh; const curl = -0.35 * Math.pow((u - 0.5) * 2, 2) + 0.15 * Math.sin(v * 3); return [x, curl, z]; };
    const inside = (u: number, v: number) => { const cx = (u - 0.5) * 2, cz = v * 2 - 1; const r = 0.92 + 0.12 * Math.sin(u * 17 + v * 9) - (v > 0.7 && u > 0.55 ? 0.3 : 0); return cx * cx + cz * cz * 0.9 < r * r; };
    for (const side of [1, -1]) {
      mb.beginPiece(); const ids: number[][] = [];
      for (let j = 0; j <= nz; j++) { const row: number[] = []; for (let i = 0; i <= nx; i++) { const u = i / nx, v = j / nz; const p = shape(u, v); const mid = Math.exp(-Math.pow((u - 0.5) / 0.04, 2)); const lat = Math.exp(-Math.pow(((v - Math.abs(u - 0.5) * 0.9) * 6) % 1 - 0.5, 2) * 40) * 0.5; const vv = Math.min(1, mid + lat); const base = side > 0 ? top : bot; row.push(mb.vert(add(p, [0, side * 0.02, 0]), [0, side, 0], [u, v], [base[0] + (vein[0] - base[0]) * vv * 0.7, base[1] + (vein[1] - base[1]) * vv * 0.7, base[2] + (vein[2] - base[2]) * vv * 0.7])); } ids.push(row); }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        if (!inside((i + 0.5) / nx, (j + 0.5) / nz)) continue;
        const a = ids[j]![i]!, b = ids[j]![i + 1]!, c = ids[j + 1]![i]!, d = ids[j + 1]![i + 1]!;
        if (side > 0) { mb.tri(a, c, b); mb.tri(b, c, d); } else { mb.tri(a, b, c); mb.tri(b, d, c); }
      }
      mb.endPiece();
    }
    rough(mb, 0.55);
    // held at its base edge, standing up in front of the head (leaf-fragment carriers hold them upright)
    mb.transform((p) => rotX([p[0], p[1], p[2]], -1.15), (q) => rotX(q, -1.15));
    done('leaf', mb, { pitch: 0.0, gape: 0.2, raise: 0.6 }, 0.05);
  }

  // ---- honeydew droplet (transparent)
  {
    const mb = new MeshBuilder(); mb.color = lin('#f2d58a');
    mb.ellipsoid([0, 0, 0.42], [0.46, 0.42, 0.46], 10, 14);
    rough(mb, 0.04);
    done('droplet', mb, { pitch: 0.0, gape: 0.35, raise: 0.5 }, 0.4, true);
  }
  return out;
}

/** item geometry re-expressed in a carrier's body frame at its grip point (vertices tagged PART.ITEM) */
export function carriedGeometry(item: ItemDef, carrier: AntVariant): BufferGeometry {
  const g = item.geometry.clone();
  const r = carrier.rig;
  const m = new Matrix4().makeRotationX(r.headTilt + item.carry.pitch);
  m.premultiply(new Matrix4().makeTranslation(r.grip[0], r.grip[1], r.grip[2]));
  g.applyMatrix4(m);
  const rig = g.getAttribute('aRig');
  for (let i = 0; i < rig.count; i++) rig.setX(i, PART.ITEM);
  g.boundingSphere = null; g.computeBoundingSphere();
  void Vector3;
  return g;
}
