// Registry slot 'weather' (wire-stage2): rain, splashes, ripples, rime, lightning and flooded cavities
// (src/render/world/weather). Drawn after the creatures and humans, before the fx overlays. The renderer is given no
// `world` peer: the world slot alone writes the ground's wetness (eased, from the same reading, worldSlot.ts
// wetnessTarget), so the two never fight over the value within a frame.
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { WeatherRenderer } from '@/render/world/weather/WeatherRenderer';

export class WeatherSlot implements SubRenderer {
  readonly name = 'weather';
  readonly weather = new WeatherRenderer();

  init(ctx: RenderContext): void {
    this.weather.init({ ...ctx, peer: (slot) => (slot === 'world' ? null : ctx.peer?.(slot) ?? null) });
  }

  onGameStart(sim: Sim): void { this.weather.onGameStart(sim); }
  update(frame: FrameInfo): void { this.weather.update(frame); }
  onGameEnd(): void { this.weather.onGameEnd(); }
  setQuality(q: QualityPreset): void { this.weather.setQuality(q); }
  stats(): Record<string, number> { return this.weather.stats(); }
  dispose(): void { this.weather.dispose(); }
}
