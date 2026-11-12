// Player-facing sim state: possession, intent, opening sequence and time-lapses (GDD 01, 06, 08 App. A).

import type { FoundingHazard, OpeningPhase, SiteWord } from './ids/progression';
import type { PlayerIntent } from './intent';

/** Opening (founding) sequence progress (GDD 06 §5, App. A `opening`). */
export interface OpeningState {
  phase: OpeningPhase;
  attempt: number;
  retriesUsed: number;
  startDoy: number;
  /** Site factor scores 0..1 in SITE_FACTORS order. */
  siteFactors: number[];
  siteQ: number;
  siteWord: SiteWord | null;
  entranceId: number;
  chamberId: number;
  shaftDepthBu: number;
  chamberVoxels: number;
  sealed: boolean;
  layBatches: number;
  threatsUsed: number;
  lastThreatTick: number;
  interruptsUsed: number;
  hazardLog: { tick: number; hazard: FoundingHazard; outcome: string }[];
  lapse: { startTick: number; endTick: number; skipped: boolean; outcome: string } | null;
  /** Atta fungus pellet; null for other species. */
  garden: { pelletHealth: number; planted: boolean; established: boolean; biomass: number } | null;
  /** Camponotus wood moisture at the site, %; -1 not applicable. */
  woodMoisture: number;
  done: boolean;
}

/** A sim-driven time-lapse (first brood or winter) shown by the UI (GDD 08 App. A `player.timelapse`). */
export interface TimelapseState {
  kind: 'founding' | 'winter';
  startTick: number;
  endTick: number;
  /** 0..1 */
  progress: number;
  /** Free-form stage label for the overlay (e.g. 'larvae'). */
  stage: string;
  /** Live counters for the overlay (eggs, larvae, workers ...). */
  counters: Record<string, number>;
  /** Pending interrupt (hazard beat), null none. */
  interrupt: { id: number; kind: string } | null;
}

export interface PlayerState {
  /** Ant under player control, -1 none. */
  possessedAntId: number;
  /** Previously possessed ant (possess-last), -1 none. */
  previousAntId: number;
  /** Ant to return to after a soft release (e.g. queen during colony view), -1 none. */
  returnAntId: number;
  intent: PlayerIntent;
  /** Tick of the last non-idle input (AFK release); reset on load. */
  lastInputTick: number;
  /** Times each prompt/action was used (prompt teaching). */
  promptLearned: Record<string, number>;
  /** Player colony id (normally colonies[0].id). */
  colonyId: number;
  opening: OpeningState | null;
  timelapse: TimelapseState | null;
}
