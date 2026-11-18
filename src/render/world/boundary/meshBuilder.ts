// Appends low-poly solids (box, Y-axis cylinder, ellipsoid) with a vertex colour to plain arrays, so every backdrop
// shape of a world ends up in one mesh and one draw call.
import { Color } from 'three';

export class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  /** Per vertex: 0..1 share of its own colour a shape keeps through the haze (the house facade, so its plinth and windows read from afar). */
  readonly keep: number[] = [];
  /** The `keep` value given to the vertices appended from now on. */
  keepNow = 0;
  readonly index: number[] = [];

  get vertexCount(): number { return this.positions.length / 3; }
  get triangleCount(): number { return this.index.length / 3; }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Color): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(c.r, c.g, c.b);
    this.keep.push(this.keepNow);
    return this.vertexCount - 1;
  }

  /** Box centred at (cx, cy, cz) with half extents (hx, hy, hz), rotated by `yaw` about +Y. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, c: Color): void {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const rot = (x: number, z: number): [number, number] => [x * cs + z * sn, -x * sn + z * cs];
    // each face: normal (local) and its two in-plane axes
    const faces: [number, number, number, number, number, number, number, number, number][] = [
      [1, 0, 0, 0, 0, 1, 0, 1, 0], [-1, 0, 0, 0, 0, -1, 0, 1, 0], [0, 1, 0, 1, 0, 0, 0, 0, -1],
      [0, -1, 0, 1, 0, 0, 0, 0, 1], [0, 0, 1, -1, 0, 0, 0, 1, 0], [0, 0, -1, 1, 0, 0, 0, 1, 0],
    ];
    for (const [nx, ny, nz, ux, uy, uz, vx, vy, vz] of faces) {
      const base = this.vertexCount;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = (nx + ux * su + vx * sv) * hx, ly = (ny + uy * su + vy * sv) * hy, lz = (nz + uz * su + vz * sv) * hz;
        const [wx, wz] = rot(lx, lz), [wnx, wnz] = rot(nx, nz);
        this.vertex(cx + wx, cy + ly, cz + wz, wnx, ny, wnz, c);
      }
      // counter-clockwise seen from outside: the quad order is CCW about u x v, so flip where u x v = -n
      const cx_ = uy * vz - uz * vy, cy_ = uz * vx - ux * vz, cz_ = ux * vy - uy * vx;
      if (cx_ * nx + cy_ * ny + cz_ * nz > 0) this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.index.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  /** Vertical cylinder (or tapered frustum when `rTop` is given) from y0 to y1 at (cx, cz), with a top cap. */
  cylinder(cx: number, y0: number, cz: number, r: number, y1: number, segments: number, c: Color, rTop = r): void {
    const base = this.vertexCount;
    // side normal tilts outward-up by the taper
    const slope = (r - rTop) / Math.max(1e-6, y1 - y0), nl = Math.hypot(1, slope);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      this.vertex(cx + x * r, y0, cz + z * r, x / nl, slope / nl, z / nl, c);
      this.vertex(cx + x * rTop, y1, cz + z * rTop, x / nl, slope / nl, z / nl, c);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2, b = a + 2;
      this.index.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const top = this.vertex(cx, y1, cz, 0, 1, 0, c);
    const ring = this.vertexCount;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      this.vertex(cx + Math.cos(a) * rTop, y1, cz + Math.sin(a) * rTop, 0, 1, 0, c);
    }
    for (let i = 0; i < segments; i++) this.index.push(top, ring + i + 1, ring + i);
  }

  /**
   * Ellipsoid centred at (cx, cy, cz) with radii (rx, ry, rz). `lump(ux, uy, uz)` scales the radius per direction
   * (foliage masses instead of a smooth balloon); `shade` darkens the underside by that fraction (self-shadowing).
   */
  ellipsoid(
    cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, lon: number, lat: number, c: Color,
    lump: (ux: number, uy: number, uz: number) => number = () => 1, shade = 0,
  ): void {
    const base = this.vertexCount, k = new Color();
    for (let j = 0; j <= lat; j++) {
      const t = (j / lat) * Math.PI, sy = Math.cos(t), sr = Math.sin(t);
      for (let i = 0; i <= lon; i++) {
        const a = (i / lon) * Math.PI * 2, ux = Math.cos(a) * sr, uz = Math.sin(a) * sr;
        const m = i === lon ? lump(Math.cos(0) * sr, sy, 0) : lump(ux, sy, uz); // the seam closes
        const nx = ux / rx, ny = sy / ry, nz = uz / rz, nl = Math.hypot(nx, ny, nz) || 1;
        k.copy(c).multiplyScalar(1 - shade * 0.5 * (1 - sy));
        this.vertex(cx + ux * rx * m, cy + sy * ry * m, cz + uz * rz * m, nx / nl, ny / nl, nz / nl, k);
      }
    }
    for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
      const a = base + j * (lon + 1) + i, b = a + lon + 1;
      this.index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
}
