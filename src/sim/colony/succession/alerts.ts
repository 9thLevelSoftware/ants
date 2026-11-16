// Lifecycle alerts (GDD 06 §6.2 notice, §11.4-§11.5; GDD 08 §6.5): "winter coming" with the days the stores cover,
// "alates ready" when winged ants first wait, "flying weather" while a flight day is open. The sim raises them with
// tokens only; the interface words them (content/text/alerts).

import type { AlertKind, Colony, Sim } from '@/sim/types';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';

export function raiseLifecycleAlert(sim: Sim, col: Colony, kind: AlertKind, tokens: Record<string, string | number>, diagnosticId: string | null = null): void {
  raiseAlert(sim, { kind, level: 'notice', subjectId: col.id, title: '', cause: '', focus: null, diagnosticId, tokens });
}

export function clearLifecycleAlert(sim: Sim, col: Colony, kind: AlertKind): void {
  clearAlert(sim, kind, col.id);
}
