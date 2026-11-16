// The scent view (GDD 08 §10.1, key V): the cache's slots drawn as one instanced mesh of surface-hugging glyphs.
// Per frame: refresh due layers (visit budget), snap new cells, refine axes, ease intensities, upload changed
// ranges. One draw call whatever the number of cells.
import { BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, type Scene, type ShaderMaterial } from 'three';
import type { Sim } from '@/sim/types';
import { inkFor, OKABE_ITO, type PaletteId } from '@/ui/overlays/catalogue';
import { ScentCache, type PointEntry, type ScentCacheStats, type SurfaceSnapper } from './ScentCache';
import { FOOD_LAYER_KEY, fieldSnapper, foodPlumes, layersKey, scentLayers } from './layers';
import { createScentMaterial, INK_ORDER, setInks } from './scentMaterial';
import { FADE_RATE_S, SCENT_RENDER_ORDER, type ScentBudget } from './tuning';

const CONVERGE = { chunks: Infinity, visits: Infinity, minRefreshS: 0 };
const IDLE = { chunks: 0, visits: 0, minRefreshS: Infinity };

const HUES: Record<(typeof INK_ORDER)[number], string> = {
  trail: OKABE_ITO.orange, home: OKABE_ITO.skyBlue, alarm: OKABE_ITO.vermillion, food: OKABE_ITO.bluishGreen, rival: OKABE_ITO.reddishPurple,
};

export interface ScentFrame {
  /** Real seconds since the last frame (0 = settle frame). */
  dt: number;
  /** Animation clock, s. */
  time: number;
  /** Real-time clock for refresh pacing, s. */
  now: number;
  reducedMotion: boolean;
  /** Converge at once (render on demand / test screenshots): no easing, no budgets. */
  converge: boolean;
  /** Multiplier cancelling the scene exposure (overlays are authored in display brightness). */
  exposure: number;
}

export interface ScentViewStats extends ScentCacheStats {
  ms: number;
  drawn: number;
  on: number;
}

export class ScentView {
  readonly mesh: Mesh;
  private cache: ScentCache | null = null;
  private material: ShaderMaterial | null = null;
  private geometry: InstancedBufferGeometry | null = null;
  private attrs: { posSize: InstancedBufferAttribute; nrmStyle: InstancedBufferAttribute; axis: InstancedBufferAttribute; val: InstancedBufferAttribute } | null = null;
  private sim: Sim | null = null;
  private snapper: SurfaceSnapper | null = null;
  private on = false;
  private key = '';
  private palette: PaletteId = 'okabe-ito';
  private readonly plumes: PointEntry[] = [];
  private lastMs = 0;

  constructor(private readonly scene: Scene, private budget: ScentBudget) {
    this.mesh = new Mesh();
    this.mesh.name = 'fx:scent';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SCENT_RENDER_ORDER;
    this.mesh.visible = false;
  }

  setSim(sim: Sim | null): void {
    this.disposeGpu();
    this.sim = sim;
    if (!sim) return;
    const cell = sim.state.phero.cell;
    this.cache = new ScentCache(this.budget.maxCells, cell);
    this.snapper = fieldSnapper(sim);
    this.material = createScentMaterial(sim.world.bu, cell);
    this.applyPalette();
    const g = new InstancedBufferGeometry();
    // quad corners in [-1, 1]^2 (two triangles)
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const c = this.cache;
    const mk = (arr: Float32Array, n: number) => { const a = new InstancedBufferAttribute(arr, n); a.setUsage(DynamicDrawUsage); return a; };
    this.attrs = { posSize: mk(c.posSize, 4), nrmStyle: mk(c.nrmStyle, 4), axis: mk(c.axis, 3), val: mk(c.val, 1) };
    g.setAttribute('iPosSize', this.attrs.posSize);
    g.setAttribute('iNrmStyle', this.attrs.nrmStyle);
    g.setAttribute('iAxis', this.attrs.axis);
    g.setAttribute('iVal', this.attrs.val);
    g.instanceCount = 0;
    this.geometry = g;
    this.mesh.geometry = g;
    this.mesh.material = this.material;
    if (!this.mesh.parent) this.scene.add(this.mesh);
    this.key = '';
    if (this.on) this.cache.setLayers(scentLayers(sim));
  }

