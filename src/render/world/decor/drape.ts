// Draping onto the terrain AS DRAWN. The terrain is a clipmap of triangulated grids whose vertex spacing doubles per
// level (terrain/clipmap.ts); its triangles deviate from the bilinear heightfield by up to a millimetre in rough
// ground. Decor that must lie ON the ground (ants stand on top of it) therefore evaluates exactly the triangle the
// terrain draws at that point: the same level choice, the same diagonal, the same morph toward the coarser level.
// The layout is recomputed from the terrain's public pieces (TERRAIN_QUALITY, layoutClipmap, levelCountFor) with the
// same camera, so it matches the terrain renderer frame by frame without touching its files.
//
// `drapeHeight` (CPU) and DRAPE_GLSL (GPU) are twins: keep them in sync (the tests compare the CPU twin against the
// terrain's own vertex formula, morphedXZ).
import type { QualityPreset } from '@/render/app';
import { layoutClipmap, levelCountFor, MORPH_END, MORPH_START, type ClipLevel, type ClipmapLayout } from '../terrain/clipmap';
import { sampleHeight } from '../terrain/terrainData';
import { TERRAIN_QUALITY } from '../terrain/terrainQuality';
import type { TerrainSource } from '../lighting/simAdapter';

/** Upper bound on clipmap levels the shader loops over (levelCountFor caps at 14). */
export const DRAPE_MAX_LEVELS = 14;

/** Terrain clipmap parameters for a source and a preset (as TerrainRenderer.buildLevels computes them). */
export function clipmapParams(src: Pick<TerrainSource, 'cell' | 'bu' | 'worldSize'>, q: QualityPreset): { spacing0: number; n: number; levels: number } {
  const tq = TERRAIN_QUALITY[q.id];
  const spacing0 = src.cell * tq.spacingCells;
  const reach = Math.max(q.drawDistanceBU * src.bu, src.worldSize * 0.75);
  return { spacing0, n: tq.gridQuads, levels: levelCountFor(spacing0, tq.gridQuads, reach) };
}

export function drapeLayout(camX: number, camZ: number, p: { spacing0: number; n: number; levels: number }, out?: ClipmapLayout): ClipmapLayout {
  return layoutClipmap(camX, camZ, p.spacing0, p.n, p.levels, out);
}

type HSrc = Pick<TerrainSource, 'cell' | 'nx' | 'nz' | 'heights'>;

/** Height of the terrain grid triangulation with vertex spacing `s` (vertices at multiples of s, diagonal (i+1,j)-(i,j+1)). */
export function triHeight(src: HSrc, x: number, z: number, s: number): number {
  const gx = x / s, gz = z / s, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
  const ha = sampleHeight(src, i * s, j * s), hb = sampleHeight(src, (i + 1) * s, j * s), hc = sampleHeight(src, i * s, (j + 1) * s);
  if (u + v <= 1) return ha + u * (hb - ha) + v * (hc - ha);
  const hd = sampleHeight(src, (i + 1) * s, (j + 1) * s);
  return hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
}

/** Index of the clipmap level that draws the ground at (x, z). */
export function drapeLevel(layout: ClipmapLayout, x: number, z: number): number {
  const ls = layout.levels;
  for (let l = 0; l < ls.length; l++) {
    const lv = ls[l], gx = (x - lv.originX) / lv.spacing, gz = (z - lv.originZ) / lv.spacing;
    if (gx >= 0.5 && gz >= 0.5 && gx <= lv.n - 0.5 && gz <= lv.n - 0.5) return l;
  }
  return ls.length - 1;
}

const MORPH_RANGE = MORPH_END - MORPH_START;

