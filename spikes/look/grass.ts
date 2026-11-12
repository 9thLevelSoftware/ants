/**
 * Instanced grass blades at true scale: 3-5 mm wide, 40-120 mm tall (a 4 mm ant sees a forest).
 *
 * Technique
 *  - One procedural blade mesh (rows x 3 vertices: left edge, folded midrib, right edge), drawn with
 *    InstancedBufferGeometry; ALL placement/bending happens in the vertex shader from per-instance attributes:
 *      iRoot (xyz root), iShape (height, width, yaw, rand), iBend (lean, curvature, hue, atlas strip).
 *  - Centreline = analytic integral of a linearly varying bend angle (length preserving), then a wind/parting rotation
 *    about the root whose angle grows with height (Rodrigues), so blades never stretch.
 *  - Wind: travelling gust wave along the wind direction + per-blade flutter (uWind, uWindDir, uTime).
 *  - Parting: blades whose root is near the camera->subject segment bend away from it and dither-fade
 *    (screen-door alpha, keeps the opaque pipeline and shadows); blades within ~20 mm of the eye fade too.
 *  - Colour: real scanned blade colour from the CC0 atlas, straightened into 7 strips at load (textures.ts),
 *    base darkening (AO), per-blade hue/dryness. Back-lit translucency added in the light loop (shaders.ts).
 *  - Chunked into 250 mm cells (separate draws with bounding spheres) so three's frustum culling drops
 *    off-screen cells in both the main and the shadow pass. Density falls with distance from the subject,
 *    far blades get wider to keep coverage; beyond ~1.6 m the terrain's lawn tint takes over.
 */
import {
  BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshDepthMaterial,
  MeshStandardMaterial, RGBADepthPacking, Sphere, Vector3, Group,
} from 'three';
import type { Texture, WebGLProgramParametersWithUniforms } from 'three';
import { mulberry32, smoothstep } from './rng';
import { groundY, grassDensity } from './terrain';
import { U, addPatch, translucency } from './shaders';
import { GRASS_STRIPS } from './textures';

export interface BladeInfo { x: number; y: number; z: number; h: number; w: number; yaw: number; lean: number; curve: number }

/** blade mesh in parameter space: position.x = across (-1..1), position.y = along (0..1) */
function bladeGeometry(rows: number, folded: boolean) {
  const cols = folded ? 3 : 2; const pos: number[] = []; const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const h = r / rows;
    if (r === rows) { pos.push(0, 1, 0); break; } // tip
    for (let c = 0; c < cols; c++) pos.push(cols === 3 ? c - 1 : c * 2 - 1, h, 0);
  }
  for (let r = 0; r < rows; r++) {
    const a = r * cols, b = (r + 1) * cols;
    if (r === rows - 1) { for (let c = 0; c < cols - 1; c++) idx.push(a + c, a + c + 1, b); continue; }
    for (let c = 0; c < cols - 1; c++) idx.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return { g, tris: idx.length / 3 };
}

