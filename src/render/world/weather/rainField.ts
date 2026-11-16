// Rain streaks: one instanced quad per drop, animated entirely in the vertex shader from a per-instance seed and the
// frame clock (no per-frame CPU work; deterministic with a frozen clock). Drops live in a box that follows the
// camera (wrapped per axis so the box can move without popping), fall along gravity tilted by the wind, and are
// drawn as camera-facing streaks whose length is the motion blur of one frame at ant scale.
import {
  AdditiveBlending, BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh,
  ShaderMaterial, Uniform, Vector2, Vector3, Vector4,
} from 'three';
import type { RainView } from './rainMath';
import {
  RAIN_BOX_HALF_BU, RAIN_BOX_HEIGHT_BU, RAIN_FADE_FAR_BU, RAIN_FADE_NEAR_BU, RAIN_MAX_LEN_FRAC, RAIN_MAX_WIDTH_FRAC, RAIN_MIN_WIDTH_MM,
  RAIN_MIN_WIDTH_PX, RAIN_PER_DROP_MIN, RAIN_WIDTH_PER_DIAMETER, RAIN_WIND_TILT, type DropLook,
} from './tuning';

// The shader mirrors rainMath.ts: the quad's world width and length are clamped by the size of one pixel at the drop's
// view depth, and the opacity is faded by that depth, so a drop never grows into a column and never sits on the lens.
const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uFall;
uniform vec2 uView;
uniform vec4 uFade;
uniform vec4 uNearFar;
uniform float uTime, uSpeed, uLen, uWidth, uCount;
varying float vAlong;
varying float vAcross;
varying float vFade;
float smoothBand(float a, float b, float x) { return smoothstep(a, b, x); }
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
  vec3 toCamV = cameraPosition - world;
  float camDist = length(toCamV);
  vec3 toCam = toCamV / max(1e-3, camDist);
  // view depth of the drop and the world size of one pixel there
  float depth = max(1e-3, -(viewMatrix * vec4(world, 1.0)).z);
  float pxMm = depth * 2.0 / (uView.y * projectionMatrix[1][1]);
  float width = min(uFade.z * uView.x * pxMm, max(uFade.w * pxMm, uWidth));
  float len = min(uLen, uView.y * pxMm * uFade.y);
  vec3 side = normalize(cross(dir, toCam)) * width;
  vec3 pos = world + side * position.x + dir * (position.y * len);
  vAlong = position.y;
  vAcross = position.x * 2.0;
  float perDrop = mix(uFade.x, 1.0, fract(aSeed.x * 91.7 + aSeed.z * 37.3));
  vFade = perDrop * smoothBand(0.0, 0.15, local) * smoothBand(1.0, 0.85, local)
        * smoothBand(uNearFar.x, uNearFar.y, depth) * (1.0 - smoothBand(uNearFar.z, uNearFar.w, depth));
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
varying float vAcross;
varying float vFade;
void main() {
  // bright head, long thin tail; soft across so a one-pixel streak is anti-aliased instead of aliased
  float head = smoothstep(0.0, 0.2, vAlong) * (1.0 - smoothstep(0.6, 1.0, vAlong));
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
  float a = uOpacity * vFade * edge * (0.3 + 0.7 * head);
  if (a < 0.004) discard;
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
        uTime: new Uniform(0), uSpeed: new Uniform(1), uLen: new Uniform(1), uWidth: new Uniform(0.1), uCount: new Uniform(0),
        uView: new Uniform(new Vector2(1280, 720)), uFade: new Uniform(new Vector4(RAIN_PER_DROP_MIN, RAIN_MAX_LEN_FRAC, RAIN_MAX_WIDTH_FRAC, RAIN_MIN_WIDTH_PX)),
        uNearFar: new Uniform(new Vector4(1, 2, 3, 4)),
        uColor: new Uniform(new Vector3(1, 1, 1)), uOpacity: new Uniform(0.4),
      },
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'weather.rain';
  }

  /**
   * Sets the drops for this frame: look by class, intensity 0..1 (share of instances), wind (m/s and unit XZ dir),
   * the streak colour (linear scene units, see tintOf), the box centre (camera), the clock, and the view (drawing
   * buffer px and projection focal) the on-screen size clamps work in.
   */
  set(look: DropLook, intensity: number, wind: number, windX: number, windZ: number, tint: readonly [number, number, number], center: Vector3, time: number, bu: number, view?: RainView): number {
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
    if (view) (u.uView.value as Vector2).set(view.widthPx, view.heightPx);
    (u.uNearFar.value as Vector4).set(RAIN_FADE_NEAR_BU[0] * bu, RAIN_FADE_NEAR_BU[1] * bu, RAIN_FADE_FAR_BU[0] * bu, RAIN_FADE_FAR_BU[1] * bu);
    (u.uColor.value as Vector3).set(tint[0], tint[1], tint[2]);
    u.uOpacity.value = look.opacity;
    this.mesh.visible = count > 0;
    return count;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