/** Morphed world xz of level vertex (gi, gk) (terrain/clipmap.ts wrClipXZ), into out[0..1]. */
function morphVertex(lv: ClipLevel, gi: number, gk: number, out: number[], o: number): void {
  const half = lv.n / 2, d = Math.max(Math.abs(gi - half), Math.abs(gk - half)) / half;
  const k = Math.min(1, Math.max(0, (d - MORPH_START) / MORPH_RANGE));
  out[o] = lv.originX + (gi - (gi - 2 * Math.floor(gi / 2)) * k) * lv.spacing;
  out[o + 1] = lv.originZ + (gk - (gk - 2 * Math.floor(gk / 2)) * k) * lv.spacing;
}

const _v = [0, 0, 0, 0, 0, 0, 0, 0];

/** Barycentric interpolation of heights at (x, z) in triangle (p, q, r) given as xz pairs; NaN outside. */
function inTri(src: HSrc, x: number, z: number, px: number, pz: number, qx: number, qz: number, rx: number, rz: number): number {
  const det = (qz - rz) * (px - rx) + (rx - qx) * (pz - rz);
  if (Math.abs(det) < 1e-9) return NaN;
  const w1 = ((qz - rz) * (x - rx) + (rx - qx) * (z - rz)) / det;
  const w2 = ((rz - pz) * (x - rx) + (px - rx) * (z - rz)) / det;
  const w3 = 1 - w1 - w2, e = -1e-6;
  if (w1 < e || w2 < e || w3 < e) return NaN;
  return w1 * sampleHeight(src, px, pz) + w2 * sampleHeight(src, qx, qz) + w3 * sampleHeight(src, rx, rz);
}

/** Height of the drawn terrain at (x, z), mm (CPU twin of drapeY in DRAPE_GLSL). */
export function drapeHeight(src: HSrc, layout: ClipmapLayout, x: number, z: number): number {
  const l = drapeLevel(layout, x, z), lv = layout.levels[l];
  const half = lv.n / 2, gx = (x - lv.originX) / lv.spacing, gz = (z - lv.originZ) / lv.spacing;
  const d = Math.max(Math.abs(gx - half), Math.abs(gz - half)) / half;
  // no vertex of the surrounding quads morphs: the plain triangulation of this level
  if (d < MORPH_START - 2 / half) return triHeight(src, x, z, lv.spacing);
  // morph band: find the morphed triangle that contains the point (vertices slide by at most one quad)
  const i0 = Math.floor(gx), k0 = Math.floor(gz), v = _v;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, k = k0 + dk;
    morphVertex(lv, i, k, v, 0); morphVertex(lv, i + 1, k, v, 2); morphVertex(lv, i, k + 1, v, 4); morphVertex(lv, i + 1, k + 1, v, 6);
    let h = inTri(src, x, z, v[0], v[1], v[4], v[5], v[2], v[3]);
    if (h === h) return h;
    h = inTri(src, x, z, v[2], v[3], v[4], v[5], v[6], v[7]);
    if (h === h) return h;
  }
  return triHeight(src, x, z, lv.spacing);
}

/**
 * GLSL of the drape. Uniforms: tDrH (R32F heights, texelFetch), uDrHf (cell mm, nx, nz, -), uDrLv[] (originX,
 * originZ, spacing, n per level), uDrCount (levels in use).
 */
