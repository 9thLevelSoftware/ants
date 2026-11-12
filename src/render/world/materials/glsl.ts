// GLSL snippets shared by the world materials. Names are prefixed `wr` (world renderer) to stay clear of three's
// chunks (three already #defines PI: never declare it again, tech-stack 7).

/** Hash and value noise (fragment and vertex safe). */
export const GLSL_NOISE = /* glsl */ `
float wrHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wrNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wrHash12(i), wrHash12(i + vec2(1.0, 0.0)), f.x), mix(wrHash12(i + vec2(0.0, 1.0)), wrHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wrFbm(vec2 p) { return 0.5 * wrNoise(p) + 0.3 * wrNoise(p * 2.07 + 7.1) + 0.2 * wrNoise(p * 4.13 + 3.3); }
`;

/**
 * Triplanar sample of albedo / roughness (G) / world normal with a whiteout normal blend (Golus 2017), from the
 * look spike. `p` and `n` are in the mapping space (world or primitive-local, mm); the returned normal is in that
 * space too. Planar-Y fast path when the surface is nearly flat.
 */
export const GLSL_TRIPLANAR = /* glsl */ `
void wrTri(sampler2D ta, sampler2D tn, sampler2D tr, vec3 p, vec3 n, float sc, float ns, out vec3 alb, out vec3 nw, out float rg) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 sg = sign(n + 1e-5);
  if (w.y > 0.985) {
    vec2 uy = p.xz / sc; uy.x *= sg.y;
    alb = texture2D(ta, uy).rgb; rg = texture2D(tr, uy).g;
    vec3 ty = texture2D(tn, uy).xyz * 2.0 - 1.0; ty.xy *= ns; ty.x *= sg.y;
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); nw = normalize(ty.xzy);
    return;
  }
  vec2 ux = p.zy / sc; ux.x *= sg.x; vec2 uy = p.xz / sc; uy.x *= sg.y; vec2 uz = p.xy / sc; uz.x *= -sg.z;
  alb = texture2D(ta, ux).rgb * w.x + texture2D(ta, uy).rgb * w.y + texture2D(ta, uz).rgb * w.z;
  rg = texture2D(tr, ux).g * w.x + texture2D(tr, uy).g * w.y + texture2D(tr, uz).g * w.z;
  vec3 tx = texture2D(tn, ux).xyz * 2.0 - 1.0, ty = texture2D(tn, uy).xyz * 2.0 - 1.0, tz = texture2D(tn, uz).xyz * 2.0 - 1.0;
  tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;
  tx.x *= sg.x; ty.x *= sg.y; tz.x *= -sg.z;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  nw = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
`;

/** Porous wet darkening + saturation lift (spike 2.7); applied to diffuseColor.rgb. */
export const GLSL_WET = /* glsl */ `
vec3 wrWetAlbedo(vec3 c, float wet, float darken) {
  c *= mix(1.0, darken, wet);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(l), c, 1.0 + 0.35 * wet), 0.0);
}
float wrWetRough(float r, float wet, float floorRough) { return mix(r, max(floorRough, r * 0.55), wet); }
`;
