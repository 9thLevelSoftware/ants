// Possession diagnostics of GDD 01 App. D published into the progression state ("why" view):
// `diag-possessed-action` (last failure of the possessed ant) and `diag-released-ant` (which release rule matched).

import type { ActionFailReason, ActionId, Ant, Sim, Task } from '@/sim/types';
import { ports } from '../actions/ports';

const FAILURE_REMEDY: Partial<Record<ActionFailReason, string>> = {
  'not-diggable': 'remedy.possessed.find-soil', 'hands-full': 'remedy.possessed.put-down',
  'crop-full': 'remedy.possessed.share-food', 'out-of-reach': 'remedy.possessed.move-closer',
};

/** The possessed ant's action failed: "Can't dig here" with the failure code as its factor. */
export function publishActionFailure(sim: Sim, ant: Ant, action: ActionId, reason: ActionFailReason): void {
  const remedy = FAILURE_REMEDY[reason];
  ports.publishDiagnostic(sim, {
    id: 'diag-possessed-action', system: 'ants', status: 'warn', label: `Can't ${action} here`, value: 0,
    factors: [{ cause: reason, weight: 1, detail: reason, diagId: null }], remedies: remedy ? [remedy] : [],
    sinceTick: sim.state.tick, focus: { kind: 'ant', id: ant.id, pos: { ...ant.pos } },
  });
}

/**
 * A released ant went back to work: info line naming the task and the release rule that matched. One fixed id
 * (App. D): it describes the latest release only, and `focus` names the ant (no entry per ant ever released).
 */
export function publishReleased(sim: Sim, ant: Ant, task: Task, rule: number): void {
  ports.publishDiagnostic(sim, {
    id: 'diag-released-ant', system: 'ants', status: 'info', label: `Returned to work: ${task}`, value: rule,
    factors: [{ cause: `release-rule-${rule}`, weight: 1, detail: `rule ${rule}`, diagId: null }], remedies: [],
    sinceTick: sim.state.tick, focus: { kind: 'ant', id: ant.id, pos: { ...ant.pos } },
  });
}
