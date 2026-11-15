// Colony health's data (GDD 08 4.4): every published diagnostic of the player colony, ranked by the progression
// module, with the history series that stands for it (the 72 newest hourly samples = the sparkline's 3 game days).
import { tsToArray } from '@/core/timeSeries';
import { overallStatus, rankedDiagnostics } from '@/sim/progression';
import type { Sim } from '@/sim/types';
import type { UiDiagnostic, UiHealth } from '@/ui/api';
import { sinceOf } from './dates';

/** The history series that stands for a diagnostic (its sparkline); a diagnostic with none shows no sparkline
 * (diag-nest-space has none: its value is a load against capacity and no recorded series is that load). */
export const DIAG_HISTORY: Readonly<Record<string, string>> = {
  'diag-food-intake-c': 'intake-c',
  'diag-food-intake-p': 'intake-p',
  'diag-stores': 'stores-c',
  'diag-brood-growth': 'larvae',
  'diag-egg-laying': 'eggs-laid',
  'diag-queen-condition': 'queen-reserves',
  'diag-nest-climate': 'nursery-temp',
  'diag-workforce': 'workers',
  'diag-foraging-trails': 'trip-success',
  'diag-mortality': 'deaths',
  'diag-overwinter-readiness': 'stores-c',
  'diag-heat-exposure': 'air-temp',
};

const SPARK_HOURS = 72;

/** Diagnostic id without a per-subject suffix. */
const baseId = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : id);

export function healthOf(sim: Sim): UiHealth {
  const hourly = sim.state.progression.history.hourly;
  const rows: UiDiagnostic[] = rankedDiagnostics(sim).map((d) => {
    const historyId = DIAG_HISTORY[baseId(d.id)] ?? null;
    const ts = historyId ? hourly[historyId] : undefined;
    const all = ts ? tsToArray(ts) : [];
    return {
      id: d.id, system: d.system, status: d.status, label: d.label, value: d.value, sinceTick: d.sinceTick, sinceLabel: sinceOf(sim, d.sinceTick),
      factors: d.factors.map((f) => ({ cause: f.cause, weight: f.weight, detail: f.detail, diagId: f.diagId })),
      remedies: [...d.remedies],
      focus: d.focus ? { kind: d.focus.kind, id: d.focus.id, pos: { x: d.focus.pos.x, y: d.focus.pos.y, z: d.focus.pos.z } } : null,
      history: all.length > SPARK_HOURS ? all.slice(all.length - SPARK_HOURS) : all, historyId,
    };
  });
  return { overall: overallStatus(sim), rows, nowTick: sim.state.tick };
}
