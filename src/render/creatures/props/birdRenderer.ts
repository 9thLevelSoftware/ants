/**
 * The bird event's visible part (GDD 05 §2.6): a soft shadow sweeping in, then the beak and front of the head
 * striking from above. One event at a time; nothing is drawn without one. The head geometry is built per variant
 * on first use.
 */
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry } from 'three';
import { birdHeadGeometry, type BirdVariant } from '../geometry/props';
import { birdPose, newBirdPose } from '../birdPose';
import type { BirdView } from '../simAdapter';
import { BIRD_LOOK } from '../tuning';
import { DrapedDisc } from './drape';

export class BirdRenderer {
  readonly group = new Group();
  private readonly disc = new DrapedDisc(8, 28, (r) => { const t = Math.min(1, Math.max(0, (r - 0.5) / 0.5)); return 1 - t * t * (3 - 2 * t); });
  private readonly shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  private readonly shadow = new Mesh(this.disc.geometry, this.shadowMat);
  private readonly headMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  private readonly heads = new Map<BirdVariant, { geometry: BufferGeometry; beakLen: number }>();
  private readonly head = new Mesh(undefined, this.headMat);
  private readonly pose = newBirdPose();
  private lastX = NaN; private lastZ = NaN; private lastScale = NaN;
  /** Drawn this frame (stats). */
  shadowOn = false; beakOn = false;

  constructor() {
    this.group.name = 'creatures:bird';
    this.shadow.renderOrder = 4; this.shadow.frustumCulled = false; this.shadow.name = 'bird-shadow';
    this.head.castShadow = false; this.head.name = 'bird-head'; // the draped disc is its (telegraph) shadow
    this.group.add(this.shadow, this.head);
    this.shadow.visible = false; this.head.visible = false;
  }

  update(ev: BirdView | null, tickF: number, height: (x: number, z: number) => number): void {
    if (!ev) { this.shadow.visible = false; this.head.visible = false; this.shadowOn = this.beakOn = false; return; }
    const g = height(ev.pos.x, ev.pos.z);
    const p = birdPose(ev, tickF, Number.isFinite(g) ? g : ev.pos.y, this.pose);
    const s = p.shadow;
    this.shadow.visible = s.visible && s.opacity > 0.005;
    if (this.shadow.visible) {
      const R = BIRD_LOOK.shadowRadiusMm * s.scale;
      if (s.x !== this.lastX || s.z !== this.lastZ || s.scale !== this.lastScale) {
        this.disc.place(s.x, s.z, R, R * 0.62, s.dirX, s.dirZ, height, 0.4);
        this.lastX = s.x; this.lastZ = s.z; this.lastScale = s.scale;
      }
      this.shadowMat.opacity = s.opacity;
    }
    const b = p.beak;
    this.head.visible = b.visible;
    if (b.visible) {
      const variant = (['thrush', 'sparrow', 'woodpecker'] as const).includes(ev.variant as BirdVariant) ? (ev.variant as BirdVariant) : 'thrush';
      let h = this.heads.get(variant);
      if (!h) { h = birdHeadGeometry(variant); this.heads.set(variant, h); }
      this.head.geometry = h.geometry;
      // the beak tip is beakLen below the geometry's origin
      this.head.position.set(b.tip.x, b.tip.y + h.beakLen, b.tip.z);
      this.head.rotation.set(0, Math.atan2(s.dirX, s.dirZ), b.tilt);
    }
    this.shadowOn = this.shadow.visible; this.beakOn = this.head.visible;
  }

  dispose(): void {
    this.disc.dispose();
    this.shadowMat.dispose(); this.headMat.dispose();
    for (const h of this.heads.values()) h.geometry.dispose();
    this.group.removeFromParent();
  }
}
