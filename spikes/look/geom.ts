/** Small geometry helpers: variable-radius tube along a polyline/curve, ellipsoids, vertex colours. */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, IcosahedronGeometry, SphereGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Tube along a Catmull-Rom curve with radius r(t); UV u = around, v = length / (2*pi*r0) (square texels). Caps optional. */
export function tube(points: Vector3[], radius: (t: number) => number, segs: number, radial: number, caps = true, uvScale = 1): BufferGeometry {
  const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  const len = curve.getLength(); const r0 = radius(0.5) || 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; const p = curve.getPointAt(t); const N = frames.normals[i]!, B = frames.binormals[i]!; const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
      const n = new Vector3().addScaledVector(N, c).addScaledVector(B, s).normalize();
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r); nrm.push(n.x, n.y, n.z);
      uv.push(j / radial, ((t * len) / (2 * Math.PI * r0)) * uvScale);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (caps) {
    for (const end of [0, 1]) {
      const t = end; const p = curve.getPointAt(t); const T = curve.getTangentAt(t).multiplyScalar(end ? 1 : -1);
      const ci = pos.length / 3; pos.push(p.x + T.x * radius(t) * 0.3, p.y + T.y * radius(t) * 0.3, p.z + T.z * radius(t) * 0.3); nrm.push(T.x, T.y, T.z); uv.push(0.5, 0.5);
      const ring = end ? segs * (radial + 1) : 0;
      for (let j = 0; j < radial; j++) end ? idx.push(ci, ring + j, ring + j + 1) : idx.push(ci, ring + j + 1, ring + j);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

export function ellipsoid(c: Vector3, r: Vector3, detail = 16): BufferGeometry {
  const g = new SphereGeometry(1, detail * 2, detail);
  g.scale(r.x, r.y, r.z); g.translate(c.x, c.y, c.z);
  // fix normals for non-uniform scale
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const v = new Vector3(n.getX(i) / r.x, n.getY(i) / r.y, n.getZ(i) / r.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function paint(g: BufferGeometry, color: Color | [number, number, number]): BufferGeometry {
  const c = Array.isArray(color) ? new Color(...color) : color;
  const n = g.getAttribute('position').count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(a, 3));
  return g;
}

/** keep only position/normal(/color/uv) so mergeGeometries accepts the set */
export function strip(g: BufferGeometry, keep: string[] = ['position', 'normal', 'color']): BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g.index ? g : g;
}

/** Lumpy pebble: subdivided icosahedron displaced by a few random lobes, flattened. */
export function pebbleGeometry(seed: number, detail = 2): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const lobes = Array.from({ length: 6 }, () => ({ d: new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), a: (rnd() - 0.4) * 0.35 }));
  const v = new Vector3(); const zs = 0.75 + 0.25 * rnd(), ys = 0.5 + 0.25 * rnd();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 1; for (const l of lobes) r += l.a * Math.pow(Math.max(0, v.dot(l.d)), 3);
    p.setXYZ(i, v.x * r, v.y * r * ys, v.z * r * zs);
  }
  // 2-4 fracture planes: project everything beyond each plane onto it -> flat facets with crisp edges
  const cuts = 2 + Math.floor(rnd() * 3); const q = new Vector3();
  for (let c = 0; c < cuts; c++) {
    const n = new Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5).normalize(); const d = 0.55 + rnd() * 0.3;
    for (let i = 0; i < p.count; i++) { q.fromBufferAttribute(p, i); const s = q.dot(n) - d * (q.y !== 0 ? 1 : 1); if (s > 0) { q.addScaledVector(n, -s); p.setXYZ(i, q.x, q.y, q.z); } }
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const ng = mergeVertices(g, 1e-4);
  ng.computeVertexNormals();
  return ng;
}
