// Registry slot 'fx' (gate 1B): replaces the debug effects renderer, whose flat unlit discs (one per marker, light
// blue) showed through every view and read as a puddle beside the nest in the colony slice. Markers, dig plans and
// ghosts are drawn by the views layer's MarkerRenderer in the colony view (GDD 08 §4.3, src/render/fx/markers); the
// scent view and particles are Tier 2 (scent-fx, weather-effects) and register here when they land. Until then the
// slot draws nothing and only counts the live markers for perf() / summary().
import type { Sim } from '@/sim/types';
import type { FrameInfo, SubRenderer } from '@/render';

export class FxSlot implements SubRenderer {
  readonly name = 'fx';
  private markers = 0;

  init(): void {}

  onGameStart(_sim: Sim): void { this.markers = 0; }

  update(frame: FrameInfo): void {
    let n = 0;
    const list = frame.sim?.state.markers;
    if (list) for (let i = 0; i < list.length; i++) if (list[i].alive) n++;
    this.markers = n;
  }

  stats(): Record<string, number> { return { markers: this.markers }; }

  onGameEnd(): void { this.markers = 0; }

  dispose(): void {}
}
