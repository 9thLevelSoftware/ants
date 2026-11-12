// Draws the colony view's markers, dig-plan outlines, the planner's ghost and its reason text (GDD 08 §4.3), from a
// plain description the views layer builds each frame (src/game/views/colony/markerScene.ts). Lines are overlays
// (drawn through soil and cut faces, like the x-ray); translucent plan volumes go to the nest renderer's ghost hook;
// labels are screen-size sprites. Rebuilt only when the description's version changes; the x-ray dots (moving ants)
// have their own version so they alone are rebuilt while ants move. Label textures are kept in a small LRU cache
// (the ghost label carries a live volume, so its text keeps changing).
import {
  BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, LineBasicMaterial, LineDashedMaterial, LineSegments, Points, PointsMaterial, Sprite,
  SpriteMaterial, type Material, type Scene,
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

/** Screen-size dots (x-ray: ants and brood seen through the soil, GDD 01 §6.7: >= 3 px). */
export interface MarkerPointSet {
  positions: number[];
  color: string;
  /** Dot diameter, px. */
  sizePx: number;
}

export interface MarkerSceneDesc {
  /** Changes whenever anything below changed (the renderer rebuilds then). */
  version: string;
  lines: MarkerLineSet[];
  labels: MarkerLabel[];
  /** Translucent volumes (plan ghost fill), drawn by the nest renderer's ghost layer. */
  volumes: NestGhost[];
  points?: MarkerPointSet[];
  /** Version of `points` alone (changes as ants move); undefined = part of `version`. */
  pointsVersion?: string;
}

/** Draw order: above the nest's x-ray cast and ghosts (render-nest XRAY / GHOST_RENDER_ORDER ~1000-1011). */
export const MARKER_RENDER_ORDER = 1020;
/** Height of one label line as a fraction of the viewport height (sizeAttenuation off). */
const LABEL_LINE_SCREEN_H = 0.032;
/** Labels wrap at about this many characters per line (a reason text stays a compact block, not a screen-wide bar). */
export const LABEL_WRAP_CHARS = 34;
/** Label textures kept for reuse (least recently used are freed beyond this). */
export const LABEL_CACHE_MAX = 24;

/** Word wrap at `max` characters (a longer word gets its own line). */
export function wrapLabel(text: string, max = LABEL_WRAP_CHARS): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > max) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

/** Least-recently-used cache: get() refreshes an entry; trim() frees the oldest beyond `max` except those in use. */
export class LruCache<V> {
  private map = new Map<string, V>();
  constructor(readonly max: number, private readonly free: (v: V) => void) {}
  get size(): number { return this.map.size; }
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }
  set(key: string, v: V): void { this.map.delete(key); this.map.set(key, v); }
  trim(inUse: ReadonlySet<string>): void {
    for (const [k, v] of this.map) {
      if (this.map.size <= this.max) break;
      if (inUse.has(k)) continue;
      this.map.delete(k);
      this.free(v);
    }
  }
  clear(): void { for (const v of this.map.values()) this.free(v); this.map.clear(); }
}

export class MarkerRenderer {
  readonly group = new Group();
  private version = '';
  private pointsVersion = '';
  private materials: Material[] = [];
  private pointObjects: Points[] = [];
  private textures = new LruCache<{ tex: CanvasTexture; aspect: number; lines: number }>(LABEL_CACHE_MAX, (t) => t.tex.dispose());
  private labelsInUse = new Set<string>();

  constructor(private readonly scene: Scene, private readonly ghostSink: ((g: NestGhost[]) => void) | null = null) {
    this.group.name = 'fx:markers';
    this.group.renderOrder = MARKER_RENDER_ORDER;
    scene.add(this.group);
  }

  /** Number of line sets and labels currently drawn (tests, perf). */
  get counts(): { lines: number; labels: number } {
    let lines = 0, labels = 0;
    for (const c of this.group.children) if (c instanceof Sprite) labels++; else if (c instanceof LineSegments) lines++;
    return { lines, labels };
  }

  update(desc: MarkerSceneDesc | null): void {
    const v = desc?.version ?? '';
    if (v !== this.version) {
      this.version = v;
      this.rebuild(desc);
      this.pointsVersion = '\u0000stale'; // whatever the points version, rebuild them with the rest
    }
    const pv = desc ? desc.pointsVersion ?? v : '';
    if (pv !== this.pointsVersion) {
      this.pointsVersion = pv;
      this.rebuildPoints(desc?.points ?? []);
    }
  }

  private rebuild(desc: MarkerSceneDesc | null): void {
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
    this.labelsInUse.clear();
    for (const l of desc.labels) this.group.add(this.label(l));
    this.textures.trim(this.labelsInUse);
  }

  private rebuildPoints(sets: readonly MarkerPointSet[]): void {
    for (const p of this.pointObjects) {
      this.group.remove(p);
      p.geometry.dispose();
      (p.material as Material).dispose();
    }
    this.pointObjects = [];
    for (const p of sets) {
      if (p.positions.length < 3) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(p.positions, 3));
      const m = new PointsMaterial({ color: p.color, size: p.sizePx, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false });
      const pts = new Points(g, m);
      pts.renderOrder = MARKER_RENDER_ORDER;
      pts.frustumCulled = false;
      this.pointObjects.push(pts);
      this.group.add(pts);
    }
  }

  private label(l: MarkerLabel): Sprite {
    const t = this.texture(l.text, l.color);
    const m = new SpriteMaterial({ map: t.tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    this.materials.push(m);
    const s = new Sprite(m);
    s.position.set(l.pos.x, l.pos.y, l.pos.z);
    s.center.set(0.5, 0);
    s.scale.set(LABEL_LINE_SCREEN_H * t.lines * t.aspect, LABEL_LINE_SCREEN_H * t.lines, 1);
    s.renderOrder = MARKER_RENDER_ORDER + 1;
    s.frustumCulled = false;
    return s;
  }

  /** Text (wrapped) on a dark rounded plate: a canvas texture cached per text and colour (LRU). */
  private texture(text: string, color: string): { tex: CanvasTexture; aspect: number; lines: number } {
    const key = `${color}|${text}`;
    this.labelsInUse.add(key);
    const have = this.textures.get(key);
    if (have) return have;
    const lines = wrapLabel(text);
    const lh = 40, pad = 14, font = `600 ${Math.round(lh * 0.6)}px system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + 2 * pad;
    const h = lines.length * lh + 8;
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
    lines.forEach((l, i) => g.fillText(l, pad, 4 + lh * (i + 0.5) + 1));
    const tex = new CanvasTexture(c);
    const e = { tex, aspect: w / h, lines: lines.length };
    this.textures.set(key, e);
    return e;
  }

  /** Removes the lines and labels (the x-ray points have their own life). */
  private clear(): void {
    for (const c of [...this.group.children]) {
      if (c instanceof Points) continue;
      this.group.remove(c);
      if (c instanceof LineSegments) c.geometry.dispose();
    }
    for (const m of this.materials) m.dispose();
    this.materials = [];
  }

  dispose(): void {
    this.clear();
    this.rebuildPoints([]);
    this.textures.clear();
    this.ghostSink?.([]);
    this.scene.remove(this.group);
  }
}
