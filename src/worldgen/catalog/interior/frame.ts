// Wall frames: building parts are laid out in (a, y, n) wall coordinates — a along a wall, y height, n the
// distance from the wall face into the room — and converted to world-axis-aligned primitives. Walls of the house
// are axis-aligned, so every box stays an unrotated box. A template builder collects primitives, climb routes and
// POIs in world space and emits an ObjectTemplate relative to an object origin (placed with yaw 0).

import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRouteKind, MaterialId, PoiKind } from '@/sim/types';
import type { ObjectTemplate, PrimSpec } from '../../kit';
import { spanBox } from './prims';

/** Unit horizontal axis (one of +-x, +-z). */
export interface Axis2 { x: number; z: number }

export class WallFrame {
  /** World point (x, z) of a = 0, n = 0; along-axis A and normal N (into the room). */
  constructor(readonly ox: number, readonly oz: number, readonly A: Axis2, readonly N: Axis2) {}

  /** World x, z of wall coordinates (a, n). */
  x(a: number, n: number): number { return this.ox + a * this.A.x + n * this.N.x; }
  z(a: number, n: number): number { return this.oz + a * this.A.z + n * this.N.z; }

  /** World point. */
  p(a: number, y: number, n: number): Vec3 { return { x: this.x(a, n), y, z: this.z(a, n) }; }

  /** World direction of (da, dy, dn). */
  dir(da: number, dy: number, dn: number): Vec3 {
    return { x: da * this.A.x + dn * this.N.x, y: dy, z: da * this.A.z + dn * this.N.z };
  }

  /** Frame of another wall: origin at (a, n), axes given in this frame's terms. */
  sub(a: number, n: number, A: Axis2, N: Axis2): WallFrame { return new WallFrame(this.x(a, n), this.z(a, n), A, N); }

  /** World axis for a frame-relative direction (+-1 along A or N). */
  axis(da: number, dn: number): Axis2 { return { x: da * this.A.x + dn * this.N.x, z: da * this.A.z + dn * this.N.z }; }

  /** World rect of the span (for planning and lane maps). */
  rect(a0: number, a1: number, n0: number, n1: number): { x0: number; x1: number; z0: number; z1: number } {
    const xa = this.x(a0, n0), xb = this.x(a1, n1), za = this.z(a0, n0), zb = this.z(a1, n1);
    return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) };
  }
}

/** Collects world-space parts of one object and emits its template relative to an origin. */
export class TemplateBuilder {
  readonly prims: PrimSpec[] = [];
  readonly routes: { kind: ClimbRouteKind; points: Vec3[] }[] = [];
  readonly pois: { kind: PoiKind; pos: Vec3 }[] = [];

  constructor(readonly id: string, readonly tags: string[]) {}

  /** World-space box in wall coordinates. */
  box(f: WallFrame, a0: number, a1: number, y0: number, y1: number, n0: number, n1: number, material: MaterialId, flags: number, round = 0): PrimSpec {
    const r = f.rect(a0, a1, n0, n1);
    const p = spanBox(r.x0, r.x1, y0, y1, r.z0, r.z1, material, flags, round);
    this.prims.push(p);
    return p;
  }

  add(p: PrimSpec): PrimSpec { this.prims.push(p); return p; }
  route(kind: ClimbRouteKind, points: Vec3[]): void { this.routes.push({ kind, points }); }
  poi(kind: PoiKind, pos: Vec3): void { this.pois.push({ kind, pos }); }

  /** Template with every position made relative to the origin (x, z at y = 0). */
  template(ox: number, oz: number): ObjectTemplate {
    const rel = (v: Vec3): Vec3 => ({ x: v.x - ox, y: v.y, z: v.z - oz });
    return {
      id: this.id, tags: [...this.tags],
      prims: this.prims.map((p) => ({ ...p, pos: rel(p.pos) })),
      routes: this.routes.map((r) => ({ kind: r.kind, points: r.points.map(rel) })),
      pois: this.pois.map((q) => ({ kind: q.kind, pos: rel(q.pos) })),
    };
  }

  /** Origin at the centre of the prims' footprint (bounding rect of the positions). */
  centre(): { x: number; z: number } {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of this.prims) {
      x0 = Math.min(x0, p.pos.x - p.size.x); x1 = Math.max(x1, p.pos.x + p.size.x);
      z0 = Math.min(z0, p.pos.z - p.size.z); z1 = Math.max(z1, p.pos.z + p.size.z);
    }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }
}
