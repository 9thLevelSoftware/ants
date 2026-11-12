// Draws the colony view's markers, dig-plan outlines, the planner's ghost and its reason text (GDD 08 §4.3), from a
// plain description the views layer builds each frame (src/game/views/colony/markerScene.ts). Lines are overlays
// (drawn through soil and cut faces, like the x-ray); translucent plan volumes go to the nest renderer's ghost hook;
// labels are screen-size sprites. Rebuilt only when the description's version changes.
import {
  BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, LineBasicMaterial, LineDashedMaterial, LineSegments, Sprite, SpriteMaterial,
  type Material, type Scene,
} from 'three';
import type { Vec3 } from '@/core';
import type { NestGhost } from '@/render/nest';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface MarkerLineSet {
  /** Segment end points, xyz pairs, mm. */
  positions: number[];
  /** sRGB colour. */
  color: string;
  style: LineStyle;
  /** Dash length for dashed / dotted, mm. */
  dash?: number;
}

export interface MarkerLabel {
  pos: Vec3;
  text: string;
  color: string;
}

export interface MarkerSceneDesc {
  /** Changes whenever anything below changed (the renderer rebuilds then). */
  version: string;
  lines: MarkerLineSet[];
  labels: MarkerLabel[];
  /** Translucent volumes (plan ghost fill), drawn by the nest renderer's ghost layer. */
  volumes: NestGhost[];
}

/** Draw order: above the nest's x-ray cast and ghosts (render-nest XRAY / GHOST_RENDER_ORDER ~1000-1011). */
export const MARKER_RENDER_ORDER = 1020;
/** Label height as a fraction of the viewport height (sizeAttenuation off). */
const LABEL_SCREEN_H = 0.045;

export class MarkerRenderer {
  readonly group = new Group();
  private version = '';
  private materials: Material[] = [];
  private textures = new Map<string, { tex: CanvasTexture; aspect: number }>();

  constructor(private readonly scene: Scene, private readonly ghostSink: ((g: NestGhost[]) => void) | null = null) {
    this.group.name = 'fx:markers';
    this.group.renderOrder = MARKER_RENDER_ORDER;
    scene.add(this.group);
  }

  /** Number of line sets and labels currently drawn (tests, perf). */
  get counts(): { lines: number; labels: number } {
    let lines = 0, labels = 0;
    for (const c of this.group.children) (c instanceof Sprite ? labels++ : lines++);
    return { lines, labels };
  }

  update(desc: MarkerSceneDesc | null): void {
    const v = desc?.version ?? '';
    if (v === this.version) return;
    this.version = v;
    this.clear();
    this.ghostSink?.(desc?.volumes ?? []);
    if (!desc) return;
    for (const set of desc.lines) {
      if (set.positions.length < 6) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(set.positions, 3));
      const common = { color: set.color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false };
      const dash = set.dash ?? 1;
      const m = set.style === 'solid' ? new LineBasicMaterial(common)
        : new LineDashedMaterial({ ...common, dashSize: set.style === 'dotted' ? dash * 0.3 : dash, gapSize: set.style === 'dotted' ? dash * 0.7 : dash * 0.6 });
      const seg = new LineSegments(g, m);
      if (set.style !== 'solid') seg.computeLineDistances();
      seg.renderOrder = MARKER_RENDER_ORDER;
      seg.frustumCulled = false;
      this.materials.push(m);
      this.group.add(seg);
    }
    for (const l of desc.labels) this.group.add(this.label(l));
  }

  private label(l: MarkerLabel): Sprite {
    const t = this.texture(l.text, l.color);
    const m = new SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.materials.push(m);
    const s = new Sprite(m);
    s.position.set(l.pos.x, l.pos.y, l.pos.z);
    s.center.set(0.5, 0);
    s.scale.set(LABEL_SCREEN_H * t.aspect, LABEL_SCREEN_H, 1);
    s.renderOrder = MARKER_RENDER_ORDER + 1;
    s.frustumCulled = false;
    return s;
  }

  /** Text on a dark rounded plate (canvas texture, cached per text and colour). */
  private texture(text: string, color: string): { tex: CanvasTexture; aspect: number } {
    const key = `${color}|${text}`;
    const have = this.textures.get(key);
    if (have) return have;
    const h = 48, pad = 14, font = `600 ${Math.round(h * 0.5)}px system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const w = Math.ceil(probe.measureText(text).width) + 2 * pad;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(20, 16, 12, 0.82)';
    g.beginPath();
    g.roundRect(0, 0, w, h, 10);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
    g.font = font;
    g.fillStyle = '#f4ede2';
    g.textBaseline = 'middle';
    g.fillText(text, pad, h / 2 + 1);
    const tex = new CanvasTexture(c);
    const e = { tex, aspect: w / h };
    this.textures.set(key, e);
    return e;
  }

  private clear(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof LineSegments) c.geometry.dispose();
    }
    for (const m of this.materials) m.dispose();
    this.materials = [];
  }

  dispose(): void {
    this.clear();
    for (const t of this.textures.values()) t.tex.dispose();
    this.textures.clear();
    this.ghostSink?.([]);
    this.scene.remove(this.group);
  }
}
