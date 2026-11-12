// Local adapter around locomotion's per-frame predictor for the possessed ant (GDD 01 §3.4). Isolated here so a
// rename in src/sim/locomotion touches one file. Returns null before the predictor has run for the current ant.
import type { Sim } from '@/sim/types';
import { possessedPose as locoPossessedPose } from '@/sim/locomotion/possessed';

export interface PredictedPose {
  pos: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  fwd: { x: number; y: number; z: number };
}

export function predictedPossessedPose(sim: Sim): PredictedPose | null {
  try {
    return locoPossessedPose(sim);
  } catch {
    return null;
  }
}
