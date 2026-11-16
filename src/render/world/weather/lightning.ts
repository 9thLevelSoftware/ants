// Lightning (GDD 06 §3.11): one brightness pulse of at most 120 ms per `weather.lightning`, as a full-screen quad
// that multiplies the frame by (1 + k x cool tint) (blend dst x src + dst), so the whole frame brightens in
// proportion (sky, haze and ground) without touching the world lighting or exposure, and an HDR frame never turns
// uniformly white after tone mapping. The sim spaces strikes at least 6 s apart (<= 2 flashes per second
// guaranteed). Reduced motion disables the pulse: a soft brightening rises and falls over 2 s instead.
import {
  AddEquation, BufferGeometry, CustomBlending, DstColorFactor, Float32BufferAttribute, Mesh, OneFactor, ShaderMaterial,
  Uniform, ZeroFactor,
} from 'three';
import { LIGHTNING_INTENSITY, LIGHTNING_REDUCED, LIGHTNING_REDUCED_S, LIGHTNING_S } from './tuning';

const VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */ `uniform float uK; void main() { gl_FragColor = vec4(vec3(0.82, 0.86, 1.0) * uK, 0.0); }`;

/** Duration of one flash, s: the pulse, or the reduced-motion brightening. */
export function flashDuration(reduced: boolean): number {
  return reduced ? LIGHTNING_REDUCED_S : LIGHTNING_S;
}

/**
 * Strength k of a flash with `left` seconds remaining: a pulse falling linearly from LIGHTNING_INTENSITY, or (reduced
 * motion) a half-sine rise and fall peaking at LIGHTNING_REDUCED, with no step anywhere.
 */
export function flashStrength(left: number, reduced: boolean): number {
  if (!(left > 0)) return 0;
  if (!reduced) return LIGHTNING_INTENSITY * Math.min(1, left / LIGHTNING_S);
  const u = 1 - Math.min(1, left / LIGHTNING_REDUCED_S);
  return LIGHTNING_REDUCED * Math.sin(Math.PI * u);
}

export class LightningFlash {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uK: new Uniform(0) }, transparent: true, depthTest: false,
      depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: DstColorFactor, blendDst: OneFactor,
      blendEquationAlpha: AddEquation, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.name = 'weather.lightning';
    this.mesh.visible = false;
  }

  /** Flash strength 0..1 this frame. */
  set(k: number): void {
    this.material.uniforms.uK.value = k;
    this.mesh.visible = k > 0.001;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
