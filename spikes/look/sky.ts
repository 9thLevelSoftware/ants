/**
 * Analytic sky dome (HDR, linear) + image-based lighting.
 *
 * The dome is cheap and art-directable per variant: zenith/horizon gradient, Mie-like forward glow around the sun,
 * sun/moon disc, optional overcast flattening and stars. The SAME dome (plus a ground hemisphere whose radiance is
 * the ground albedo times the incoming light) is rendered once into a PMREM cube -> scene.environment, so ambient
 * light and reflections (wet ground, droplets, ant cuticle) are consistent with what is seen in the sky.
 */
import { BackSide, Color, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { Texture, WebGLRenderer, WebGLRenderTarget } from 'three';

export interface SkyParams {
  zenith: Color; horizon: Color; ground: Color;   // linear HDR radiance
  sunDir: Vector3; sunColor: Color; sunDisc: number; sunGlow: number; discSize: number; // discSize: cos-space size
  overcast: number; stars: number;
}

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane
}`;
const FRAG = /* glsl */`
uniform vec3 zenith, horizon, ground, sunDir, sunColor; uniform float sunDisc, sunGlow, discSize, overcast, stars, envPass;
varying vec3 vDir;
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), mix(0.45, 1.0, overcast));
  vec3 sky = mix(horizon, zenith, t);
  float mu = dot(d, normalize(sunDir));
  // forward-scattering glow (wide + tight lobes), stronger near the horizon (more air)
  float glow = sunGlow * (0.25 * pow(max(mu, 0.0), 6.0) + 0.6 * pow(max(mu, 0.0), 48.0)) * (1.0 - 0.6 * t);
  sky += sunColor * glow;
  if (envPass < 0.5) sky += sunColor * sunDisc * smoothstep(1.0 - discSize * 1.3, 1.0 - discSize, mu);
  // stars (night): sparse cells on the direction sphere
  if (stars > 0.0 && h > 0.0) {
    vec3 c = floor(d * 380.0); float r = h13(c);
    float s = step(0.9988, r) * pow(fract(r * 113.7), 3.0) * smoothstep(0.0, 0.25, h);
    sky += vec3(0.8, 0.85, 1.0) * s * stars;
  }
  // below the horizon: ground bounce radiance, soft horizon line
  vec3 col = mix(ground, sky, smoothstep(-0.04, 0.02, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  private envScene = new Scene();
  private envMesh: Mesh;
  private pmrem: PMREMGenerator;
  private envRT: WebGLRenderTarget | null = null;
  constructor(renderer: WebGLRenderer, radius = 30000) {
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: new Color() }, horizon: { value: new Color() }, ground: { value: new Color() }, sunDir: { value: new Vector3(0, 1, 0) },
        sunColor: { value: new Color() }, sunDisc: { value: 0 }, sunGlow: { value: 0 }, discSize: { value: 0.00004 }, overcast: { value: 0 }, stars: { value: 0 }, envPass: { value: 0 },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 48, 24), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -10; this.mesh.name = 'sky';
    const envMat = this.mat.clone(); envMat.uniforms = this.mat.uniforms; // share uniforms
    this.envMesh = new Mesh(new SphereGeometry(100, 32, 16), envMat);
    this.envScene.add(this.envMesh);
    this.pmrem = new PMREMGenerator(renderer);
  }
  set(p: SkyParams) {
    const u = this.mat.uniforms;
    (u.zenith!.value as Color).copy(p.zenith); (u.horizon!.value as Color).copy(p.horizon); (u.ground!.value as Color).copy(p.ground);
    (u.sunDir!.value as Vector3).copy(p.sunDir).normalize(); (u.sunColor!.value as Color).copy(p.sunColor);
    u.sunDisc!.value = p.sunDisc; u.sunGlow!.value = p.sunGlow; u.discSize!.value = p.discSize; u.overcast!.value = p.overcast; u.stars!.value = p.stars;
  }
  /** Re-bake the IBL cube (call after set(); ~10-40 ms on a GPU, a few hundred ms under SwiftShader). */
  bakeEnvironment(): Texture {
    this.mat.uniforms.envPass!.value = 1; // no hard sun disc in the IBL (the DirectionalLight carries the sun)
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.mat.uniforms.envPass!.value = 0;
    this.envRT?.dispose(); this.envRT = rt;
    return rt.texture;
  }
  /** Env for a closed environment (underground): uniform-ish warm gradient. */
  bakeFlat(top: Color, bottom: Color): Texture {
    const save = { z: (this.mat.uniforms.zenith!.value as Color).clone(), h: (this.mat.uniforms.horizon!.value as Color).clone(), g: (this.mat.uniforms.ground!.value as Color).clone(), glow: this.mat.uniforms.sunGlow!.value as number, st: this.mat.uniforms.stars!.value as number };
    (this.mat.uniforms.zenith!.value as Color).copy(top); (this.mat.uniforms.horizon!.value as Color).copy(top.clone().lerp(bottom, 0.5)); (this.mat.uniforms.ground!.value as Color).copy(bottom);
    this.mat.uniforms.sunGlow!.value = 0; this.mat.uniforms.stars!.value = 0;
    const t = this.bakeEnvironment();
    (this.mat.uniforms.zenith!.value as Color).copy(save.z); (this.mat.uniforms.horizon!.value as Color).copy(save.h); (this.mat.uniforms.ground!.value as Color).copy(save.g);
    this.mat.uniforms.sunGlow!.value = save.glow; this.mat.uniforms.stars!.value = save.st;
    return t;
  }
}
