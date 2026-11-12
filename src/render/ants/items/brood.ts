/**
 * Brood meshes (Lasius-scale nominal sizes, scaled per species and stage by the renderers): eggs (single and the
 * carried clump), C-curved segmented larva, silk cocoon with the meconium spot (formicines), naked pupa and corpse
 * baked from an adult variant (GDD 08 §11.6: myrmicine pupae are naked; corpses stay intact).
 */
import { Matrix4 } from 'three';
import { MeshBuilder, type Ring, type V3, add, cross, lin, norm, scl } from '../geometry/meshBuilder';
import { mulberry32, vnoise3 } from '../geometry/curves';
import { bakeStaticPose } from '../geometry/staticPose';
import type { AntVariant } from '../geometry/rig';
import { asItem, makeDef, mix3, type ItemDef } from './itemDef';

const EGG_WHITE = '#e9e1cc';

function eggAt(mb: MeshBuilder, p: V3, R: () => number, rings = 6, radial = 8): void {
  const ax = norm([R() - 0.5, R() - 0.5, R() - 0.5]); const up = norm([R() - 0.5, 1, R() - 0.5]);
  const lat = norm(cross(ax, up)); const up2 = norm(cross(lat, ax));
  const w = lin(EGG_WHITE);
  mb.color = [w[0] * (0.95 + R() * 0.05), w[1] * (0.95 + R() * 0.05), w[2] * (0.9 + R() * 0.05)];
  mb.ellipsoid(p, [0.17, 0.17, 0.26], rings, radial, { lat, up: up2, fwd: ax });
}

/** A sticky clump of eggs held in the mandibles (up to EGG_CLUMP_MAX 6, GDD 01 §7.3). */
export function eggClump(count = 6): ItemDef {
  const mb = new MeshBuilder(); const R = mulberry32(99); const pts: V3[] = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const p: V3 = [(R() - 0.5) * 0.55, (R() - 0.5) * 0.4, (R() - 0.5) * 0.55 + 0.25];
      if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 0.26)) { pts.push(p); break; }
    }
  }
  for (const p of pts) eggAt(mb, p, R);
  asItem(mb, 0.18);
  return makeDef('eggs', mb.toGeometry(), 0.5, { pitch: 0.2, gape: 0.25, raise: 0.6 });
}

/** One egg (0.52 x 0.34 mm for Lasius), lying. */
export function singleEgg(): ItemDef {
  const mb = new MeshBuilder(); mb.color = lin(EGG_WHITE);
  mb.ellipsoid([0, 0, 0.26], [0.17, 0.16, 0.26], 6, 10);
  asItem(mb, 0.18);
  return makeDef('egg', mb.toGeometry(), 0.52, { pitch: 0.2, gape: 0.25, raise: 0.6 });
}

/** Larva: curved (crook-neck), segmented, pale with a darker midgut, small head capsule at the narrow end. */
export function larva(): ItemDef {
  const mb = new MeshBuilder(); const pale = lin('#e8dfc8'), gut = lin('#cdb98c');
  const rings: Ring[] = [];
  const spine = (t: number): V3 => { const a = -0.25 + t * 3.4; return [0, 0.75 * Math.cos(a) - 0.1, 0.75 * Math.sin(a) * 1.15]; };
  const tan = (t: number) => norm(add(spine(Math.min(1, t + 0.01)), scl(spine(Math.max(0, t - 0.01)), -1)));
  const steps = 39;
  rings.push({ c: spine(0), t: tan(0), a: 0, b: 0, color: pale });
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; const seg = 0.94 + 0.06 * Math.cos((i % 3) / 3 * Math.PI * 2);
    const body = 0.36 * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92 + 0.12), 0.7) * (1 - 0.55 * Math.max(0, t - 0.7) / 0.3);
    const g = Math.max(0, Math.sin(t * Math.PI) - 0.3);
    rings.push({ c: spine(t), t: tan(t), a: body * seg, b: body * seg * 0.92, color: mix3(pale, gut, g * 0.6) });
  }
  rings.push({ c: spine(1), t: tan(1), a: 0, b: 0, color: pale });
  mb.loft(rings, 14);
  const hp = spine(1);
  mb.color = lin('#efe2c4'); mb.ellipsoid(add(hp, [0, 0.04, 0.05]), [0.12, 0.1, 0.11], 5, 8);
  mb.color = lin('#8a5a2a'); mb.ellipsoid(add(hp, [0.05, -0.02, 0.13]), [0.03, 0.02, 0.04], 3, 5); mb.ellipsoid(add(hp, [-0.05, -0.02, 0.13]), [0.03, 0.02, 0.04], 3, 5);
  asItem(mb, 0.28);
  // held by the middle of the body, hanging below the mandibles
  mb.transform((p) => [p[0], p[1] - 0.45, p[2] - 0.15], (q) => q);
  return makeDef('larva', mb.toGeometry(), 2.4, { pitch: -0.2, gape: 0.3, raise: 0.85 }, new Matrix4().makeRotationZ(Math.PI / 2));
}

