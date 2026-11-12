/**
 * Materials for the nest spike (three r187, MeshStandardMaterial + onBeforeCompile patches).
 *
 * - Terrain / primitive materials: discard fragments inside BREACH spheres (shared uniform array) so entrances open.
 *   Discard radius = r - BREACH_MARGIN: the discarded disc always lies inside the carved cavity's iso surface, so a
 *   ray through the hole always meets a cavity wall (no see-through), at worst leaving a sub-millimetre soil lip.
 * - Cavity (marching cubes) material: discards fragments whose interpolated substrate distance is > 0 (in open air,
 *   i.e. the part of a carve sphere that pokes above the ground), darkens with depth below ground and adds a warm
 *   "lantern" term around the possessed ant (the dim scent-lit underground look). In cutaway mode it is double sided:
 *   back faces get a lighter "nest cast" colour.
 * - Cap material: the soil cross-section on the cutaway plane (slice texture, discard where open).
 */
import {
  Color, DoubleSide, FrontSide, MeshStandardMaterial, ShaderMaterial, Uniform, Vector3, Vector4, type Texture, type Plane,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';

export const MAX_BREACH = 64;
export const BREACH_MARGIN = 0.5; // mm
/** cavity walls within this distance BELOW the soil surface are discarded too: where a carve sphere barely dips into
 *  the soil the MC dish lies within ~0.1 mm of the ground and chordal error lifts specks of it above the flat terrain
 *  triangles. Must stay < BREACH_MARGIN so the terrain lip still hides the cut (no see-through). */
export const CAVITY_SKIN = 0.2; // mm

export interface SharedUniforms {
  uBreach: Uniform<Vector4[]>;
  uBreachCount: Uniform<number>;
  uAntPosView: Uniform<Vector3>;
  uLantern: Uniform<Color>;
  uLanternR: Uniform<number>;
  uCutaway: Uniform<number>;
}

export function makeShared(): SharedUniforms {
  return {
    uBreach: new Uniform(Array.from({ length: MAX_BREACH }, () => new Vector4(0, -1e6, 0, 0))),
    uBreachCount: new Uniform(0),
    uAntPosView: new Uniform(new Vector3()),
    uLantern: new Uniform(new Color(1.0, 0.72, 0.42)),
    uLanternR: new Uniform(12),
    uCutaway: new Uniform(0),
  };
}

const BREACH_GLSL = /* glsl */ `
uniform vec4 uBreach[${MAX_BREACH}];
uniform int uBreachCount;
varying vec3 vWorldP;
bool inBreach(vec3 p) {
  for (int i = 0; i < ${MAX_BREACH}; i++) {
    if (i >= uBreachCount) break;
    vec3 d = p - uBreach[i].xyz;
    float r = uBreach[i].w - ${BREACH_MARGIN.toFixed(3)};
    if (dot(d, d) < r * r) return true;
  }
  return false;
}
`;

function patchWorldPos(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
}

/** terrain / primitive material with breach-sphere discard (enable per material) */
export function breachMaterial(shared: SharedUniforms, params: ConstructorParameters<typeof MeshStandardMaterial>[0], discardBreach: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial(params);
  if (!discardBreach) return m;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBreach = shared.uBreach;
    shader.uniforms.uBreachCount = shared.uBreachCount;
    patchWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BREACH_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (inBreach(vWorldP)) discard;');
  };
  m.customProgramCacheKey = () => 'breach';
  return m;
}

/** marching-cubes cavity wall material */
export function cavityMaterial(shared: SharedUniforms): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: new Color('#80603f'), roughness: 0.97, metalness: 0, side: FrontSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uAntPosView: shared.uAntPosView, uLantern: shared.uLantern, uLanternR: shared.uLanternR, uCutaway: shared.uCutaway,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSub;\nvarying float vSub;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSub = aSub;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('varying float vSub;', 'varying float vSub;\nvarying vec3 vWorldP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSub;
varying vec3 vWorldP;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
uniform vec3 uAntPosView; uniform vec3 uLantern; uniform float uLanternR; uniform float uCutaway;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vSub > -${CAVITY_SKIN.toFixed(3)}) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // soil grain + strata so tunnel walls give depth/motion cues (cheap value noise in world mm)
  float g = n3(vWorldP * 1.3) * 0.55 + n3(vWorldP * 0.35) * 0.45;
  float strata = n3(vec3(vWorldP.x * 0.04, vWorldP.y * 0.45, vWorldP.z * 0.04));
  diffuseColor.rgb *= 0.72 + 0.5 * g;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.95, 0.78), strata * 0.6);
}
if (uCutaway > 0.5 && !gl_FrontFacing) diffuseColor.rgb = vec3(0.86, 0.80, 0.70);`)
      .replace('#include <opaque_fragment>', `
{
  float depth = clamp(-vSub, 0.0, 200.0);
  float amb = mix(0.85, 0.10, smoothstep(0.0, 14.0, depth));
  if (uCutaway > 0.5) amb = 1.0;
  outgoingLight *= amb;
  vec3 fragV = -vViewPosition;
  vec3 toAnt = uAntPosView - fragV;
  float d = length(toAnt);
  float fall = 1.0 / (1.0 + (d * d) / (uLanternR * uLanternR));
  float lam = 0.35 + 0.65 * max(dot(normal, toAnt / max(d, 1e-4)), 0.0);
  outgoingLight += diffuseColor.rgb * uLantern * fall * lam * (1.0 - amb) * 2.2;
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'cavity';
  return m;
}

export function setCutawayMaterial(m: MeshStandardMaterial, on: boolean, planes: Plane[]): void {
  m.side = on ? DoubleSide : FrontSide;
  m.clippingPlanes = on ? planes : null;
  m.needsUpdate = true;
}

/** soil cross-section on the cutaway plane. Texture: rgb = colour (sRGB), a = solidness (0.5 = surface). */
export function capMaterial(tex: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTex: { value: tex }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(uTex, vUv);
        if (t.a < 0.5) discard;
        // darken a thin band at the cavity edge so tunnel outlines read clearly
        float edge = smoothstep(0.5, 0.62, t.a);
        gl_FragColor = vec4(t.rgb * mix(0.45, 1.0, edge), uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
