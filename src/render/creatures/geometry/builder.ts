/**
 * Mesh builder for creatures: the ants' MeshBuilder (src/render/ants/geometry/meshBuilder.ts, reused unchanged) plus
 * one more per-vertex attribute, `aPivot` (hinge point xyz + side), and the small part library every creature is
 * assembled from (segmented bodies, jointed legs, antennae, eyes, wings).
 *
 * Body frame (same as the ants, binding for the shader): mm, +Y up, +Z forward (head), +X = the animal's left,
 * origin on the ground under the body centre. Geometry is built at true size.
 *
 * Per-vertex rig (see shader/creatureChunk.ts):
 *   aRig   x part id (PART), y gait phase offset (cycles), z axial coordinate (mm along Z; legs use their hip's),
 *          w raise weight (wind-up: front legs / raised abdomen)
 *   aPivot xyz hinge (mm, body frame), w side (+1 left, -1 right, 0 midline)
 *   aFoot  legs: the foot's offset from the hip in the ground plane (x, z mm, rest pose); 0 elsewhere. The shader
 *          plants the foot from it (gait.ts).
 */
import { BufferAttribute, type BufferGeometry } from 'three';
import { MeshBuilder, add, norm, scl, sub, type Ring, type V3 } from '@/render/ants/geometry/meshBuilder';
import { curve } from '@/render/ants/geometry/curves';

/** Part ids read by the shader. */
export const PART = {
  BODY: 0, LEG: 1, WING: 2, FLEX: 3, JAW: 4, SOFT: 5, TENTACLE: 6, ANTENNA: 7, HINDWING: 8,
} as const;

/** 0 = near (full detail), 1 = mid, 2 = far (minimal). */
export type Detail = 0 | 1 | 2;

export type Rig4 = [number, number, number, number];

export class CreatureBuilder extends MeshBuilder {
  piv: number[] = [];
  pivV: Rig4 = [0, 0, 0, 0];
  foot: number[] = [];
  footV: [number, number] = [0, 0];

  override vert(p: V3, n?: V3, uv?: [number, number], color?: V3, rig?: Rig4): number {
    const i = super.vert(p, n, uv, color, rig);
    this.piv.push(this.pivV[0], this.pivV[1], this.pivV[2], this.pivV[3]);
    this.foot.push(this.footV[0], this.footV[1]);
    return i;
  }

  /** Sets the part and pivot used by the next vertices (and clears the foot offset; leg() sets its own). */
  part(part: number, pivot: V3 = [0, 0, 0], side = 0, phaseOff = 0, axial = pivot[2], raise = 0): this {
    this.rigV = [part, phaseOff, axial, raise];
    this.pivV = [pivot[0], pivot[1], pivot[2], side];
    this.footV = [0, 0];
    return this;
  }

  /** Re-colours vertices [v0, vcount) with fn(position, normal). */
  recolor(v0: number, fn: (p: V3, n: V3) => V3): void {
    for (let i = v0; i < this.vcount; i++) {
      const c = fn(this.p(i), [this.nrm[i * 3]!, this.nrm[i * 3 + 1]!, this.nrm[i * 3 + 2]!]);
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    }
  }

  /**
   * Appends a mirror image (x -> -x) of `o` (positions, normals, pivots, sides; winding flipped). Mirrored legs are
   * half a cycle out of phase with their left partner (tripods, tetrapods, left-right alternation of myriapods).
   */
  appendMirrorX(o: CreatureBuilder, legPhaseShift = 0.5): void {
    const off = this.vcount;
    for (let i = 0; i < o.vcount; i++) {
      this.pos.push(-o.pos[i * 3]!, o.pos[i * 3 + 1]!, o.pos[i * 3 + 2]!);
      this.nrm.push(-o.nrm[i * 3]!, o.nrm[i * 3 + 1]!, o.nrm[i * 3 + 2]!);
      this.col.push(o.col[i * 3]!, o.col[i * 3 + 1]!, o.col[i * 3 + 2]!);
      this.uv.push(o.uv[i * 2]!, o.uv[i * 2 + 1]!);
      const isLeg = o.rig[i * 4] === PART.LEG;
      const ph = isLeg ? (o.rig[i * 4 + 1]! + legPhaseShift) % 1 : o.rig[i * 4 + 1]!;
      this.rig.push(o.rig[i * 4]!, ph, o.rig[i * 4 + 2]!, o.rig[i * 4 + 3]!);
      this.piv.push(-o.piv[i * 4]!, o.piv[i * 4 + 1]!, o.piv[i * 4 + 2]!, -o.piv[i * 4 + 3]!);
      this.foot.push(-o.foot[i * 2]!, o.foot[i * 2 + 1]!);
    }
    for (let i = 0; i < o.idx.length; i += 3) this.idx.push(o.idx[i]! + off, o.idx[i + 2]! + off, o.idx[i + 1]! + off);
  }

