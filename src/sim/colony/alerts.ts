// Alerts and diagnostics go to the progression module (which owns their storage, de-duplication and
// cooldowns). Diagnostics are also upserted into progression.diagnostics here while progression's
// publishDiagnostic is still a stub, so the colony's records are always visible in state (see colonyPublish).

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
 * Publishes a diagnostic through progression. Progression owns the record and the `diagnostic-changed` event; while
 * its publishDiagnostic is a stub (it leaves progression.diagnostics untouched), the record is upserted here.
 * Hand-over test: if the call changed the stored entry for this id (a new object, or a new entry), progression
 * handled it, so nothing is written and false is returned. True = the fallback was used (the caller emits the
 * event). Once progression stores records, this fallback never runs, so records and events are not doubled.
 */
export function colonyPublish(
  sim: Sim, d: Diagnostic, publish: (sim: Sim, d: Diagnostic) => void = publishDiagnostic,
): boolean {
  const before = findDiag(sim, d.id);
  publish(sim, d);
  const after = findDiag(sim, d.id);
  if (after !== before) return false;
  const list = sim.state.progression.diagnostics;
  const i = list.findIndex((x) => x.id === d.id);
  if (i < 0) list.push(d);
  else list[i] = d;
  return true;
}

function findDiag(sim: Sim, id: string): Diagnostic | undefined {
  return sim.state.progression.diagnostics.find((x) => x.id === id);
}