const VERT_HEAD = /* glsl */`
attribute vec3 iRoot; attribute vec4 iShape; attribute vec4 iBend;
uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform vec3 uCamPos; uniform vec3 uSubject; uniform float uPart;
varying float vBH; varying float vBS; varying float vBFade; varying vec3 vBInfo;
vec3 lkRot(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }
void bladeShape(out vec3 P, out vec3 N) {
  float s = position.x, h = position.y;
  float H = iShape.x, W = iShape.y, yaw = iShape.z, rnd = iShape.w;
  vec3 fwd = vec3(sin(yaw), 0.0, cos(yaw)), side = vec3(cos(yaw), 0.0, -sin(yaw)), up = vec3(0.0, 1.0, 0.0);
  float a = iBend.x, b = iBend.y;
  // length-preserving centreline for bend angle theta(t) = a + b t
  float xl, yl;
  if (abs(b) < 1e-3) { xl = sin(a) * h; yl = cos(a) * h; }
  else { xl = (cos(a) - cos(a + b * h)) / b; yl = (sin(a + b * h) - sin(a)) / b; }
  float th = a + b * h;
  vec3 c = (fwd * xl + up * yl) * H;
  vec3 tang = fwd * sin(th) + up * cos(th);
  vec3 nrm = fwd * cos(th) - up * sin(th);
  // width profile: parallel-sided, tapering over the top ~30 %, slightly pinched at the base
  float w = 0.5 * W * pow(clamp((1.0 - h) / 0.3, 0.0, 1.0), 0.75) * (0.8 + 0.2 * smoothstep(0.0, 0.08, h));
  vec3 p = c + side * s * w;
  p += nrm * (1.0 - abs(s)) * w * 0.35;                 // folded midrib (V cross-section)
  vec3 n = normalize(nrm + side * s * 0.45);
  // ---- wind: travelling gusts + flutter -> extra bend toward the wind direction, growing with height
  vec2 wd = uWindDir;
  float ph = dot(iRoot.xz, wd) * 0.006 - uTime * 1.7;
  float gust = 0.55 + 0.45 * sin(ph) * sin(ph * 0.43 + 1.7);
  float flut = sin(uTime * (5.0 + rnd * 4.0) + rnd * 40.0) * 0.18;
  vec2 push = wd * uWind * (gust + flut) * (0.6 + 0.8 * rnd) * (60.0 / H);
  // ---- parting around the camera -> subject line of sight
  vec2 A = uCamPos.xz, B = uSubject.xz + normalize(uSubject.xz - uCamPos.xz + 1e-4) * 6.0;
  vec2 ab = B - A; float t = clamp(dot(iRoot.xz - A, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  vec2 cl = A + ab * t; vec2 away = iRoot.xz - cl; float d = length(away);
  float R = 22.0 + 0.25 * H;
  float part = (1.0 - smoothstep(R * 0.35, R, d)) * uPart;
  push += (away / max(d, 1e-3)) * part * 1.3;
  vBFade = smoothstep(R * 0.15, R * 0.75, d) + (1.0 - step(0.001, part));
  float ang = length(push);
  if (ang > 1e-4) {
    vec3 axis = normalize(cross(up, vec3(push.x, 0.0, push.y)));
    float k = ang * h;                                    // rotation grows along the blade -> curved, not hinged
    p = lkRot(p, axis, k); n = lkRot(n, axis, k);
  }
  P = iRoot + p; N = n;
  vBH = h; vBS = s;
  vBInfo = vec3(iBend.z, iBend.w, rnd);
  // eye-proximity fade (camera inside a meadow)
  vBFade = min(clamp(vBFade, 0.0, 1.0), mix(1.0, smoothstep(8.0, 22.0, length(P - uCamPos)), uPart));
}
`;

export interface GrassBuild { group: Group; count: number; trisPerBlade: number; blades: BladeInfo[]; material: MeshStandardMaterial }