  /** Appends `o` unchanged. */
  appendAll(o: CreatureBuilder): void {
    super.append(o);
    this.piv.push(...o.piv);
    this.foot.push(...o.foot);
  }

  get triangles(): number { return this.idx.length / 3; }

  toCreatureGeometry(): BufferGeometry {
    const g = this.toGeometry();
    g.setAttribute('aPivot', new BufferAttribute(new Float32Array(this.piv), 4));
    g.setAttribute('aFoot', new BufferAttribute(new Float32Array(this.foot), 2));
    return g;
  }
}

// ---------------------------------------------------------------- bodies

export interface BodySpec {
  /** z of the tail and head ends, mm. */
  zTail: number; zHead: number;
  /** Rows [u (0 tail .. 1 head), half width, half height, centre y]: smooth profile through them. */
  rows: number[][];
  /** Ring count at detail 0 (scaled down for 1 and 2) and radial sections per detail. */
  rings: number; radial: [number, number, number];
  /** Superellipse exponent (2 = ellipse; > 2 squarer). */
  e?: number;
  /** Ventral flattening (lower half height factor). */
  lower?: number;
  /** Segment constrictions: count and depth (fraction of radius), detail 0-1 only. */
  segments?: number; segDepth?: number;
  /** Part id (BODY rigid, FLEX undulating, SOFT retracting) and raise weight for vertices with u above raiseFrom. */
  part?: number; pivot?: V3; raiseFrom?: number; raiseTo?: number; raiseW?: number;
  color: (p: V3, n: V3, u: number) => V3;
  /** Close the ends with poles (default true). */
  caps?: boolean;
}

const RING_SCALE: [number, number, number] = [1, 0.5, 0.25];

/** A closed loft along Z; returns the first vertex index. */
export function body(b: CreatureBuilder, d: Detail, s: BodySpec): number {
  const v0 = b.vcount;
  const n = Math.max(4, Math.round(s.rings * RING_SCALE[d]));
  const segs = d < 2 ? (s.segments ?? 0) : 0;
  const rings: Ring[] = [];
  const caps = s.caps !== false;
  const part = s.part ?? PART.BODY;
  const pivot = s.pivot ?? [0, 0, 0];
  b.part(part, pivot, 0);
  const rigAt = (z: number, u: number): Rig4 => {
    let w = 0;
    if (s.raiseW && s.raiseFrom !== undefined) w = s.raiseW * Math.min(1, Math.max(0, (u - s.raiseFrom) / ((s.raiseTo ?? 1) - s.raiseFrom || 1)));
    return [part, 0, z, w];
  };
  const at = (u: number): Ring => {
    const [a, hb, yc] = curve(s.rows, u) as [number, number, number];
    let k = 1;
    if (segs > 0) k = 1 - (s.segDepth ?? 0.08) * Math.pow(Math.abs(Math.cos(Math.PI * segs * u)), 6);
    const z = s.zTail + (s.zHead - s.zTail) * u;
    return { c: [0, yc, z], t: [0, 0, 1], a: Math.max(0, a * k), b: Math.max(0, hb * k), e: s.e ?? 2, lower: s.lower ?? 1, rig: rigAt(z, u) };
  };
  if (caps) { const r = at(0); rings.push({ ...r, a: 0, b: 0 }); }
  // with segments, sample densely enough to resolve each constriction
  const count = segs > 0 ? Math.max(n, segs * (d === 0 ? 4 : 2)) : n;
  for (let i = 0; i <= count; i++) rings.push(at(i / count));
  if (caps) { const r = at(1); rings.push({ ...r, a: 0, b: 0 }); }
  b.loft(rings, s.radial[d], [1, 0, 0]);
  const zs = s.zHead - s.zTail;
  b.recolor(v0, (p, nn) => s.color(p, nn, Math.min(1, Math.max(0, (p[2] - s.zTail) / (zs || 1)))));
  return v0;
}

/** An ellipsoid part (eye, head capsule, shell knob) with its own colour. */
export function blob(b: CreatureBuilder, d: Detail, c: V3, r: V3, color: V3, rings = 8, radial = 10): void {
  const k = RING_SCALE[d];
  b.color = color;
  b.ellipsoid(c, r, Math.max(3, Math.round(rings * k)), Math.max(4, Math.round(radial * Math.max(k, 0.4))));
}

// ---------------------------------------------------------------- legs

export interface LegSpec {
  hip: V3;
  /** Direction in the ground plane, degrees from +X (left) toward +Z (forward). */
  yawDeg: number;
  /** Horizontal reach hip -> foot, mm; knee position (fraction of reach) and height above the hip, mm. */
  reach: number; kneeAt: number; kneeUp: number;
  /** Optional second joint (spiders: patella / metatarsus): fraction of reach and height above ground. */
  ankleAt?: number; ankleY?: number;
  radius: number;
  phase: number;
  raise?: number;
  color: V3;
  /** Foot colour (tarsus). */
  tip?: V3;
}