export const DRAPE_GLSL = /* glsl */ `
uniform highp sampler2D tDrH; uniform vec4 uDrHf; uniform vec4 uDrLv[${DRAPE_MAX_LEVELS}]; uniform int uDrCount;
float drHAt(ivec2 c) { return texelFetch(tDrH, clamp(c, ivec2(0), ivec2(int(uDrHf.y) - 1, int(uDrHf.z) - 1)), 0).r; }
float drH(vec2 xz) {
  vec2 f = clamp(xz / uDrHf.x, vec2(0.0), vec2(uDrHf.y - 1.0, uDrHf.z - 1.0));
  ivec2 i = ivec2(min(floor(f), vec2(uDrHf.y - 2.0, uDrHf.z - 2.0))); vec2 t = f - vec2(i);
  return mix(mix(drHAt(i), drHAt(i + ivec2(1, 0)), t.x), mix(drHAt(i + ivec2(0, 1)), drHAt(i + ivec2(1, 1)), t.x), t.y);
}
float drTri(vec2 xz, float s) {
  vec2 g = xz / s; vec2 i = floor(g); vec2 f = g - i;
  float ha = drH(i * s), hb = drH((i + vec2(1.0, 0.0)) * s), hc = drH((i + vec2(0.0, 1.0)) * s);
  if (f.x + f.y <= 1.0) return ha + f.x * (hb - ha) + f.y * (hc - ha);
  float hd = drH((i + 1.0) * s);
  return hd + (1.0 - f.x) * (hc - hd) + (1.0 - f.y) * (hb - hd);
}
vec2 drMorph(vec2 g, vec4 lv) {
  float hf = lv.w * 0.5; vec2 dv = abs(g - vec2(hf));
  float k = clamp((max(dv.x, dv.y) / hf - ${MORPH_START.toFixed(3)}) / ${(MORPH_END - MORPH_START).toFixed(3)}, 0.0, 1.0);
  return lv.xy + (g - (g - 2.0 * floor(g * 0.5)) * k) * lv.z;
}
// Height at xz if it lies in triangle (p, q, r), else a value below -1e8.
float drInTri(vec2 xz, vec2 p, vec2 q, vec2 r) {
  float det = (q.y - r.y) * (p.x - r.x) + (r.x - q.x) * (p.y - r.y);
  if (abs(det) < 1e-9) return -1e9;
  float w1 = ((q.y - r.y) * (xz.x - r.x) + (r.x - q.x) * (xz.y - r.y)) / det;
  float w2 = ((r.y - p.y) * (xz.x - r.x) + (p.x - r.x) * (xz.y - r.y)) / det;
  float w3 = 1.0 - w1 - w2;
  if (min(w1, min(w2, w3)) < -1e-6) return -1e9;
  return w1 * drH(p) + w2 * drH(q) + w3 * drH(r);
}
float drapeY(vec2 xz) {
  vec4 lv = uDrLv[0];
  for (int l = 0; l < ${DRAPE_MAX_LEVELS}; l++) {
    if (l >= uDrCount) break;
    lv = uDrLv[l];
    vec2 g = (xz - lv.xy) / lv.z;
    if (g.x >= 0.5 && g.y >= 0.5 && g.x <= lv.w - 0.5 && g.y <= lv.w - 0.5) break;
  }
  float hf = lv.w * 0.5;
  vec2 g = (xz - lv.xy) / lv.z;
  float d = max(abs(g.x - hf), abs(g.y - hf)) / hf;
  if (d < ${MORPH_START.toFixed(3)} - 2.0 / hf) return drTri(xz, lv.z);
  vec2 g0 = floor(g);
  for (int dk = -1; dk <= 1; dk++) for (int di = -1; di <= 1; di++) {
    vec2 q = g0 + vec2(float(di), float(dk));
    vec2 a = drMorph(q, lv), b = drMorph(q + vec2(1.0, 0.0), lv), c = drMorph(q + vec2(0.0, 1.0), lv), e = drMorph(q + vec2(1.0), lv);
    float h = drInTri(xz, a, c, b);
    if (h > -1e8) return h;
    h = drInTri(xz, b, c, e);
    if (h > -1e8) return h;
  }
  return drTri(xz, lv.z);
}
// Bilinear ground normal (shading only), central differences at data resolution.
vec3 drN(vec2 xz) {
  float e = uDrHf.x;
  float hx = drH(xz + vec2(e, 0.0)) - drH(xz - vec2(e, 0.0)), hz = drH(xz + vec2(0.0, e)) - drH(xz - vec2(0.0, e));
  return normalize(vec3(-hx, 2.0 * e, -hz));
}
`;
