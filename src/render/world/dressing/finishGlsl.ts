// Shader side of the per-instance finishes (finishes.ts, looks.ts): GLSL injected by the surface patch into the
// primitive materials. Everything is computed in primitive-local space (vWrP = local position, vWrN = local normal,
// vWrSize = half extents), so a moved object keeps its pattern. Organic finishes cut silhouettes by discarding
// (the opaque pipeline, shadows and DoF depth stay intact) and the depth material applies the same cut.
//
// Inputs (fragment): wrAlb (texture albedo x material tint), wrNw (local shading normal), wrRg (texture roughness),
// vColor (instance colour), vWrLook, vWrSize, vWrEdge. Outputs: wrAlb (final albedo incl. colour), wrNw,
// wrRoughO (-1 = material roughness), wrMetal, wrCoat (clear-coat weight), wrTransl (back-lit translucency).
import { FINISH, LEAF_STYLE } from './finishes';
import { PLASTIC } from './tuning';

const F = FINISH;

/** Vertex declarations + main (after the primitive vertex expansion; `normal` = unit direction attribute). */
export const LOOK_VERT_DECL = /* glsl */ `
attribute vec4 iLook;
varying vec4 vWrLook; varying vec4 vWrSize; varying float vWrEdge; varying float vWrDressed;
uniform vec3 uWrCam; uniform float uWrFlowerMm;
`;
export const LOOK_VERT_MAIN = /* glsl */ `
vWrLook = iLook; vWrSize = iSize;
// 0 on flat faces, ~0.3 on 45 degree rounded edges, ~0.42 at corners (edge wear, rims)
vWrEdge = 1.0 - max(max(abs(normal.x), abs(normal.y)), abs(normal.z));
// flower heads within the dressing radius are drawn as cores under their parts (flowerDressing.ts)
#ifdef USE_INSTANCING
vWrDressed = step(distance((modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz, uWrCam), uWrFlowerMm);
#else
vWrDressed = 0.0;
#endif
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
varying vec4 vWrLook; varying vec4 vWrSize; varying float vWrEdge; varying float vWrDressed;
${LEAF_OUTLINE_GLSL}
float wrLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// the texture as detail around its own mean colour (the instance colour gives the hue)
vec3 wrDetail(vec3 alb, float keep) {
  vec3 avg = max(textureLod(tWrA, vec2(0.5), 12.0).rgb * uWrTint, vec3(0.03));
  float l = clamp(wrLuma(alb) / wrLuma(avg), 0.35, 1.9);
  return vec3(mix(1.0, l, keep));
}
float wrCells(vec2 p) { vec2 f = fract(p) - 0.5; return length(f); }
// Injection-moulded plastic (finishes.ts plastic, and the wear of the ribbed moulded finish): an orange-peel stipple in the albedo and the
// roughness that fades before it can shimmer, a mould part line round the thinnest axis and a recessed rim on big flat faces (seams = 1),
// worn light edges, and dirt at the foot of the object (height above its lowest point, iFoot). Features are 1 to 22 mm.
vec3 wrPlastic(vec3 col, vec3 lp, vec3 ln, vec3 hs, float seed, float seams, inout float rough) {
  vec3 an = abs(ln);
  float fp = max(length(fwidth(lp)), 1e-4); // mm per pixel
  bool ay = an.y >= an.x && an.y >= an.z, ax = !ay && an.x >= an.z;
  vec2 g = ay ? lp.xz : (ax ? lp.zy : lp.xy);   // coordinates in the plane of the face this fragment is on
  vec2 h2 = ay ? hs.xz : (ax ? hs.zy : hs.xy);  // its half extents
  float grain = wrNoise(g / ${PLASTIC.grainMm.toFixed(2)} + seed * 17.0) - 0.5;
  float gk = 1.0 - smoothstep(0.3, 0.8, fp / ${PLASTIC.grainMm.toFixed(2)});
  col *= 1.0 + ${PLASTIC.grainAlbedo.toFixed(2)} * grain * gk;
  rough = clamp(rough + ${PLASTIC.grainRough.toFixed(2)} * grain * gk, 0.05, 1.0);
  if (seams > 0.5) {
    bool tx = hs.x <= hs.y && hs.x <= hs.z, ty = !tx && hs.y <= hs.z;
    float t = tx ? lp.x : (ty ? lp.y : lp.z), tn = tx ? an.x : (ty ? an.y : an.z);
    float part = (1.0 - smoothstep(0.0, max(${PLASTIC.seamMm.toFixed(2)}, fp * 1.2), abs(t))) * (1.0 - smoothstep(0.35, 0.7, tn));
    col *= 1.0 - ${PLASTIC.seamDark.toFixed(2)} * part;
    float flatFace = step(0.93, max(an.x, max(an.y, an.z))) * step(${PLASTIC.rimMinMm.toFixed(1)}, min(h2.x, h2.y));
    vec2 e = h2 - abs(g);
    float inset = clamp(${PLASTIC.rimInset.toFixed(2)} * min(h2.x, h2.y), ${PLASTIC.rimInsetMm[0].toFixed(1)}, ${PLASTIC.rimInsetMm[1].toFixed(1)});
    float rim = (1.0 - smoothstep(0.0, max(${PLASTIC.rimMm.toFixed(2)}, fp * 1.2), abs(min(e.x, e.y) - inset))) * flatFace;
    col *= 1.0 - ${PLASTIC.rimDark.toFixed(2)} * rim;
  }
  float worn = smoothstep(0.04, 0.28, vWrEdge);
  col = mix(col, col * 1.28 + 0.035, ${PLASTIC.wearMix.toFixed(2)} * worn);
  rough = mix(rough, min(1.0, rough + 0.25), worn);
  float dirt = (1.0 - smoothstep(${PLASTIC.dirtMm[0].toFixed(1)}, ${PLASTIC.dirtMm[1].toFixed(1)}, vWrW.y - vWrFoot)) * (0.6 + 0.8 * wrNoise(g / ${PLASTIC.dirtBlotchMm.toFixed(1)} + seed * 31.0));
  return mix(col, col * vec3(0.42, 0.37, 0.28), clamp(${PLASTIC.dirtMix.toFixed(2)} * dirt, 0.0, 0.75));
}
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
  } else if (fin <= ${F.tyre} || fin == ${F.glass} || fin == ${F.carBody} || fin == ${F.moulded} || fin == ${F.plastic} || fin == ${F.appliance}) {
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
      if (ln.y < -0.6) {
        // underbody, the view of an ant walking beneath the car (look-pass 2): undersealed dark steel with two
        // chassis rails, cross-members every metre or so, an exhaust run with a silencer box, road grime
        float rails = 1.0 - smoothstep(0.02, 0.06, abs(abs(q.z) - 0.52));
        float beams = 1.0 - smoothstep(0.015, 0.045, abs(fract(q.x * 3.2 + 0.31) - 0.5) - 0.44);
        float pipe = 1.0 - smoothstep(0.018, 0.04, abs(q.z + 0.16));
        float box = (1.0 - smoothstep(0.02, 0.05, abs(q.x + 0.42) - 0.2)) * (1.0 - smoothstep(0.1, 0.16, abs(q.z + 0.16)));
        float grime = wrFbm(lp.xz * 0.06 + lk.w * 4.0);
        vec3 under = vec3(0.028, 0.026, 0.024) * (0.65 + 0.7 * grime);
        under = mix(under, vec3(0.085, 0.082, 0.08), max(rails, beams) * 0.8);
        under = mix(under, vec3(0.16, 0.1, 0.07), max(pipe, box) * (0.45 + 0.4 * grime));
        col = under; det = vec3(1.0); wrCoat = 0.0; metal = max(pipe, box) * 0.55; rough = mix(0.82, 0.5, max(rails, beams));
      }
    }
    else if (fin == ${F.moulded}) {
      // moulding ribs every few cm round the sides (a groove and a raised band), lighter sun-faded top
      if (abs(ln.y) < 0.6) {
        float period = clamp(hs.y * 0.22, 12.0, 60.0);
        float ph = fract(lp.y / period);
        float groove = 1.0 - smoothstep(0.0, 0.06, abs(ph - 0.5));
        col *= 1.0 - 0.28 * groove;
        wrNw = normalize(ln + vec3(0.0, 0.2 * cos(ph * 6.2832), 0.0) * smoothstep(0.3, 0.5, abs(ph - 0.5) + groove * 0.5));
      } else if (ln.y > 0.6) col = mix(col, vec3(dot(col, vec3(0.33))) * 1.15, 0.25);
      col = wrPlastic(col, lp, ln, hs, 0.0, 0.0, rough);
    }
    else if (fin == ${F.plastic}) {
      // a moulded part: stipple, part line, recessed rim, worn edges, dirt at the foot; a sun-bleached, chalky top
      col = wrPlastic(col, lp, ln, hs, 0.0, 1.0, rough);
      if (ln.y > 0.6) { col = mix(col, vec3(dot(col, vec3(0.33))) * 1.12, 0.22); rough = min(1.0, rough + 0.1); }
    }
    else if (fin == ${F.appliance}) {
      // ventilated plinth along the bottom of the sides; a dark door gap a quarter of the way up
      // plinth: the bottom 45 mm (a kick plate with vertical vent slots), whatever the appliance's height
      vec3 q = lp / max(hs, vec3(1e-3));
      float fromFloor = lp.y + hs.y;
      if (abs(ln.y) < 0.6) {
        if (fromFloor < 45.0) {
          float u = (abs(ln.x) > abs(ln.z) ? lp.z : lp.x) / 8.0;
          float slot = step(0.62, fract(u)) * step(8.0, fromFloor) * step(fromFloor, 36.0);
          col = mix(vec3(0.06, 0.06, 0.065), vec3(0.01), slot); rough = 0.55; det = vec3(1.0);
        } else col *= 1.0 - 0.8 * (1.0 - smoothstep(0.0, 0.004, abs(q.y - 0.25)));
      }
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
    // a rust scan's normals belong to its rust blisters: clean finishes keep the geometric normal
    ${rustScan ? 'wrNw = normalize(mix(ln, wrNw, rust));' : ''}
    wrAlb = mix(col * det, raw * vec3(1.0, 0.92, 0.85), rust);
    wrRoughO = mix(rough, 0.85, rust);
    wrMetal = metal * (1.0 - rust);
    wrCoat *= 1.0 - rust;
  } else if (fin == ${F.leaf}) {
    // ---- leaf blade: silhouette, midrib, veins, cupped (vertex bend) edges, back-lit translucency
    if (wrLeafCut(lp, vWrSize, lk)) discard;
    float t = lp.x / max(hs.x, 1e-3) * 0.5 + 0.5;
    float v = lp.z / max(hs.z, 1e-3);
    float hw = max(wrLeafHalfWidth(t, lk.y, lk.w), 0.05);
    float av = abs(v) / hw;
    bool top = ln.y > 0.0;
    float rib = 1.0 - smoothstep(0.0, 0.06, abs(v));
    // secondary veins: straight lines from the midrib toward the tip and the margin (measured in mm, so they stay
    // straight on a wide leaf: normalised by the outline they bent into concentric arcs that read as wood grain)
    float g = fract((t - abs(v) * hs.z / (2.0 * hs.x) * 0.9) * 8.0 + lk.w * 3.0);
    float vein = (1.0 - smoothstep(0.0, 0.06, min(g, 1.0 - g))) * smoothstep(0.06, 0.2, av) * (1.0 - smoothstep(0.8, 0.98, av));
    vec2 nq = vec2(t * hs.x, v * hs.z) * 0.9;
    float net = 1.0 - smoothstep(0.03, 0.12, abs(wrNoise(nq) - 0.5));
    vec3 c = wrCol * (0.82 + 0.3 * wrFbm(lp.xz * 0.12 + lk.w * 9.0));
    c = mix(c, c * vec3(1.45, 1.4, 1.05), rib * 0.75);
    // dead, dry leaves (low translucency) show their veins faintly; at full contrast the arcs read as wood grain
    c *= 1.0 + mix(0.08, 0.32, lk.z) * vein + 0.1 * net;
    c *= mix(1.0, 0.85, smoothstep(0.8, 1.0, av)); // darker margin
    c = mix(c, c * vec3(1.25, 1.15, 0.6), 0.35 * smoothstep(0.75, 1.0, t) * lk.z); // yellowing tip on living leaves
    // a few blemishes: pale feeding scars and dark spots
    float bl = wrNoise(lp.xz * 0.5 + lk.w * 23.0);
    c *= 1.0 - 0.18 * smoothstep(0.9, 0.94, bl);
    // dry, dead leaves (low translucency): blotchy decay, dark fungal specks, duller hue, matte and crinkled
    bool dry = lk.z < 0.5;
    if (dry) {
      float blot = wrFbm(lp.xz * 0.05 + lk.w * 5.0);
      c = mix(c, c * vec3(0.6, 0.52, 0.46), 0.75 * smoothstep(0.42, 0.72, blot));
      c = mix(c, c * vec3(1.18, 1.1, 0.95), 0.4 * smoothstep(0.55, 0.3, blot));
      c *= 1.0 - 0.4 * smoothstep(0.86, 0.9, wrNoise(lp.xz * 0.9 + lk.w * 41.0));
      c = mix(vec3(wrLuma(c)), c, 0.72);
    }
    if (!top) c = mix(c, c * vec3(1.15, 1.2, 1.05), 0.6); // paler, matte underside
    ${'' /* clover-style chevron */}
    if (lk.y > ${LEAF_STYLE.obovate - 0.5} && lk.y < ${LEAF_STYLE.obovate + 0.5}) c = mix(c, c * vec3(1.6, 1.55, 1.25), 0.5 * (1.0 - smoothstep(0.02, 0.16, abs(av - 0.45 - (1.0 - t) * 0.3))) * smoothstep(0.3, 0.45, t));
    wrAlb = c;
    // raised midrib, sunken veins
    vec3 bump = vec3(0.0, 0.0, sign(v) * (-0.25 * rib) ) + vec3(0.0, 0.0, 0.12 * vein * sign(v));
    if (dry) bump += vec3(wrNoise(lp.xz * 0.22 + 3.1) - 0.5, 0.0, wrNoise(lp.zx * 0.22 + 8.7) - 0.5) * 0.5; // crinkles
    if (abs(ln.y) > 0.5) wrNw = normalize(ln + bump * sign(ln.y));
    // a flat leaf is thicker than a grass blade: it glows when back-lit, but far less
    wrRoughO = dry ? 0.9 : (top ? 0.62 : 0.75); wrMetal = 0.0; wrTransl = lk.z * 0.45;
  } else if (fin == ${F.stem}) {
    // ---- stem: smooth, waxy and slightly translucent; fine lengthwise ridges (vascular bundles) in the shading and
    // the tone; style 1 = herbaceous stem with nodes and fine hairs that catch the light at the silhouette
    float a = atan(lp.z, lp.x);
    float wob = wrNoise(vec2(a * 2.0 + lk.w * 13.0, lp.y * 0.04));
    float ridge = cos(a * 16.0 + 2.0 * wob);
    float streak = wrNoise(vec2(a * 5.0 + lk.w * 7.0, lp.y * 0.02));
    vec3 c = wrCol * (0.8 + 0.06 * ridge + 0.22 * streak);
    vec3 tang = normalize(vec3(-sin(a), 0.0, cos(a)));
    if (abs(ln.y) < 0.9) wrNw = normalize(ln + tang * 0.12 * sin(a * 16.0 + 2.0 * wob));
    float hairy = step(0.5, lk.y);
    if (hairy > 0.5) {
      // nodes: a darker, purplish band every 18 mm
      float node = 1.0 - smoothstep(0.0, 1.2, abs(fract(lp.y / 18.0 + lk.w) - 0.5) * 18.0);
      c = mix(c, c * vec3(0.75, 0.62, 0.62), node * 0.6);
    }
    // silhouette fuzz: pale hairs (style 1) or a waxy bloom (style 0) brighten the grazing edge
    vec3 nv = normalize((viewMatrix * vec4(wrRot * wrNw, 0.0)).xyz);
    float rim = pow(1.0 - abs(dot(nv, normalize(vViewPosition))), 3.0);
    c += rim * mix(vec3(0.05, 0.06, 0.04), vec3(0.22, 0.24, 0.18), hairy);
    wrAlb = c; wrRoughO = mix(0.38, 0.55, hairy); wrMetal = 0.0; wrTransl = lk.z * 0.6;
  } else if (fin <= ${F.umbel}) {
    // ---- flower heads on a flattened ellipsoid: top = florets / petals, underside = green bracts
    float r = length(lp.xz) / max(hs.x, 1e-3);
    float a = atan(lp.z, lp.x);
    vec3 c = wrCol;
    bool under = ln.y < -0.25;
    if (vWrDressed > 0.5) {
      // near the camera the parts (flowerDressing.ts) carry the petals: the ellipsoid is the solid core under them
      float cell = wrCells(lp.xz * 1.1 + lk.w * 5.0);
      float pit = smoothstep(0.15, 0.45, cell);
      if (fin == ${F.daisy}) c = r < 0.4 ? mix(vec3(0.95, 0.55, 0.02), vec3(0.7, 0.36, 0.02), pit) : wrCol * 0.8;
      else if (fin == ${F.dandelion}) c = wrCol * mix(0.75, 0.5, pit) * vec3(1.0, 0.85, 0.6);
      else if (fin == ${F.seedClock}) {
        // only the small receptacle shows inside the sphere of parachutes
        if (r > 0.3) discard;
        c = mix(vec3(0.22, 0.16, 0.1), vec3(0.42, 0.36, 0.28), pit);
      }
      // the florets of the parts cover the ball; the core under them is the flower's own colour, only a little darker between them (look pass 6: the
      // bright cell centres on a dark purple showed as big white polka dots)
      else if (fin == ${F.cloverHead}) c = wrCol * mix(0.66, 0.82, pit);
      else c = mix(vec3(0.2, 0.3, 0.1), wrCol * 0.6, pit);
      // seen from below, a real head is a small green cup under its petals: the wide flat underside of the
      // collision ellipsoid is not drawn there (the parts' undersides show instead)
      if (under && r > 0.5) discard;
      if (under) c = vec3(0.1, 0.17, 0.04);
      wrAlb = c; wrRoughO = 0.7; wrMetal = 0.0; wrTransl = 0.2;
    } else if (fin == ${F.daisy}) {
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
      // look pass 6: the florets are small and close (about 90 round the head) and the light between them only a little darker; at 6 x 4 cells with
      // 0.75 .. 1.05 the head read as a ball of big white dots on a dark net
      float cell = wrCells(vec2(a * 14.0, lp.y / max(hs.y, 1e-3) * 9.0));
      c *= mix(0.86, 1.0, smoothstep(0.5, 0.15, cell));
      c = mix(c, vec3(0.55, 0.42, 0.33), smoothstep(-0.2, -0.8, lp.y / max(hs.y, 1e-3)) * 0.6);
      // no ragged rim: the cell corners cut the flanks of the head into a lattice of white discs (look pass 6)
    } else {
      float cell = wrCells(lp.xz * 0.9 + lk.w * 5.0);
      if (cell > 0.36 && r > 0.55) discard;
      c *= mix(1.0, 0.55, smoothstep(0.2, 0.4, cell));
    }
    if (vWrDressed < 0.5) {
      if (under) c = vec3(0.12, 0.2, 0.05);
      wrAlb = c; wrRoughO = 0.6; wrMetal = 0.0; wrTransl = under ? 0.3 : lk.z;
    }
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
