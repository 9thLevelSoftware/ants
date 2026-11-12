// Readable causality: diagnostics and alerts (contracts guidance §6, GDD 02 §14, GDD 08 App. A).

import type { AlertKind, AlertLevel, DiagnosticStatus } from './ids/progression';
import type { TargetRef } from './refs';

/** One limiting factor. Weights over a diagnostic's factors sum to 1. */
export interface DiagnosticFactor {
  /** Factor id (e.g. 'protein', 'temperature', 'nurses'). */
  cause: string;
  /** Share of the shortfall 0..1. */
  weight: number;
  /** Short human-readable detail (numbers already formatted). */
  detail: string;
  /** Diagnostic this factor is explained by (cause chains, depth <= 3), null none. */
  diagId: string | null;
}

export interface Diagnostic {
  /** DiagnosticId; per-subject instances append ':<subjectId>' (e.g. 'diag-dig-progress:42'). */
  id: string;
  /** Publishing system ('colony', 'nest', 'world', 'ecology', 'environment', 'species', ...). */
  system: string;
  status: DiagnosticStatus;
  label: string;
  /** Main value (ratio or count, see owner chapter). */
  value: number;
  factors: DiagnosticFactor[];
  /** Remedy ids (e.g. 'remedy.slider.forage'); the UI maps them to controls. */
  remedies: string[];
  /** Tick the current status began. */
  sinceTick: number;
  /** Entity the UI "Show" button jumps to; null none. */
  focus: TargetRef | null;
}

export interface ActiveAlert {
  id: number;
  kind: AlertKind;
  level: AlertLevel;
  /** Subject entity id for de-duplication (`kind:subjectId`), -1 none. */
  subjectId: number;
  title: string;
  cause: string;
  focus: TargetRef | null;
  diagnosticId: string | null;
  raisedTick: number;
  updatedTick: number;
  /** Times re-raised while active. */
  count: number;
  acknowledged: boolean;
}

/** Entry of the event log ring (GDD 08 App. A `progression.eventLog`). */
export interface EventLogEntry {
  tick: number;
  kind: string;
  level: AlertLevel;
  text: string;
  focus: TargetRef | null;
}
