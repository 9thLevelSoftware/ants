// The Directives panel's data (GDD 08 4.2, GDD 02 12.1): the ordered or automatic workforce shares with need, target
// and actual headcount per group, the production and policy directives, and the readouts under them.
import type { Sim } from '@/sim/types';
import { ALLOCATION_GROUPS } from '@/sim/types';
import { needRates } from '@/sim/colony';
import { GROUP_TASKS } from '@/sim/colony/allocation';
import { ti } from '@/sim/colony/taskIdx';
import { TICKS_PER_HOUR } from '@/sim/time';
import type { UiDirectives, UiGroupId } from '@/ui/api';

const OPEN_PLAN_STATUSES = new Set(['proposed', 'queued', 'active', 'stalled', 'paused']);

function perGroup(arr: ArrayLike<number>): Record<UiGroupId, number> {
  const out = { forage: 0, nurse: 0, dig: 0, defend: 0 } as Record<UiGroupId, number>;
  for (const g of ALLOCATION_GROUPS) for (const t of GROUP_TASKS[g]) out[g] += arr[ti(t)] ?? 0;
  return out;
}

/** Auto allocation shows what the colony is doing: its current targets as percent (an even split before the first pass). */
function autoShares(target: Record<UiGroupId, number>, actual: Record<UiGroupId, number>): Record<UiGroupId, number> {
  const src = ALLOCATION_GROUPS.reduce((a, g) => a + target[g], 0) > 0 ? target : actual;
  const sum = ALLOCATION_GROUPS.reduce((a, g) => a + src[g], 0);
  const out = {} as Record<UiGroupId, number>;
  for (const g of ALLOCATION_GROUPS) out[g] = sum > 0 ? (src[g] / sum) * 100 : 25;
  return out;
}

export function directivesOf(sim: Sim): UiDirectives | null {
  const col = sim.state.colonies[0];
  if (!col) return null;
  const d = col.directives;
  const need = perGroup(col.alloc.demand), target = perGroup(col.alloc.target), actual = perGroup(col.alloc.actual);
  const manual = d.allocation !== 'auto';
  const nest = col.nestIds.map((id) => sim.stores.nests.get(id)).find((n) => !!n && n.alive);
  const queen = sim.stores.ants.get(col.queenId);
  let workers = 0, larvae = 0;
  const broodByCaste: Record<string, number> = {};
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id && (a.caste === 'worker' || a.caste === 'minor' || a.caste === 'media' || a.caste === 'major')) workers++;
  for (const b of sim.state.brood) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.stage === 'larva') larvae++;
    broodByCaste[b.destined] = (broodByCaste[b.destined] ?? 0) + 1;
  }
  const rates = needRates(col);
  const days = { c: col.stores.c / rates.c, p: col.stores.p / rates.p };
  const mature = sim.state.progression.stage.id === 'mature';
  const def = sim.getSpecies(col.species);
  return {
    allocationMode: manual ? 'manual' : 'auto',
    shares: manual ? { ...(d.allocation as Record<UiGroupId, number>) } : autoShares(target, actual),
    need, target, actual, workers, queenAlive: !!queen,
    diet: d.diet, alateInvestment: d.alateInvestment, alatePolicy: d.alatePolicy,
    alates: mature && queen ? { ok: true, reason: null } : { ok: false, reason: queen ? 'Alates need a mature colony in the right season' : 'No queen: no new eggs' },
    stockTarget: d.stockTarget, stayIn: d.stayIn,
    stayInHoursLeft: d.stayIn && d.stayInUntil >= 0 ? Math.max(0, (d.stayInUntil - sim.state.tick) / TICKS_PER_HOUR) : 0,
    sealInCold: d.sealInCold, stance: d.stance,
    architect: nest ? nest.architect.mode : null, nestId: nest ? nest.id : -1,
    openPlans: nest ? nest.digPlans.filter((p) => OPEN_PLAN_STATUSES.has(p.status)).length : 0,
    stores: { c: col.stores.c, p: col.stores.p },
    intake: { c: col.counters.intakeTodayC, p: col.counters.intakeTodayP },
    stockDays: days, larvae, needRateP: rates.p, broodByCaste,
    extras: def ? [...def.directiveExtras] : [],
  };
}
