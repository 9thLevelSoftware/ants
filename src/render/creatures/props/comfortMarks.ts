/**
 * Comfort-mode marks (GDD 08 §12, GDD 05 §2.1): a hazard ring on the surface under an `abstract` or `marker`
 * creature, an arc around it that grows through a strike wind-up (`marker` keeps the telegraph this way), and for
 * `marker` a text label ("Spider"). Rings lie in the creature's surface plane, so they work on walls too.
 */
import {
  CanvasTexture, Color, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, RingGeometry, ShaderMaterial,
  SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type Texture,
} from 'three';
import { COMFORT_LOOK } from '../tuning';

const RING_VERT = /* glsl */ `
attribute float aArc;
varying vec2 vXY;
varying float vArc;
void main() {
  vXY = position.xy; vArc = aArc;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vXY;
varying float vArc;
void main() {
  float a = atan(vXY.y, vXY.x) / 6.28318530718 + 0.5;
  if (a > vArc) discard;
  gl_FragColor = vec4(uColor, uOpacity);
}`;

/**
 * Instanced rings; capacity doubles when full (a marker-mode creature has no body, so a dropped ring would leave it
 * with no representation at all).
 */
class RingSet {
  mesh!: InstancedMesh;
  private arc = new Float32Array(0);
  private readonly material: ShaderMaterial;
  private readonly geometry: RingGeometry;
  private cap = 0;
  n = 0;
  constructor(inner: number, color: string, opacity: number, private readonly parent: Group, initialCap = 32) {
    this.geometry = new RingGeometry(inner, 1, 48, 1);
    this.material = new ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, side: DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    });
    this.alloc(initialCap);
  }
  private alloc(cap: number): void {
    const old = this.mesh, oldArc = this.arc;
    // each mesh gets its own geometry wrapper, because the per-instance attribute is sized to the capacity
    const g = new RingGeometry();
    g.copy(this.geometry);
    this.arc = new Float32Array(cap);
    this.arc.set(oldArc.subarray(0, Math.min(oldArc.length, cap)));
    g.setAttribute('aArc', new InstancedBufferAttribute(this.arc, 1));
    const mesh = new InstancedMesh(g, this.material, cap);
    mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5; mesh.name = 'comfort-ring';
    if (old) {
      (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      this.parent.remove(old); old.geometry.dispose(); old.dispose();
    }
    this.parent.add(mesh);
    this.mesh = mesh;
    this.cap = cap;
  }
  begin(): void { this.n = 0; }
  add(m: Matrix4, arc: number): void {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    this.mesh.setMatrixAt(this.n, m);
    this.arc[this.n] = arc;
    this.n++;
  }
  commit(): void {
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.geometry.getAttribute('aArc') as InstancedBufferAttribute).needsUpdate = true;
  }
  dispose(): void { this.mesh.geometry.dispose(); this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); }
}

const _m = new Matrix4(), _s = new Vector3();

export class ComfortMarks {
  readonly group = new Group();
  private readonly ring = new RingSet(1 - COMFORT_LOOK.ringWidthFraction, COMFORT_LOOK.ring, 0.75, this.group);
  private readonly arc = new RingSet(1.05, COMFORT_LOOK.arc, 0.9, this.group);
  private readonly labels: Sprite[] = [];
  private readonly labelMats = new Map<string, SpriteMaterial>();
  private nLabels = 0;
  rings = 0;

  constructor() {
    this.group.name = 'creatures:comfort';
  }

  begin(): void { this.ring.begin(); this.arc.begin(); this.nLabels = 0; }

  /**
   * One mark: `frame` = the creature's surface frame (columns left, up, forward; translation on the surface), ring
   * radius (mm), wind-up progress 0..1 (0 = none), label text or null.
   */
  add(frame: Matrix4, radiusMm: number, windup: number, label: string | null): void {
    // ring geometry is in its XY plane: turn it into the surface plane (XZ of the frame) and scale
    _m.copy(frame).multiply(RING_BASIS).scale(_s.set(radiusMm, radiusMm, radiusMm));
    this.ring.add(_m, 1.01);
    if (windup > 0) this.arc.add(_m, Math.min(1, windup));
    if (label) this.label(label, frame, radiusMm);
  }

  private label(text: string, frame: Matrix4, r: number): void {
    const mat = this.labelMat(text);
    if (!mat) return;
    let s = this.labels[this.nLabels];
    if (!s) { s = new Sprite(mat); s.center.set(0.5, 0); s.renderOrder = 6; this.labels.push(s); this.group.add(s); }
    s.material = mat;
    const e = frame.elements;
    s.position.set(e[12]! + e[4]! * r * 0.6, e[13]! + e[5]! * r * 0.6, e[14]! + e[6]! * r * 0.6);
    // fixed size on screen
    s.scale.set(0.12, 0.03, 1);
    s.visible = true;
    this.nLabels++;
  }

  private labelMat(text: string): SpriteMaterial | null {
    let m = this.labelMats.get(text);
    if (m) return m;
    const tex = makeLabelTexture(text);
    if (!tex) return null;
    m = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false });
    this.labelMats.set(text, m);
    return m;
  }

  commit(): void {
    this.ring.commit(); this.arc.commit();
    for (let i = this.nLabels; i < this.labels.length; i++) this.labels[i]!.visible = false;
    this.rings = this.ring.n;
  }

  get labelsShown(): number { return this.nLabels; }

  dispose(): void {
    this.ring.dispose(); this.arc.dispose();
    for (const m of this.labelMats.values()) { m.map?.dispose(); m.dispose(); }
    this.group.removeFromParent();
  }
}

/** Ring XY plane -> frame XZ plane (rotate +90 degrees about X). */
const RING_BASIS = new Matrix4().makeRotationX(-Math.PI / 2);

/** A small label texture (null without a DOM, e.g. in Node tests). */
function makeLabelTexture(text: string): Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = 'rgba(20, 18, 14, 0.55)';
  g.beginPath(); g.roundRect?.(8, 8, 240, 48, 12); g.fill();
  g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#efe6d2';
  g.fillText(text, 128, 34);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
