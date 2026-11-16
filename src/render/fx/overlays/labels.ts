// Screen-size text labels in the 3D scene (isotherm values, human-event countdowns): sprites on a dark plate, one
// canvas texture per distinct text (small cache), at most `max` shown. Browser only (canvas).
import { CanvasTexture, Group, Sprite, SpriteMaterial, type Scene } from 'three';
import { LABEL_RENDER_ORDER, LABEL_SCREEN_H } from './tuning';

export interface LabelSpec {
  x: number;
  y: number;
  z: number;
  text: string;
}

interface Tex { tex: CanvasTexture; aspect: number }

const CACHE_MAX = 32;

export class Labels {
  readonly group = new Group();
  private readonly sprites: Sprite[] = [];
  private readonly cache = new Map<string, Tex>();
  private k = 1;

  constructor(scene: Scene, private readonly max: number) {
    this.group.name = 'fx:overlay-labels';
    this.group.renderOrder = LABEL_RENDER_ORDER;
    scene.add(this.group);
  }

  /** Shows these labels (beyond `max` are dropped), hides the rest. */
  set(list: readonly LabelSpec[]): void {
    const n = Math.min(this.max, list.length);
    for (let i = 0; i < n; i++) {
      const l = list[i];
      const t = this.texture(l.text);
      let s = this.sprites[i];
      if (!s) {
        s = new Sprite(new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
        s.renderOrder = LABEL_RENDER_ORDER;
        this.sprites.push(s);
        this.group.add(s);
      }
      const m = s.material;
      if (m.map !== t.tex) { m.map = t.tex; m.needsUpdate = true; }
      s.position.set(l.x, l.y, l.z);
      s.scale.set(LABEL_SCREEN_H * t.aspect, LABEL_SCREEN_H, 1);
      s.material.color.setScalar(this.k);
      s.visible = true;
    }
    for (let i = n; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }

  /** Cancels the scene exposure (labels are authored in display brightness). */
  setExposure(k: number): void {
    this.k = k;
    for (const s of this.sprites) s.material.color.setScalar(k);
  }

  get count(): number { return this.sprites.filter((s) => s.visible).length; }

  private texture(text: string): Tex {
    const hit = this.cache.get(text);
    if (hit) { this.cache.delete(text); this.cache.set(text, hit); return hit; }
    const h = 44, pad = 12;
    const font = `600 ${Math.round(h * 0.6)}px system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + pad * 2;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(20, 18, 16, 0.78)';
    g.beginPath();
    g.roundRect(0, 0, w, h, 8);
    g.fill();
    g.font = font;
    g.fillStyle = '#F2EFE6';
    g.textBaseline = 'middle';
    g.fillText(text, pad, h / 2 + 1);
    const tex = new CanvasTexture(c);
    const t = { tex, aspect: w / h };
    this.cache.set(text, t);
    if (this.cache.size > CACHE_MAX) {
      const inUse = new Set(this.sprites.filter((s) => s.visible).map((s) => s.material.map));
      for (const [k, v] of this.cache) {
        if (this.cache.size <= CACHE_MAX) break;
        if (inUse.has(v.tex)) continue;
        v.tex.dispose();
        this.cache.delete(k);
      }
    }
    return t;
  }

  dispose(): void {
    for (const s of this.sprites) s.material.dispose();
    for (const t of this.cache.values()) t.tex.dispose();
    this.cache.clear();
    this.group.removeFromParent();
  }
}
