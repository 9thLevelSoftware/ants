// Registry slot 'ants': the real ant, brood and item renderer. The sim is its source (a Sim satisfies the renderer's
// AntSimSource structurally); the possessed ant is drawn at locomotion's per-frame prediction (the pose the camera
// follows, so neither judders), and hover / inspect highlights come from the frame.
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { AntRenderer, type AntFrameInfo, type AntSimSource } from '../ants';
import { WorldSlot } from './worldSlot';

/** The sim as the ant renderer's read-only source. */
export function antSource(sim: Sim): AntSimSource {
  return sim;
}

export class AntsSlot implements SubRenderer {
  readonly name = 'ants';
  readonly ants = new AntRenderer();
  private source: AntSimSource | null = null;
  private sim: Sim | null = null;
  private world: WorldSlot | null = null;
  private readonly af: AntFrameInfo = { dt: 0, time: 0, alpha: 1, sim: null, viewportHeightPx: 720, underground: false, possessedPose: null };

  init(ctx: RenderContext): void {
    this.ants.init(ctx);
    const w = ctx.peer?.('world');
    this.world = w instanceof WorldSlot ? w : null;
  }

  onGameStart(sim: Sim): void {
    this.setSim(sim);
  }

  onGameEnd(): void {
    this.setSim(null);
  }

  private setSim(sim: Sim | null): void {
    this.sim = sim;
    this.source = sim ? antSource(sim) : null;
    this.ants.setSim(this.source);
  }

  update(frame: FrameInfo): void {
    if (frame.sim !== this.sim) this.setSim(frame.sim);
    const a = this.af;
    a.dt = frame.dt; a.time = frame.time; a.alpha = frame.alpha; a.sim = this.source; a.camera = frame.camera;
    a.viewportHeightPx = frame.viewportHeightPx; a.underground = frame.underground; a.possessedPose = frame.possessedPose;
    a.hover = frame.hover ?? null; a.inspect = frame.inspect ?? null; a.subjectOpacity = frame.subjectOpacity;
    a.hidePossessedHighlight = frame.hidePossessedHighlight === true;
    if (this.world) this.ants.setHighlightExposure(this.world.world.lighting.exposureEV);
    this.ants.update(a);
  }

  setQuality(q: QualityPreset): void {
    this.ants.setQuality(q);
  }

  stats(): Record<string, number> {
    const s = this.ants.stats;
    return {
      ants: s.ants, lod0: s.visible[0], lod1: s.visible[1], lod2: s.visible[2], lod3: s.visible[3], culled: s.culled, dropped: s.dropped,
      carried: s.carried, looseItems: s.looseItems, drawCalls: s.drawCalls, triangles: s.triangles, cpuMs: s.cpuMs, variants: s.variants,
    };
  }

  dispose(): void {
    this.ants.dispose();
  }
}
