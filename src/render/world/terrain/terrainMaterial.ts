// Terrain material: MeshStandardMaterial (three's lighting, shadows, fog, IBL) patched so that
//  - the vertex shader builds the clipmap level from a flat grid: morph, height from the height texture
//    (texelFetch + bilinear, identical to the kernel's heightAt), normal from central differences at data resolution;
//  - the fragment shader discards the area a finer level covers, terrain holes and the hole mask (nest entrances),
//    then splats the two dominant ground materials of the 4 surrounding material cells from texture arrays
//    (triplanar with planar-Y fast path, dual scale against tiling, height-aware blend, jittered borders), with
//    wetness and a distance fade of the normal detail.
import { MeshStandardMaterial, Uniform, Vector4, type DataArrayTexture } from 'three';
import { GLSL_NOISE, GLSL_WET } from '../materials/glsl';
import { dappledLightsChunk, GLSL_DAPPLE } from '../materials/dapple';
import { addPatch } from '../materials/surfacePatch';
import type { WorldUniforms } from '../materials/uniforms';
import { CLIPMAP_GLSL } from './clipmap';
import { HOLE_MASK_GLSL, type HoleMaskUniforms } from './holeMask';
import { MAT_SLOTS, type TerrainLayerTable, type TerrainTextures } from './terrainData';

export interface TerrainShared {
  textures: TerrainTextures;
  arrays: { albedoRough: DataArrayTexture; normalHeight: DataArrayTexture };
  table: TerrainLayerTable;
  holeMask: HoleMaskUniforms;
  world: WorldUniforms;
}

export interface TerrainLevelUniforms {
  uWrLevel: Uniform<Vector4>;
  uWrInner: Uniform<Vector4>;
}

const VERT_DECL = /* glsl */ `
uniform sampler2D tWrHeight; uniform vec4 uWrHf; uniform vec4 uWrLevel;
varying vec3 vWrW;
${CLIPMAP_GLSL}
float wrHAt(ivec2 c) { return texelFetch(tWrHeight, clamp(c, ivec2(0), ivec2(int(uWrHf.y) - 1, int(uWrHf.z) - 1)), 0).r; }
float wrH(vec2 xz) {
  vec2 f = clamp(xz / uWrHf.x, vec2(0.0), vec2(uWrHf.y - 1.0, uWrHf.z - 1.0));
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  return mix(mix(wrHAt(i), wrHAt(i + ivec2(1, 0)), t.x), mix(wrHAt(i + ivec2(0, 1)), wrHAt(i + ivec2(1, 1)), t.x), t.y);
}
`;

