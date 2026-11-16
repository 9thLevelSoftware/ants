// `diag-nest-flood:<nestId>` (GDD 03 App. D with GDD 06's forecast factor folded in) and the founding-chamber alert.
// Status (decision of this module: the registry raises the critical `nest-flooding` alert on warn and bad, and GDD 03
// §11.3 wants that alert only for real flooding):
//   bad   a brood, royal or founding chamber is >= 25 % flooded (GDD 03 §11.3 alert rule)
//   warn  another chamber is >= 25 % flooded
//   info  some water stands in a chamber, or the reference storm would flood a brood / royal / founding chamber
//   ok    otherwise
// A founding nest (sealed cell, no workers) also raises `founding-flooding` while its cell takes water, so a queen on
// a low site is never drowned silently.

import type { Diagnostic, DiagnosticFactor, Nest, Sim } from '@/sim/types';
import { FLOOD_ALERT_FRACTION, FLOOD_RIM_MIN } from '@/sim/balance/weather';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';
import { publishDiagnostic } from '@/sim/progression/diagnostics';
import { moistureAt } from '../substrate';
import { entranceInflow } from './inflow';
import type { FloodPrediction } from './predict';

const BROOD_TYPES = new Set(['nursery', 'royal', 'founding']);

function rainSoon(sim: Sim): boolean {
  const w = sim.state.env.weather;
  if (w.state === 'rain' || w.state === 'storm') return true;
  const f = w.forecast?.state;
  return f === 'rain' || f === 'storm';
}

function factor(cause: string, weight: number, detail: string): DiagnosticFactor {
  return { cause, weight: Math.max(0, weight), detail, diagId: null };
}

/** The diagnostic record of one nest's flood state and risk. */
export function floodDiagnostic(sim: Sim, nest: Nest, pred: FloodPrediction | null): Diagnostic {
  let worstNow = 0, worstPred = 0, worstAny = 0, lowName = '';
  for (const c of nest.chambers) {
    if (c.flooded > worstAny) worstAny = c.flooded;
    if (!BROOD_TYPES.has(c.type)) continue;
    if (c.flooded > worstNow) worstNow = c.flooded;
    const p = pred?.chambers.get(c.id) ?? c.floodRisk;
    if (p > worstPred) { worstPred = p; lowName = c.type; }
  }
  const status: Diagnostic['status'] = worstNow >= FLOOD_ALERT_FRACTION ? 'bad' : worstAny >= FLOOD_ALERT_FRACTION ? 'warn'
    : worstAny > 0 || worstPred >= FLOOD_ALERT_FRACTION ? 'info' : 'ok';
  // limiting factors from the entrance with the largest reference-storm inflow
  let best = null as ReturnType<typeof entranceInflow> | null;
  for (const e of nest.entrances) {
    const f = entranceInflow(sim, e, 1);
    if (!best || f.q > best.q) best = f;
  }
  const m = moistureAt(sim, nest.origin);
  const factors: DiagnosticFactor[] = [];
  if (best) {
    factors.push(factor('exposed-entrance', (best.catchment / 4) * best.cover, `catchment x${best.catchment.toFixed(1)}${best.cover < 1 ? ', covered' : ''}`));
    factors.push(factor('low-rim', (best.rim - FLOOD_RIM_MIN) / (1 - FLOOD_RIM_MIN), `rim factor ${best.rim.toFixed(2)}`));
  }
  factors.push(factor('low-brood-chamber', worstPred, lowName ? `${lowName} ${Math.round(worstPred * 100)} % in a reference storm` : 'no brood chamber at risk'));
  factors.push(factor('soil-saturation', m, `soil moisture ${Math.round(m * 100)} %`));
  factors.push(factor('rain-forecast', rainSoon(sim) ? 0.5 : 0, rainSoon(sim) ? 'rain now or next' : 'no rain forecast'));
  const label = status === 'bad' ? 'Nest flooding' : status === 'warn' ? 'Water in the nest'
    : status === 'info' ? (worstAny > 0 ? 'A little water in the nest' : 'Nest at risk of flooding') : 'Nest drains well';
  return {
    id: `diag-nest-flood:${nest.id}`, system: 'nest', status, label, value: Math.max(worstNow, worstPred), factors,
    remedies: status === 'ok' ? [] : ['remedy.marker.entrance', 'remedy.marker.move-brood', 'remedy.dig.drain-chamber'],
    sinceTick: -1, focus: { kind: 'nest', id: nest.id, pos: { ...nest.origin } },
  };
}

/** Publishes the flood diagnostic of a player-colony nest. */
export function publishFloodDiagnostic(sim: Sim, nest: Nest, pred: FloodPrediction | null): Diagnostic {
  const d = floodDiagnostic(sim, nest, pred);
  publishDiagnostic(sim, d);
  return d;
}

/** Raises or clears `founding-flooding` for a founding nest whose cell takes water. */
export function foundingFloodAlert(sim: Sim, nest: Nest): void {
  if (!nest.founding) return;
  let share = 0;
  for (const c of nest.chambers) share = Math.max(share, c.flooded);
  if (share <= 0) {
    clearAlert(sim, 'founding-flooding', nest.id);
    return;
  }
  const colony = sim.stores.colonies.get(nest.colony);
  const queen = colony ? sim.stores.ants.get(colony.queenId) : undefined;
  const pct = Math.round(share * 100);
  raiseAlert(sim, {
    kind: 'founding-flooding', level: 'critical', subjectId: nest.id, title: '', cause: '',
    focus: queen ? { kind: 'ant', id: queen.id, pos: { ...queen.pos } } : { kind: 'nest', id: nest.id, pos: { ...nest.origin } },
    diagnosticId: `diag-nest-flood:${nest.id}`, tokens: { pct },
  });
}