/** Silk cocoon: spindle, silk colour noise, dark meconium spot at the posterior pole; held by the anterior end. */
export function cocoon(): ItemDef {
  const mb = new MeshBuilder(); const silk = lin('#b49c74'), silk2 = lin('#9c835e'), mec = lin('#2a2018');
  const L = 3.5, Rr = 0.7; const n = 20; const rings: Ring[] = [{ c: [0, 0, 0], t: [0, 0, 1], a: 0, b: 0, color: silk }];
  for (let i = 1; i < n; i++) {
    const t = i / n; const r = Rr * Math.pow(Math.sin(t * Math.PI), 0.62) * (1 - 0.06 * t);
    rings.push({ c: [0, 0, t * L], t: [0, 0, 1], a: r, b: r * 0.96, color: silk });
  }
  rings.push({ c: [0, 0, L], t: [0, 0, 1], a: 0, b: 0, color: silk });
  const s0 = mb.vcount; mb.loft(rings, 16);
  for (let i = s0; i < mb.vcount; i++) {
    const p = mb.p(i); const f = vnoise3(p[0] * 9, p[1] * 9, p[2] * 2.5);
    let c = mix3(silk, silk2, f);
    const spot = Math.max(0, 1 - Math.hypot(p[0], p[1] + 0.15, (p[2] - L) * 1.2) / 0.38);
    if (spot > 0) c = mix3(c, mec, Math.min(1, spot * 2.2));
    const fz = 1 + (f - 0.5) * 0.04; mb.pos[i * 3] = p[0] * fz; mb.pos[i * 3 + 1] = p[1] * fz;
    mb.col[i * 3] = c[0]; mb.col[i * 3 + 1] = c[1]; mb.col[i * 3 + 2] = c[2];
  }
  mb.beginPieceAt(s0); mb.endPiece();
  asItem(mb, 0.82);
  mb.transform((p) => [p[0], p[1], p[2] - 0.12], (q) => q);
  return makeDef('cocoon', mb.toGeometry(), 3.5, { pitch: 0.05, gape: 0.45, raise: 1.0 });
}

/** Naked (exarate) pupa of a species, held by the waist, lying lengthwise ahead of the carrier. */
export function nakedPupa(v: AntVariant): ItemDef {
  const g = bakeStaticPose(v, 'pupa', 0);
  const L = v.morph.bodyLength;
  // body frame -> item frame: centre the waist on the grip, the pupa extends forward and hangs a little low
  g.applyMatrix4(new Matrix4().makeTranslation(0, -0.16 * L, 0.29 * L));
  return makeDef(`pupa:${v.key}`, g, L * 0.97, { pitch: -0.3, gape: 0.4, raise: 1.0 }, new Matrix4().makeRotationZ(Math.PI));
}

/** Dead adult: legs curled, gaster down. Carried gripped at the waist, body hanging forward on its side. */
export function corpse(v: AntVariant): ItemDef {
  const g = bakeStaticPose(v, 'corpse', 1);
  const L = v.morph.bodyLength;
  const m = new Matrix4().makeTranslation(0, -0.08 * L, 0.32 * L).multiply(new Matrix4().makeRotationZ(1.35));
  g.applyMatrix4(m);
  return makeDef(`corpse:${v.key}`, g, L, { pitch: 0.1, gape: 0.5, raise: 1.0 }, 0);
}
