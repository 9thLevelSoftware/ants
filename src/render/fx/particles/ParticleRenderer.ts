// Draws a ParticlePool as one Points object: size in mm projected to pixels (capped), soft round sprites, faded
// close to the eye (no giant bokeh discs). Effects use normal blending; motes are additive so bloom picks them up.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial, type PerspectiveCamera, type Scene,
} from 'three';
import type { ParticlePool } from './ParticlePool';
import { MAX_POINT_PX, NEAR_FADE_MM } from './tuning';

const vertex = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uPxPerMm;
uniform float uMaxPx;
uniform vec2 uNearFade;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(-mv.z, 1e-3);
  float px = aSize * uPxPerMm / d;
  vColor = aColor;
  vColor.a *= smoothstep(uNearFade.x, uNearFade.y, d) * clamp(px / 1.5, 0.0, 1.0);
  gl_PointSize = clamp(px, 1.5, uMaxPx);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
uniform float uHard;
uniform float uExposure;
varying vec4 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * (1.0 - smoothstep(uHard, 1.0, r));
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * uExposure, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class ParticleRenderer {
  readonly points: Points;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private pool: ParticlePool | null = null;
  private attrs: { pos: BufferAttribute; col: BufferAttribute; size: BufferAttribute } | null = null;

  constructor(scene: Scene, name: string, additive: boolean, renderOrder: number, hard: number) {
    this.material = new ShaderMaterial({
      name, vertexShader: vertex, fragmentShader: fragment,
      uniforms: { uExposure: { value: 1 }, uPxPerMm: { value: 1000 }, uMaxPx: { value: MAX_POINT_PX }, uNearFade: { value: NEAR_FADE_MM }, uHard: { value: hard } },
      transparent: true, depthWrite: false, depthTest: true, blending: additive ? AdditiveBlending : NormalBlending, toneMapped: false,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** Draws this pool (re-binds the buffers when the pool object changed). */
  setPool(pool: ParticlePool): void {
    if (pool === this.pool) return;
    this.pool = pool;
    const mk = (a: Float32Array, n: number) => { const b = new BufferAttribute(a, n); b.setUsage(DynamicDrawUsage); return b; };
    this.attrs = { pos: mk(pool.position, 3), col: mk(pool.color, 4), size: mk(pool.size, 1) };
    this.geometry.setAttribute('position', this.attrs.pos);
    this.geometry.setAttribute('aColor', this.attrs.col);
    this.geometry.setAttribute('aSize', this.attrs.size);
  }

  /**
   * Uploads the live range and sets the projection scale for the camera and drawing-buffer height. `exposure`
   * cancels the scene exposure (the effects are authored in display brightness).
   */
  update(camera: PerspectiveCamera, viewportHeightPx: number, exposure = 1): void {
    this.material.uniforms.uExposure.value = exposure;
    const p = this.pool, a = this.attrs;
    if (!p || !a) return;
    const n = p.count;
    this.points.visible = n > 0;
    this.geometry.setDrawRange(0, n);
    if (n === 0) return;
    for (const [attr, size] of [[a.pos, 3], [a.col, 4], [a.size, 1]] as const) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * size);
      attr.needsUpdate = true;
    }
    const fovRad = (camera.fov * Math.PI) / 180;
    this.material.uniforms.uPxPerMm.value = viewportHeightPx / (2 * Math.tan(fovRad / 2));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