const FRAG_DECL = /* glsl */ `
${GLSL_NOISE}
${GLSL_WET}
${HOLE_MASK_GLSL}
varying vec3 vWrW;
${GLSL_DAPPLE}
uniform highp sampler2DArray tWrAR; uniform highp sampler2DArray tWrNH;
uniform sampler2D tWrMat; uniform sampler2D tWrHoles;
uniform vec4 uWrMatGrid; uniform vec4 uWrHoleGrid; uniform vec4 uWrInner;
uniform vec4 uWrMatA[${MAT_SLOTS}]; uniform vec4 uWrMatB[${MAT_SLOTS}]; uniform vec4 uWrMatC[${MAT_SLOTS}];
uniform float uWet;
const mat2 WR_VAR_ROT = mat2(0.4848, 0.8746, -0.8746, 0.4848); // 61 degrees

int wrCode(ivec2 c) {
  c = clamp(c, ivec2(0), ivec2(int(uWrMatGrid.y) - 1, int(uWrMatGrid.z) - 1));
  return min(int(texelFetch(tWrMat, c, 0).r * 255.0 + 0.5), ${MAT_SLOTS - 1});
}

// Triplanar (planar-Y fast path) sample of one array layer: albedo, roughness, height proxy and normal.
void wrTriA(float layer, vec3 p, vec3 n, float sc, float ns, out vec3 alb, out vec3 nw, out float rg, out float ht) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 sg = sign(n + 1e-5);
  if (w.y > 0.985) {
    vec2 uy = p.xz / sc; uy.x *= sg.y;
    vec4 a = texture(tWrAR, vec3(uy, layer)); vec4 b = texture(tWrNH, vec3(uy, layer));
    vec3 ty = b.xyz * 2.0 - 1.0;
    // anti-tiling: a second, rotated and shifted copy of the tile fades in by low-frequency noise, so long
    // runs of one material (a road, a lawn) never show the same crack or pebble at regular intervals
    float vb = smoothstep(0.38, 0.62, wrNoise(p.xz / (sc * 1.7) + layer * 7.3));
    if (vb > 0.01) {
      vec2 uv2 = WR_VAR_ROT * uy + vec2(0.37, 0.71);
      vec4 a2 = texture(tWrAR, vec3(uv2, layer)); vec4 b2 = texture(tWrNH, vec3(uv2, layer));
      vec3 t2 = b2.xyz * 2.0 - 1.0; t2.xy = transpose(WR_VAR_ROT) * t2.xy;
      a = mix(a, a2, vb); b.a = mix(b.a, b2.a, vb); ty = normalize(mix(ty, t2, vb));
    }
    alb = a.rgb; rg = a.a; ht = b.a;
    ty.xy *= ns; ty.x *= sg.y;
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); nw = normalize(ty.xzy);
    return;
  }
  vec2 ux = p.zy / sc; ux.x *= sg.x; vec2 uy = p.xz / sc; uy.x *= sg.y; vec2 uz = p.xy / sc; uz.x *= -sg.z;
  vec4 ax = texture(tWrAR, vec3(ux, layer)), ay = texture(tWrAR, vec3(uy, layer)), az = texture(tWrAR, vec3(uz, layer));
  vec4 bx = texture(tWrNH, vec3(ux, layer)), by = texture(tWrNH, vec3(uy, layer)), bz = texture(tWrNH, vec3(uz, layer));
  alb = ax.rgb * w.x + ay.rgb * w.y + az.rgb * w.z;
  rg = ax.a * w.x + ay.a * w.y + az.a * w.z;
  ht = bx.a * w.x + by.a * w.y + bz.a * w.z;
  vec3 tx = bx.xyz * 2.0 - 1.0, ty = by.xyz * 2.0 - 1.0, tz = bz.xyz * 2.0 - 1.0;
  tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;
  tx.x *= sg.x; ty.x *= sg.y; tz.x *= -sg.z;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  nw = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}

// One material code: dual-scale sample (near tile fades into a coarser tile with distance).
void wrMaterial(int code, vec3 p, vec3 n, float dist, out vec3 alb, out vec3 nw, out float rg, out float ht) {
  vec4 A = uWrMatA[code]; vec4 C = uWrMatC[code];
  float sc = A.y;
  float ns = A.z * mix(1.0, 0.45, smoothstep(sc * 15.0, sc * 80.0, dist));
  if (C.y > 0.0) {
    float wf = smoothstep(sc * 3.0, sc * 12.0, dist);
    vec3 a1 = vec3(0.0), n1 = n, a2 = vec3(0.0), n2 = n; float r1 = 0.0, r2 = 0.0, h1 = 0.0, h2 = 0.0;
    if (wf < 0.999) wrTriA(A.x, p, n, sc, ns, a1, n1, r1, h1);
    if (wf > 0.001) wrTriA(A.x, p, n, sc * C.y, ns, a2, n2, r2, h2);
    alb = mix(a1, a2, wf); rg = mix(r1, r2, wf); ht = mix(h1, h2, wf); nw = normalize(mix(n1, n2, wf));
  } else {
    wrTriA(A.x, p, n, sc, ns, alb, nw, rg, ht);
  }
  alb *= uWrMatB[code].rgb;
  rg = max(C.w, rg * A.w);
}
`;

