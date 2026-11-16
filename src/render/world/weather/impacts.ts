// Things that happen where rain meets a surface, as flat instanced quads drawn by one small shader:
//   splash  a crown of droplets thrown out where a drop lands on exposed ground (grows and fades in ~0.3 s)
//   ripple  a ring spreading on standing water (puddles, gully and bowl water)
//   fleck   a glint of rime on the ground in a frost (static, twinkles with the view)
// The CPU only places an instance when its previous life is over, at a deterministic hash of (slot, cycle), so a
// frozen clock gives a reproducible frame and a running clock costs a few hundred placements per second.
import {
  AdditiveBlending, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Uniform, Vector3,
} from 'three';
import { hash01 } from './rainField';

const VERT = /* glsl */ `
attribute vec4 aPos;   // xyz centre (mm), w = radius (mm)
attribute vec4 aLife;  // x start time (s), y life (s), z kind (0 splash, 1 ripple, 2 fleck), w seed
uniform float uTime;
varying vec2 vUv;
varying vec4 vLife;
varying float vAge;
void main() {
  float age = (uTime - aLife.x) / max(1e-3, aLife.y);
  vAge = aLife.z > 1.5 ? 0.5 : age;
  vLife = aLife;
  vUv = position.xz * 2.0;
  float r = aPos.w * (aLife.z > 1.5 ? 1.0 : (0.25 + 0.75 * clamp(age, 0.0, 1.0)));
  if (aPos.w <= 0.0 || age < 0.0 || age > 1.0) r = 0.0;
  vec3 world = aPos.xyz + vec3(position.x * r * 2.0, 0.0, position.z * r * 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying vec4 vLife;
varying float vAge;
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  float a;
  if (vLife.z < 0.5) {
    // crown: a thin ring broken into droplets by angle
    float ang = atan(vUv.y, vUv.x);
    float beads = 0.5 + 0.5 * cos(ang * (9.0 + floor(vLife.w * 5.0)) + vLife.w * 31.0);
    a = smoothstep(0.62, 0.86, d) * (1.0 - smoothstep(0.86, 1.0, d)) * (0.35 + 0.65 * beads);
    a *= 1.0 - vAge;
  } else if (vLife.z < 1.5) {
    a = smoothstep(0.78, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d)) * (1.0 - vAge);
  } else {
    a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
  }
  a *= uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export type ImpactKind = 'splash' | 'ripple' | 'fleck';
const KIND_CODE: Record<ImpactKind, number> = { splash: 0, ripple: 1, fleck: 2 };

/** Where an instance may appear: returns false when no place is available (slot stays empty this cycle). */
export type ImpactPlacer = (u: number, v: number, out: { x: number; y: number; z: number; r: number }) => boolean;

export class ImpactLayer {
  readonly mesh: Mesh;
  readonly kind: ImpactKind;
  readonly capacity: number;
  private readonly pos: InstancedBufferAttribute;
  private readonly life: InstancedBufferAttribute;
  private readonly cycle: Float64Array;
  private readonly material: ShaderMaterial;
  private readonly tmp = { x: 0, y: 0, z: 0, r: 0 };
  /** Instances currently alive (stats). */
  active = 0;

  constructor(kind: ImpactKind, capacity: number, color: readonly [number, number, number], opacity: number) {
    this.kind = kind;
    this.capacity = capacity;
    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3));
    quad.setIndex([0, 2, 1, 0, 3, 2]);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.pos = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    this.life = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aLife', this.life);
    g.instanceCount = capacity;
    this.cycle = new Float64Array(capacity).fill(Number.NaN);
    this.material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: new Uniform(0), uColor: new Uniform(new Vector3(color[0], color[1], color[2])), uOpacity: new Uniform(opacity) },
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.name = `weather.${kind}`;
  }

  /**
   * Advances the layer to `time`: `count` instances live, each `lifeS` long, re-placed by `place` when its cycle
   * ends (`salt` varies the hash between scene changes). Returns the number of instances placed this frame.
   */
  update(time: number, count: number, lifeS: number, salt: number, place: ImpactPlacer): number {
    const n = Math.min(this.capacity, Math.max(0, Math.floor(count)));
    const P = this.pos.array as Float32Array, L = this.life.array as Float32Array;
    const code = KIND_CODE[this.kind];
    let placed = 0, active = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (i >= n) {
        if (P[i * 4 + 3] !== 0) { P[i * 4 + 3] = 0; placed++; }
        this.cycle[i] = Number.NaN;
        continue;
      }
      const phase = hash01(i * 7 + 3);
      const c = Math.floor(time / lifeS + phase);
      if (c === this.cycle[i]) { if (P[i * 4 + 3] > 0) active++; continue; }
      this.cycle[i] = c;
      const k = (c * 7919 + i * 104729 + salt * 15485863) | 0;
      const ok = place(hash01(k), hash01(k ^ 0x5bd1e995), this.tmp);
      P[i * 4] = this.tmp.x; P[i * 4 + 1] = this.tmp.y; P[i * 4 + 2] = this.tmp.z; P[i * 4 + 3] = ok ? this.tmp.r : 0;
      L[i * 4] = (c - phase) * lifeS; L[i * 4 + 1] = lifeS; L[i * 4 + 2] = code; L[i * 4 + 3] = hash01(k ^ 0x27d4eb2f);
      placed++;
      if (ok) active++;
    }
    this.active = active;
    if (placed > 0) { this.pos.needsUpdate = true; this.life.needsUpdate = true; }
    this.material.uniforms.uTime.value = time;
    this.mesh.visible = active > 0;
    return placed;
  }

  /** Colour of the instances (linear scene units): the weather renderer follows the scene's light with it. */
  setColor(r: number, g: number, b: number): void {
    (this.material.uniforms.uColor.value as Vector3).set(r, g, b);
  }

  setOpacity(a: number): void {
    this.material.uniforms.uOpacity.value = a;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
