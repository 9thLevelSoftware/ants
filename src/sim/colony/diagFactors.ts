// Diagnostic record helpers (GDD 02 §14): ln-share factor weights, status from a ratio, status hysteresis.

import type { Colony, Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim } from '@/sim/types';
import {
  DIAG_FACTOR_CUTOFF, DIAG_FACTOR_FLOOR, DIAG_HYSTERESIS_GD, DIAG_OK_RATIO, DIAG_WARN_RATIO,
} from '@/sim/balance';
import { daysToTicks } from '@/sim/time';
import { coreOf } from './core';
import { colonyPublish } from './alerts';

/** A factor as a multiplicative value f in (0, 1]. */
export interface FactorIn {
  cause: string;
  f: number;
  detail: string;
  diagId?: string | null;
}

/** weight_i = ln f_i / sum ln f_j over factors with f < DIAG_FACTOR_CUTOFF; sorted by weight. */
export function weighFactors(list: FactorIn[]): DiagnosticFactor[] {
  const limiting = list.filter((x) => x.f < DIAG_FACTOR_CUTOFF);
  const logs = limiting.map((x) => Math.log(Math.max(DIAG_FACTOR_FLOOR, Math.min(1, x.f))));
  const sum = logs.reduce((a, b) => a + b, 0);
  const out = limiting.map((x, i) => ({ cause: x.cause, weight: sum < 0 ? logs[i] / sum : 0, detail: x.detail, diagId: x.diagId ?? null }));
  return out.sort((a, b) => b.weight - a.weight || a.cause.localeCompare(b.cause));
}

export function statusOf(ratio: number): DiagnosticStatus {
  return ratio >= DIAG_OK_RATIO ? 'ok' : ratio >= DIAG_WARN_RATIO ? 'warn' : 'bad';
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * Publishes a diagnostic with status hysteresis: a new status takes effect once it has held DIAG_HYSTERESIS_GD
 * (the first record of an id is published at once); while a change waits, the record keeps the old status and the
 * value that status was given for. Emits `diagnostic-changed` when the status changes.
 */
export function publishWithHysteresis(sim: Sim, col: Colony, d: Omit<Diagnostic, 'sinceTick'>): Diagnostic {
  const core = coreOf(col);
  const now = sim.state.tick;
  const prev = sim.state.progression.diagnostics.find((x) => x.id === d.id);
  let status = d.status;
  let value = d.value;
  let since = now;
  if (prev) {
    since = prev.sinceTick;
    if (status !== prev.status) {
      let p = core.diagPending.find((x) => x.id === d.id);
      if (!p || p.status !== status) {
        if (p) { p.status = status; p.sinceTick = now; } else core.diagPending.push({ id: d.id, status, sinceTick: now });
        p = core.diagPending.find((x) => x.id === d.id)!;
      }
      if (now - p.sinceTick >= daysToTicks(DIAG_HYSTERESIS_GD)) {
        since = now;
        core.diagPending = core.diagPending.filter((x) => x.id !== d.id);
      } else {
        // the held status keeps its value too: a record never reads "Good" at a value of a poor one (R6)
        status = prev.status;
        value = prev.value;
      }
    } else {
      core.diagPending = core.diagPending.filter((x) => x.id !== d.id);
    }
  }
  const rec: Diagnostic = { ...d, status, value, sinceTick: since };
  const fallback = colonyPublish(sim, rec);
  if (fallback && (!prev || prev.status !== status)) {
    sim.emit({ type: 'diagnostic-changed', id: rec.id, status: rec.status, topCause: rec.factors[0]?.cause ?? '' });
  }
  return rec;
}