const FRAG_MAIN = /* glsl */ `
if (vWrW.x > uWrInner.x && vWrW.x < uWrInner.z && vWrW.z > uWrInner.y && vWrW.z < uWrInner.w) discard;
if (wrHoleMask(vWrW.xz) > 0.5) discard;
if (uWrHoleGrid.z > 0.5) {
  ivec2 hc = ivec2(floor(vWrW.xz / uWrMatGrid.w));
  if (hc.x >= 0 && hc.y >= 0 && hc.x < int(uWrHoleGrid.x) && hc.y < int(uWrHoleGrid.y) && texelFetch(tWrHoles, hc, 0).r > 0.0) discard;
}
vec3 wrN0 = normalize(vNormalWr);
float wrDist = length(vWrW - cameraPosition);
// material cells: centres at (i + 0.5) * cell; borders jittered by noise so they never run straight
vec2 wrCf = vWrW.xz / uWrMatGrid.x - 0.5;
// laid hard surfaces keep crisp edges: the jitter is the smaller one of the cell's own material and its neighbours'
float wrJit = uWrMatC[wrCode(ivec2(floor(wrCf + 0.5)))].z;
wrCf += (vec2(wrNoise(vWrW.xz / (uWrMatGrid.x * 0.6)), wrNoise(vWrW.zx / (uWrMatGrid.x * 0.6) + 17.3)) - 0.5) * 0.7 * wrJit;
ivec2 wrC = ivec2(floor(wrCf)); vec2 wrT = wrCf - vec2(wrC);
// sharpen the bilinear weights between hard materials (a tile edge is a line, not a 16 mm gradient)
wrT = mix(smoothstep(0.42, 0.58, wrT), wrT, wrJit);
int ids[4]; float ws[4];
ids[0] = wrCode(wrC); ids[1] = wrCode(wrC + ivec2(1, 0)); ids[2] = wrCode(wrC + ivec2(0, 1)); ids[3] = wrCode(wrC + ivec2(1, 1));
ws[0] = (1.0 - wrT.x) * (1.0 - wrT.y); ws[1] = wrT.x * (1.0 - wrT.y); ws[2] = (1.0 - wrT.x) * wrT.y; ws[3] = wrT.x * wrT.y;
for (int i = 1; i < 4; i++) for (int j = 0; j < i; j++) if (ids[j] == ids[i]) { ws[j] += ws[i]; ws[i] = 0.0; }
int ia = 0; for (int i = 1; i < 4; i++) if (ws[i] > ws[ia]) ia = i;
int ib = ia == 0 ? 1 : 0; for (int i = 0; i < 4; i++) if (i != ia && ws[i] > ws[ib]) ib = i;
int codeA = ids[ia], codeB = ids[ib];
float wA = ws[ia], wB = ws[ib];
vec3 wrAlb; vec3 wrNw; float wrRg; float wrHt;
wrMaterial(codeA, vWrW, wrN0, wrDist, wrAlb, wrNw, wrRg, wrHt);
float wrWD = uWrMatB[codeA].w, wrWR = uWrMatC[codeA].x;
if (wB > 0.02) {
  vec3 bA; vec3 bN; float bR; float bH;
  wrMaterial(codeB, vWrW, wrN0, wrDist, bA, bN, bR, bH);
  // height-aware blend: grains of the higher layer poke through first
  float t = wB / (wA + wB);
  float hb = clamp((t - 0.5) * 5.0 + 0.5 + (bH - wrHt) * 2.0, 0.0, 1.0);
  wrAlb = mix(wrAlb, bA, hb); wrNw = normalize(mix(wrNw, bN, hb)); wrRg = mix(wrRg, bR, hb);
  wrWD = mix(wrWD, uWrMatB[codeB].w, hb); wrWR = mix(wrWR, uWrMatC[codeB].x, hb);
}
// macro variation so large areas never look printed
wrAlb *= mix(0.86, 1.12, wrFbm(vWrW.xz / 340.0));
float wrWet = uWet;
diffuseColor.rgb *= wrWetAlbedo(wrAlb, wrWet, wrWD);
`;

export function createTerrainMaterial(shared: TerrainShared): { material: MeshStandardMaterial; level: TerrainLevelUniforms } {
  const level: TerrainLevelUniforms = {
    uWrLevel: new Uniform(new Vector4(0, 0, 1, 1)),
    uWrInner: new Uniform(new Vector4(1, 1, 0, 0)),
  };
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.name = 'world:terrain';
  addPatch(m, 'terrain-v1', (s) => {
    const t = shared.textures.uniforms;
    Object.assign(s.uniforms, {
      tWrHeight: t.tWrHeight, uWrHf: t.uWrHf, tWrMat: t.tWrMat, tWrHoles: t.tWrHoles, uWrMatGrid: t.uWrMatGrid, uWrHoleGrid: t.uWrHoleGrid,
      tWrAR: { value: shared.arrays.albedoRough }, tWrNH: { value: shared.arrays.normalHeight },
      uWrMatA: { value: shared.table.matA }, uWrMatB: { value: shared.table.matB }, uWrMatC: { value: shared.table.matC },
      uWet: shared.world.uWet,
      uWrDapple: shared.world.uDapple, uWrDappleMm: shared.world.uDappleMm,
      tWrCanopy: shared.world.tDappleMask, uWrCanopyInv: shared.world.uDappleMaskInv,
      ...shared.holeMask,
      ...level,
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}\nvarying vec3 vNormalWr;`)
      .replace('#include <beginnormal_vertex>', `
vec2 wrXZ = wrClipXZ(position.xz, uWrLevel);
float wrE = uWrHf.x;
vec3 objectNormal = normalize(vec3(wrH(wrXZ - vec2(wrE, 0.0)) - wrH(wrXZ + vec2(wrE, 0.0)), 2.0 * wrE, wrH(wrXZ - vec2(0.0, wrE)) - wrH(wrXZ + vec2(0.0, wrE))));
vNormalWr = objectNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(wrXZ.x, wrH(wrXZ), wrXZ.y);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWrW = transformed;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}\nvarying vec3 vNormalWr;`)
      .replace('#include <map_fragment>', FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wrWetRough(roughness * wrRg, wrWet, wrWR);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(wrNw, 0.0)).xyz);')
      .replace('#include <lights_fragment_begin>', dappledLightsChunk());
  });
  return { material: m, level };
}
