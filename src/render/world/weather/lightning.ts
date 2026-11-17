// Lightning (GDD 06 §3.11): one brightness pulse of at most 120 ms per `weather.lightning`, as a full-screen quad
// that multiplies the frame by (1 + k x cool tint) (blend dst x src + dst), so the whole frame brightens in
// proportion (sky, haze and ground) without touching the world lighting or exposure, and an HDR frame never turns
// uniformly white after tone mapping. The sim spaces strikes at least 6 s apart (<= 2 flashes per second
// guaranteed). Reduced motion disables the pulse: a soft brightening rises and falls over 2 s instead.
import {
  AddEquation, BufferGeometry, CustomBlending, DstColorFactor, Float32BufferAttribute, Mesh, OneFactor, ShaderMaterial,
  Uniform, ZeroFactor,
} from 'three';
import { LIGHTNING_INTENSITY, LIGHTNING_REDUCED, LIGHTNING_REDUCED_MIN_GAP_S, LIGHTNING_REDUCED_S, LIGHTNING_S } from './tuning';

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

/**
 * Whether a new strike starts a flash: always for the pulse; with flash reduction only when no soft brightening is
 * running and the last one started at least LIGHTNING_REDUCED_MIN_GAP_S real seconds ago (restarting a glow would
 * dip and rise again, a second brightening event).
 */
export function strikeStartsFlash(reduced: boolean, flashLeft: number, sinceStartS: number): boolean {
  if (!reduced) return true;
  return !(flashLeft > 0) && sinceStartS >= LIGHTNING_REDUCED_MIN_GAP_S;
}

/**
 * The flash's clock, one per renderer: a strike starts it, every frame reads its strength. Running frames (dt > 0)
 * fade it; a settle frame (dt 0, scripted screenshots) shows a new pulse once, never an old one, while the slow
 * reduced glow holds still on settle frames. Pure, so GDD 08 App. E 25 is measured on it frame by frame.
 */
export class FlashTimer {
  private left = 0;
  private reduced = false;
  private fresh = false;
  private sinceStartS = Infinity;

  strike(reduced: boolean): boolean {
    if (this.reduced !== reduced) this.left = 0; // the setting changed mid-flash: drop it
    if (!strikeStartsFlash(reduced, this.left, this.sinceStartS)) return false;
    this.left = flashDuration(reduced);
    this.reduced = reduced;
    this.fresh = true;
    this.sinceStartS = 0;
    return true;
  }

  /** Strength k this frame (0 = no flash). */
  frame(dt: number, reduced: boolean): number {
    if (this.reduced !== reduced) this.left = 0;
    const step = dt > 0 ? dt : 0;
    this.sinceStartS += step;
    const left = reduced ? Math.max(0, this.left - step) : this.left;
    const show = this.left > 0 && (reduced || dt > 0 || this.fresh);
    const k = show ? flashStrength(left, reduced) : 0;
    this.left = dt > 0 ? Math.max(0, this.left - dt) : reduced ? this.left : 0;
    this.fresh = false;
    return k;
  }
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
