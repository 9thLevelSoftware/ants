// Loading-screen phases of a new game (GDD 01 §1.1 `loading`). World generation reports its own progress (worldgen
// steps, in a worker when the build ships one); the phases after it are the game's. Progress follows the UI's stage
// weights (UI_BALANCE.loadingStageWeights: the eight worldgen stages take the first 75 %, meshes and textures the rest).
import type { WorldgenProgress } from '@/worldgen';

export interface LoadingPhase {
  label: string;
  /** Progress shown when the phase starts, 0..1. */
  progress: number;
}

/** Share of the loading bar that world generation fills. */
export const GENERATION_SHARE = 0.75;

export function loadingPhases(): { generate: LoadingPhase; simulate: LoadingPhase; render: LoadingPhase } {
  return {
    generate: { label: 'Generating the locality', progress: 0 },
    simulate: { label: 'Waking the simulation', progress: GENERATION_SHARE },
    render: { label: 'Preparing the view', progress: 0.8 },
  };
}

/**
 * Loading-bar state for a worldgen progress report: the label is left empty so the loading screen names the stage
 * from the progress; the attempt is shown when the generator retries.
 */
export function generationPhase(p: WorldgenProgress): LoadingPhase & { attempt: number } {
  const f = Number.isFinite(p.fraction) ? Math.min(1, Math.max(0, p.fraction)) : 0;
  return { label: '', progress: f * GENERATION_SHARE, attempt: Math.max(1, (p.attempt ?? 0) + 1) };
}
