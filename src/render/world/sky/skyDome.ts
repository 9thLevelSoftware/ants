// Analytic sky dome (spike-look.md 2.3): zenith/horizon gradient, forward-scattering glow around the sun, sun and
// moon discs, overcast flattening and stars. Linear HDR output. The dome is drawn as geometry, not as
// scene.background, so it goes through the same tone mapping as the fogged terrain (tech-stack 7): it includes
// three's tonemapping/colorspace chunks for the no-post path, and its horizon colour IS the fog colour, so the far
// terrain and the sky meet without a seam. Below the horizon it stays the haze colour (the fogged ground), except in the
// possession cutaway, where the dithered ground shows the dark inside of the earth (EARTH_BACKDROP).
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { LightingState } from '../lighting/timeOfDay';

/** The inside of the earth, seen through the terrain's cutaway dither (look pass 3 review: a white dotted disc round the ant in the crevice state). */
export const EARTH_BACKDROP = { color: '#1f160f' };

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}`;

const FRAG = /* glsl */ `
uniform vec3 zenith, horizon, sunDir, sunColor, moonDir;
uniform float sunDisc, sunGlow, discSize, overcast, stars, envPass, moonDisc, earthAmt;
uniform vec3 earthColor;
varying vec3 vDir;
float wrH13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), mix(0.45, 1.0, overcast));
  // a broad haze band at the horizon (look-pass 2): the gradient starts gently, so far shapes dissolved into the
  // horizon colour have no steep sky edge to be outlined against (twin of bdSky in boundary/edgeHaze.ts)
  t *= mix(0.5, 1.0, smoothstep(0.0, 0.22, h));
  vec3 sky = mix(horizon, zenith, t);
  float mu = dot(d, normalize(sunDir));
  // wide and tight forward-scattering lobes, stronger near the horizon (more air)
  float glow = sunGlow * (0.25 * pow(max(mu, 0.0), 6.0) + 0.6 * pow(max(mu, 0.0), 48.0)) * (1.0 - 0.6 * t);
  sky += sunColor * glow * smoothstep(-0.12, 0.02, sunDir.y);
  if (envPass < 0.5) {
    sky += sunColor * sunDisc * smoothstep(1.0 - discSize * 1.3, 1.0 - discSize, mu);
    float mm = dot(d, normalize(moonDir));
    sky += vec3(0.75, 0.8, 0.9) * moonDisc * smoothstep(1.0 - discSize * 1.1, 1.0 - discSize * 0.8, mm);
  }
  if (stars > 0.0 && h > 0.0) {
    vec3 c = floor(d * 380.0); float r = wrH13(c);
    float s = step(0.9988, r) * pow(fract(r * 113.7), 3.0) * smoothstep(0.0, 0.25, h);
    sky += vec3(0.8, 0.85, 1.0) * s * stars;
  }
  vec3 col = mix(horizon, sky, smoothstep(-0.02, 0.01, h));
  // Where the terrain is dithered away round an ant (possession cutaway) a ray that points below the horizon sees the inside of
  // the earth, not the haze of the far ground. Off in the environment bake (the image-based light stays the sky's).
  if (envPass < 0.5) col = mix(col, earthColor, earthAmt * (1.0 - smoothstep(-0.2, -0.04, h)));
  // screen-space dither (+-1.5 %) against 8-bit banding of the wide, smooth gradient on low-contrast displays
  if (envPass < 0.5) col *= 1.0 + (wrH13(vec3(gl_FragCoord.xy, 17.0)) - 0.5) * 0.03;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SkyUniforms {
  zenith: { value: Color };
  horizon: { value: Color };
  sunDir: { value: Vector3 };
  sunColor: { value: Color };
  moonDir: { value: Vector3 };
  sunDisc: { value: number };
  sunGlow: { value: number };
  discSize: { value: number };
  overcast: { value: number };
  stars: { value: number };
  envPass: { value: number };
  moonDisc: { value: number };
  /** 0..1: how much of the below-horizon dome shows the inside of the earth (the possession cutaway); `earthColor` is that colour. */
  earthAmt: { value: number };
  earthColor: { value: Color };
}

/** Angular size of the sun / moon disc in cos-space (1 - cos(radius)). */
export const SKY_DISC_SIZE = 0.00004;
/** Moon disc radiance at full moon. */
export const MOON_DISC = 0.6;

export function createSkyUniforms(): SkyUniforms {
  return {
    zenith: { value: new Color() }, horizon: { value: new Color() }, sunDir: { value: new Vector3(0, 1, 0) },
    sunColor: { value: new Color(1, 1, 1) }, moonDir: { value: new Vector3(0, 1, 0) }, sunDisc: { value: 0 }, sunGlow: { value: 0 },
    discSize: { value: SKY_DISC_SIZE }, overcast: { value: 0 }, stars: { value: 0 }, envPass: { value: 0 }, moonDisc: { value: 0 },
    earthAmt: { value: 0 }, earthColor: { value: new Color(EARTH_BACKDROP.color) },
  };
}

export function createSkyMaterial(uniforms: SkyUniforms): ShaderMaterial {
  return new ShaderMaterial({
    name: 'world:sky', vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthWrite: false, fog: false,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
  });
}

/** Sky dome mesh: centred on the camera every frame by the caller; drawn first, never culled. */
export function createSkyDome(uniforms: SkyUniforms, radius: number): Mesh {
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), createSkyMaterial(uniforms));
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'world:sky';
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}

/**
 * Copies a lighting state into the sky uniforms. `starGain` scales the stars (lowered when depth of field is on:
 * the dome sits at infinity, so every star becomes a full-size bokeh disc that reads as falling snow).
 */
export function applySky(u: SkyUniforms, l: LightingState, moonDir: Vector3, moonIllum: number, sunColor: Color, starGain = 1): void {
  u.zenith.value.copy(l.skyZenith);
  u.horizon.value.copy(l.skyHorizon);
  u.sunDir.value.copy(l.sunDir);
  u.sunColor.value.copy(sunColor);
  u.moonDir.value.copy(moonDir);
  u.sunDisc.value = l.sunDisc;
  u.sunGlow.value = l.sunGlow;
  u.overcast.value = l.overcast;
  u.stars.value = l.stars * starGain;
  u.moonDisc.value = l.moonlit ? MOON_DISC * moonIllum * (1 - l.overcast) : 0;
}
