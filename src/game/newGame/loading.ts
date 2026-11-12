// Loading-screen phases of a new game (GDD 01 §1.1 `loading`). World generation is synchronous today; the
// worldgen worker (task worldgen-terrain) will report its own phases (zone layout, heightfield, ...) here.
export interface LoadingPhase {
  label: string;
  /** Progress shown when the phase starts, 0..1. */
  progress: number;
}

export function loadingPhases(): { generate: LoadingPhase; simulate: LoadingPhase; render: LoadingPhase } {
  return {
    generate: { label: 'Generating the locality', progress: 0.05 },
    simulate: { label: 'Waking the simulation', progress: 0.7 },
    render: { label: 'Preparing the view', progress: 0.9 },
  };
}
