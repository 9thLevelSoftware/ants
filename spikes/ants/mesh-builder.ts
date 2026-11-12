/**
 * Minimal indexed mesh builder for procedural creatures and items (spike).
 * Every vertex carries: position, normal, colour (linear RGB), aRig (vec4, see ant-shader.ts), optional uv.
 * Pieces are built one at a time; `endPiece()` computes smooth area-weighted normals for that piece only,
 * so separate parts keep their own shading (no smoothing across a joint).
 */
import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from 'three';

export type V3 = [number, number, number];
export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mirrorX = (a: V3): V3 => [-a[0], a[1], a[2]];
/** rotate v about unit axis k by angle a (Rodrigues) */
export function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
export const rotX = (v: V3, a: number): V3 => rotAxis(v, [1, 0, 0], a);

export function lin(hex: string): V3 { const c = new Color(hex); return [c.r, c.g, c.b]; } // Color() converts sRGB hex -> linear

export interface Ring {
  /** centre */ c: V3;
  /** unit tangent (direction of the spine) */ t: V3;
  /** half extent along `lat` */ a: number;
  /** half extent along up = cross(t, lat) */ b: number;
  /** superellipse exponent, 2 = ellipse */ e?: number;
  /** vertical offset of the section's lower half (flattens the ventral side when < 1) */ lower?: number;
  color?: V3; rig?: [number, number, number, number];
}

export class MeshBuilder {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; rig: number[] = []; uv: number[] = []; idx: number[] = [];
  color: V3 = [1, 1, 1];
  rigV: [number, number, number, number] = [0, 0, 0, 0];
  private pv0 = 0; private pi0 = 0;
  get vcount() { return this.pos.length / 3; }

