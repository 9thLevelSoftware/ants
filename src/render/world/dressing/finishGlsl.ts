// Shader side of the per-instance finishes (finishes.ts, looks.ts): GLSL injected by the surface patch into the
// primitive materials. Everything is computed in primitive-local space (vWrP = local position, vWrN = local normal,
// vWrSize = half extents), so a moved object keeps its pattern. Organic finishes cut silhouettes by discarding
// (the opaque pipeline, shadows and DoF depth stay intact) and the depth material applies the same cut.
//
// Inputs (fragment): wrAlb (texture albedo x material tint), wrNw (local shading normal), wrRg (texture roughness),
// vColor (instance colour), vWrLook, vWrSize, vWrEdge. Outputs: wrAlb (final albedo incl. colour), wrNw,
// wrRoughO (-1 = material roughness), wrMetal, wrCoat (clear-coat weight), wrTransl (back-lit translucency).
import { FINISH, LEAF_STYLE } from './finishes';

const F = FINISH;

/** Vertex declarations + main (after the primitive vertex expansion; `normal` = unit direction attribute). */
export const LOOK_VERT_DECL = /* glsl */ `
attribute vec4 iLook;
varying vec4 vWrLook; varying vec4 vWrSize; varying float vWrEdge;
`;
export const LOOK_VERT_MAIN = /* glsl */ `
vWrLook = iLook; vWrSize = iSize;
// 0 on flat faces, ~0.3 on 45 degree rounded edges, ~0.42 at corners (edge wear, rims)
vWrEdge = 1.0 - max(max(abs(normal.x), abs(normal.y)), abs(normal.z));
`;

/** Leaf outline: half width (0..1 of the box width) at t = 0 base .. 1 tip, per style. */
export const LEAF_OUTLINE_GLSL = /* glsl */ `
float wrLeafHalfWidth(float t, float style, float seed) {
  t = clamp(t, 0.0, 1.0);
  float w;
  if (style < ${LEAF_STYLE.toothed}.5) w = pow(sin(3.14159 * pow(t, 0.8)), 0.8) * (1.0 - 0.12 * t);          // lanceolate
  else if (style < ${LEAF_STYLE.spatulate}.5) {                                                             // dandelion: runcinate teeth
    float saw = fract(t * 5.0 + seed * 0.7);
    w = pow(sin(3.14159 * pow(t, 0.75)), 0.7) * mix(0.5, 1.0, pow(saw, 0.6));
  }
  else if (style < ${LEAF_STYLE.obovate}.5) w = mix(0.28, 1.0, smoothstep(0.1, 0.7, t)) * sqrt(max(0.0, 1.0 - pow(max(0.0, t - 0.7) / 0.3, 2.0)));
  else if (style < ${LEAF_STYLE.ovate}.5) w = pow(sin(3.14159 * pow(t, 1.35)), 0.6) * (1.0 - 0.25 * exp(-pow((1.0 - t) * 14.0, 2.0)));
  else w = pow(sin(3.14159 * pow(t, 0.62)), 0.75);                                                          // ovate
  return w;
}
// true when a local point of a leaf box lies outside the leaf outline (x = length, z = width)
bool wrLeafCut(vec3 lp, vec4 sz, vec4 lk) {
  float t = lp.x / max(sz.x, 1e-3) * 0.5 + 0.5;
  float v = abs(lp.z) / max(sz.z, 1e-3);
  return v > wrLeafHalfWidth(t, lk.y, lk.w) * 0.98;
}
`;

/** Fragment declarations (needs GLSL_NOISE). */
export const LOOK_FRAG_DECL = /* glsl */ `
varying vec4 vWrLook; varying vec4 vWrSize; varying float vWrEdge;
${LEAF_OUTLINE_GLSL}
float wrLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// the texture as detail around its own mean colour (the instance colour gives the hue)
vec3 wrDetail(vec3 alb, float keep) {
  vec3 avg = max(textureLod(tWrA, vec2(0.5), 12.0).rgb * uWrTint, vec3(0.03));
  float l = clamp(wrLuma(alb) / wrLuma(avg), 0.35, 1.9);
  return vec3(mix(1.0, l, keep));
}
float wrCells(vec2 p) { vec2 f = fract(p) - 0.5; return length(f); }
`;

/**
 * Fragment main: runs after wrAlb / wrNw / wrRg are known, before wetness and lighting. Local frame: lp, ln.
 * `rustScan` = the material's texture is the rust scan (metal): rust shows where the scan is rusty and wear allows.
 */
