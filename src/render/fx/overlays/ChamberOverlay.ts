// Cavity values of the temperature and moisture overlays (GDD 08 §10.1: "surface and cavity temperature",
// "soil moisture and cavity humidity"): one disc on each chamber floor of the visible nests, coloured with the same
// ramps as the ground field; a flooded chamber is solid blue with light wave hatching. Seen underground and in the
// cutaway.
import {
  CircleGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, NormalBlending, Quaternion, ShaderMaterial,
  Vector3, type Scene,
} from 'three';
import type { Sim } from '@/sim/types';
import { legendFor, OKABE_ITO } from '@/ui/overlays/catalogue';
import { encodeTemp } from './samplers';
import { CHAMBER_ALPHA, FIELD_RENDER_ORDER, FLOOD_ALPHA, FLOODED_CHAMBER } from './tuning';

const MAX_CHAMBERS = 256;
/** Floor disc lift, mm. */
const LIFT_MM = 0.5;

const vertex = /* glsl */ `
attribute vec3 aColor;
attribute float aFlood;
varying vec3 vColor;
varying float vFlood;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vColor = aColor;
  vFlood = aFlood;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const fragment = /* glsl */ `
uniform float uAlpha;
uniform float uFloodAlpha;
uniform float uBu;
uniform float uExposure;
varying vec3 vColor;
varying float vFlood;
varying vec3 vWorld;
void main() {
  vec3 c = vColor;
  float a = uAlpha;
  if (vFlood > 0.5) {
    float ph = (vWorld.z + sin(vWorld.x / (0.9 * uBu)) * 0.35 * uBu) / (1.4 * uBu);
    float f = fract(ph);
    float aa = clamp(fwidth(ph) * 1.2, 1e-4, 0.5);
    float wave = smoothstep(0.0, aa, f) * (1.0 - smoothstep(0.25 - aa, 0.25, f));
    c = mix(c, vec3(0.75, 0.88, 1.0), wave * 0.6);
    a = uFloodAlpha;
  }
  gl_FragColor = vec4(c * uExposure, a);
  #include <colorspace_fragment>
}`;

export class ChamberOverlay {
  readonly mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly colors: InstancedBufferAttribute;
  private readonly floods: InstancedBufferAttribute;
  private mode: 'temperature' | 'moisture' | null = null;
  private sim: Sim | null = null;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly water = new Color(OKABE_ITO.blue);
  private readonly stops = [new Color(), new Color(), new Color()];
  private mid = 0.5;

  constructor(scene: Scene) {
    this.material = new ShaderMaterial({
      name: 'fx:overlay-chambers', vertexShader: vertex, fragmentShader: fragment,
      uniforms: { uAlpha: { value: CHAMBER_ALPHA }, uFloodAlpha: { value: FLOOD_ALPHA }, uBu: { value: 4 }, uExposure: { value: 1 } },
      transparent: true, depthWrite: false, blending: NormalBlending, toneMapped: false,
    });
    const g = new CircleGeometry(1, 32);
    this.colors = new InstancedBufferAttribute(new Float32Array(MAX_CHAMBERS * 3), 3).setUsage(DynamicDrawUsage);
    this.floods = new InstancedBufferAttribute(new Float32Array(MAX_CHAMBERS), 1).setUsage(DynamicDrawUsage);
    g.setAttribute('aColor', this.colors);
    g.setAttribute('aFlood', this.floods);
    this.mesh = new InstancedMesh(g, this.material, MAX_CHAMBERS);
    this.mesh.name = 'fx:overlay-chambers';
    this.mesh.renderOrder = FIELD_RENDER_ORDER;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setSim(sim: Sim | null): void {
    this.sim = sim;
    if (sim) this.material.uniforms.uBu.value = sim.world.bu;
  }

  /** Ramp of the mode; `mid` is the temperature optimum on the 0..1 scale. */
  setMode(mode: 'temperature' | 'moisture' | null, mid = 0.5): void {
    this.mode = mode;
    this.mid = mid;
    if (!mode) return;
    const stops = legendFor(mode).scale!.stops;
    for (let i = 0; i < 3; i++) this.stops[i].set(stops[i]);
  }

  /** `exposure` cancels the scene exposure (authored in display brightness). */
  update(exposure = 1): void {
    const sim = this.sim;
    if (!sim || !this.mode) { this.mesh.visible = false; return; }
    this.material.uniforms.uExposure.value = exposure;
    let n = 0;
    for (const nest of sim.state.nests) {
      for (const ch of nest.chambers) {
        if (n >= MAX_CHAMBERS) break;
        const flooded = ch.flooded >= FLOODED_CHAMBER;
        const t = this.mode === 'temperature' ? encodeTemp(ch.temp) : ch.humidity;
        if (flooded) this.c.copy(this.water);
        else this.ramp(Math.max(0, Math.min(1, t)), this.mode === 'temperature' ? this.mid : 0.5);
        this.p.set(ch.center.x, ch.center.y - ch.radii.y + LIFT_MM, ch.center.z);
        this.s.set(ch.radii.x * 0.92, ch.radii.z * 0.92, 1);
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(n, this.m);
        this.colors.setXYZ(n, this.c.r, this.c.g, this.c.b);
        this.floods.setX(n, flooded ? 1 : 0);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.floods.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  /** Per-instance flooded flag and colour (tests). */
  instance(i: number): { flooded: boolean; color: [number, number, number] } {
    return { flooded: this.floods.getX(i) > 0.5, color: [this.colors.getX(i), this.colors.getY(i), this.colors.getZ(i)] };
  }

  get alphas(): { normal: number; flooded: number } {
    return { normal: this.material.uniforms.uAlpha.value as number, flooded: this.material.uniforms.uFloodAlpha.value as number };
  }

  private ramp(t: number, mid: number): void {
    const [a, b, c] = this.stops;
    if (t < mid) this.c.copy(a).lerp(b, t / Math.max(mid, 1e-3));
    else this.c.copy(b).lerp(c, (t - mid) / Math.max(1 - mid, 1e-3));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
