/**
 * Ground at true scale (mm, Y up). The controlled ant stands at the origin on a bare-soil patch at a lawn edge;
 * 450 mm paving flags (8 mm sand joints) start 95 mm ahead and run off to the right; two rows deep, then a raised kerb
 * (115 mm above the flags) runs across the view, a road beyond it. The lawn edge is ~55 mm to the left.
 *
 * Terrain = radially graded grid (vertex spacing ~0.8 mm at the ant, ~40 mm at 3 m) + per-vertex masks (aMask:
 * x grass density, y grit/humus layer, z puddle-prone hollow, w ambient occlusion near slab faces).
 */
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, vnoise, smoothstep, clamp } from './rng';
import { surface } from './shaders';
import type { TextureSet } from './textures';

export const LAYOUT = {
  slabX0: 45, slabW: 450, slabD: 450, joint: 8, slabFront: -95, slabCols: 7, slabRows: 2, slabThick: 50,
  kerbW: 125, kerbUp: 115, kerbLen: 6000, // kerb runs along +X behind the last slab row; top 115 mm above the flags
  extentX: 2600, extentZneg: 3400, extentZpos: 700,
};
export const slabX1 = () => LAYOUT.slabX0 + LAYOUT.slabCols * LAYOUT.slabW + (LAYOUT.slabCols - 1) * LAYOUT.joint;
export const slabZ1 = () => LAYOUT.slabFront - LAYOUT.slabRows * LAYOUT.slabD - (LAYOUT.slabRows - 1) * LAYOUT.joint;
export const kerbZ0 = () => slabZ1() - LAYOUT.joint;          // kerb front face
export const kerbZ1 = () => kerbZ0() - LAYOUT.kerbW;           // kerb back face (road beyond)

const edgeFade = (x: number, z: number) =>
  1 - smoothstep(LAYOUT.extentX * 0.7, LAYOUT.extentX, Math.abs(x)) * 1 - smoothstep(LAYOUT.extentZneg * 0.7, LAYOUT.extentZneg, -z);
function hBase(x: number, z: number) {
  return (fbm(x / 700 + 3, z / 700 + 7, 4, 3) - 0.5) * 70 * clamp(edgeFade(x, z), 0, 1);
}
/** slab top height (constant: the flags are laid level) */
export const SLAB_TOP = hBase(LAYOUT.slabX0 + 250, LAYOUT.slabFront - 250) + 14;

