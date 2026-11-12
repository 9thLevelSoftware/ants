/**
 * Ground props at true scale (mm): fallen leaves (CC0 atlas cards, curled in the vertex shader), pebbles/sand grains,
 * a twig, white clover, a dandelion, paving flags with sand-filled joints, a raised kerb, road, rain droplets.
 */
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, RGBADepthPacking, SphereGeometry, Vector3,
} from 'three';
import type { Texture, WebGLProgramParametersWithUniforms } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, smoothstep, vnoise } from './rng';
import { LAYOUT, SLAB_TOP, groundNormal, groundY, grassDensity, kerbZ0, kerbZ1, slabX1, slabZ1 } from './terrain';
import { addPatch, surface, translucency } from './shaders';
import { cloverLeafletTexture, type TextureSet } from './textures';
import { pebbleGeometry, tube } from './geom';
import { bladePoint, type BladeInfo } from './grass';

const UP = new Vector3(0, 1, 0);
const offHard = (x: number, z: number) => !(x > LAYOUT.slabX0 - 2 && z < LAYOUT.slabFront + 2);
const onSlab = (x: number, z: number) => x > LAYOUT.slabX0 && x < slabX1() && z < LAYOUT.slabFront && z > slabZ1();

function placeMatrix(x: number, y: number, z: number, yaw: number, n: Vector3, sx: number, sy: number, sz: number, m = new Matrix4()) {
  const q = new Quaternion().setFromUnitVectors(UP, n).multiply(new Quaternion().setFromAxisAngle(UP, yaw));
  return m.compose(new Vector3(x, y, z), q, new Vector3(sx, sy, sz));
}

