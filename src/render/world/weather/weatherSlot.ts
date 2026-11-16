// Ready-to-paste registry slot for the weather renderer (task weather-effects; the registry and slots are the app
// gate's files, so this lives here until the integrator moves it to src/render/slots/weatherSlot.ts).
//
// Registration (src/render/index.ts, app gate):
//   1. add 'weather' to RendererSlot and to RENDERER_SLOTS after 'creatures' (before 'fx': the rain draws over the
//      world and nest, the fx overlays over the rain);
//   2. add `weather: () => new NullWeatherRenderer()` to DEBUG_RENDERERS (src/render/debug/index.ts);
//   3. the one registration line:
//        registerRenderer('weather', () => new WeatherSlot());
//   4. optional: WorldSlot.updateWetness can read env.moisture.surfaceWet itself (then the weather slot's wetness
//      write and the world's agree; until then the weather slot's write, later in the slot order, wins).
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { WeatherRenderer } from './WeatherRenderer';

export class WeatherSlot implements SubRenderer {
  readonly name = 'weather';
  readonly weather = new WeatherRenderer();

  init(ctx: RenderContext): void { this.weather.init(ctx); }
  onGameStart(sim: Sim): void { this.weather.onGameStart(sim); }
  update(frame: FrameInfo): void { this.weather.update(frame); }
  onGameEnd(): void { this.weather.onGameEnd(); }
  setQuality(q: QualityPreset): void { this.weather.setQuality(q); }
  stats(): Record<string, number> { return this.weather.stats(); }
  dispose(): void { this.weather.dispose(); }
}

/** Debug fallback for a 'weather' slot: draws nothing. */
export class NullWeatherRenderer implements SubRenderer {
  readonly name = 'weather-null';
  init(): void {}
  update(): void {}
  dispose(): void {}
}
