// Progression API: milestones, journal, stage, codex, alerts, diagnostics aggregation, lineage record.
// STUB written by F1b; owner: progression.

import type { ActiveAlert, Diagnostic, Sim, System } from '@/sim/types';
import { DIAGNOSTICS_EVERY, DIAGNOSTICS_OFFSET } from '@/sim/balance';

/** Milestones, journal entries, aims, stage, codex observations. Stub: progression. */
export const progressionSystem: System = { name: 'progression', run: () => {} };
/** Collects module diagnostics, status hysteresis, alerts on status change. Stub: progression. */
export const diagnosticsSystem: System = {
  name: 'diagnostics', every: DIAGNOSTICS_EVERY, offset: DIAGNOSTICS_OFFSET, run: () => {},
};

/** Raises or updates an alert (dedupe by kind:subjectId); returns its id, -1 if suppressed. Stub: -1. */
export function raiseAlert(_sim: Sim, _alert: Omit<ActiveAlert, 'id' | 'raisedTick' | 'updatedTick' | 'count' | 'acknowledged'>): number {
  return -1;
}

export function clearAlert(_sim: Sim, _kind: ActiveAlert['kind'], _subjectId: number): void {}

/** Records a milestone once; true if newly reached. Stub: false. */
export function recordMilestone(_sim: Sim, _id: string): boolean {
  return false;
}

/** Publishes (replaces) a diagnostic record by id. Stub: no-op. */
export function publishDiagnostic(_sim: Sim, _d: Diagnostic): void {}
