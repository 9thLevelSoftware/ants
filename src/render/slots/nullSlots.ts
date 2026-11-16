// Debug fallbacks for the Stage 2 slots that have no debug drawing of their own (?render=debug): they draw nothing.
import type { SubRenderer } from '@/render';

class NullRenderer implements SubRenderer {
  constructor(readonly name: string) {}
  init(): void {}
  update(): void {}
  dispose(): void {}
}

export const nullWeatherRenderer = (): SubRenderer => new NullRenderer('weather-null');
export const nullHumansRenderer = (): SubRenderer => new NullRenderer('humans-null');