/** A jointed leg on the left side (mirror for the right). */
export function leg(b: CreatureBuilder, d: Detail, s: LegSpec): void {
  const yaw = (s.yawDeg * Math.PI) / 180;
  const dir: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const at = (f: number, y: number): V3 => [s.hip[0] + dir[0] * s.reach * f, y, s.hip[2] + dir[2] * s.reach * f];
  const r = s.radius;
  const knee = at(s.kneeAt, s.hip[1] + s.kneeUp);
  const foot = at(1, r * 0.6);
  // far detail: one straight stick per leg (6 triangles)
  const pts: V3[] = d === 2 ? [s.hip] : [s.hip, knee];
  const radii = d === 2 ? [r] : [r, r * 0.9];
  if (d < 2 && s.ankleAt !== undefined) { pts.push(at(s.ankleAt, s.ankleY ?? r * 2)); radii.push(r * 0.7); }
  pts.push(foot); radii.push(r * 0.45);
  b.part(PART.LEG, s.hip, 1, s.phase, s.hip[2], s.raise ?? 0);
  b.footV = [foot[0] - s.hip[0], foot[2] - s.hip[2]];
  b.color = s.color;
  const v0 = b.vcount;
  b.tubePath(pts, radii, d === 0 ? 5 : 3, false, d < 2);
  if (s.tip) { const tip = s.tip; const last = pts[pts.length - 2]!; const L = sub(foot, last); b.recolor(v0, (p) => (dotN(sub(p, last), L) > 0.55 ? tip : s.color)); }
}

const dotN = (a: V3, l: V3): number => { const ll = l[0] * l[0] + l[1] * l[1] + l[2] * l[2] || 1; return (a[0] * l[0] + a[1] * l[1] + a[2] * l[2]) / ll; };

/** Builds the left legs with `fn` into a scratch builder and appends them plus their mirror image. */
export function bilateral(b: CreatureBuilder, fn: (side: CreatureBuilder) => void): void {
  const s = new CreatureBuilder();
  fn(s);
  b.appendAll(s);
  b.appendMirrorX(s);
}

/** A thin curved feeler from `socket` through `pts` (left side), part ANTENNA (sways) unless given. */
export function feeler(b: CreatureBuilder, d: Detail, socket: V3, pts: V3[], r: number, color: V3, part: number = PART.ANTENNA): void {
  if (d === 2) return;
  b.part(part, socket, 1, 0, socket[2]);
  b.color = color;
  const all = [socket, ...pts];
  const radii = all.map((_, i) => r * (1 - 0.55 * (i / Math.max(1, all.length - 1))));
  b.tubePath(all, radii, d === 0 ? 4 : 3, false, true);
}

/** A flat wing (double-sided membrane slab) hinged at `hinge`, lying back along -Z over the body. */
export function wing(b: CreatureBuilder, d: Detail, hinge: V3, length: number, width: number, color: V3, part: number = PART.WING, lift = 0.05): void {
  b.part(part, hinge, 1, 0, hinge[2]);
  b.color = color;
  const m = d === 0 ? 10 : 6;
  const outline: V3[] = [];
  for (let i = 0; i < m; i++) {
    const t = (i / (m - 1)) * Math.PI;
    // teardrop: narrow at the hinge, broadest at 60 %, rounded tip; laid along -Z, slightly to the side (+X)
    const u = (1 - Math.cos(t)) / 2;
    const half = width * 0.5 * Math.sin(Math.PI * Math.pow(u, 0.8));
    outline.push([hinge[0] + width * 0.35 * u + half, hinge[1] + lift * u, hinge[2] - length * u]);
  }
  for (let i = m - 2; i > 0; i--) {
    const t = (i / (m - 1)) * Math.PI; const u = (1 - Math.cos(t)) / 2;
    const half = width * 0.5 * Math.sin(Math.PI * Math.pow(u, 0.8));
    outline.push([hinge[0] + width * 0.35 * u - half * 0.6, hinge[1] + lift * u, hinge[2] - length * u]);
  }
  const center = scl(add(outline[0]!, outline[m - 1]!), 0.5);
  b.slab(center, outline, norm([0, 1, 0]), () => Math.max(0.01, width * 0.015), Math.max(0.01, width * 0.015));
}

/** Short spines / setae along a direction from base points (hairy caterpillars, spiders). */
export function setae(b: CreatureBuilder, bases: { p: V3; n: V3 }[], len: number, r: number, color: V3): void {
  b.color = color;
  for (const s of bases) b.hair(s.p, s.n, len, r, s.n);
}
