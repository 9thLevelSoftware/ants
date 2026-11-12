// Registry slot 'world': the real surface renderer (terrain, primitives, mounds, sky, lights, haze). Adapts the
// registry's lifecycle and FrameInfo to WorldRenderer and feeds it the sim inputs it does not read itself:
// mound-changed events and surface wetness from the weather.
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { WorldRenderer, type WorldFrame } from '../world/lighting';
import { WET_EASE_S, WET_PER_PRECIP } from './params';

export class WorldSlot implements SubRenderer {
  readonly name = 'world';
  readonly world = new WorldRenderer();
  private ctx!: RenderContext;
  private offMound: (() => void) | null = null;
  private wet = 0;
  private readonly wf: WorldFrame = { dt: 0, time: 0, sim: null, underground: false, subject: null, reducedMotion: false };

  init(ctx: RenderContext): Promise<void> {
    this.ctx = ctx;
    return this.world.init(ctx);
  }

  onGameStart(sim: Sim): Promise<void> {
    this.offMound?.();
    this.offMound = sim.events.on('mound-changed', (e) => this.world.onMoundChanged(e.moundId));
    this.wet = -1;
    return this.world.setWorld(sim.world, sim);
  }

  onGameEnd(): void {
    this.offMound?.();
    this.offMound = null;
    this.world.clearWorld();
  }

  update(frame: FrameInfo): void {
    const w = this.wf;
    w.dt = frame.dt; w.time = frame.time; w.sim = frame.sim; w.underground = frame.underground;
    w.subject = frame.subject; w.reducedMotion = !!frame.reducedMotion;
    if (frame.sim) this.updateWetness(frame.sim, frame.dt);
    this.world.update(w);
    // test mode draws single settled frames: rasterise every pending terrain-hole tile now (no budget)
    if (this.ctx.game.testMode) this.world.terrain.holeMask?.update(1e9);
  }

  private updateWetness(sim: Sim, dt: number): void {
    const precip = sim.state.env?.weather?.precip ?? 0;
    const target = Math.min(1, Math.max(0, precip * WET_PER_PRECIP));
    const k = this.wet < 0 || !(dt > 0) ? 1 : 1 - Math.exp(-dt / WET_EASE_S);
    const next = this.wet < 0 ? target : this.wet + (target - this.wet) * k;
    if (next !== this.wet) { this.wet = next; this.world.setWetness(next); }
  }

  setQuality(q: QualityPreset): void {
    this.world.setQuality(q);
  }

  stats(): Record<string, number> {
    const s = this.world.stats(), p = s.prims as unknown as Record<string, unknown>;
    const out: Record<string, number> = {
      terrainLevels: s.terrainLevels, terrainTriangles: s.terrainTriangles, mounds: s.mounds, holeSlots: s.holeSlots,
      holeTilesDropped: s.holeTilesDropped, envBakes: s.envBakes,
    };
    for (const k in p) if (typeof p[k] === 'number') out[`prims.${k}`] = p[k] as number;
    return out;
  }

  dispose(): void {
    this.offMound?.();
    this.offMound = null;
    this.world.dispose();
  }
}