export function lookFragMain(rustScan: boolean): string {
  return /* glsl */ `
vec3 wrCol = vColor.rgb;
float wrRoughO = -1.0, wrMetal = metalness, wrCoat = 0.0, wrTransl = 0.0;
{
  vec4 lk = vWrLook;
  int fin = int(lk.x + 0.5);
  vec3 lp = vWrP, ln = normalize(vWrN), hs = vWrSize.xyz;
  vec3 raw = wrAlb;
  if (fin == ${F.natural}) {
    wrAlb *= wrCol;
  } else if (fin <= ${F.tyre} || fin == ${F.glass} || fin == ${F.carBody}) {
    // ---- re-coloured man-made surfaces
    vec3 det = wrDetail(raw, lk.w);
    float wear = lk.y * (0.3 + 2.2 * vWrEdge);
    float rust = 0.0;
    ${rustScan ? `float rs = clamp((raw.r - raw.b) * 3.0, 0.0, 1.0);
    // the rust scan's blotches are no paint detail: clean finishes get a faint procedural mottle instead
    det = vec3(mix(1.0, 0.93 + 0.14 * wrNoise(lp.xz * 0.7 + lp.y * 0.3), lk.w));
    rust = fin == ${F.rust} ? 1.0 : smoothstep(0.86, 0.98, rs * 0.62 + wear * 0.75 + 0.22 * wrNoise(lp.xz * 0.35 + lp.y * 0.2));` : `det *= 1.0 - 0.3 * smoothstep(0.4, 0.9, wear * wrNoise(lp.xz * 0.8 + lp.y));`}
    vec3 col = wrCol;
    float rough = lk.z > 0.0 ? lk.z : max(WR_ROUGHMIN, roughness * wrRg);
    float metal = 0.0;
    // bare metal: brushed / rolled grain (streaks along the longest local axis) in the roughness
    if (fin == ${F.metal}) { metal = 1.0; vec3 g3 = hs.x > hs.y ? lp.yzx : lp; rough *= mix(0.88, 1.12, wrNoise(vec2(g3.x * 6.0 + g3.z * 6.0, g3.y * 0.3))); }
    else if (fin == ${F.clearcoat}) { wrCoat = 1.0; metal = 0.15; }
    else if (fin == ${F.carBody}) {
      // panel seams (doors, bonnet, boot) on the sides and top, a dark sill strip and shade inside the wheel arches
      wrCoat = 1.0; metal = 0.15;
      vec3 q = lp / max(hs, vec3(1e-3));
      float seam = 0.0;
      if (abs(ln.x) > 0.6) seam = max(1.0 - smoothstep(0.0, 0.006, abs(abs(q.z) - 0.42)), 1.0 - smoothstep(0.0, 0.006, abs(q.z + 0.02)));
      if (ln.y > 0.6) seam = 1.0 - smoothstep(0.0, 0.006, abs(abs(q.z) - 0.62));
      col *= 1.0 - 0.75 * seam;
      if (q.y < -0.55) { col = mix(col, vec3(0.02), 0.85); wrCoat = 0.2; }
      float arch = max(1.0 - smoothstep(0.18, 0.24, length(vec2(abs(q.z) - 0.68, q.y + 1.0))), 0.0);
      col *= 1.0 - 0.9 * arch;
    }
    else if (fin == ${F.glass}) { wrCoat = 1.0; rough = mix(lk.z, 0.18, smoothstep(0.55, 0.9, wrNoise(lp.xz * 0.05 + lp.y * 0.04))); }
    else if (fin == ${F.cabin}) {
      // windows on the sides of the cabin, painted roof and pillars
      bool side = abs(ln.y) < 0.6;
      float yy = lp.y / max(hs.y, 1e-3);
      bool pillar = abs(fract(lp.z / max(hs.z, 1e-3) * 1.6 + 0.5) - 0.5) < 0.05;
      if (side && yy > -0.55 && yy < 0.8 && !pillar) { col = vec3(0.012, 0.016, 0.018); rough = 0.04; det = vec3(1.0); }
      wrCoat = 1.0; metal = side ? 0.0 : 0.15;
    } else if (fin == ${F.tyre}) {
      float r = length(lp.xz) / max(hs.x, 1e-3);
      if (abs(ln.y) > 0.7) {
        if (r < 0.6) {
          // hub: alloy disc with spokes and a darker centre
          float a = atan(lp.z, lp.x);
          float spoke = smoothstep(0.25, 0.32, abs(fract(a * 5.0 / 6.2832) - 0.5)) * step(0.22, r) * step(r, 0.52);
          col = mix(vec3(0.55, 0.56, 0.57), vec3(0.04), spoke);
          metal = 1.0 - spoke; rough = 0.3; det = vec3(1.0);
        } else if (r < 0.65) col *= 0.6;
        else det *= 0.85 + 0.15 * smoothstep(0.7, 0.75, r);
      } else {
        // tread blocks around the circumference
        float a = atan(lp.z, lp.x) * 18.0 / 3.14159;
        det *= 0.6 + 0.4 * step(0.25, abs(fract(a + step(0.0, lp.y) * 0.5) - 0.5));
      }
    }
    wrAlb = mix(col * det, raw * vec3(1.0, 0.92, 0.85), rust);
    wrRoughO = mix(rough, 0.85, rust);
    wrMetal = metal * (1.0 - rust);
    wrCoat *= 1.0 - rust;
  } else if (fin == ${F.leaf}) {
    // ---- leaf blade: silhouette, midrib, veins, cupped edges, back-lit translucency
    if (wrLeafCut(lp, vWrSize, lk)) discard;
    float t = lp.x / max(hs.x, 1e-3) * 0.5 + 0.5;
    float v = lp.z / max(hs.z, 1e-3);
    float hw = max(wrLeafHalfWidth(t, lk.y, lk.w), 0.05);
    float av = abs(v) / hw;
    float rib = 1.0 - smoothstep(0.0, 0.07, abs(v));
    float g = fract((t - av * 0.35) * 9.0 + lk.w * 3.0);
    float vein = (1.0 - smoothstep(0.0, 0.07, min(g, 1.0 - g))) * smoothstep(0.08, 0.25, av) * (1.0 - smoothstep(0.85, 1.0, av));
    vec3 c = wrCol * (0.75 + 0.25 * wrNoise(lp.xz * 0.6 + lk.w * 9.0));
    c = mix(c, c * vec3(1.35, 1.3, 1.0), rib * 0.8);
    c *= 1.0 + 0.16 * vein;
    c *= mix(1.0, 0.82, smoothstep(0.75, 1.0, av)); // darker margin
    ${'' /* clover-style chevron */}
    if (lk.y > ${LEAF_STYLE.obovate - 0.5} && lk.y < ${LEAF_STYLE.obovate + 0.5}) c = mix(c, c * vec3(1.6, 1.55, 1.25), 0.5 * (1.0 - smoothstep(0.02, 0.16, abs(av - 0.45 - (1.0 - t) * 0.3))) * smoothstep(0.3, 0.45, t));
    wrAlb = c;
    // cupped blade (normal tilts up toward the margins) and raised midrib
    vec3 bump = vec3(0.0, 0.0, sign(v) * (0.35 * smoothstep(0.5, 1.0, av) - 0.25 * rib));
    if (abs(ln.y) > 0.5) wrNw = normalize(ln + bump * sign(ln.y));
    wrRoughO = 0.5; wrMetal = 0.0; wrTransl = lk.z;
  } else if (fin == ${F.stem}) {
    // ---- stem: fine lengthwise hairs and (style 1) darker nodes
    float a = atan(lp.z, lp.x);
    float hair = wrNoise(vec2(a * 9.0, lp.y * 0.4));
    float streak = wrNoise(vec2(a * 14.0, lp.y * 0.05));
    vec3 c = wrCol * (0.75 + 0.2 * hair + 0.2 * streak);
    // nodes: a darker, slightly swollen ring every 18 mm (style 1), fine pale hairs catching the light
    if (lk.y > 0.5) c *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.9, abs(fract(lp.y / 18.0 + lk.w) - 0.5) * 18.0));
    c = mix(c, vec3(0.8, 0.85, 0.7), 0.25 * step(0.82, wrNoise(vec2(a * 40.0, lp.y * 3.0))));
    wrAlb = c; wrRoughO = 0.55; wrMetal = 0.0; wrTransl = lk.z * 0.6;
  } else if (fin <= ${F.umbel}) {
    // ---- flower heads on a flattened ellipsoid: top = florets / petals, underside = green bracts
    float r = length(lp.xz) / max(hs.x, 1e-3);
    float a = atan(lp.z, lp.x);
    vec3 c = wrCol;
    bool under = ln.y < -0.25;
    if (fin == ${F.daisy}) {
      float pp = abs(fract(a * 21.0 / 6.2832 + lk.w) - 0.5) * 2.0;
      if (!under && r > 0.5 && pp > 0.82 - 0.25 * smoothstep(0.6, 1.0, r)) discard;
      if (r > 0.94 - 0.18 * pp * pp && ln.y > -0.6) discard;
      if (r < 0.38 && !under) {
        float cell = wrCells(lp.xz * 1.3);
        c = mix(vec3(0.95, 0.55, 0.02), vec3(0.75, 0.4, 0.02), smoothstep(0.15, 0.45, cell));
        wrNw = normalize(ln + vec3(0.0, 0.0, 0.0));
      } else c *= 0.9 + 0.1 * smoothstep(0.0, 0.5, pp) ;
    } else if (fin == ${F.dandelion}) {
      // ligules: many strap-shaped florets with toothed tips, deeper orange toward the centre, pollen specks
      float strip = fract(a * 58.0 / 6.2832 + r * 3.0 * (0.5 + 0.5 * sin(r * 9.0)) + lk.w);
      if (r > 0.86 + 0.1 * abs(strip - 0.5) * 2.0 && ln.y > -0.5) discard;
      c *= mix(0.62, 1.05, smoothstep(0.0, 0.75, r)) * (0.7 + 0.3 * smoothstep(0.08, 0.38, abs(strip - 0.5)));
      c *= 1.0 - 0.25 * step(0.86, wrNoise(lp.xz * 2.4 + lk.w * 31.0)) * (1.0 - smoothstep(0.3, 0.6, r));
      wrNw = normalize(ln + vec3(cos(a), 0.0, sin(a)) * 0.35 * (abs(strip - 0.5) - 0.25));
    } else if (fin == ${F.seedClock}) {
      float cell = wrCells(vec2(a * 9.0, (ln.y + 1.0) * 14.0));
      c = mix(vec3(0.95, 0.94, 0.9), vec3(0.45, 0.4, 0.33), smoothstep(0.32, 0.12, cell) * 0.6);
      if (wrNoise(vec2(a * 30.0, ln.y * 40.0)) > 0.82 - 0.2 * (1.0 - abs(ln.y))) discard;
      wrTransl = 1.0;
    } else if (fin == ${F.cloverHead}) {
      float cell = wrCells(vec2(a * 6.0, lp.y / max(hs.y, 1e-3) * 4.0));
      c *= mix(0.75, 1.05, smoothstep(0.42, 0.1, cell));
      c = mix(c, vec3(0.55, 0.42, 0.33), smoothstep(-0.2, -0.8, lp.y / max(hs.y, 1e-3)) * 0.6);
      if (cell > 0.43 && r > 0.8) discard;
    } else {
      float cell = wrCells(lp.xz * 0.9 + lk.w * 5.0);
      if (cell > 0.36 && r > 0.55) discard;
      c *= mix(1.0, 0.55, smoothstep(0.2, 0.4, cell));
    }
    if (under) c = vec3(0.12, 0.2, 0.05);
    wrAlb = c; wrRoughO = 0.6; wrMetal = 0.0; wrTransl = under ? 0.3 : lk.z;
  } else if (fin == ${F.cutWood}) {
    // ---- bark cylinder whose flat ends show the cut: growth rings, radial checks, bark rim
    if (abs(ln.y) > 0.8) {
      float r = length(lp.xz) / max(hs.x, 1e-3);
      float a = atan(lp.z, lp.x);
      float rings = fract(r * 13.0 + 0.35 * wrNoise(lp.xz * 0.05 + lk.w * 7.0));
      vec3 wood = lk.y > 0.5 ? vec3(0.32, 0.27, 0.21) : vec3(0.62, 0.47, 0.3);
      vec3 c = wood * (0.82 + 0.18 * smoothstep(0.0, 0.25, rings));
      float check = 1.0 - smoothstep(0.0, 0.02, abs(fract(a * 5.0 / 6.2832 + 0.2 * wrNoise(vec2(r * 3.0, lk.w * 11.0))) - 0.5) - 0.48);
      c *= 1.0 - 0.6 * check * step(0.25, r);
      c = mix(c, raw * wrCol * 0.7, smoothstep(0.88, 0.93, r));
      wrAlb = c; wrRoughO = 0.85;
    } else wrAlb *= wrCol;
  } else if (fin == ${F.fungus}) {
    if (ln.y < -0.1) {
      float a = atan(lp.z, lp.x);
      float gill = abs(fract(a * 48.0 / 6.2832) - 0.5);
      wrAlb = vec3(0.78, 0.7, 0.58) * (0.65 + 0.35 * smoothstep(0.05, 0.25, gill));
    } else wrAlb = wrCol * (0.85 + 0.25 * wrNoise(lp.xz * 0.3));
    wrRoughO = 0.7; wrMetal = 0.0;
  } else wrAlb *= wrCol;
}
`;
}

/** Depth-material fragment cut (same silhouettes in the shadow map): leaves and petalled flower rims. */
export const LOOK_DEPTH_FRAG = /* glsl */ `
{
  int fin = int(vWrLook.x + 0.5);
  if (fin == ${F.leaf} && wrLeafCut(vWrP, vWrSize, vWrLook)) discard;
}
`;