  vert(p: V3, n: V3 = [0, 1, 0], uv: [number, number] = [0, 0], color = this.color, rig = this.rigV): number {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]);
    this.col.push(color[0], color[1], color[2]); this.rig.push(rig[0], rig[1], rig[2], rig[3]); this.uv.push(uv[0], uv[1]);
    return this.vcount - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }

  beginPiece() { this.pv0 = this.vcount; this.pi0 = this.idx.length; }
  /** re-open the piece that starts at vertex v0 (e.g. to recompute normals after displacing it) */
  beginPieceAt(v0: number) { this.pv0 = v0; let i = 0; while (i < this.idx.length && this.idx[i]! < v0) i += 3; this.pi0 = i; }
  /** smooth normals over the current piece (area weighted). keepNormals: leave the given normals */
  endPiece(keepNormals = false) {
    if (keepNormals) return;
    const v0 = this.pv0, n = this.vcount - v0; const acc = new Float64Array(n * 3);
    for (let i = this.pi0; i < this.idx.length; i += 3) {
      const a = this.idx[i]!, b = this.idx[i + 1]!, c = this.idx[i + 2]!;
      const pa = this.p(a), pb = this.p(b), pc = this.p(c);
      const fn = cross(sub(pb, pa), sub(pc, pa));
      for (const k of [a, b, c]) { const o = (k - v0) * 3; acc[o] += fn[0]; acc[o + 1] += fn[1]; acc[o + 2] += fn[2]; }
    }
    for (let i = 0; i < n; i++) {
      const o = i * 3; const l = Math.hypot(acc[o]!, acc[o + 1]!, acc[o + 2]!);
      if (l > 1e-12) { this.nrm[(v0 + i) * 3] = acc[o]! / l; this.nrm[(v0 + i) * 3 + 1] = acc[o + 1]! / l; this.nrm[(v0 + i) * 3 + 2] = acc[o + 2]! / l; }
    }
  }
  p(i: number): V3 { return [this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!]; }

  /**
   * Loft closed superellipse sections along a spine. `lat` is the lateral unit axis of every section
   * (for bilateral body parts: +X). Rings with a = b = 0 become single pole vertices.
   * Winding: outward faces when up = cross(t, lat) (right-handed lat, up, t).
   */
  loft(rings: Ring[], radial: number, lat: V3 = [1, 0, 0]) {
    this.beginPiece();
    const ids: number[][] = [];
    for (const r of rings) {
      const color = r.color ?? this.color, rig = r.rig ?? this.rigV;
      if (r.a <= 1e-9 && r.b <= 1e-9) { ids.push([this.vert(r.c, r.t, [0, 0], color, rig)]); continue; }
      const up = norm(cross(r.t, lat)); const l2 = norm(cross(up, r.t)); const e = r.e ?? 2; const row: number[] = [];
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2; const c = Math.cos(th), s = Math.sin(th);
        const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / e), sy = Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
        const yb = sy < 0 ? r.b * (r.lower ?? 1) : r.b;
        row.push(this.vert(add(r.c, add(scl(l2, r.a * sx), scl(up, yb * sy))), [0, 1, 0], [j / radial, 0], color, rig));
      }
      ids.push(row);
    }
    for (let i = 0; i + 1 < ids.length; i++) {
      const A = ids[i]!, B = ids[i + 1]!;
      if (A.length === 1 && B.length === 1) continue;
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        const a = A.length === 1 ? A[0]! : A[j]!, b = A.length === 1 ? A[0]! : A[j1]!;
        const c = B.length === 1 ? B[0]! : B[j]!, d = B.length === 1 ? B[0]! : B[j1]!;
        if (A.length > 1) this.tri(a, b, c);
        if (B.length > 1) this.tri(b, d, c);
      }
    }
    this.endPiece();
  }

  /** ellipsoid with semi-axes along the given orthonormal frame (lat, up, fwd) */
  ellipsoid(c: V3, r: V3, rings: number, radial: number, frame?: { lat: V3; up: V3; fwd: V3 }, e = 2) {
    const f = frame ?? { lat: [1, 0, 0] as V3, up: [0, 1, 0] as V3, fwd: [0, 0, 1] as V3 };
    const rs: Ring[] = [];
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * Math.PI; const z = -Math.cos(th), s = Math.sin(th);
      rs.push({ c: add(c, scl(f.fwd, z * r[2])), t: f.fwd, a: s * r[0], b: s * r[1], e });
    }
    this.loft(rs, radial, f.lat);
  }

  /**
   * Tube along +X (segment-local frame used by legs): profile = list of [u, ry, rz]; y/z radii.
   * Ends are capped with pole vertices.
   */
  tubeX(profile: [number, number, number][], radial: number, caps = true) {
    const rings: Ring[] = [];
    const first = profile[0]!, last = profile[profile.length - 1]!;
    if (caps) rings.push({ c: [first[0], 0, 0], t: [1, 0, 0], a: 0, b: 0 });
    for (const [u, ry, rz] of profile) rings.push({ c: [u, 0, 0], t: [1, 0, 0], a: rz, b: ry });
    if (caps) rings.push({ c: [last[0], 0, 0], t: [1, 0, 0], a: 0, b: 0 });
    // lat = +Z, up = cross(X, Z) = -Y: right-handed (lat, up, t)
    this.loft(rings, radial, [0, 0, 1]);
  }

  /** generic tube along a polyline of centres with radii (circular sections); lat chosen per segment */
  tubePath(pts: V3[], radii: number[], radial: number, capStart = true, capEnd = true) {
    const rings: Ring[] = []; const n = pts.length;
    const tan = (i: number) => norm(sub(pts[Math.min(i + 1, n - 1)]!, pts[Math.max(i - 1, 0)]!));
    // one consistent lateral axis: perpendicular to the first tangent, parallel transported
    let lat = norm(cross(tan(0), Math.abs(tan(0)[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const frames: { t: V3; lat: V3 }[] = [];
    for (let i = 0; i < n; i++) { const t = tan(i); lat = norm(sub(lat, scl(t, dot(lat, t)))); frames.push({ t, lat }); }
    // loft() takes one lat for all rings; build rings in a common lat by giving each ring its own lat via a/b swap trick is
    // not possible, so emit the tube ring by ring with a local loft of 2 rings (keeps the code small; caps added below)
    this.beginPiece();
    const ids: number[][] = [];
    if (capStart) ids.push([this.vert(pts[0]!, scl(tan(0), -1))]);
    for (let i = 0; i < n; i++) {
      const { t, lat: l } = frames[i]!; const up = norm(cross(t, l)); const l2 = norm(cross(up, t)); const row: number[] = [];
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        row.push(this.vert(add(pts[i]!, add(scl(l2, radii[i]! * Math.cos(th)), scl(up, radii[i]! * Math.sin(th))))));
      }
      ids.push(row);
    }
    if (capEnd) ids.push([this.vert(pts[n - 1]!, tan(n - 1))]);
    for (let i = 0; i + 1 < ids.length; i++) {
      const A = ids[i]!, B = ids[i + 1]!;
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        const a = A.length === 1 ? A[0]! : A[j]!, b = A.length === 1 ? A[0]! : A[j1]!;
        const c = B.length === 1 ? B[0]! : B[j]!, d = B.length === 1 ? B[0]! : B[j1]!;
        if (A.length > 1) this.tri(a, b, c);
        if (B.length > 1) this.tri(b, d, c);
      }
    }
    this.endPiece();
  }

  /** thin 3-sided pyramid (a seta): base centre, direction, length, base radius. Normal = given surface normal */
  hair(base: V3, dir: V3, length: number, r: number, surfN: V3) {
    const d = norm(dir); const a = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); const b = cross(d, a);
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
      const th = (k / 3) * Math.PI * 2;
      ids.push(this.vert(add(base, add(scl(a, r * Math.cos(th)), scl(b, r * Math.sin(th)))), surfN));
    }
    // slightly curved: tip bent toward the surface tangent
    const tip = this.vert(add(base, scl(d, length)), norm(add(surfN, scl(d, 0.5))));
    for (let k = 0; k < 3; k++) this.tri(ids[k]!, ids[(k + 1) % 3]!, tip);
  }

  /** flat polygon (star-shaped about its first point = centre) extruded symmetrically by thickness(i) along `n` */
  slab(center: V3, outline: V3[], n: V3, thick: (i: number) => number, thickC: number) {
    this.beginPiece();
    const m = outline.length;
    const top = this.vert(add(center, scl(n, thickC / 2)), n), bot = this.vert(add(center, scl(n, -thickC / 2)), scl(n, -1));
    const T: number[] = [], B: number[] = [];
    for (let i = 0; i < m; i++) { T.push(this.vert(add(outline[i]!, scl(n, thick(i) / 2)))); B.push(this.vert(add(outline[i]!, scl(n, -thick(i) / 2)))); }
    // orientation: detect whether the outline is CCW seen from +n and emit outward-facing triangles either way
    let area = 0;
    for (let i = 0; i < m; i++) area += dot(cross(sub(outline[i]!, center), sub(outline[(i + 1) % m]!, center)), n);
    const t3 = area >= 0 ? (a: number, b: number, c: number) => this.tri(a, b, c) : (a: number, b: number, c: number) => this.tri(a, c, b);
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      t3(top, T[i]!, T[j]!); t3(bot, B[j]!, B[i]!);
      t3(T[i]!, B[i]!, B[j]!); t3(T[i]!, B[j]!, T[j]!);
    }
    this.endPiece();
  }

  /** append another builder (used for mirroring) */
  append(o: MeshBuilder) {
    const off = this.vcount;
    this.pos.push(...o.pos); this.nrm.push(...o.nrm); this.col.push(...o.col); this.rig.push(...o.rig); this.uv.push(...o.uv);
    for (const i of o.idx) this.idx.push(i + off);
  }

  /** mirror copy: map(x) applied to positions and normals; flips winding (reflection) */
  mirrored(axis: 0 | 1 | 2, rigMap?: (r: number[]) => number[]): MeshBuilder {
    const m = new MeshBuilder();
    m.pos = this.pos.slice(); m.nrm = this.nrm.slice(); m.col = this.col.slice(); m.uv = this.uv.slice(); m.rig = this.rig.slice();
    for (let i = axis; i < m.pos.length; i += 3) { m.pos[i] = -m.pos[i]!; m.nrm[i] = -m.nrm[i]!; }
    if (rigMap) for (let i = 0; i < m.rig.length; i += 4) { const r = rigMap(m.rig.slice(i, i + 4)); for (let k = 0; k < 4; k++) m.rig[i + k] = r[k]!; }
    for (let i = 0; i < this.idx.length; i += 3) m.idx.push(this.idx[i]!, this.idx[i + 2]!, this.idx[i + 1]!);
    return m;
  }

  /** transform all vertices in place by fn (position) and fnN (normal) */
  transform(fn: (p: V3, i: number) => V3, fnN: (n: V3, i: number) => V3) {
    for (let i = 0; i < this.vcount; i++) {
      const p = fn(this.p(i), i); const n = fnN([this.nrm[i * 3]!, this.nrm[i * 3 + 1]!, this.nrm[i * 3 + 2]!], i);
      this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2];
      this.nrm[i * 3] = n[0]; this.nrm[i * 3 + 1] = n[1]; this.nrm[i * 3 + 2] = n[2];
    }
  }
  setRigAll(r: [number, number, number, number]) { for (let i = 0; i < this.rig.length; i += 4) for (let k = 0; k < 4; k++) this.rig[i + k] = r[k]!; }

  toGeometry(opts: { uv?: boolean; rig?: boolean; bounds?: Sphere } = {}): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    if (opts.rig !== false) g.setAttribute('aRig', new BufferAttribute(new Float32Array(this.rig), 4));
    if (opts.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    const n = this.vcount;
    g.setIndex(new BufferAttribute(n < 65536 ? new Uint16Array(this.idx) : new Uint32Array(this.idx), 1));
    if (opts.bounds) g.boundingSphere = opts.bounds; else g.computeBoundingSphere();
    return g;
  }
}

export const sphere = (center: V3, r: number) => new Sphere(new Vector3(center[0], center[1], center[2]), r);