export function buildGrass(opts: { count: number; rows: number; folded: boolean; strip: Texture | null; seed?: number }): GrassBuild {
  const rnd = mulberry32(opts.seed ?? 99);
  const blades: BladeInfo[] = [];
  // rejection-sample positions: density = mask * falloff(r) ; radius up to 1700 mm around the subject
  const target = opts.count; let guard = 0;
  while (blades.length < target && guard++ < target * 60) {
    const r = 1700 * Math.pow(rnd(), 0.62), a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.15 - 120;
    const dens = grassDensity(x, z);
    if (dens <= 0.01 || rnd() > dens) continue;
    // fewer, wider blades far away (keeps coverage), full density near the subject
    const far = smoothstep(250, 1600, Math.hypot(x, z));
    if (rnd() < far * 0.55) continue;
    const tall = rnd();
    const h = (40 + 80 * Math.pow(tall, 1.3)) * (0.75 + 0.25 * dens);
    const w = (3 + 2 * rnd()) * (1 + far * 1.2);
    blades.push({ x, y: groundY(x, z) - 1.0, z, h, w, yaw: rnd() * Math.PI * 2, lean: 0.05 + rnd() * 0.35, curve: 0.2 + rnd() * 0.9 });
  }
  // chunk into 250 mm cells
  const C = 250; const cells = new Map<string, BladeInfo[]>();
  for (const b of blades) { const k = Math.floor(b.x / C) + ',' + Math.floor(b.z / C); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(b); }

  const { g: proto, tris } = bladeGeometry(opts.rows, opts.folded);
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: DoubleSide });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  const patchVert = (s: WebGLProgramParametersWithUniforms, std: boolean) => {
    Object.assign(s.uniforms, { uTime: U.uTime, uWindDir: U.uWindDir, uWind: U.uWind, uCamPos: U.uCamPos, uSubject: U.uSubject, uPart: U.uPart });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD);
    if (std) {
      s.vertexShader = s.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 bladeP; vec3 objectNormal; bladeShape(bladeP, objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = bladeP;');
    } else {
      s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 bladeP; vec3 bladeN; bladeShape(bladeP, bladeN); vec3 transformed = bladeP;');
    }
  };
  addPatch(mat, 'grass', (s) => {
    patchVert(s, true);
    s.uniforms.tStrip = { value: opts.strip };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tStrip; varying float vBH; varying float vBS; varying float vBFade; varying vec3 vBInfo;
float bHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <map_fragment>', `
if (vBFade < 0.999 && bHash(floor(gl_FragCoord.xy)) > vBFade) discard;
${opts.strip ? `vec3 bc = texture2D(tStrip, vec2(0.02 + vBH * 0.96, 1.0 - (vBInfo.y + 0.5 + vBS * 0.4) / ${GRASS_STRIPS.toFixed(1)})).rgb;`
    : `vec3 bc = mix(vec3(0.05, 0.13, 0.02), vec3(0.16, 0.3, 0.05), vBH) * (0.9 + 0.1 * sin(vBS * 18.0));`}
bc *= vec3(1.0 + vBInfo.x * 0.25, 1.0, 1.0 - vBInfo.x * 0.35);                    // hue variety (yellower / bluer)
bc = mix(bc, vec3(0.42, 0.36, 0.17), smoothstep(0.86, 1.0, vBH) * step(0.6, vBInfo.z) * 0.7); // some dry tips
bc *= mix(0.28, 1.0, smoothstep(0.0, 0.55, vBH));                                   // self-shadowed base
diffuseColor.rgb *= bc;
`);
  });
  translucency(mat, 0.9, [1.25, 1.45, 0.55]);
  addPatch(depth, 'grassDepth', (s) => patchVert(s, false));

  const group = new Group(); group.name = 'grass';
  for (const list of cells.values()) {
    const n = list.length; const g = new InstancedBufferGeometry();
    g.setAttribute('position', proto.getAttribute('position')); g.setIndex(proto.getIndex());
    const root = new Float32Array(n * 3), shape = new Float32Array(n * 4), bend = new Float32Array(n * 4);
    const ctr = new Vector3(); let hmax = 0;
    list.forEach((b, i) => {
      root.set([b.x, b.y, b.z], i * 3);
      shape.set([b.h, b.w, b.yaw, rnd()], i * 4);
      bend.set([b.lean, b.curve, rnd() * 2 - 1, Math.floor(rnd() * GRASS_STRIPS)], i * 4);
      ctr.x += b.x; ctr.y += b.y; ctr.z += b.z; hmax = Math.max(hmax, b.h);
    });
    ctr.multiplyScalar(1 / n);
    let rad = 0; for (const b of list) rad = Math.max(rad, Math.hypot(b.x - ctr.x, b.z - ctr.z, b.y - ctr.y));
    g.setAttribute('iRoot', new InstancedBufferAttribute(root, 3));
    g.setAttribute('iShape', new InstancedBufferAttribute(shape, 4));
    g.setAttribute('iBend', new InstancedBufferAttribute(bend, 4));
    g.instanceCount = n;
    g.boundingSphere = new Sphere(ctr.clone().add(new Vector3(0, hmax * 0.5, 0)), rad + hmax);
    const m = new Mesh(g, mat); m.customDepthMaterial = depth; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return { group, count: blades.length, trisPerBlade: tris, blades, material: mat };
}

/** CPU copy of the (wind-free) centreline, used to put rain droplets on blades. */
export function bladePoint(b: BladeInfo, h: number, out = new Vector3()) {
  const a = b.lean, k = b.curve;
  const xl = Math.abs(k) < 1e-3 ? Math.sin(a) * h : (Math.cos(a) - Math.cos(a + k * h)) / k;
  const yl = Math.abs(k) < 1e-3 ? Math.cos(a) * h : (Math.sin(a + k * h) - Math.sin(a)) / k;
  return out.set(b.x + Math.sin(b.yaw) * xl * b.h, b.y + yl * b.h, b.z + Math.cos(b.yaw) * xl * b.h);
}
export const _unused = smoothstep;
