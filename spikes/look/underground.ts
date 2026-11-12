/**
 * Underground look: a hand-built nest cavity (entrance funnel -> descending tunnel -> brood chamber).
 *
 * The cavity is defined like the production field f(p) (positive in free space, design seed §3):
 *   f = max(y - surface, fCavity),  fCavity = smooth union of a tunnel capsule chain and a flat-bottomed chamber,
 * plus a little 3D noise, and polygonised with naive surface nets (production uses marching cubes on the carve grid;
 * the iso-surface and shading are the same). Per-vertex attributes:
 *   aDepth.x = path length (mm) from the entrance along the tunnel -> daylight falls off as exp(-d / uDayL)
 *   aDepth.y = cheap SDF ambient occlusion (crevices, tunnel/chamber junction)
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, Points, ShaderMaterial, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, vnoise3, clamp } from './rng';
import { surface, U } from './shaders';
import type { TextureSet } from './textures';
import { ellipsoid, paint, strip, tube } from './geom';

const PATH = [
  new Vector3(14, -68, -10), new Vector3(24, -63, -34), new Vector3(36, -50, -56), new Vector3(48, -33, -76),
  new Vector3(55, -16, -96), new Vector3(58, -2, -112), new Vector3(59, 12, -122),
];
const ENTRANCE_IDX = 5; // PATH[5] is at ground level
const CH = { c: new Vector3(0, -70, 0), rx: 30, rz: 24, up: 12, down: 7 };
const TUN_R = 4.4;

const smax = (a: number, b: number, k: number) => { const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h); };

function segDist(p: Vector3, a: Vector3, b: Vector3): { d: number; t: number } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
  const dx = p.x - (a.x + abx * t), dy = p.y - (a.y + aby * t), dz = p.z - (a.z + abz * t);
  return { d: Math.hypot(dx, dy, dz), t };
}
const segLen = PATH.slice(1).map((p, i) => p.distanceTo(PATH[i]!));
const cumLen = [0]; for (const l of segLen) cumLen.push(cumLen[cumLen.length - 1]! + l);

/** free-space field (mm, positive in the cavity / air) */
export function fieldU(p: Vector3): number {
  // chamber: flat-bottomed ellipsoid (pseudo distance)
  const dy = p.y - CH.c.y; const ry = dy > 0 ? CH.up : CH.down;
  const q = Math.hypot((p.x - CH.c.x) / CH.rx, dy / ry, (p.z - CH.c.z) / CH.rz);
  const fCh = (1 - q) * Math.min(CH.rx, CH.rz, ry) * 0.9;
  let fT = -1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const { d, t } = segDist(p, PATH[i]!, PATH[i + 1]!);
    const r = TUN_R * (i >= ENTRANCE_IDX - 1 ? 1 + 0.9 * clamp((p.y + 12) / 20, 0, 1) : 1) + (i === 0 ? 1.5 * (1 - t) : 0); // funnel out at the entrance
    fT = Math.max(fT, r - d);
  }
  let f = smax(fCh, fT, 4);
  const n = (vnoise3(p.x / 3.2, p.y / 3.2, p.z / 3.2, 5) - 0.5) * 1.4 + (vnoise3(p.x / 1.1, p.y / 1.1, p.z / 1.1, 9) - 0.5) * 0.45;
  f += n;
  const ground = p.y - 0.6 * Math.sin(p.x / 9) * Math.cos(p.z / 11); // the surface (y = 0) is air above
  return Math.max(f, ground);
}

function pathDistance(p: Vector3): number {
  // arc length from the entrance (PATH[ENTRANCE_IDX]) to the closest point of the path, + offset in the chamber
  let best = 1e9, s = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const { d, t } = segDist(p, PATH[i]!, PATH[i + 1]!);
    if (d < best) { best = d; s = cumLen[i]! + t * segLen[i]!; }
  }
  const sEnt = cumLen[ENTRANCE_IDX]!;
  let dist = Math.max(0, sEnt - s);
  if (p.y > -2) dist = 0;
  const dc = p.distanceTo(CH.c); if (dc < 34) dist = Math.max(dist, sEnt + Math.max(0, dc - 8) * 0.6);
  return dist;
}

