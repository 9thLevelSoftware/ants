// Rain streaks: one instanced quad per drop, animated entirely in the vertex shader from a per-instance seed and the
// frame clock (no per-frame CPU work; deterministic with a frozen clock). Drops live in a box that follows the
// camera (wrapped per axis so the box can move without popping), fall along gravity tilted by the wind, and are
// drawn as camera-facing streaks whose length is the motion blur of one frame at ant scale.
import {
  AdditiveBlending, BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  ShaderMaterial, Uniform, Vector3,
} from 'three';
import {
  RAIN_BOX_HALF_BU, RAIN_BOX_HEIGHT_BU, RAIN_COLOR, RAIN_MIN_WIDTH_MM, RAIN_NEAR_FADE_BU, RAIN_WIDTH_PER_DIAMETER, RAIN_WIND_TILT,
  type DropLook,
} from './tuning';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uFall;
uniform float uTime, uSpeed, uLen, uWidth, uCount, uNear;
varying float vAlong;
varying float vFade;
void main() {
  // instances above the active count collapse to nothing
  if (aSeed.w > uCount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 dir = normalize(uFall);
  float W = uBox.x, H = uBox.y;
  // fall progress 0 (top) .. 1 (bottom); horizontal drift along the wind while falling
  float f = fract(uTime * uSpeed / H + aSeed.y);
  float y = H * (1.0 - f);
  vec2 xz = vec2(aSeed.x, aSeed.z) * 2.0 * W + dir.xz / max(1e-3, -dir.y) * (H - y);
  // each drop keeps its world position modulo the box tiling, so the box follows the camera without popping
  xz = mod(xz - uCenter.xz + W, 2.0 * W) - W + uCenter.xz;
  vec3 world = vec3(xz.x, uCenter.y - H * 0.35 + y, xz.y);
  float local = 1.0 - f;
  float camDist = length(cameraPosition - world);
  vec3 toCam = (cameraPosition - world) / max(1e-3, camDist);
  vec3 side = normalize(cross(dir, toCam)) * uWidth;
  vec3 pos = world + side * position.x + dir * (position.y * uLen);
  vAlong = position.y;
  // drops right at the lens would be blurred out of focus: fade them, and thin the far ones to a hairline
  vFade = smoothstep(0.0, 0.15, local) * smoothstep(1.0, 0.85, local) * smoothstep(uNear, uNear * 2.5, camDist);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
varying float vFade;
void main() {
  float head = smoothstep(0.0, 0.2, vAlong) * (1.0 - smoothstep(0.6, 1.0, vAlong));
  float a = uOpacity * vFade * (0.35 + 0.65 * head);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

/** Deterministic hash in [0, 1) (no Math.random: frames are reproducible). */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class RainField {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const g = new InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    const seeds = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) {
      seeds[i * 4] = hash01(i * 3 + 1);
      seeds[i * 4 + 1] = hash01(i * 3 + 2);
      seeds[i * 4 + 2] = hash01(i * 3 + 3);
      seeds[i * 4 + 3] = i + 0.5;
    }
    g.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    g.instanceCount = capacity;
    this.material = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: {
        uCenter: new Uniform(new Vector3()), uBox: new Uniform(new Vector3(1, 1, 1)), uFall: new Uniform(new Vector3(0, -1, 0)),
        uTime: new Uniform(0), uSpeed: new Uniform(1), uLen: new Uniform(1), uWidth: new Uniform(0.1), uCount: new Uniform(0), uNear: new Uniform(1),
        uColor: new Uniform(new Vector3(...RAIN_COLOR)), uOpacity: new Uniform(0.4),
      },
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'weather.rain';
  }

  /**
   * Sets the drops for this frame: look by class, intensity 0..1 (share of instances), wind (m/s and unit XZ dir),
   * brightness (sky light 0..1), the box centre (camera) and the clock.
   */
  set(look: DropLook, intensity: number, wind: number, windX: number, windZ: number, light: number, center: Vector3, time: number, bu: number): number {
    const u = this.material.uniforms;
    const count = Math.round(this.capacity * Math.min(1, Math.max(0, intensity)) * look.density);
    u.uCount.value = count;
    (u.uCenter.value as Vector3).copy(center);
    (u.uBox.value as Vector3).set(RAIN_BOX_HALF_BU * bu, RAIN_BOX_HEIGHT_BU * bu, 0);
    const tilt = RAIN_WIND_TILT * wind;
    (u.uFall.value as Vector3).set(windX * tilt, -1, windZ * tilt).normalize();
    u.uTime.value = time;
    u.uSpeed.value = look.speedMmS;
    u.uLen.value = look.streakMm;
    u.uWidth.value = Math.max(RAIN_MIN_WIDTH_MM, look.diameterMm * RAIN_WIDTH_PER_DIAMETER);
    u.uNear.value = RAIN_NEAR_FADE_BU * bu;
    u.uOpacity.value = look.opacity * (0.35 + 0.65 * Math.min(1, Math.max(0, light)));
    this.mesh.visible = count > 0;
    return count;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