  setBudget(b: ScentBudget): void {
    const resize = b.maxCells !== this.budget.maxCells;
    this.budget = b;
    if (resize && this.sim) this.setSim(this.sim);
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!this.cache || !this.sim) return;
    if (on) { this.key = ''; } else this.cache.clearLayers();
  }

  get isOn(): boolean { return this.on; }

  setPalette(p: PaletteId): void {
    this.palette = p;
    this.applyPalette();
  }

  private applyPalette(): void {
    if (!this.material) return;
    setInks(this.material, INK_ORDER.map((k, i) => inkFor(this.palette, HUES[k], i)));
  }

  update(f: ScentFrame): void {
    const sim = this.sim, cache = this.cache, mat = this.material;
    if (!sim || !cache || !mat || !this.geometry || !this.attrs) return;
    const t0 = performance.now();
    if (this.on) {
      const k = layersKey(sim);
      if (k !== this.key) { this.key = k; cache.setLayers(scentLayers(sim)); }
      const b = this.budget;
      const all = f.converge;
      cache.converge = all;
      cache.refresh(sim.phero, sim.state.phero, all ? CONVERGE : { chunks: b.chunksPerFrame, visits: b.visitsPerFrame, minRefreshS: b.minRefreshS, evictScan: b.evictScanPerFrame }, f.now);
      cache.setPoints(FOOD_LAYER_KEY, foodPlumes(sim, this.plumes));
      cache.processSnaps(this.snapper!, all ? Infinity : b.snapsPerFrame);
      cache.processAxes(all ? Infinity : b.axesPerFrame, all ? 0 : b.axesSweepPerFrame, all ? Infinity : b.geoPerFrame);
    } else {
      cache.refresh(sim.phero, null, IDLE, f.now); // retires faded layers only
    }
    cache.ease(f.dt, f.converge ? Infinity : FADE_RATE_S);
    this.upload();
    mat.uniforms.uTime.value = f.time;
    mat.uniforms.uReduced.value = f.reducedMotion ? 1 : 0;
    mat.uniforms.uExposure.value = f.exposure;
    this.mesh.visible = cache.high > 0;
    this.lastMs = performance.now() - t0;
  }

  private upload(): void {
    const c = this.cache!, a = this.attrs!, g = this.geometry!;
    g.instanceCount = c.high;
    if (c.geomHi > c.geomLo) {
      const lo = c.geomLo, n = c.geomHi - c.geomLo;
      for (const [attr, size] of [[a.posSize, 4], [a.nrmStyle, 4], [a.axis, 3]] as const) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(lo * size, n * size);
        attr.needsUpdate = true;
      }
    }
    if (c.valHi > c.valLo) {
      a.val.clearUpdateRanges();
      a.val.addUpdateRange(c.valLo, c.valHi - c.valLo);
      a.val.needsUpdate = true;
    }
    c.clearDirty();
  }

  stats(): ScentViewStats {
    const s = this.cache?.stats() ?? { slots: 0, live: 0, pending: 0, moving: 0, dropped: 0, outranked: 0, evicted: 0, visits: 0, chunks: 0, snaps: 0, axes: 0, layers: 0 };
    return { ...s, ms: this.lastMs, drawn: this.mesh.visible ? 1 : 0, on: this.on ? 1 : 0 };
  }

  /** The CPU cache (tests, probes). */
  get data(): ScentCache | null { return this.cache; }

  private disposeGpu(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.attrs = null;
    this.cache = null;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.disposeGpu();
    this.mesh.removeFromParent();
    this.sim = null;
  }
}
