// Registry slot 'fx' renderer (scent-fx task): the scent view, the world overlays (temperature, moisture, threats,
// dig plans) and the particle effects, behind one SubRenderer that is also the UI's overlay host
// (src/ui/overlays/state.ts registerOverlayHost: setOverlay(id, on) for exactly the ids of the catalogue).
// Overlays draw only when switched on; in the `test` quality preset the particle effects are off unless
// requested with setEffects (deterministic, cheap test frames).
import type { Object3D, Scene } from 'three';
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { applyOverlay, inkFor, OKABE_ITO, type OverlayId, type OverlaySet, type PaletteId } from '@/ui/overlays/catalogue';
import { ScentView } from '../scent/ScentView';
import { SCENT_BUDGET } from '../scent/tuning';
import { ParticleSystem } from '../particles/ParticleSystem';
import { ParticleRenderer } from '../particles/ParticleRenderer';
import { MOTE_RENDER_ORDER, PARTICLE_BUDGET, PARTICLE_RENDER_ORDER, REQUESTED_IN_TEST } from '../particles/tuning';
import { ChamberOverlay } from './ChamberOverlay';
import { DimLayer } from './DimLayer';
import { GroundOverlay, optimumC } from './GroundOverlay';
import { encodeTemp, type FieldMode } from './samplers';
import { OVERLAY_BUDGET, OVERLAY_SCENE_DIM } from './tuning';

/** Name of the views task's marker / dig-plan layer (src/render/fx/markers/MarkerRenderer.ts group name). */
export const MARKER_LAYER_NAME = 'fx:markers';

export interface FxRendererOptions {
  /** The dig-plan layer the `dig-plans` overlay switches (default: the scene object named MARKER_LAYER_NAME). */
  markerLayer?: () => Object3D | null;
}

export interface EffectRequest {
  particles?: boolean;
  motes?: boolean;
}

/** Also the UI's overlay host: structurally an OverlayHost of src/ui/overlays/state.ts (not imported: no preact in render). */
export class FxRenderer implements SubRenderer {
  readonly name = 'fx';
  private ctx: RenderContext | null = null;
  private scene: Scene | null = null;
  private quality: QualityPreset | null = null;
  private sim: Sim | null = null;
  private scent: ScentView | null = null;
  private ground: GroundOverlay | null = null;
  private chambers: ChamberOverlay | null = null;
  private dim: DimLayer | null = null;
  private particles: ParticleSystem | null = null;
  private fxPoints: ParticleRenderer | null = null;
  private motePoints: ParticleRenderer | null = null;
  private overlays: OverlaySet = { scent: false, other: null };
  private palette: PaletteId = 'okabe-ito';
  private requested: Required<EffectRequest> = { particles: false, motes: false };
  private markerWasVisible: boolean | null = null;
  private markers = 0;
  private lastMs = 0;

  constructor(private readonly opts: FxRendererOptions = {}) {}

  init(ctx: RenderContext): void {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.quality = ctx.quality;
    const q = ctx.quality.id;
    this.dim = new DimLayer(ctx.scene);
    this.scent = new ScentView(ctx.scene, SCENT_BUDGET[q]);
    this.ground = new GroundOverlay(ctx.scene, OVERLAY_BUDGET[q]);
    this.chambers = new ChamberOverlay(ctx.scene);
    this.particles = new ParticleSystem(this.particleBudget());
    this.fxPoints = new ParticleRenderer(ctx.scene, 'fx:particles', false, PARTICLE_RENDER_ORDER, 0.7);
    this.motePoints = new ParticleRenderer(ctx.scene, 'fx:motes', true, MOTE_RENDER_ORDER, 0.05);
    this.applyPalette();
  }

  onGameStart(sim: Sim): void { this.setSim(sim); }

  onGameEnd(): void { this.setSim(null); }

  /** The sim whose pheromones, environment and events are drawn (null = none). */
  setSim(sim: Sim | null): void {
    this.sim = sim;
    this.markers = 0;
    this.scent?.setSim(sim);
    this.ground?.setSim(sim);
    this.chambers?.setSim(sim);
    this.particles?.setSim(sim);
    this.applyModes();
  }