// ------------------------------------------------------------------------------------------------ leaves
export function buildLeaves(tex: TextureSet, count: number, seed = 5) {
  const rnd = mulberry32(seed);
  const group = new Group(); group.name = 'leaves';
  const mats: MeshStandardMaterial[] = [];
  const tops: { p: Vector3; n: Vector3; r: number }[] = [];
  const sets: { name: 'leaf_atlas_maple' | 'leaf_atlas_oak_dry'; cols: number; rows: number; aspect: number; share: number; len: [number, number]; curl: [number, number] }[] = [
    { name: 'leaf_atlas_maple', cols: 4, rows: 4, aspect: 0.5, share: 0.4, len: [120, 175], curl: [0.01, 0.04] },
    { name: 'leaf_atlas_oak_dry', cols: 4, rows: 4, aspect: 0.62, share: 0.6, len: [95, 140], curl: [0.03, 0.1] },
  ];
  for (const set of sets) {
    const t = tex.mats[set.name]!;
    const n = Math.max(2, Math.round(count * set.share));
    const g = new PlaneGeometry(1, 1, 12, 6); g.rotateX(-Math.PI / 2);
    const atlas = new Float32Array(n * 4), curl = new Float32Array(n * 2);
    const mesh = new InstancedMesh(g, undefined as unknown as MeshStandardMaterial, n);
    const m = new Matrix4(); const nrm = new Vector3();
    for (let i = 0; i < n; i++) {
      let x: number, z: number;
      if (set.name === 'leaf_atlas_maple' && i === 0) { x = -78; z = -150; }      // hero leaf beside the ant
      else if (set.name === 'leaf_atlas_oak_dry' && i === 0) { x = 210; z = -250; }
      else {
        let tries = 0;
        do {
          const r = 60 + 1500 * Math.pow(rnd(), 1.6), a = rnd() * Math.PI * 2; x = Math.cos(a) * r; z = Math.sin(a) * r * 1.2 - 200; tries++;
        } while (tries < 20 && (z < kerbZ0() + 10 && x > LAYOUT.slabX0 - 10 || (grassDensity(x, z) > 0.6 && rnd() < 0.7) || Math.hypot(x, z) < 45));
      }
      const L = set.len[0] + rnd() * (set.len[1] - set.len[0]);
      const slab = onSlab(x, z);
      const y = slab ? SLAB_TOP + 0.4 : groundY(x, z) + 0.6;
      groundNormal(x, z, nrm); if (slab) nrm.set(0, 1, 0);
      nrm.x += (rnd() - 0.5) * 0.12; nrm.z += (rnd() - 0.5) * 0.12; nrm.normalize();
      const yaw = i === 0 && set.name === 'leaf_atlas_maple' ? 2.4 : rnd() * Math.PI * 2;
      mesh.setMatrixAt(i, placeMatrix(x, y, z, yaw, nrm, L, L, L * set.aspect, m));
      const c = Math.floor(rnd() * set.cols), r = Math.floor(rnd() * set.rows);
      atlas.set([c / set.cols, 1 - (r + 1) / set.rows, 1 / set.cols, 1 / set.rows], i * 4);
      const cu = set.curl[0] + rnd() * (set.curl[1] - set.curl[0]);
      curl.set([cu * (rnd() < 0.3 ? -0.5 : 1), cu * 1.2], i * 2);
      if (i < 6) tops.push({ p: new Vector3(x, y + 0.6, z), n: nrm.clone(), r: L * 0.28 });
    }
    g.setAttribute('iAtlas', new InstancedBufferAttribute(atlas, 4));
    g.setAttribute('iCurl', new InstancedBufferAttribute(curl, 2));
    const mat = new MeshStandardMaterial({
      map: t.albedo, normalMap: t.normal, roughnessMap: t.rough, alphaMap: t.opacity ?? undefined, alphaTest: 0.5,
      side: DoubleSide, roughness: 1, metalness: 0,
    });
    const vpatch = (s: WebGLProgramParametersWithUniforms, std: boolean) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 iAtlas; attribute vec2 iCurl;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
{ vec2 auv = iAtlas.xy + uv * iAtlas.zw;
#ifdef USE_MAP
vMapUv = auv;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = auv;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = auv;
#endif
#ifdef USE_ALPHAMAP
vAlphaMapUv = auv;
#endif
}`);
      const curlCode = `float lx = position.x, lz = position.z;
float ly = iCurl.x * lx * lx * 4.0 + iCurl.y * lz * lz * 4.0 + 0.012 * sin(lx * 11.0 + lz * 7.0);`;
      if (std) s.vertexShader = s.vertexShader
        .replace('#include <beginnormal_vertex>', `${curlCode}
vec3 objectNormal = normalize(vec3(-8.0 * iCurl.x * lx, 1.0, -8.0 * iCurl.y * lz));`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(lx, ly, lz);');
      else s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `${curlCode}\nvec3 transformed = vec3(lx, ly, lz);`);
    };
    addPatch(mat, 'leaf', (s) => vpatch(s, true));
    translucency(mat, 0.7, [1.3, 1.1, 0.6]);
    const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, alphaMap: t.opacity ?? undefined, alphaTest: 0.5, side: DoubleSide });
    addPatch(depth, 'leafDepth', (s) => vpatch(s, false));
    mesh.material = mat; mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; // instances span the whole scene
    group.add(mesh); mats.push(mat);
  }
  return { group, mats, tops };
}

// ------------------------------------------------------------------------------------------------ pebbles
export function buildPebbles(tex: TextureSet, count: number, opts: { triplanar: boolean }, seed = 21) {
  const rnd = mulberry32(seed);
  const group = new Group(); group.name = 'pebbles';
  const shapes = 4; const per = Math.ceil(count / shapes);
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0 });
  surface(mat, { proj: opts.triplanar ? 'triplanar' : 'planar', layerA: { tex: tex.mats.gravel_fine!, scale: 9, normalScale: 1.0, tint: [1.0, 1.0, 1.0] }, instanced: true, wetDarken: 0.7, wetRough: 0.18 });
  const palette = [[0.42, 0.37, 0.31], [0.33, 0.31, 0.29], [0.45, 0.34, 0.24], [0.2, 0.18, 0.16], [0.4, 0.28, 0.21], [0.62, 0.58, 0.52], [0.28, 0.22, 0.17]].map((c) => new Color(...(c as [number, number, number])));
  const m = new Matrix4(); const nrm = new Vector3(); const tops: { p: Vector3; n: Vector3; r: number }[] = [];
  const hero: [number, number, number][] = [[14, -15, 2.4], [-13, -27, 4], [42, -72, 7], [-22, -58, 3], [76, -42, 4.5], [-50, -22, 6], [125, -78, 5], [-4, -9, 1.6]];
  for (let s = 0; s < shapes; s++) {
    const g = pebbleGeometry(1000 + s * 77, 2);
    const mesh = new InstancedMesh(g, mat, per);
    let k = 0;
    for (let i = 0; i < per; i++) {
      let x: number, z: number, r: number;
      const hi = s * 2 + (i === 0 ? 0 : 1);
      if (i < 2 && hero[hi]) { [x, z, r] = hero[hi]; }
      else {
        r = 0.2 + 1.6 * Math.pow(rnd(), 4.5);
        let tries = 0;
        do {
          const d = 20 + 520 * Math.pow(rnd(), 1.5), a = rnd() * Math.PI * 2; x = Math.cos(a) * d; z = Math.sin(a) * d - 60; tries++;
        } while (tries < 30 && ((grassDensity(x, z) > 0.4 && rnd() < 0.85) || (onSlab(x, z) && (r > 1.0 || rnd() < 0.8)) || (x > LAYOUT.slabX0 && z < kerbZ0()) || Math.hypot(x, z - 0) < 5));
      }
      const slab = onSlab(x, z);
      groundNormal(x, z, nrm); if (slab) nrm.set(0, 1, 0);
      const y = (slab ? SLAB_TOP : groundY(x, z)) - r * 0.18;
      placeMatrix(x, y, z, rnd() * 6.28, nrm, r, r, r, m);
      mesh.setMatrixAt(k, m);
      const c = palette[Math.floor(rnd() * palette.length)]!.clone().multiplyScalar(0.85 + rnd() * 0.3);
      mesh.setColorAt(k, c); k++;
      if (r > 3) tops.push({ p: new Vector3(x, y + r * 0.45, z), n: UP.clone(), r: r * 0.6 });
    }
    mesh.count = k; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    group.add(mesh);
  }
  // hero stones near the subject: dense mesh so fracture facets read at macro distance
  const heroGeo = [0, 1, 2].map((s) => pebbleGeometry(4000 + s * 131, 4));
  const heroMeshes = heroGeo.map((g) => new InstancedMesh(g, mat, 8));
  heroMeshes.forEach((hm) => { hm.count = 0; hm.castShadow = true; hm.receiveShadow = true; hm.frustumCulled = false; group.add(hm); });
  // move the instanced hero entries (first two of every shape) to the dense meshes
  group.children.slice(0, shapes).forEach((c, s) => {
    const im = c as InstancedMesh; const tmp = new Matrix4(); const col = new Color();
    for (let i = 0; i < Math.min(2, im.count); i++) {
      im.getMatrixAt(i, tmp); im.getColorAt(i, col);
      const hm = heroMeshes[(s * 2 + i) % 3]!; hm.setMatrixAt(hm.count, tmp); hm.setColorAt(hm.count, col); hm.count++;
      tmp.makeScale(0, 0, 0); im.setMatrixAt(i, tmp);
    }
  });
  return { group, mat, tops };
}

// ------------------------------------------------------------------------------------------------ twig
export function buildTwig(tex: TextureSet) {
  const t = tex.mats.bark_oak!;
  const pts: Vector3[] = [];
  const a = new Vector3(14, 0, -22), b = new Vector3(140, 0, -70);
  for (let i = 0; i <= 8; i++) {
    const p = a.clone().lerp(b, i / 8); p.x += Math.sin(i * 1.7) * 4; p.z += Math.cos(i * 2.3) * 3;
    p.y = groundY(p.x, p.z) + 2.2 + (i === 3 ? 1.5 : 0) + (i > 6 ? Math.max(0, SLAB_TOP - 14 - groundY(p.x, p.z)) : 0);
    pts.push(p);
  }
  const main = tube(pts, (s) => 2.4 - 0.9 * s, 64, 12, true, 1);
  const bp = pts[5]!.clone();
  const side = tube([bp, bp.clone().add(new Vector3(18, 1.5, 10)), bp.clone().add(new Vector3(38, 0.5, 14))], (s) => 1.1 - 0.5 * s, 16, 8, true, 1);
  const g = mergeGeometries([main, side])!;
  const mat = new MeshStandardMaterial({ map: t.albedo, normalMap: t.normal, roughnessMap: t.rough, roughness: 1, color: new Color(1.2, 1.12, 1.02) });
  const mesh = new Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'twig';
  const tops = pts.slice(1, 7).map((p) => ({ p: p.clone().add(new Vector3(0, 2.2, 0)), n: UP.clone(), r: 1.2 }));
  return { mesh, mat, tops };
}

// ------------------------------------------------------------------------------------------------ clover + dandelion
function leafletGeometry(len: number, wid: number) {
  // obovate leaflet with a notched tip; u along (0 base -> 1 tip), v across
  const S = 10, T = 6; const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= S; i++) for (let j = 0; j <= T; j++) {
    const s = i / S, t = (j / T) * 2 - 1;
    const hw = wid * 0.5 * Math.pow(Math.sin(Math.PI * (0.03 + s * 0.94)), 0.55) * Math.min(1, 0.35 + s * 1.6);
    const notch = 0.12 * (1 - t * t) * smoothstep(0.7, 1, s);
    const x = len * s * (1 - notch), z = t * hw;
    const y = 0.08 * len * t * t - 0.05 * len * s * s;   // cupped, slightly drooping
    pos.push(x, y, z); uv.push(s, (t + 1) / 2);
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) { const a = i * (T + 1) + j, b = a + T + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildClover(seed = 31) {
  const rnd = mulberry32(seed); const parts: BufferGeometry[] = [];
  const spots: [number, number, number][] = [[-10, -48, 16], [-30, -62, 26], [-12, -86, 36], [-46, -96, 48], [-24, -130, 58], [-58, -42, 22], [-80, -120, 70], [6, -74, 12]];
  const tops: { p: Vector3; n: Vector3; r: number }[] = [];
  for (const [x, z, h] of spots) {
    const base = new Vector3(x, groundY(x, z) - 0.5, z);
    const lean = new Vector3((rnd() - 0.5) * 10, 0, (rnd() - 0.5) * 10);
    const top = base.clone().add(new Vector3(0, h, 0)).add(lean);
    const pet = tube([base, base.clone().lerp(top, 0.5).add(new Vector3(lean.x * 0.3, 0, lean.z * 0.3)), top], () => 0.75, 12, 6, false);
    const uvA = pet.getAttribute('uv'); for (let i = 0; i < uvA.count; i++) uvA.setXY(i, 0.08, 0.5);
    parts.push(pet);
    const yaw0 = rnd() * Math.PI * 2; const L = 17 + rnd() * 8;
    for (let k = 0; k < 3; k++) {
      const lg = leafletGeometry(L, L * 0.85);
      lg.rotateZ(-0.12 - rnd() * 0.15); lg.rotateY(yaw0 + (k * Math.PI * 2) / 3); lg.translate(top.x, top.y, top.z);
      parts.push(lg);
    }
    tops.push({ p: top.clone(), n: UP.clone(), r: L * 0.6 });
  }
  const g = mergeGeometries(parts.map((p) => { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k); return p; }))!;
  const mat = new MeshStandardMaterial({ map: cloverLeafletTexture(), roughness: 0.42, side: DoubleSide });
  translucency(mat, 0.8, [1.2, 1.4, 0.6]);
  const mesh = new Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'clover';
  return { mesh, mat, tops };
}

export function buildDandelion(at = new Vector3(-130, 0, -400), seed = 41) {
  const rnd = mulberry32(seed); const green: BufferGeometry[] = []; const yellow: BufferGeometry[] = [];
  const by = groundY(at.x, at.z);
  const top = new Vector3(at.x + 12, by + 150, at.z - 6);
  green.push(tube([new Vector3(at.x, by - 1, at.z), new Vector3(at.x + 2, by + 60, at.z - 1), new Vector3(at.x + 8, by + 115, at.z - 4), top], (s) => 1.9 - 0.4 * s, 40, 10, false));
  // involucre bracts (reflexed outer, upright inner)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2; const outer = i % 2 === 0;
    const d = new Vector3(Math.cos(a), 0, Math.sin(a));
    const p0 = top.clone().add(new Vector3(0, -1.5, 0));
    const p1 = p0.clone().addScaledVector(d, outer ? 4 : 2.5).add(new Vector3(0, outer ? -3 : 3, 0));
    const p2 = p0.clone().addScaledVector(d, outer ? 6 : 4).add(new Vector3(0, outer ? -9 : 7, 0));
    green.push(tube([p0, p1, p2], (s) => 0.6 - 0.45 * s, 6, 4, false));
  }
  // rosette: runcinate (lion's-tooth) leaves flat on the ground
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4; const L = 110 + rnd() * 60;
    const pos: number[] = [], idx: number[] = []; const S = 30;
    for (let k = 0; k <= S; k++) {
      const s = k / S; const lobes = 0.5 + 0.5 * Math.abs(Math.sin(s * Math.PI * 5.5));
      const hw = 11 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.85 + 0.08)), 0.7) * lobes * (0.4 + 0.6 * s);
      const cx = Math.cos(a) * s * L, cz = Math.sin(a) * s * L; const px = -Math.sin(a), pz = Math.cos(a);
      for (const t of [-1, 0, 1]) {
        const x = at.x + cx + px * hw * t, z = at.z + cz + pz * hw * t;
        pos.push(x, groundY(x, z) + 0.8 + 3 * s * (1 - s) + (t === 0 ? 0.6 : 0), z);
      }
    }
    for (let k = 0; k < S; k++) for (let j = 0; j < 2; j++) { const q = k * 3 + j, r = q + 3; idx.push(q, r, q + 1, q + 1, r, r + 1); }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
    green.push(g);
  }
  // capitulum: ~150 ligulate florets in rings
  const rings = [{ n: 34, el: 0.12, len: 15 }, { n: 32, el: 0.35, len: 13 }, { n: 30, el: 0.6, len: 11 }, { n: 26, el: 0.9, len: 8.5 }, { n: 20, el: 1.2, len: 6 }];
  for (const ring of rings) for (let i = 0; i < ring.n; i++) {
    const a = (i / ring.n) * Math.PI * 2 + rnd() * 0.15; const d = new Vector3(Math.cos(a), 0, Math.sin(a)); const side = new Vector3(-d.z, 0, d.x);
    const pos: number[] = [], idx: number[] = [], col: number[] = []; const S = 4; const W = 1.7;
    for (let k = 0; k <= S; k++) {
      const s = k / S; const el = ring.el + s * 0.25;
      const c = top.clone().addScaledVector(d, Math.cos(el) * ring.len * s + 1.5).add(new Vector3(0, Math.sin(el) * ring.len * s + 1.0, 0));
      for (const t of [-1, 1]) { pos.push(c.x + side.x * W * 0.5 * t, c.y, c.z + side.z * W * 0.5 * t); col.push(1.0, 0.62 + 0.12 * s, 0.02); }
    }
    for (let k = 0; k < S; k++) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3)); g.setIndex(idx); g.computeVertexNormals();
    yellow.push(g);
  }
  const gm = new MeshStandardMaterial({ color: new Color(0.11, 0.2, 0.04), roughness: 0.55, side: DoubleSide });
  translucency(gm, 0.6);
  const ym = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: DoubleSide });
  translucency(ym, 0.5, [1.0, 0.8, 0.3]);
  const greenMesh = new Mesh(mergeGeometries(green.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; }))!, gm);
  const yellowMesh = new Mesh(mergeGeometries(yellow)!, ym);
  for (const m of [greenMesh, yellowMesh]) { m.castShadow = true; m.receiveShadow = true; }
  const group = new Group(); group.add(greenMesh, yellowMesh); group.name = 'dandelion';
  return { group, mats: [gm, ym] };
}

// ------------------------------------------------------------------------------------------------ paving, kerb, road
export function buildHardscape(tex: TextureSet, opts: { triplanar: boolean; dual: boolean }) {
  const L = LAYOUT; const group = new Group(); group.name = 'hardscape';
  const concrete = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  surface(concrete, { proj: 'triplanar', layerA: { tex: tex.mats.gravel_fine!, scale: 140, normalScale: 0.6, tint: [0.93, 0.9, 0.85] }, dualScale: opts.dual ? 5 : 0, macro: 0.12, instanced: true, grimeBelow: 6, wetDarken: 0.72, wetRough: 0.35 });
  addPatch(concrete, 'cement', (s) => {
    // pull the aggregate toward a cement matrix colour: the gravel scan reads as fine exposed aggregate
    s.fragmentShader = s.fragmentShader.replace('diffuseColor.rgb *= lkAlb;', 'diffuseColor.rgb *= mix(vec3(0.30, 0.295, 0.28), lkAlb * 0.62, 0.6);');
  });
  const slabGeo = new RoundedBoxGeometry(L.slabW, L.slabThick, L.slabD, 3, 3.5);
  const n = L.slabCols * L.slabRows; const slabs = new InstancedMesh(slabGeo, concrete, n);
  const rnd = mulberry32(3); const m = new Matrix4(); let k = 0;
  for (let r = 0; r < L.slabRows; r++) for (let c = 0; c < L.slabCols; c++) {
    const x = L.slabX0 + c * (L.slabW + L.joint) + L.slabW / 2, z = L.slabFront - r * (L.slabD + L.joint) - L.slabD / 2;
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize(), 0.0025 * rnd());
    m.compose(new Vector3(x, SLAB_TOP - L.slabThick / 2 + (rnd() - 0.5) * 1.6, z), tilt, new Vector3(1, 1, 1));
    slabs.setMatrixAt(k, m); slabs.setColorAt(k, new Color().setScalar(0.92 + rnd() * 0.16)); k++;
  }
  slabs.castShadow = true; slabs.receiveShadow = true; slabs.frustumCulled = false;
  // joint fill: sand/grit 7 mm below the slab top
  const sand = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  surface(sand, { proj: opts.triplanar ? 'triplanar' : 'planar', layerA: { tex: tex.mats.sand_playground!, scale: 40, tint: [0.78, 0.74, 0.7], normalScale: 1.5 }, wetDarken: 0.55 });
  const jg: BufferGeometry[] = []; const depthBelow = 7;
  const x0 = L.slabX0, x1 = slabX1(), z1 = slabZ1();
  for (let r = 1; r < L.slabRows; r++) {
    const z = L.slabFront - r * (L.slabD + L.joint) + L.joint / 2;
    const b = new RoundedBoxGeometry(x1 - x0, 20, L.joint + 1, 1, 0.5); b.translate((x0 + x1) / 2, SLAB_TOP - depthBelow - 10, z); jg.push(b);
  }
  for (let c = 1; c < L.slabCols; c++) {
    const x = x0 + c * (L.slabW + L.joint) - L.joint / 2;
    const b = new RoundedBoxGeometry(L.joint + 1, 20, L.slabFront - z1, 1, 0.5); b.translate(x, SLAB_TOP - depthBelow - 10, (L.slabFront + z1) / 2); jg.push(b);
  }
  const joints = new Mesh(mergeGeometries(jg)!, sand); joints.receiveShadow = true;
  // kerb (raised edging stone)
  const kerbH = L.kerbUp + 120;
  const kerbGeo = new RoundedBoxGeometry(L.kerbLen, kerbH, L.kerbW, 3, 9);
  const kerb = new InstancedMesh(kerbGeo, concrete, 1);
  kerb.setMatrixAt(0, new Matrix4().makeTranslation(L.slabX0 + L.kerbLen / 2, SLAB_TOP + L.kerbUp - kerbH / 2, kerbZ0() - L.kerbW / 2));
  kerb.setColorAt(0, new Color(0.8, 0.79, 0.77)); kerb.castShadow = true; kerb.receiveShadow = true; kerb.frustumCulled = false;
  // road beyond the kerb
  const asphalt = new MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  surface(asphalt, { proj: 'planar', layerA: { tex: tex.mats.asphalt!, scale: 260, normalScale: 1.0 }, dualScale: opts.dual ? 6 : 0, macro: 0.1, wetDarken: 0.6 });
  const rg = new PlaneGeometry(30000, 30000); rg.rotateX(-Math.PI / 2); rg.translate(L.slabX0 + 15000, SLAB_TOP - 8, kerbZ1() - 15000);
  const road = new Mesh(rg, asphalt); road.receiveShadow = true;
  group.add(slabs, joints, kerb, road);
  return { group, mats: [concrete, sand, asphalt] };
}

// ------------------------------------------------------------------------------------------------ rain droplets
export function buildDroplets(spots: { p: Vector3; n: Vector3; r: number }[], blades: BladeInfo[], count: number, seed = 61) {
  const rnd = mulberry32(seed);
  const g = new SphereGeometry(1, 18, 12);
  const mat = new MeshStandardMaterial({ color: new Color(0.02, 0.025, 0.03), roughness: 0.03, metalness: 0, envMapIntensity: 1.6 });
  addPatch(mat, 'drop', (s) => {
    // water bead: specular from roughness 0.03 + a refracted 'sky core' (bright centre, dark Fresnel rim) - reads as a
    // transparent lens without a transmission pass
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
{ vec3 sky = textureCubeUV( envMap, envMapRotation * vec3( 0.0, 1.0, 0.0 ), 0.5 ).rgb;
  float core = pow( saturate( dot( geometryNormal, geometryViewDir ) ), 1.5 );
  totalEmissiveRadiance += sky * envMapIntensity * ( 0.12 + 0.75 * core ) * 0.7; }
#endif`);
  });
  const mesh = new InstancedMesh(g, mat, count); const m = new Matrix4(); let k = 0; const tmp = new Vector3();
  // on blades near the subject (hanging along the blade edges), on leaf/clover/pebble tops
  const near = blades.filter((b) => Math.hypot(b.x, b.z) < 400);
  while (k < count) {
    const useBlade = rnd() < 0.6 && near.length > 0;
    let p: Vector3; let r: number; let n = UP;
    if (useBlade) {
      const b = near[Math.floor(rnd() * near.length)]!; p = bladePoint(b, 0.25 + rnd() * 0.6, tmp).clone(); r = 0.35 + rnd() * 0.9;
      p.y += r * 0.4;
    } else if (spots.length) {
      const sp = spots[Math.floor(rnd() * spots.length)]!; const a = rnd() * 6.28, d = Math.sqrt(rnd()) * sp.r;
      p = sp.p.clone().add(new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d)); r = 0.25 + Math.pow(rnd(), 2) * 1.6; n = sp.n;
      p.y += r * 0.3;
    } else break;
    m.compose(p, new Quaternion().setFromUnitVectors(UP, n), new Vector3(r, r * 0.72, r));
    mesh.setMatrixAt(k++, m);
  }
  mesh.count = k; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.name = 'droplets';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return { mesh, mat };
}
export const _keep = [vnoise, offHard, smoothstep] as const;
export type { Texture };
