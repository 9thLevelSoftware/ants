// Alerts and diagnostics go to the progression module (which owns their storage, de-duplication and
// cooldowns). Diagnostics are also upserted into progression.diagnostics here while progression's
// publishDiagnostic is still a stub, so the colony's records are always visible in state.

import type { AlertKind, AlertLevel, Diagnostic, Sim, TargetRef } from '@/sim/types';
import { clearAlert, publishDiagnostic, raiseAlert } from '@/sim/progression';

export function colonyAlert(
  sim: Sim, kind: AlertKind, level: AlertLevel, subjectId: number, title: string, cause: string,
  diagnosticId: string | null = null, focus: TargetRef | null = null,
): void {
  raiseAlert(sim, { kind, level, subjectId, title, cause, focus, diagnosticId });
}

export function colonyClearAlert(sim: Sim, kind: AlertKind, subjectId: number): void {
  clearAlert(sim, kind, subjectId);
}

/**
 * Publishes a diagnostic through progression; if progression did not store it (its stub), upserts it into
 * progression.diagnostics here. Returns true when this fallback was used (the caller then emits the event).
 */
export function colonyPublish(sim: Sim, d: Diagnostic): boolean {
  publishDiagnostic(sim, d);
  const list = sim.state.progression.diagnostics;
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0 && list[i] === d) return false;
  if (i < 0) list.push(d);
  else list[i] = d;
  return true;
}
