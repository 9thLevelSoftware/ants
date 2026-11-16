// Registry slot 'world': the real surface renderer (terrain, primitives, mounds, sky, lights, haze) plus the visual
// layers that share its material library and uniforms: decor (grass, draped litter, moss, dew, water) and the map
// boundary (skirt, backdrop silhouettes, edge haze). Adapts the registry's lifecycle and FrameInfo to them and feeds
// the sim inputs they do not read themselves: mound-changed events and surface wetness from the weather. It also
// applies the colour grade the lighting computes (ctx.setGrade) and passes the possession camera's occlusion cone
// to the world frame (WorldFrame.occlusion; the materials that dither are the look-pass task's).
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import { easeGrade, gradeTarget, neutralGrade } from '@/render/app/look';
import type { Sim } from '@/sim/types';
import { BoundaryRenderer } from '../world/boundary';
import { DecorRenderer, type DecorFrame } from '../world/decor';
import { UNDERGROUND, WorldRenderer } from '../world/lighting';
import { readWeather } from '../world/weather/WeatherRenderer';
import { WET_EASE_S, WET_PER_PRECIP } from './params';
import { easeEV, occlusionAt, shadeEV, type OcclusionGrid } from './shadeAdapt';

export class WorldSlot implements SubRenderer {
  readonly name = 'world';
  readonly world = new WorldRenderer();
  readonly decor = new DecorRenderer();
  readonly boundary = new BoundaryRenderer();
  private ctx!: RenderContext;
  private offMound: (() => void) | null = null;
  private wet = 0;
  /** Incremented by every game start / end: a start whose world finished loading after a newer one does nothing. */
  private gameToken = 0;
  private hasWorld = false;
  /** Underground blend for the grade (eased like the world renderer's own), and the grade actually applied. */
  private under = 0;
  private readonly gradeNow = neutralGrade();
  private readonly gradeGoal = neutralGrade();
  /** Exposure the world lighting asked for (EV) and the local deep-shade term added on top (shadeAdapt.ts). */
  private baseEV = 0;
  private shadeNow = 0;
  private appliedEV = Number.NaN;
  private readonly wf: DecorFrame = {
    dt: 0, time: 0, sim: null, underground: false, subject: null, reducedMotion: false, occlusion: null,
  };

  async init(ctx: RenderContext): Promise<void> {
    this.ctx = ctx;
    // the world meters the sky; the slot owns the final exposure so it can add the local deep-shade term
    await this.world.init({ ...ctx, setExposure: (ev: number) => { this.baseEV = ev; } });
    this.boundary.init(ctx);
    await this.decor.init(ctx, this.world); // shares the world's uniforms, environment sample and hole mask
  }

  async onGameStart(sim: Sim): Promise<void> {
    const token = ++this.gameToken;
    this.offMound?.();
    this.offMound = sim.events.on('mound-changed', (e) => this.world.onMoundChanged(e.moundId));
    this.wet = -1;
    this.hasWorld = false;
    await this.world.setWorld(sim.world, sim);
    if (token !== this.gameToken) return; // a newer start (or the end of the game) took over while textures loaded
    this.decor.setWorld(sim.world, sim);
    this.boundary.setWorld(sim.world);
    this.hasWorld = true;
  }

  onGameEnd(): void {
    this.gameToken++;
    this.hasWorld = false;
    this.offMound?.();
    this.offMound = null;
    this.world.clearWorld();
    this.decor.clearWorld();
    this.boundary.clear();
    this.applyGrade(0, true);
  }

  update(frame: FrameInfo): void {
    const w = this.wf;
    w.dt = frame.dt; w.time = frame.time; w.sim = frame.sim; w.underground = frame.underground;
    w.subject = frame.subject; w.reducedMotion = !!frame.reducedMotion; w.occlusion = frame.fade ?? null;
    if (frame.sim) this.updateWetness(frame.sim, frame.dt);
    this.world.update(w);
    if (this.hasWorld) {
      this.decor.update(w);
      this.boundary.update(w, this.world.lighting);
    }
    if (this.ctx.game.testMode) {
      // test mode draws single settled frames: rasterise every pending terrain-hole tile and every decor block now
      this.world.terrain.holeMask?.update(1e9);
      if (this.hasWorld) this.decor.flush();
    }
    this.applyGrade(frame.dt, !this.hasWorld);
    this.applyExposure(frame);
  }

