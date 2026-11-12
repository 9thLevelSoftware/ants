// Debug summary of a colony (GDD 02 §13.3 `__game.summary().colony`) and the ledger query (`query.ledger()`).

import { ti } from './taskIdx';
import type { ColonyLedger, Sim, Task } from '@/sim/types';
import { ALLOCATION_GROUPS, TASKS } from '@/sim/types';
import { accGet, coreOf, ledgerNet } from './core';
import { censusOf } from './census';
import { daysOfStock, needRates } from './needs';
import { queenOf } from './queen';
import { GROUP_TASKS } from './allocation';

export interface ColonySummary {
  N: number;
  byCaste: Record<string, number>;
  byTask: Partial<Record<Task, number>>;
  byGroup: Record<string, number>;
  brood: { egg: number; larva: number; pupa: number; diapause: number };
  stores: { C: number; P: number; capC: number; capP: number; daysC: number; daysP: number };
  intakeToday: { C: number; P: number };
  useToday: { C: number; P: number };
  needs: { C: number; P: number; rateC: number; rateP: number; sP: number };
  layingPotential: number;
  layingActual: number;
  starvationStage: string;
  queen: { mode: string; gut: { c: number; p: number }; reserve: number; reserveP: number; health: number } | null;
  allocation: { mode: string; need: Record<string, number>; target: Record<string, number>; actual: Record<string, number> };
  trips: { today: number; successRate: number };
}

export function colonySummary(sim: Sim, colonyId: number): ColonySummary | null {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return null;
  const cen = censusOf(sim, col.id);
  const core = coreOf(col);
  const byTask: Partial<Record<Task, number>> = {};
  TASKS.forEach((t, i) => { if (cen.byTask[i] > 0) byTask[t] = cen.byTask[i]; });
  const byGroup: Record<string, number> = {};
  const need: Record<string, number> = {}, target: Record<string, number> = {}, actual: Record<string, number> = {};
  for (const g of ALLOCATION_GROUPS) {
    let n = 0, d = 0, tg = 0, ac = 0;
    for (const t of GROUP_TASKS[g]) {
      const i = ti(t);
      n += cen.byTask[i]; d += col.alloc.demand[i]; tg += col.alloc.target[i]; ac += col.alloc.actual[i];
    }
    byGroup[g] = n; need[g] = d; target[g] = tg; actual[g] = ac;
  }
  const q = queenOf(sim, col);
  const days = daysOfStock(col);
  const r = needRates(col);
  return {
    N: cen.workers,
    byCaste: { worker: cen.workers, queen: q ? 1 : 0, gyne: cen.gynes, male: cen.males },
    byTask, byGroup,
    brood: { egg: cen.eggs, larva: cen.larvae, pupa: cen.pupae, diapause: cen.diapause },
    stores: { C: col.stores.c, P: col.stores.p, capC: col.stores.cap.c, capP: col.stores.cap.p, daysC: days.c, daysP: days.p },
    intakeToday: { C: col.counters.intakeTodayC, P: col.counters.intakeTodayP },
    useToday: { C: col.counters.useTodayC, P: col.counters.useTodayP },
    needs: { C: col.needs.needC, P: col.needs.needP, rateC: r.c, rateP: r.p, sP: col.needs.sP },
    layingPotential: accGet(core, 'lay.potential'),
    layingActual: core.layingRate,
    starvationStage: col.starvationStage,
    queen: q?.queen ? { mode: q.queen.mode, gut: { ...q.queen.gut }, reserve: q.queen.reserve, reserveP: q.queen.reserveP, health: q.hp / q.maxHp } : null,
    allocation: { mode: col.directives.allocation === 'auto' ? 'auto' : 'manual', need, target, actual },
    trips: { today: core.departuresToday, successRate: col.counters.trips > 0 ? col.counters.tripSuccesses / col.counters.trips : 0 },
  };
}

/** Today's and the lifetime ledger with their net pool change (`query.ledger()`). */
export function queryLedger(sim: Sim, colonyId: number): { today: ColonyLedger; life: ColonyLedger; netToday: { c: number; p: number }; netLife: { c: number; p: number } } | null {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return null;
  const core = coreOf(col);
  return { today: { ...col.ledger }, life: { ...core.life }, netToday: ledgerNet(col.ledger), netLife: ledgerNet(core.life) };
}
