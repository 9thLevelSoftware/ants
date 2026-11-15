// The marker palette's counts (GDD 08 4.3): living markers of each kind of the player colony against MARKER_CAP, and
// the open dig plans (the `dig` and `entrance` tools place plans, whose cap is PLAN_CAP_PLAYER / MARKER_CAP.entrance).
import { MARKER_CAP } from '@/sim/balance/colony';
import { PLAN_CAP_PLAYER } from '@/sim/balance/nest';
import type { MarkerKind, Sim } from '@/sim/types';
import type { UiMarkerCounts, UiPlanLine } from '@/ui/api';
import { playerNestOf } from './nestSlice';

const TERMINAL = new Set(['complete', 'cancelled']);
const PLANS_MAX = 12;
const MARKER_TOOLS: readonly MarkerKind[] = ['forage', 'avoid', 'rally', 'move-brood', 'move-queen'];

export function markerCountsOf(sim: Sim): UiMarkerCounts {
  const col = sim.state.colonies[0];
  const counts: UiMarkerCounts['counts'] = {};
  const colId = col?.id ?? -1;
  for (const k of MARKER_TOOLS) counts[k] = { n: 0, cap: MARKER_CAP[k] };
  for (const m of sim.state.markers) if (m.alive && m.colony === colId && counts[m.kind]) counts[m.kind].n++;
  const open = (playerNestOf(sim)?.digPlans ?? []).filter((p) => p.source === 'player' && !TERMINAL.has(p.status));
  counts.dig = { n: open.length, cap: PLAN_CAP_PLAYER };
  counts.entrance = { n: open.filter((p) => p.kind === 'entrance').length, cap: MARKER_CAP.entrance };
  const plans: UiPlanLine[] = (playerNestOf(sim)?.digPlans ?? [])
    .filter((p) => !TERMINAL.has(p.status))
    .slice(0, PLANS_MAX)
    .map((p) => ({
      id: p.id, kind: p.kind, chamberType: p.chamberType, status: p.status, source: p.source, blockedReason: p.blockedReason,
      progress: p.targetVolume > 0 ? Math.max(0, Math.min(1, p.removedVolume / p.targetVolume)) : 0,
    }));
  const def = col ? sim.getSpecies(col.species) : undefined;
  const clim = def?.nestTemplate.broodClimate.find((c) => c.stage === 'larva') ?? def?.nestTemplate.broodClimate[0];
  return { counts, plans, comfortBand: clim ? { lo: clim.tOpt[0], hi: clim.tOpt[1] } : null };
}
