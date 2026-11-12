// Sim events: opening, overwintering, reproduction, progression, alerts, diagnostics, codex, cues
// (GDD 06 App. C, GDD 08 §5).

import type { Vec3 } from '@/core/math/vec3';
import type { Caste } from './ids';
import type {
  AimId, CueId, DiagnosticStatus, FoundingFailCause, FoundingHazard, HintId, OpeningPhase, SiteWord, StageId,
} from './ids/progression';
import type { ActiveAlert } from './diagnostics';

export type FlowEvent =
  | { type: 'opening.phase'; from: OpeningPhase; to: OpeningPhase }
  | { type: 'opening.site-assessed'; point: Vec3; factors: number[]; q: number; word: SiteWord }
  | { type: 'opening.readiness'; depth: number; volume: number }
  | { type: 'opening.sealed'; entranceId: number }
  | { type: 'opening.egg-batch'; eggs: number; total: number; forecast: number }
  | {
    type: 'opening.timelapse'; kind: 'start' | 'progress' | 'beat' | 'interrupt' | 'end'; p: number; spanGd: number;
    hazard: FoundingHazard | null;
  }
  | { type: 'opening.handover'; workers: number; reserves: number; q: number }
  | { type: 'opening.failed'; cause: FoundingFailCause }
  | { type: 'queen.egg-eaten'; queenId: number }
  | { type: 'queen.hazard'; queenId: number; hazard: FoundingHazard }
  | { type: 'overwinter.notice' }
  | { type: 'overwinter.banner' }
  | { type: 'overwinter.begin' }
  | { type: 'overwinter.beat'; p: number }
  | { type: 'overwinter.end' }
  | { type: 'overwinter.report'; report: Record<string, number> }
  | { type: 'alate.eclosed'; antId: number; caste: Caste }
  | { type: 'flight.eligible'; p: number; factors: number[] }
  | { type: 'flight.launched'; id: number; nGynes: number; nMales: number; weather: string }
  | { type: 'flight.possessed-start'; gyneId: number }
  | { type: 'flight.possessed-end'; gyneId: number; outcome: string }
  | { type: 'flight.ended'; id: number; nFounded: number }
  | { type: 'lineage.daughter-added'; daughterId: string }
  | { type: 'queen.died'; queenId: number; colonyId: number; cause: string }
  | { type: 'colony.orphaned'; colonyId: number }
  | { type: 'colony.extinct'; colonyId: number; cause: string }
  | { type: 'epitaph.ready'; snapshotId: number };

export type ProgressionEvent =
  | { type: 'milestone.reached'; id: string; tick: number; title: string }
  | { type: 'journal.entry'; entryId: number }
  | { type: 'aim.opened'; id: AimId }
  | { type: 'aim.completed'; id: AimId }
  | { type: 'stage.changed'; from: StageId; to: StageId }
  | { type: 'codex.unlocked'; id: string }
  /** First observation of something with a codex entry (GDD 08 `observe`). */
  | { type: 'observe'; codexId: string }
  | { type: 'hint-trigger'; hintId: HintId }
  | { type: 'alert'; op: 'raise' | 'update' | 'clear'; alert: ActiveAlert }
  | { type: 'diag.changed'; diagId: string; status: DiagnosticStatus; topCause: string }
  | { type: 'ambient.cue'; kind: string }
  /** Audio/visual effect trigger (contracts guidance §8). `variant` carries a material or item class. */
  | { type: 'cue'; cue: CueId; pos: Vec3; strength: number; variant: string | null };
