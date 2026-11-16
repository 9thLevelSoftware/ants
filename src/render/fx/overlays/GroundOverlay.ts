// The ground-hugging field of the temperature, moisture and threats overlays: a draped grid over a square region
// around what the camera looks at, coloured from an RGBA8 field texture rastered a few rows per frame (raster.ts)
// from the sim (samplers.ts), plus isotherm labels (temperature) and countdown labels (threats).
import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DataTexture, LinearFilter, Mesh, RGBAFormat, UnsignedByteType, type Scene,
  type ShaderMaterial, type Vector3, type Vector4,
} from 'three';
import type { Sim } from '@/sim/types';
import { inkFor, legendFor, OKABE_ITO, type PaletteId } from '@/ui/overlays/catalogue';
import { FieldRaster, isothermSpots, regionFor, sameRegion, type Region } from './raster';
import { decodeTemp, encodeTemp, samplerFor, type FieldMode, type Forecast } from './samplers';
import { createGroundMaterials, lumOf, setVec, type GroundMaterials } from './groundShader';
import { Labels, type LabelSpec } from './labels';
import {
  DRAPE_MAX_RISE_BU, FIELD_LIFT_MM, FIELD_RENDER_ORDER, ISOTHERM_LABEL_C, LABEL_LIFT_BU, RASTER_REFRESH_S, REGION, STAIN_CHROMA, TEMP_MAX_C, TEMP_MIN_C, type OverlayBudget,
} from './tuning';

const MODE_INDEX: Record<FieldMode, number> = { temperature: 0, moisture: 1, threats: 2 };

export interface GroundFrame {
  /** Real seconds (pass pacing). */
  now: number;
  /** World point the camera looks at, mm, and the camera height above the ground there, mm. */
  focusX: number;
  focusZ: number;
  heightMm: number;
  /** Raster everything at once (render on demand / screenshots). */
  converge: boolean;
  /** Multiplier cancelling the scene exposure (overlays are authored in display brightness). */
  exposure: number;
}

export interface GroundStats {
  mode: number;
  passes: number;
  ms: number;
  labels: number;
  texels: number;
}

export class GroundOverlay {
  /** Ink pass (lines, hatching, outlines). */
  readonly mesh: Mesh;
  /** Stain pass (temperature and moisture fills), same grid, drawn first. */
  readonly stainMesh: Mesh;
  private sim: Sim | null = null;
  private raster: FieldRaster;
  private tex: DataTexture;
  private materials: GroundMaterials | null = null;
  private geometry: BufferGeometry | null = null;
  private labels: Labels;
  private mode: FieldMode | null = null;
  /** Mode of the pass under way / of the front image. */
  private passMode: FieldMode | null = null;
  private frontMode: FieldMode | null = null;
  private passForecasts: Forecast[] = [];
  private passStartedAt = -Infinity;
  private meshRegion: Region | null = null;
  private palette: PaletteId = 'okabe-ito';
  private passes = 0;
  private lastMs = 0;

  constructor(private readonly scene: Scene, private budget: OverlayBudget) {
    this.raster = new FieldRaster(budget.texels);
    this.tex = makeTexture(this.raster);
    this.mesh = new Mesh();
    this.mesh.name = 'fx:overlay-ground';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = FIELD_RENDER_ORDER;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.stainMesh = new Mesh();
    this.stainMesh.name = 'fx:overlay-stain';
    this.stainMesh.frustumCulled = false;
    this.stainMesh.renderOrder = FIELD_RENDER_ORDER - 1;
    this.stainMesh.visible = false;
    scene.add(this.stainMesh);
    this.labels = new Labels(scene, budget.labels);
  }

  setSim(sim: Sim | null): void {
    this.sim = sim;
    this.disposeMaterials();
    this.frontMode = null;
    this.passMode = null;
    this.meshRegion = null;
    this.raster = new FieldRaster(this.budget.texels);
    this.tex.dispose();
    this.tex = makeTexture(this.raster);
    if (!sim) { this.mesh.visible = false; this.stainMesh.visible = false; return; }
    this.materials = createGroundMaterials(this.tex, sim.world.bu);
    this.mesh.material = this.materials.ink;
    this.stainMesh.material = this.materials.stain;
    this.applyPalette();
  }

  setBudget(b: OverlayBudget): void {
    const resize = b.texels !== this.budget.texels || b.grid !== this.budget.grid || b.labels !== this.budget.labels;
    this.budget = b;
    if (!resize) return;
    this.labels.dispose();
    this.labels = new Labels(this.scene, b.labels);
    this.setSim(this.sim);
  }