  // ------------------------------------------------------------------ overlay host (src/ui/overlays/state.ts)

  setOverlay(id: OverlayId, on: boolean): void {
    this.overlays = applyOverlay(this.overlays, id, on);
    this.applyModes();
    this.ctx?.game.requestRender();
  }

  /** Overlays currently on (debug, tests). */
  get overlayState(): OverlaySet { return { ...this.overlays }; }

  /** Colour-blind palette of the overlays (Settings > Accessibility). */
  setPalette(p: PaletteId): void {
    this.palette = p;
    this.applyPalette();
  }

  /** Particle effects / motes explicitly requested (they are off in the `test` preset otherwise). */
  setEffects(r: EffectRequest): void {
    this.requested = { particles: r.particles ?? this.requested.particles, motes: r.motes ?? this.requested.motes };
    this.particles?.setBudget(this.particleBudget());
    this.applyEffects();
  }

  private particleBudget() {
    const id = this.quality?.id ?? 'test';
    const on = this.requested.particles || this.requested.motes;
    return PARTICLE_BUDGET[id === 'test' && on ? REQUESTED_IN_TEST : id];
  }

  private applyEffects(): void {
    const p = this.particles;
    if (!p) return;
    const test = this.quality?.id === 'test';
    p.effectsOn = !test || this.requested.particles;
    p.motesOn = !test || this.requested.motes;
    this.fxPoints?.setPool(p.fx);
    this.motePoints?.setPool(p.motes);
  }

  private applyModes(): void {
    this.scent?.setOn(this.overlays.scent);
    const other = this.overlays.other;
    const field: FieldMode | null = other === 'temperature' || other === 'moisture' || other === 'threats' ? other : null;
    this.ground?.setMode(field);
    const sim = this.sim;
    const mid = sim ? Math.max(0.1, Math.min(0.9, encodeTemp(optimumC(sim)))) : 0.5;
    this.chambers?.setMode(field === 'temperature' || field === 'moisture' ? field : null, mid);
    this.applyMarkerLayer(other === 'dig-plans');
    this.applyEffects();
  }

  /** The dig-plans overlay is on: the views layer should put plan outlines in the marker scene in every view. */
  get digPlansOverlay(): boolean { return this.overlays.other === 'dig-plans'; }

  /**
   * The dig-plans overlay only switches the views task's marker layer on (it is drawn there, not here) and flags it
   * in the layer's userData.digPlansOverlay. The layer only holds plan outlines while the colony view builds them,
   * so outside that view the overlay shows nothing until the views layer reads the flag (or digPlansOverlay) and
   * emits the plans too (reported cross-module need).
   */
  private applyMarkerLayer(on: boolean): void {
    const layer = this.opts.markerLayer?.() ?? this.scene?.getObjectByName(MARKER_LAYER_NAME) ?? null;
    if (!layer) return;
    layer.userData.digPlansOverlay = on;
    if (on) {
      if (this.markerWasVisible === null) this.markerWasVisible = layer.visible;
      layer.visible = true;
    } else if (this.markerWasVisible !== null) {
      layer.visible = this.markerWasVisible;
      this.markerWasVisible = null;
    }
  }

  private applyPalette(): void {
    this.scent?.setPalette(this.palette);
    this.ground?.setPalette(this.palette);
  }

  // ------------------------------------------------------------------ frame

