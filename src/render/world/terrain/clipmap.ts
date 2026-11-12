// Terrain level-of-detail layout (pure maths, tested): a stack of camera-centred square grids ("clipmap" levels),
// each N x N quads, spacing doubling per level. Level l is snapped to multiples of 2 x its spacing so its even
// vertices coincide with level l+1's vertices. Seamless borders (no cracks, no T-junction gaps):
//  - near its outer edge every level morphs its odd vertices onto the coarser grid (CDLOD-style), so the last
//    ring of a level is geometrically the coarser level's surface;
//  - each coarser level discards fragments inside the next finer level's square (slightly shrunk so the two
//    overlap by a sliver of identical surface rather than leaving a pixel gap).
// Heights come from a texture in the vertex shader, so moving the camera only changes uniforms.

export interface ClipLevel {
  /** Grid origin (vertex 0,0) in world mm. */
  originX: number;
  originZ: number;
  /** Vertex spacing, mm. */
  spacing: number;
  /** Quads per edge. */
  n: number;
  /** Fragments inside this rectangle (the finer level) are discarded; empty for level 0 (x0 > x1). */
  innerX0: number;
  innerZ0: number;
  innerX1: number;
  innerZ1: number;
}

export interface ClipmapLayout {
  levels: ClipLevel[];
}

/** Morph band as a fraction of a level's half extent: full morph from MORPH_END to the edge. */
export const MORPH_START = 0.8;
export const MORPH_END = 0.95;
/** The discard square is shrunk by this many fine spacings so neighbouring levels overlap slightly. */
export const INNER_SHRINK = 0.5;

/** Number of levels so the outermost half-extent reaches `reachMm`. */
export function levelCountFor(spacing0: number, n: number, reachMm: number, maxLevels = 14): number {
  let l = 1;
  while (l < maxLevels && (n / 2) * spacing0 * 2 ** (l - 1) < reachMm) l++;
  return l;
}

/** Levels for a camera at (cx, cz). `n` must be a multiple of 4. */
export function layoutClipmap(cx: number, cz: number, spacing0: number, n: number, levels: number, out?: ClipmapLayout): ClipmapLayout {
  const res = out ?? { levels: [] };
  res.levels.length = levels;
  for (let l = 0; l < levels; l++) {
    const s = spacing0 * 2 ** l;
    const snap = 2 * s;
    const half = (n / 2) * s;
    const ox = Math.round((cx - half) / snap) * snap;
    const oz = Math.round((cz - half) / snap) * snap;
    const lv = res.levels[l] ?? (res.levels[l] = { originX: 0, originZ: 0, spacing: 0, n: 0, innerX0: 1, innerZ0: 1, innerX1: 0, innerZ1: 0 });
    lv.originX = ox; lv.originZ = oz; lv.spacing = s; lv.n = n;
    if (l === 0) {
      lv.innerX0 = 1; lv.innerZ0 = 1; lv.innerX1 = 0; lv.innerZ1 = 0;
    } else {
      const f = res.levels[l - 1];
      const e = INNER_SHRINK * f.spacing;
      lv.innerX0 = f.originX + e; lv.innerZ0 = f.originZ + e;
      lv.innerX1 = f.originX + f.n * f.spacing - e; lv.innerZ1 = f.originZ + f.n * f.spacing - e;
    }
  }
  return res;
}

/** Morph factor 0..1 of a vertex at grid coordinates (gx, gz) of a level (same formula as the shader). */
export function morphFactor(gx: number, gz: number, n: number): number {
  const half = n / 2;
  const d = Math.max(Math.abs(gx - half), Math.abs(gz - half)) / half;
  return Math.min(1, Math.max(0, (d - MORPH_START) / (MORPH_END - MORPH_START)));
}

/** World position of a level vertex after morphing (same formula as the shader). */
export function morphedXZ(lv: ClipLevel, gx: number, gz: number, out: { x: number; z: number }): { x: number; z: number } {
  const k = morphFactor(gx, gz, lv.n);
  // odd grid coordinates slide toward the even neighbour (fract(g / 2) * 2 = 1 for odd, 0 for even)
  const fx = gx - 2 * Math.floor(gx / 2), fz = gz - 2 * Math.floor(gz / 2);
  out.x = lv.originX + (gx - fx * k) * lv.spacing;
  out.z = lv.originZ + (gz - fz * k) * lv.spacing;
  return out;
}

export const CLIPMAP_GLSL = /* glsl */ `
// uWrLevel: originX, originZ, spacing, n. Returns morphed world xz of grid vertex g.
vec2 wrClipXZ(vec2 g, vec4 lv) {
  float half_ = lv.w * 0.5;
  vec2 dv = abs(g - vec2(half_));
  float d = max(dv.x, dv.y) / half_;
  float k = clamp((d - ${MORPH_START.toFixed(3)}) / ${(MORPH_END - MORPH_START).toFixed(3)}, 0.0, 1.0);
  vec2 f = g - 2.0 * floor(g * 0.5);
  return lv.xy + (g - f * k) * lv.z;
}
`;