  /** The active field overlay (null = none). */
  setMode(mode: FieldMode | null): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.passStartedAt = -Infinity; // start a pass for the new mode at once
  }

  get activeMode(): FieldMode | null { return this.mode; }

  setPalette(p: PaletteId): void {
    this.palette = p;
    this.applyPalette();
  }

  /** The ink material; its uniforms are shared with the stain pass (null before setSim). */
  private get material(): ShaderMaterial | null { return this.materials?.ink ?? null; }

  private disposeMaterials(): void {
    this.materials?.stain.dispose();
    this.materials?.ink.dispose();
    this.materials = null;
  }

  private applyPalette(): void {
    const m = this.material;
    const sim = this.sim;
    if (!m || !sim) return;
    const u = m.uniforms;
    const mono = this.palette === 'pattern-only';
    u.uMono.value = mono ? 1 : 0;
    const mode = this.mode ?? 'temperature';
    const scale = legendFor(mode === 'moisture' ? 'moisture' : 'temperature').scale!;
    setVec(u.uRamp0.value as Vector3, scale.stops[0]);
    setVec(u.uRamp1.value as Vector3, scale.stops[1]);
    setVec(u.uRamp2.value as Vector3, scale.stops[2]);
    // the stain is relative to the ramp's neutral end: the optimum (temperature) or dry (moisture)
    u.uLumRef.value = lumOf(scale.stops[mode === 'moisture' ? 0 : 1]);
    setVec(u.uWater.value as Vector3, OKABE_ITO.blue);
    // GDD 08 §10.1: the diverging temperature ramp is centred on the species' optimum (the legend spaces its stops evenly)
    u.uMid.value = mode === 'temperature' ? Math.max(0.1, Math.min(0.9, encodeTemp(optimumC(sim)))) : 0.5;
    const threats = legendFor('threats').entries;
    const inks = u.uInk.value as Vector3[];
    for (let i = 0; i < 4; i++) setVec(inks[i], inkFor(this.palette, threats[i]?.hue ?? OKABE_ITO.paper, i));
  }

  update(f: GroundFrame): void {
    const sim = this.sim, m = this.material;
    if (!sim || !m || !this.mode) {
      this.mesh.visible = false;
      this.stainMesh.visible = false;
      this.labels.set([]);
      return;
    }
    const t0 = performance.now();
    m.uniforms.uExposure.value = f.exposure;
    this.labels.setExposure(f.exposure);
    const bu = sim.world.bu;
    const region = regionFor(f.focusX, f.focusZ, f.heightMm, bu, REGION.k, REGION.minBu, REGION.maxBu, REGION.snap);
    // render on demand (converge): every frame shows the current state
    const due = f.converge || f.now - this.passStartedAt >= RASTER_REFRESH_S || this.passMode !== this.mode || !sameRegion(region, this.raster.frontRegion);
    if (!this.raster.busy && due || this.raster.busy && this.passMode !== this.mode) {
      const s = samplerFor(sim, this.mode);
      this.raster.start(region, s.sampler);
      this.passMode = this.mode;
      this.passForecasts = s.forecasts;
      this.passStartedAt = f.now;
      if (this.mode !== this.frontMode) this.applyPalette();
    }
    if (this.raster.step(f.converge ? Infinity : this.budget.rowsPerFrame)) this.passDone();
    this.mesh.visible = this.frontMode === this.mode && !!this.raster.frontRegion;
    this.stainMesh.visible = this.mesh.visible && this.mode !== 'threats';
    if (!this.mesh.visible) this.labels.set([]);
    this.lastMs = performance.now() - t0;
  }

  private passDone(): void {
    const sim = this.sim!, m = this.material!, r = this.raster.frontRegion!;
    this.passes++;
    this.frontMode = this.passMode;
    (this.tex.image.data as Uint8Array).set(this.raster.front);
    this.tex.needsUpdate = true;
    (m.uniforms.uRegion.value as Vector4).set(r.x0, r.z0, r.size, 1 / r.size);
    m.uniforms.uMode.value = MODE_INDEX[this.frontMode!];
    m.uniforms.uChroma.value = this.frontMode === 'moisture' ? STAIN_CHROMA.moisture : STAIN_CHROMA.temperature;
    if (!sameRegion(r, this.meshRegion)) this.drape(r);
    this.labels.set(this.labelSpecs(sim, r));
  }

  private labelSpecs(sim: Sim, r: Region): LabelSpec[] {
    const bu = sim.world.bu;
    if (this.frontMode === 'threats') {
      return this.passForecasts.map((q) => ({ x: q.x, y: q.y + LABEL_LIFT_BU * bu, z: q.z, text: q.text }));
    }
    if (this.frontMode !== 'temperature') return [];
    const n = this.raster.n, step = r.size / n;
    const spots = isothermSpots(this.raster, decodeTemp, ISOTHERM_LABEL_C, this.budget.labels, Math.max(4, n / 5));
    const labels = spots.map((s) => {
      const x = r.x0 + (s.i + 1) * step, z = r.z0 + (s.j + 0.5) * step;
      return { x, y: sim.field.height(x, z) + LABEL_LIFT_BU * bu, z, text: `${s.c} °C` };
    });
    // no isotherm to label (uniform weather, or none of the 10 °C ones in view): the value under the view's centre, so
    // the tint always comes with a number to read against the legend
    if (labels.length === 0 && this.raster.texel(n >> 1, n >> 1, 1) > 0) {
      const x = r.x0 + r.size / 2, z = r.z0 + r.size / 2;
      labels.push({ x, y: sim.field.height(x, z) + LABEL_LIFT_BU * bu, z, text: `${Math.round(decodeTemp(this.raster.texel(n >> 1, n >> 1, 0)))} °C` });
    }
    return labels;
  }

  /**
   * (Re)builds the draped grid over the region: terrain height (with mounds), raised onto low hard surfaces lying on
   * it (paving slabs, kerbs: GDD 04 hardscape is made of primitives) but not onto tall objects, plus a small lift.
   */
  private drape(r: Region): void {
    const sim = this.sim!;
    const g = this.budget.grid;
    const pos = new Float32Array(g * g * 3);
    const maxRise = DRAPE_MAX_RISE_BU * sim.world.bu;
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const x = r.x0 + (i / (g - 1)) * r.size, z = r.z0 + (j / (g - 1)) * r.size;
      const h = sim.field.height(x, z);
      let y = h;
      let d = sim.field.hardXYZ(x, y + FIELD_LIFT_MM, z);
      for (let k = 0; k < 6 && d < 0; k++) {
        y += -d + FIELD_LIFT_MM;
        d = sim.field.hardXYZ(x, y + FIELD_LIFT_MM, z);
      }
      if (d < 0 || y - h > maxRise) y = h;
      const o = (j * g + i) * 3;
      pos[o] = x; pos[o + 1] = y + FIELD_LIFT_MM; pos[o + 2] = z;
    }
    let geo = this.geometry;
    if (!geo || (geo.getAttribute('position')?.count ?? 0) !== g * g) {
      geo?.dispose();
      geo = new BufferGeometry();
      const idx: number[] = [];
      for (let j = 0; j < g - 1; j++) for (let i = 0; i < g - 1; i++) {
        const a = j * g + i, b = a + 1, c = a + g, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      geo.setIndex(idx);
      this.geometry = geo;
      this.mesh.geometry = geo;
      this.stainMesh.geometry = geo;
    }
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.computeBoundingSphere();
    this.meshRegion = { ...r };
  }

  stats(): GroundStats {
    return { mode: this.mode ? MODE_INDEX[this.mode] + 1 : 0, passes: this.passes, ms: this.lastMs, labels: this.labels.count, texels: this.raster.n };
  }

  /** The completed field image (tests, probes). */
  get image(): FieldRaster { return this.raster; }

  dispose(): void {
    this.geometry?.dispose();
    this.disposeMaterials();
    this.tex.dispose();
    this.labels.dispose();
    this.mesh.removeFromParent();
    this.stainMesh.removeFromParent();
    this.sim = null;
  }
}

/** The species' brood optimum, °C: middle of the larval tOpt band (the legend's comfort band), else 25. */
export function optimumC(sim: Sim): number {
  const clim = sim.species.nestTemplate?.broodClimate;
  const c = clim?.find((b) => b.stage === 'larva') ?? clim?.[0];
  return c ? (c.tOpt[0] + c.tOpt[1]) / 2 : (TEMP_MIN_C + TEMP_MAX_C) / 2;
}

function makeTexture(r: FieldRaster): DataTexture {
  const t = new DataTexture(new Uint8Array(r.n * r.n * 4), r.n, r.n, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