/** naive surface nets on f(p) = 0 over a box; faces oriented so normals point into free space */
function surfaceNets(f: (p: Vector3) => number, min: Vector3, max: Vector3, cell: number) {
  const nx = Math.ceil((max.x - min.x) / cell), ny = Math.ceil((max.y - min.y) / cell), nz = Math.ceil((max.z - min.z) / cell);
  const sx = nx + 1, sy = ny + 1;
  const vals = new Float32Array(sx * sy * (nz + 1)); const p = new Vector3();
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    p.set(min.x + i * cell, min.y + j * cell, min.z + k * cell); vals[i + sx * (j + sy * k)] = f(p);
  }
  const V = (i: number, j: number, k: number) => vals[i + sx * (j + sy * k)]!;
  const cellVert = new Int32Array(nx * ny * nz).fill(-1); const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] as const;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = corners.map(([a, b, d]) => V(i + a, j + b, k + d));
    let mask = 0; c.forEach((v, n) => { if (v > 0) mask |= 1 << n; });
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, cnt = 0;
    for (const [e0, e1] of edges) {
      const v0 = c[e0]!, v1 = c[e1]!; if ((v0 > 0) === (v1 > 0)) continue;
      const t = v0 / (v0 - v1); const A = corners[e0]!, B = corners[e1]!;
      ax += A[0] + (B[0] - A[0]) * t; ay += A[1] + (B[1] - A[1]) * t; az += A[2] + (B[2] - A[2]) * t; cnt++;
    }
    cellVert[i + nx * (j + ny * k)] = pos.length / 3;
    pos.push(min.x + (i + ax / cnt) * cell, min.y + (j + ay / cnt) * cell, min.z + (k + az / cnt) * cell);
  }
  const idx: number[] = []; const CV = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : cellVert[i + nx * (j + ny * k)]!);
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {   // x edges
    const v0 = V(i, j, k), v1 = V(i + 1, j, k); if ((v0 > 0) === (v1 > 0)) continue;
    quad(CV(i, j - 1, k - 1), CV(i, j, k - 1), CV(i, j, k), CV(i, j - 1, k), v0 > 0);
  }
  for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {   // y edges
    const v0 = V(i, j, k), v1 = V(i, j + 1, k); if ((v0 > 0) === (v1 > 0)) continue;
    quad(CV(i - 1, j, k - 1), CV(i - 1, j, k), CV(i, j, k), CV(i, j, k - 1), v0 > 0);
  }
  for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {   // z edges
    const v0 = V(i, j, k), v1 = V(i, j, k + 1); if ((v0 > 0) === (v1 > 0)) continue;
    quad(CV(i - 1, j - 1, k), CV(i, j - 1, k), CV(i, j, k), CV(i - 1, j, k), v0 > 0);
  }
  return { pos, idx, cells: nx * ny * nz };
}

