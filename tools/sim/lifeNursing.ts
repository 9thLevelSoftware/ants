// colony-life round 8 (direction 16): nursing per game hour of a life run. A measuring tool: reads state only.
// Each game hour after the hand-over: the workforce the allocation sees (GDD 02 §6.3 `A`), R29's nurse-capable
// (A less the queen-care demand), the nurse demand and target, the ants actually on nurse / queen-care / idle and
// what they are doing (state, and whether they stand in a chamber with overdue brood), and the eggs and pupae past
// their tending interval (TEND_DUE_GD: a tend job is due; UNTENDED_GD: the untended hazard is on).

import type { Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
// not censusOf: its per-tick cache, filled after a tick, would be read by the next tick's systems (an observer must not)
import { isAvailable, isWorkerCaste } from '@/sim/colony/census';
import { ti } from '@/sim/colony/taskIdx';
import { UNTENDED_GD } from '@/sim/balance/colony';
import { TEND_DUE_GD } from '@/sim/balance/nestwork';
import { TICKS_PER_DAY } from '@/sim/time';
import { round } from './lifeMetrics';

const HOUR_TICKS = TICKS_PER_DAY / 24;

export interface NursingHour {
  h: number;
  workers: number; available: number; nurseCapable: number;
  demandNurse: number; targetNurse: number; demandQueenCare: number; targetQueenCare: number;
  nursing: number; queenCare: number; idle: number;
  /** State counts of the ants on nurse, queen-care and idle ("state" or "state@x" when not in an overdue chamber). */
  nurseStates: Record<string, number>; queenCareStates: Record<string, number>; idleStates: Record<string, number>;
  eggs: number; pupae: number; eggsDue: number; pupaeDue: number; eggsOverdue: number; pupaeOverdue: number;
  /** Overdue eggs + pupae by chamber id, and nurse-task ants by chamber id. */
  overdueByChamber: Record<string, number>; nursesByChamber: Record<string, number>;
  layPotential: number;
}

const bump = (r: Record<string, number>, k: string, n = 1): void => { r[k] = (r[k] ?? 0) + n; };

export class NursingObserver {
  private readonly col: number;
  private readonly t0: number;
  readonly hours: NursingHour[] = [];

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, now = sim.state.tick;
    if ((now - this.t0) % HOUR_TICKS !== 0) return;
    const col = sim.stores.colonies.get(this.col);
    if (!col) return;
    const due = TEND_DUE_GD * TICKS_PER_DAY, overdue = UNTENDED_GD * TICKS_PER_DAY;
    const row: NursingHour = {
      h: round((now - this.t0) / HOUR_TICKS), workers: 0, available: 0, nurseCapable: 0,
      demandNurse: round(col.alloc.demand[ti('nurse')]), targetNurse: col.alloc.target[ti('nurse')],
      demandQueenCare: round(col.alloc.demand[ti('queen-care')]), targetQueenCare: col.alloc.target[ti('queen-care')],
      nursing: 0, queenCare: 0, idle: 0, nurseStates: {}, queenCareStates: {}, idleStates: {},
      eggs: 0, pupae: 0, eggsDue: 0, pupaeDue: 0, eggsOverdue: 0, pupaeOverdue: 0, overdueByChamber: {}, nursesByChamber: {},
      layPotential: round(col.core?.acc['lay.potential'] ?? 0),
    };
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== this.col || (b.flags & BroodFlag.DIAPAUSE) !== 0) continue;
      if (b.stage !== 'egg' && b.stage !== 'pupa') continue;
      const egg = b.stage === 'egg', age = now - b.lastTendedTick, free = b.carriedBy === -1;
      if (egg) row.eggs++; else row.pupae++;
      if (free && age > due) { if (egg) row.eggsDue++; else row.pupaeDue++; }
      if (free && age > overdue) { if (egg) row.eggsOverdue++; else row.pupaeOverdue++; bump(row.overdueByChamber, String(b.chamberId)); }
    }
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || !isWorkerCaste(a.caste)) continue;
      row.workers++;
      if (isAvailable(a)) row.available++;
      const where = a.chamberId >= 0 && row.overdueByChamber[String(a.chamberId)] ? '' : '@x';
      if (a.task === 'nurse') { row.nursing++; bump(row.nurseStates, a.state + where); bump(row.nursesByChamber, String(a.chamberId)); }
      else if (a.task === 'queen-care') { row.queenCare++; bump(row.queenCareStates, a.state + where); }
      else if (a.task === 'idle' || a.task === 'rest') { row.idle++; bump(row.idleStates, a.state + where); }
    }
    row.nurseCapable = round(Math.max(0, row.available - col.alloc.demand[ti('queen-care')]));
    this.hours.push(row);
  }
}