/** signed distance (mm) outside the slab footprint rectangle (negative inside) */
function slabRectDist(x: number, z: number) {
  // hardscape quadrant: flags, kerb and road (x >= slabX0, z <= slabFront)
  const x0 = LAYOUT.slabX0, x1 = 1e6, z0 = LAYOUT.slabFront, z1 = -1e6;
  const dx = Math.max(x0 - x, x - x1), dz = Math.max(z - z0, z1 - z);
  if (dx <= 0 && dz <= 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}

export function grassDensity(x: number, z: number) {
  const edge = -55 + (fbm(z / 90 + 5, 3.3, 3, 5) - 0.5) * 70;   // lawn edge line (lawn at x < edge)
  let g = smoothstep(edge + 20, edge - 45, x);
  const bare = Math.hypot((x - 10) / 150, (z + 20) / 120);        // bare patch around the ant
  g *= smoothstep(0.85, 1.25, bare + (vnoise(x / 40, z / 40, 9) - 0.5) * 0.3);
  g *= smoothstep(-5, 40, slabRectDist(x, z));
  // scattered weeds in the soil strip and beyond the kerb (none on the road)
  const weeds = 0.08 * smoothstep(0.6, 0.8, vnoise(x / 30, z / 30, 17));
  return clamp(Math.max(g, weeds * smoothstep(-5, 20, slabRectDist(x, z))), 0, 1);
}

export function groundY(x: number, z: number) {
  const base = hBase(x, z);
  const sd = slabRectDist(x, z);
  const near = 1 - smoothstep(300, 900, Math.hypot(x, z));
  let h = base + (fbm(x / 45 + 1, z / 45 + 2, 3, 11) - 0.5) * 6 + (vnoise(x / 5, z / 5, 23) - 0.5) * 1.1 * near;
  // soil settles ~14 mm below the flags along their edge, the flags sit on a bedding layer
  const edgeTarget = SLAB_TOP - 14 + (vnoise(x / 25, z / 25, 4) - 0.5) * 4;
  h = h + (edgeTarget - h) * (1 - smoothstep(0, 120, sd));
  if (sd < 0) h = SLAB_TOP - 14 - smoothstep(0, 12, -sd) * 20; // hidden under the slabs (joint fill covers the gap)
  return h;
}

export function groundNormal(x: number, z: number, out = new Vector3()) {
  const e = 0.5;
  return out.set(groundY(x - e, z) - groundY(x + e, z), 2 * e, groundY(x, z - e) - groundY(x, z + e)).normalize();
}

function gradedCoord(t: number, neg: number, pos: number, a: number) {
  // t in [-1,1] -> mm, dense near 0
  const g = (u: number) => a * u + (1 - a) * u * u;
  return t < 0 ? -neg * g(-t) : pos * g(t);
}

export function buildTerrain(tex: TextureSet, segs: number, opts: { layers: 1 | 2; dual: boolean; triplanar: boolean }) {
  const N = segs, L = LAYOUT;
  const nV = (N + 1) * (N + 1);
  const pos = new Float32Array(nV * 3), mask = new Float32Array(nV * 4);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = gradedCoord((i / N) * 2 - 1, L.extentX, L.extentX, 0.035);
    const z = gradedCoord((j / N) * 2 - 1, L.extentZneg, L.extentZpos, 0.03);
    const k = j * (N + 1) + i; const y = groundY(x, z);
    pos.set([x, y, z], k * 3);
    const sd = slabRectDist(x, z);
    const grit = clamp(smoothstep(140, 0, sd) * 0.8 + (fbm(x / 120, z / 120, 3, 31) - 0.45) * 1.4, 0, 1);
    const hollow = 1 - fbm(x / 45 + 1, z / 45 + 2, 3, 11); // inverse of the meso relief -> low spots
    const ao = 0.35 + 0.65 * smoothstep(0, 18, sd < 0 ? 0 : sd);
    const dryMargin = smoothstep(25, 70, Math.hypot(x - 4, z + 8)); // spike composition: keep the hero spot out of a puddle
    mask.set([grassDensity(x, z), grit, hollow * (1 - grassDensity(x, z)) * dryMargin, ao], k * 4);
  }
  const idx = new Uint32Array(N * N * 6); let o = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aMask', new BufferAttribute(mask, 4));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0 });
  const soil = tex.mats.soil_garden!, humus = tex.mats.humus_forest!;
  surface(mat, {
    proj: opts.triplanar ? 'triplanar' : 'planar',
    layerA: { tex: soil, scale: 95, tint: [0.9, 0.86, 0.84], normalScale: 1.0 },
    layerB: opts.layers === 2 ? { tex: humus, scale: 150, tint: [0.92, 0.88, 0.84], normalScale: 1.2 } : undefined,
    dualScale: opts.dual ? 6.3 : 0, macro: 0.18, maskAttr: true, puddles: true, lawnTint: true, wetDarken: 0.5, wetRough: 0.72,
  });
  const mesh = new Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'terrain';

  // far field: flat lawn plane beneath and beyond the graded grid (fogged, out of focus)
  // (a ring of 4 quads around the grid rectangle, overlapping it by 2 cells so there is no crack)
  const R = 40000, x0 = -L.extentX + 60, x1 = L.extentX - 60, z0 = -L.extentZneg + 60, z1 = L.extentZpos - 60;
  const quad = (ax: number, az: number, bx: number, bz: number) => {
    const p = new PlaneGeometry(bx - ax, bz - az, 1, 1); p.rotateX(-Math.PI / 2); p.translate((ax + bx) / 2, 0, (az + bz) / 2);
    p.deleteAttribute('uv'); return p;
  };
  const fg = mergeGeometries([quad(-R, -R, R, z0), quad(-R, z1, R, R), quad(-R, z0, x0, z1), quad(x1, z0, R, z1)])!;
  const fm = new Float32Array(fg.getAttribute('position').count * 4);
  for (let i = 0; i < fm.length / 4; i++) fm.set([1, 0, 0, 1], i * 4);
  fg.setAttribute('aMask', new BufferAttribute(fm, 4));
  const far = new Mesh(fg, mat); far.position.y = Math.min(-0.5, SLAB_TOP - 30); far.name = 'farGround'; far.receiveShadow = false;
  return { mesh, far, material: mat, tris: N * N * 2 };
}
