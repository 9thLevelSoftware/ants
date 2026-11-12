// Shared shape of brood and item meshes, plus small builder helpers.
import { BufferGeometry, Matrix4 } from 'three';
import { MeshBuilder, type V3, add, norm, scl } from '../geometry/meshBuilder';
import { vnoise3 } from '../geometry/curves';
import { PART } from '../geometry/rig';

/**
 * Item-local frame: mm, +Z away from the carrier, +Y up, origin = the point held between the mandibles.
 * `nominalMm` is the length the geometry was built at; renderers scale it to the real size.
 */
export interface ItemDef {
  kind: string;
  geometry: BufferGeometry;
  /** Same mesh lying on the ground: bottom on y = 0, centred on x/z (static display). */
  ground: BufferGeometry;
  nominalMm: number;
  /** Carry pose: extra pitch (rad, + = tip down), mandible gape 0..1, head raise 0..1. */
  carry: { pitch: number; gape: number; raise: number };
  transparent: boolean;
  tris: number;
}

/** Tags every vertex as PART.ITEM with the given roughness (aRig.w). */
export function asItem(mb: MeshBuilder, roughness: number): void {
  for (let i = 0; i < mb.rig.length; i += 4) { mb.rig[i] = PART.ITEM; mb.rig[i + 1] = 0; mb.rig[i + 2] = 0; mb.rig[i + 3] = roughness; }
}

/** Noise-displaced ellipsoid (crumbs, pellets, grains) with per-vertex colour. */
export function lump(mb: MeshBuilder, c: V3, r: V3, rings: number, radial: number, amp: number, freq: number, seed: number, colorFn: (p: V3, d: number) => V3): void {
  const start = mb.vcount; mb.ellipsoid(c, r, rings, radial);
  for (let i = start; i < mb.vcount; i++) {
    const p = mb.p(i); const n = norm([p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    const d = (vnoise3(p[0] * freq + seed, p[1] * freq, p[2] * freq) - 0.5) * 2 + (vnoise3(p[0] * freq * 2.7, p[1] * freq * 2.7 + seed, p[2] * freq * 2.7) - 0.5);
    const q = add(p, scl(n, d * amp));
    mb.pos[i * 3] = q[0]; mb.pos[i * 3 + 1] = q[1]; mb.pos[i * 3 + 2] = q[2];
    const col = colorFn(q, d); mb.col[i * 3] = col[0]; mb.col[i * 3 + 1] = col[1]; mb.col[i * 3 + 2] = col[2];
  }
  mb.beginPieceAt(start); mb.endPiece();
}

export const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Builds the record: carried geometry as given, ground copy rotated by `groundRot` (rad about X, or a matrix) and set on y = 0. */
export function makeDef(kind: string, geometry: BufferGeometry, nominalMm: number, carry: ItemDef['carry'], groundRot: number | Matrix4 = 0, transparent = false): ItemDef {
  geometry.computeBoundingSphere();
  const ground = geometry.clone();
  if (typeof groundRot !== 'number') ground.applyMatrix4(groundRot);
  else if (groundRot) ground.applyMatrix4(new Matrix4().makeRotationX(groundRot));
  ground.computeBoundingBox();
  const bb = ground.boundingBox!;
  ground.applyMatrix4(new Matrix4().makeTranslation(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2));
  ground.computeBoundingSphere();
  return { kind, geometry, ground, nominalMm, carry, transparent, tris: (geometry.getIndex()?.count ?? 0) / 3 };
}
