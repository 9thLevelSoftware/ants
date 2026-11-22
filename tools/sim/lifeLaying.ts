// colony-life round 10 (direction 23 item 5): where the eggs are not laid. A measuring tool: it reads state and
// changes nothing. Every SAMPLE_TICKS while the queen's laying potential is above 0 it asks the laying gates of
// colony/queen.ts in their own order which one holds the protein back, and files the sample's game days under it:
//   stage            starvation stage worse than lean (layingProteinPermitted)
//   p-days           days of protein stock under LAYING_P_MIN_DAYS
//   larval-hunger    mean larval hunger over LAYING_LARVAL_HUNGER_MAX
//   larvae-per-nurse feeding larvae over LAYING_LARVAE_PER_NURSE x nurses + LAYING_LARVAE_EXTRA
//   winter-reserve   winterReserveShort (a small colony keeps its C for the winter)
//   brood-need       protein in store + LAYING_SUPPLY_HORIZON_GD of intake does not cover what the brood laid needs
//   released         none of these: the release share (0..1) is filed as released x dt and (1 - share) x dt
//                    under "ramp" (days of P stock below the stock target)
// Per day also the mean laying potential and the eggs laid.

import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY, currentDayOfYear } from '@/sim/time';
import {
  LAYING_LARVAE_EXTRA, LAYING_LARVAE_PER_NURSE, LAYING_LARVAL_HUNGER_MAX, LAYING_P_MIN_DAYS, LAYING_SUPPLY_HORIZON_GD,
} from '@/sim/balance';
import { cycleCensus } from '@/sim/colony/census';
import { daysOfStock } from '@/sim/colony/needs';
import { BROOD_NEED_P_KEY, PROTEIN_INTAKE_KEY, layingReleaseShare, winterReserveShort } from '@/sim/colony/queen';
import { round } from './lifeMetrics';

const SAMPLE_TICKS = 300;

export interface LayingDay {
  day: number; doy: number; potential: number; eggs: number;
  /** Game days per gate while the potential was > 0. */
  gates: Record<string, number>;
}

export class LayingGateRecorder {
  private readonly col: number;
  private readonly t0: number;
  private readonly rows: LayingDay[] = [];
  private cur: LayingDay;
  private samples = 0;

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    this.cur = { day: 1, doy: 0, potential: 0, eggs: 0, gates: {} };
    sim.events.on('egg-laid', (e) => { if (e.queenId === sim.stores.colonies.get(this.col)?.queenId) this.cur.eggs++; });
  }

  /** The gate that holds laying protein now, or null when the carers release some. */
  private gate(): string | null {
    const sim = this.sim, col = sim.stores.colonies.get(this.col);
    if (!col) return 'no-colony';
    const st = col.starvationStage;
    if (st !== 'fed' && st !== 'lean') return 'stage';
    if (daysOfStock(col).p < LAYING_P_MIN_DAYS) return 'p-days';
    const cen = cycleCensus(sim, col);
    if (cen.meanLarvalHunger > LAYING_LARVAL_HUNGER_MAX) return 'larval-hunger';
    if (cen.larvae - cen.diapause > LAYING_LARVAE_PER_NURSE * cen.nurses + LAYING_LARVAE_EXTRA) return 'larvae-per-nurse';
    if (winterReserveShort(sim, col, cen.workers)) return 'winter-reserve';
    const acc = col.core?.acc;
    if (acc && acc[BROOD_NEED_P_KEY] !== undefined
      && col.stores.p + (acc[PROTEIN_INTAKE_KEY] ?? 0) * LAYING_SUPPLY_HORIZON_GD <= acc[BROOD_NEED_P_KEY]) return 'brood-need';
    return null;
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, tick = sim.state.tick;
    if (tick % SAMPLE_TICKS === 0) this.sample();
    if ((tick - this.t0) % TICKS_PER_DAY === 0 && tick > this.t0) this.closeDay();
  }

  private sample(): void {
    const sim = this.sim, col = sim.stores.colonies.get(this.col);
    const pot = col?.core?.acc['lay.potential'] ?? 0;
    this.samples++;
    this.cur.potential += pot;
    this.cur.doy = currentDayOfYear(sim.state);
    if (!col || pot <= 0) return;
    const dt = SAMPLE_TICKS / TICKS_PER_DAY, g = this.gate(), b = this.cur.gates;
    if (g) { b[g] = (b[g] ?? 0) + dt; return; }
    const share = layingReleaseShare(sim, col);
    b.released = (b.released ?? 0) + share * dt;
    b.ramp = (b.ramp ?? 0) + (1 - share) * dt;
  }

  private closeDay(): void {
    const d = this.cur;
    d.potential = round(d.potential / Math.max(1, this.samples));
    d.gates = Object.fromEntries(Object.entries(d.gates).map(([k, v]) => [k, round(v)]));
    this.rows.push(d);
    this.cur = { day: d.day + 1, doy: 0, potential: 0, eggs: 0, gates: {} };
    this.samples = 0;
  }

  result(): LayingDay[] {
    if (this.samples > 0) this.closeDay();
    return this.rows;
  }
}