export function buildUnderground(tex: TextureSet, cell = 0.8) {
  const t0 = performance.now();
  const min = new Vector3(-38, -82, -132), max = new Vector3(74, 8, 32);
  const { pos, idx, cells } = surfaceNets(fieldU, min, max, cell);
  const nV = pos.length / 3; const nrm = new Float32Array(nV * 3), depth = new Float32Array(nV * 2);
  const p = new Vector3(), e = 0.35;
  for (let i = 0; i < nV; i++) {
    p.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!);
    const gx = fieldU(p.clone().setX(p.x + e)) - fieldU(p.clone().setX(p.x - e));
    const gy = fieldU(p.clone().setY(p.y + e)) - fieldU(p.clone().setY(p.y - e));
    const gz = fieldU(p.clone().setZ(p.z + e)) - fieldU(p.clone().setZ(p.z - e));
    const n = new Vector3(gx, gy, gz).normalize(); nrm.set([n.x, n.y, n.z], i * 3); // gradient points into free space
    // AO: how open is the space along the normal (2 taps)
    const o1 = clamp(fieldU(p.clone().addScaledVector(n, 1.5)) / 1.5, 0, 1), o2 = clamp(fieldU(p.clone().addScaledVector(n, 4)) / 4, 0, 1);
    depth.set([pathDistance(p), clamp(0.25 + 0.4 * o1 + 0.45 * o2, 0, 1)], i * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('aDepth', new BufferAttribute(depth, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  const mat = new MeshStandardMaterial({ color: new Color(1.0, 0.92, 0.85), roughness: 1 });
  surface(mat, {
    proj: 'triplanar', layerA: { tex: tex.mats.soil_garden!, scale: 45, normalScale: 1.6 }, layerB: undefined, dualScale: 0, macro: 0.2, dayDepth: true, wetDarken: 0.6,
  });
  const walls = new Mesh(g, mat); walls.receiveShadow = true; walls.castShadow = true; walls.name = 'nestWalls';

  // contents: brood pile (cocoons + larvae), soil pellets, roots through the ceiling
  const rnd = mulberry32(12); const brood: ReturnType<typeof paint>[] = [];
    for (let i = 0; i < 14; i++) {
    const a = 2.3 + rnd() * 1.1, r = 14 + rnd() * 9; const x = CH.c.x + Math.cos(a) * r, z = CH.c.z + Math.sin(a) * r * 0.8;
    const cocoon = rnd() < 0.6; const L = cocoon ? 2.0 : 1.2 + rnd() * 0.8;
    const geo = ellipsoid(new Vector3(0, 0, 0), new Vector3(L * 0.42, L * 0.38, L), 10);
    geo.rotateY(rnd() * 6.28); geo.rotateX((rnd() - 0.5) * 0.6); geo.translate(x, floorAt(x, z) + L * 0.3 + (i > 9 ? 0.9 : 0), z);
    brood.push(paint(geo, cocoon ? [0.62, 0.48, 0.3] : [0.85, 0.82, 0.74]));
  }
  for (let i = 0; i < 26; i++) { // excavated soil pellets near the tunnel mouth
    const x = 8 + rnd() * 16, z = -12 + rnd() * 12; const r = 0.5 + rnd() * 0.5;
    const geo = ellipsoid(new Vector3(x, floorAt(x, z) + r * 0.55, z), new Vector3(r, r * 0.8, r), 6);
    brood.push(paint(geo, [0.28, 0.19, 0.12]));
  }
  const broodMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  surface(broodMat, { proj: 'triplanar', layerA: { tex: tex.mats.sand_playground!, scale: 6, normalScale: 0.5, tint: [1.3, 1.3, 1.3] }, wetDarken: 0.9 });
  const broodMesh = new Mesh(mergeGeometries(brood.map((b) => strip(b)))!, broodMat); broodMesh.castShadow = true; broodMesh.receiveShadow = true;
  const roots: ReturnType<typeof tube>[] = [];
  for (let i = 0; i < 0; i++) {
    const ang = (i / 6) * Math.PI * 2 + rnd() * 0.5; const rr = 0.8 + rnd() * 0.15;
    const a = new Vector3(CH.c.x + Math.cos(ang) * CH.rx * rr, CH.c.y + CH.up * 0.7, CH.c.z + Math.sin(ang) * CH.rz * rr);
    const b = a.clone().add(new Vector3(-Math.cos(ang) * 4, -5 - rnd() * 4, -Math.sin(ang) * 4));
    const c = b.clone().add(new Vector3(15 * (rnd() - 0.5), 4 + rnd() * 5, 20 * (rnd() - 0.5)));
    roots.push(paint(tube([a, b, c], (t) => 0.32 - 0.2 * t, 24, 6, true), [0.26, 0.18, 0.11]));
  }
  const rootMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const rootMesh = new Mesh(roots.length ? mergeGeometries(roots.map((r) => strip(r)))! : new BufferGeometry(), rootMat); rootMesh.castShadow = true; rootMesh.receiveShadow = true;

  // scent motes: drifting HDR points, densest along the trail and around the ant
  const N = 380; const mp = new Float32Array(N * 3), mr = new Float32Array(N * 4); let k = 0; const q = new Vector3();
  while (k < N) {
    const onTrail = rnd() < 0.55;
    if (onTrail) { const s = rnd() * cumLen[ENTRANCE_IDX]!; let i = 0; while (i < segLen.length - 1 && cumLen[i + 1]! < s) i++; q.copy(PATH[i]!).lerp(PATH[i + 1]!, (s - cumLen[i]!) / segLen[i]!).add(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(5)); }
    else q.set(CH.c.x + (rnd() - 0.5) * 56, CH.c.y + (rnd() - 0.3) * 16, CH.c.z + (rnd() - 0.5) * 44);
    if (fieldU(q) < 0.8 || q.y > -3) continue;
    mp.set([q.x, q.y, q.z], k * 3); mr.set([rnd(), rnd(), rnd(), onTrail ? 1 : 0], k * 4); k++;
  }
  const mg = new BufferGeometry(); mg.setAttribute('position', new BufferAttribute(mp, 3)); mg.setAttribute('aR', new BufferAttribute(mr, 4));
  const moteMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
    uniforms: { uTime: U.uTime, uSubject: U.uSubject, uScale: { value: 600 } },
    vertexShader: /* glsl */`
      attribute vec4 aR; uniform float uTime; uniform vec3 uSubject; uniform float uScale; varying vec3 vC; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.31 + aR.x * 40.0), sin(uTime * 0.23 + aR.y * 40.0) * 0.6, cos(uTime * 0.27 + aR.z * 40.0)) * 1.4;
        p.y += mod(uTime * 0.15 + aR.x * 6.0, 6.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float near = exp(-length(p - uSubject) / 18.0);
        float tw = 0.6 + 0.4 * sin(uTime * (1.5 + aR.y * 3.0) + aR.z * 30.0);
        vA = (0.18 + 1.4 * near) * tw * (0.5 + aR.w * 0.7) * smoothstep(6.0, 14.0, -mv.z);
        vC = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.85, 0.55), aR.z);
        gl_PointSize = clamp(uScale * (0.08 + 0.12 * aR.y) / -mv.z, 1.0, 10.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = exp(-r * 3.5) * (1.0 - r);
        if (a <= 0.0) discard; gl_FragColor = vec4(vC * vA * a * 2.2, 1.0); }`,
  });
  const motes = new Points(mg, moteMat); motes.frustumCulled = false; motes.name = 'motes';

  const group = new Group(); group.name = 'underground'; group.add(walls, broodMesh, rootMesh, motes);
  const antPos = new Vector3(4, 0, 2); antPos.y = CH.c.y - CH.down + floorOffset(antPos);
  return {
    group, walls, motes, moteMat, mats: [mat, broodMat, rootMat], antPos, antYaw: Math.atan2(PATH[0]!.x - antPos.x, -(PATH[0]!.z - antPos.z)) + Math.PI,
    entrance: PATH[ENTRANCE_IDX]!.clone(), tunnelMouth: PATH[1]!.clone(), stats: { verts: nV, tris: idx.length / 3, cells, ms: Math.round(performance.now() - t0) },
  };
}

/** floor height under (x, z): march down from the chamber centre height until the field turns solid */
function floorAt(x: number, z: number) {
  const q = new Vector3(x, CH.c.y + 2, z);
  for (let i = 0; i < 400; i++) { q.y -= 0.05; if (fieldU(q) <= 0) break; }
  return q.y;
}
/** find the floor height under (x, z) inside the chamber by marching down the field */
function floorOffset(p: Vector3) {
  const q = new Vector3(p.x, CH.c.y, p.z);
  for (let i = 0; i < 200; i++) { q.y -= 0.05; if (fieldU(q) <= 0) break; }
  return q.y - (CH.c.y - CH.down);
}
export const UG_CAMERA = { pos: new Vector3(-16, -64.5, 21), look: new Vector3(10, -71.5, -8) };