  /** World exposure plus the deep-shade adaptation at the subject (above ground only). */
  private applyExposure(frame: FrameInfo): void {
    let target = 0;
    const p = frame.subject;
    if (this.hasWorld && p && !frame.underground) {
      const ground = this.world.terrain.height(p.x, p.z);
      target = shadeEV(occlusionAt(this.occlusionGrid(), p.x, p.z), p.y - ground);
    }
    this.shadeNow = easeEV(this.shadeNow, target, frame.dt);
    const ev = this.baseEV + this.shadeNow;
    if (Math.abs(ev - this.appliedEV) < 0.01) return;
    this.appliedEV = ev;
    if (this.ctx.setExposure) this.ctx.setExposure(ev);
    else this.ctx.renderer.toneMappingExposure = Math.pow(2, ev);
  }

  private occlusionGrid(): OcclusionGrid | null {
    const tex = this.world.uniforms?.tSkyOcc.value as { image?: { data?: ArrayLike<number>; width?: number; height?: number } } | null;
    const img = tex?.image;
    if (!img?.data || !img.width || !img.height) return null;
    const inv = this.world.uniforms.uSkyOccInv.value;
    return { data: img.data, width: img.width, height: img.height, invX: inv.x, invZ: inv.y };
  }

  /** Deep-shade exposure currently added (EV; tests, debug). */
  get shadeEV(): number {
    return this.shadeNow;
  }

  /** Colour grade from the lighting state (GDD 08 11.2 / 11.4), faded to neutral underground and without a world. */
  private applyGrade(dt: number, neutral: boolean): void {
    const settle = !(dt > 0);
    const k = settle ? 1 : 1 - Math.exp(-dt / UNDERGROUND.easeS);
    this.under += ((this.wf.underground ? 1 : 0) - this.under) * k;
    if (neutral) Object.assign(this.gradeGoal, neutralGrade());
    else gradeTarget(this.world.lighting, this.under, this.gradeGoal);
    easeGrade(this.gradeNow, this.gradeGoal, settle ? 0 : dt);
    this.ctx.setGrade?.(this.gradeNow);
  }

  private updateWetness(sim: Sim, dt: number): void {
    const target = wetnessTarget(sim);
    const k = this.wet < 0 || !(dt > 0) ? 1 : 1 - Math.exp(-dt / WET_EASE_S);
    const next = this.wet < 0 ? target : this.wet + (target - this.wet) * k;
    if (next !== this.wet) { this.wet = next; this.world.setWetness(next); }
  }

  /** Quality: world first (the decor's drape follows the terrain's clipmap levels), then decor. */
  setQuality(q: QualityPreset): void {
    this.world.setQuality(q);
    this.decor.setQuality(q);
  }

  /** The grade currently applied (tests, debug). */
  get grade(): Readonly<ReturnType<typeof neutralGrade>> {
    return this.gradeNow;
  }

  stats(): Record<string, number> {
    const s = this.world.stats(), p = s.prims as unknown as Record<string, unknown>;
    const out: Record<string, number> = {
      terrainLevels: s.terrainLevels, terrainTriangles: s.terrainTriangles, mounds: s.mounds, holeSlots: s.holeSlots,
      holeTilesDropped: s.holeTilesDropped, envBakes: s.envBakes,
    };
    for (const k in p) if (typeof p[k] === 'number') out[`prims.${k}`] = p[k] as number;
    const d = this.decor.stats();
    for (const k of ['blocks', 'blades', 'draped', 'drops', 'mossPatches', 'trianglesSubmitted', 'drawsSubmitted', 'waterSurfaces', 'revisitMismatches'] as const) {
      if (typeof d[k] === 'number') out[`decor.${k}`] = d[k];
    }
    const b = this.boundary.stats();
    out['boundary.skirtTriangles'] = b.skirtTriangles;
    out['boundary.backdropShapes'] = b.backdropShapes;
    out['boundary.backdropTriangles'] = b.backdropTriangles;
    out['shade.ev'] = this.shadeNow;
    out['grade.saturation'] = this.gradeNow.saturation;
    out['grade.gainR'] = this.gradeNow.gain[0];
    out['grade.gainB'] = this.gradeNow.gain[2];
    return out;
  }

  dispose(): void {
    this.gameToken++;
    this.offMound?.();
    this.offMound = null;
    this.decor.dispose();
    this.boundary.dispose();
    this.world.dispose();
  }
}

/**
 * Surface wetness the ground eases toward (wire-stage2): the weather renderer's reading (rain now, precipitation and
 * the soil's surface wetness after the rain, src/render/world/weather), so the ground stays wet after a shower. This
 * slot is the only writer of the world materials' wetness: the weather slot adapter withholds the world peer from the
 * weather renderer (src/render/slots/weatherSlot.ts), otherwise its instant write would undo this easing.
 */
export function wetnessTarget(sim: Sim): number {
  const w = sim.state.env?.weather;
  if (!w) return 0;
  if (!w.windDir || !sim.state.env.moisture) return Math.min(1, Math.max(0, (w.precip ?? 0) * WET_PER_PRECIP));
  return Math.min(1, Math.max(0, readWeather(sim).wet));
}