  update(frame: FrameInfo): void {
    const t0 = performance.now();
    let n = 0;
    const list = frame.sim?.state.markers;
    if (list) for (let i = 0; i < list.length; i++) if (list[i].alive) n++;
    this.markers = n;
    const sim = this.sim;
    if (!sim || frame.sim !== sim) {
      if (frame.sim && frame.sim !== sim) this.setSim(frame.sim);
      if (!this.sim) return;
    }
    const converge = !!this.ctx?.game.testMode || frame.dt === 0;
    const now = performance.now() / 1000;
    const exposure = 1 / Math.max(1e-3, this.ctx?.renderer.toneMappingExposure ?? 1);
    const anyOverlay = this.overlays.scent || this.overlays.other !== null;
    this.dim?.set(anyOverlay ? OVERLAY_SCENE_DIM : 0);
    this.scent?.update({ dt: frame.dt, time: frame.time, now, reducedMotion: !!frame.reducedMotion, converge, exposure });
    const cam = frame.camera.position;
    const focus = this.focusOf(frame);
    this.ground?.update({ now, focusX: focus.x, focusZ: focus.z, heightMm: Math.max(1, cam.y - this.sim!.field.height(focus.x, focus.z)), converge, exposure });
    this.chambers?.update(exposure);
    const inks = {
      trail: inkFor(this.palette, OKABE_ITO.orange, 0), home: inkFor(this.palette, OKABE_ITO.skyBlue, 1), alarm: inkFor(this.palette, OKABE_ITO.vermillion, 2),
    };
    this.particles?.update({ dt: frame.dt, camera: cam, scentOn: this.overlays.scent, inks });
    this.fxPoints?.update(frame.camera, frame.viewportHeightPx, exposure);
    this.motePoints?.update(frame.camera, frame.viewportHeightPx, exposure);
    this.lastMs = performance.now() - t0;
  }

  /** What the camera looks at on the ground: the subject, else where the view ray meets the ground. */
  private focusOf(frame: FrameInfo): { x: number; z: number } {
    if (frame.subject) return { x: frame.subject.x, z: frame.subject.z };
    const c = frame.camera, sim = this.sim!;
    const e = c.matrixWorld.elements;
    const dx = -e[8], dy = -e[9], dz = -e[10];
    const h = sim.field.height(c.position.x, c.position.z);
    const above = c.position.y - h;
    const t = dy < -0.05 ? Math.min(above / -dy, 2000 * sim.world.bu) : 300 * sim.world.bu;
    return { x: c.position.x + dx * t, z: c.position.z + dz * t };
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    this.scent?.setBudget(SCENT_BUDGET[q.id]);
    this.ground?.setBudget(OVERLAY_BUDGET[q.id]);
    this.particles?.setBudget(this.particleBudget());
    this.applyEffects();
    if (this.sim) this.scent?.setSim(this.sim);
    this.applyModes();
  }

  stats(): Record<string, number> {
    const s = this.scent?.stats(), g = this.ground?.stats(), p = this.particles?.stats();
    return {
      markers: this.markers,
      ms: this.lastMs,
      scentOn: s?.on ?? 0, scentCells: s?.live ?? 0, scentPending: s?.pending ?? 0, scentMs: s?.ms ?? 0, scentDropped: s?.dropped ?? 0,
      field: g?.mode ?? 0, fieldPasses: g?.passes ?? 0, fieldMs: g?.ms ?? 0, labels: g?.labels ?? 0,
      particles: p?.particles ?? 0, motes: p?.motes ?? 0, particleMs: p?.ms ?? 0, emitted: p?.emitted ?? 0,
      drawCalls: this.drawCalls(),
    };
  }

  /** Draw calls this renderer adds to a frame (one per visible layer). */
  drawCalls(): number {
    let n = 0;
    for (const o of [this.dim?.mesh, this.scent?.mesh, this.ground?.stainMesh, this.ground?.mesh, this.chambers?.mesh, this.fxPoints?.points, this.motePoints?.points]) if (o?.visible) n++;
    return n;
  }

  /** The parts (tests, demo page probes). */
  get parts() {
    return { scent: this.scent, ground: this.ground, chambers: this.chambers, particles: this.particles };
  }

  dispose(): void {
    this.particles?.dispose();
    this.scent?.dispose();
    this.ground?.dispose();
    this.chambers?.dispose();
    this.dim?.dispose();
    this.fxPoints?.dispose();
    this.motePoints?.dispose();
    this.applyMarkerLayer(false);
    this.scent = null; this.ground = null; this.chambers = null; this.dim = null; this.particles = null; this.fxPoints = null; this.motePoints = null;
    this.sim = null;
  }
}

/** The fx slot's renderer in a registry, as the UI's overlay host (game wiring: registerOverlayHost(host)). */
export function overlayHostOf(registry: { entries: readonly { slot: string; renderer: unknown }[] }): FxRenderer | null {
  const r = registry.entries.find((e) => e.slot === 'fx')?.renderer;
  return r instanceof FxRenderer ? r : null;
}
