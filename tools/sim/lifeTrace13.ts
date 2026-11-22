// colony-life round 13 (direction 27, R40 b and c): two traces of a year-two run. A measuring tool: it reads state
// and changes nothing (no census call: censusOf's per-tick cache would be read by the next tick's systems).
//  - `hours`: every game hour on doy 5-15 (R40 b): laying potential, release share and the gate that holds it, the
//    carbohydrate ramp of prospectiveProteinRate as the tree has it (daysC / target - 1) and as R40 b rules it
//    ((daysC / target - 0.5) / 0.5), the prospective protein rate, sP and the nutrient weights, stores, the forage
//    head-count and the protein share of what was delivered that hour.
//  - `late`: every brood item laid after doy 11, and every pupa (R40 c): one row a game day (stage, progress,
//    temperature of its chamber, diapause, hours since tended, carried), and its end (eclosed / died and the cause).
// Enabled by life.ts --trace13.

import type { Brood, Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { TICKS_PER_DAY, currentDayOfYear, currentYear } from '@/sim/time';
import { daysOfStock, nutrientWeights, PROSPECTIVE_P_KEY, targetDays } from '@/sim/colony/needs';
import { layingReleaseShare } from '@/sim/colony/queen';
import { clamp } from '@/core/math/scalar';
import { round } from './lifeMetrics';

const HOUR_TICKS = TICKS_PER_DAY / 24;
const LATE_DOY = 11;

export interface TraceHour {
  day: number; doy: number; h: number; potential: number; release: number;
  carbRamp: number; carbRampB: number; prospP: number; sP: number; wC: number; wP: number;
  storesC: number; storesP: number; daysC: number; targetC: number; forage: number; tend: number; scout: number; idle: number;
  delivC: number; delivP: number;
}

export interface LateBrood {
  id: number; laidDoy: number; laidYear: number; firstStage: string;
  rows: { doy: number; stage: string; progress: number; tempC: number | null; diapause: boolean; untendedH: number; carried: boolean; chamber: number }[];
  end?: { doy: number; what: string };
}

export class Trace13Observer {
  private readonly col: number;
  private readonly t0: number;
  readonly hours: TraceHour[] = [];
  private readonly late = new Map<number, LateBrood>();
  private delivC = 0; private delivP = 0;

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    sim.events.on('delivery', (e) => { if (e.colonyId === this.col) { this.delivC += e.c; this.delivP += e.p; } });
    sim.events.on('egg-laid', (e) => {
      if (currentDayOfYear(sim.state) <= LATE_DOY) return;
      this.track(e.broodId, 'egg');
    });
    sim.events.on('brood-stage', (e) => { if (e.to === 'pupa') this.track(e.broodId, 'pupa'); });
    sim.events.on('brood-died', (e) => {
      const r = this.late.get(e.broodId);
      if (r && !r.end) r.end = { doy: currentDayOfYear(sim.state), what: `${e.stage}:${e.cause}` };
    });
  }

  private track(id: number, firstStage: string): void {
    if (this.late.has(id)) return;
    const b = this.sim.stores.brood.get(id);
    if (!b || b.colony !== this.col) return;
    this.late.set(id, { id, laidDoy: dayOfTick(this.sim, b.laidTick), laidYear: currentYear(this.sim.state), firstStage, rows: [] });
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, now = sim.state.tick;
    if ((now - this.t0) % HOUR_TICKS !== 0) return;
    const doy = currentDayOfYear(sim.state);
    if (doy >= 5 && doy <= 15) this.hour(doy);
    else { this.delivC = 0; this.delivP = 0; }
    if ((now - this.t0) % TICKS_PER_DAY === 0) this.day(doy);
  }

  private hour(doy: number): void {
    const sim = this.sim, col = sim.stores.colonies.get(this.col);
    if (!col || !col.core) return;
    const acc = col.core.acc;
    const dC = daysOfStock(col).c, tC = targetDays(col).c, w = nutrientWeights(col);
    const by = (t: string) => countTask(sim, this.col, t);
    this.hours.push({
      day: round((sim.state.tick - this.t0) / TICKS_PER_DAY), doy, h: Math.floor(((sim.state.tick + sim.state.env.calendar.startTick) % TICKS_PER_DAY) / HOUR_TICKS),
      potential: round(acc['lay.potential'] ?? 0), release: round(layingReleaseShare(sim, col)),
      carbRamp: round(clamp(dC / tC - 1, 0, 1)), carbRampB: round(clamp((dC / tC - 0.5) / 0.5, 0, 1)),
      prospP: round(acc[PROSPECTIVE_P_KEY] ?? 0), sP: round(col.needs.sP), wC: round(w.wC), wP: round(w.wP),
      storesC: round(col.stores.c), storesP: round(col.stores.p), daysC: round(dC), targetC: round(tC),
      forage: by('forage'), tend: by('tend'), scout: by('scout'), idle: by('idle'),
      delivC: round(this.delivC), delivP: round(this.delivP),
    });
    this.delivC = 0; this.delivP = 0;
  }

  private day(doy: number): void {
    const sim = this.sim;
    for (const r of this.late.values()) {
      if (r.end) continue;
      const b = sim.stores.brood.get(r.id);
      if (!b || !b.alive) { r.end = { doy, what: 'gone' }; continue; }
      r.rows.push({
        doy, stage: b.stage, progress: round(b.progress), tempC: chamberTemp(sim, b), diapause: (b.flags & BroodFlag.DIAPAUSE) !== 0,
        untendedH: round(((sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY) * 24), carried: b.carriedBy !== -1, chamber: b.chamberId,
      });
    }
  }

  /** Eclosions end a pupa's record (the brood entity dies without a brood-died event). */
  result(): { hours: TraceHour[]; late: LateBrood[] } {
    for (const r of this.late.values()) if (!r.end) {
      const b = this.sim.stores.brood.get(r.id);
      if (!b || !b.alive) r.end = { doy: currentDayOfYear(this.sim.state), what: 'eclosed-or-gone' };
    }
    return { hours: this.hours, late: [...this.late.values()] };
  }
}

function countTask(sim: Sim, col: number, task: string): number {
  let n = 0;
  for (const a of sim.state.ants) if (a.alive && a.colony === col && a.caste === 'worker' && a.task === task) n++;
  return n;
}

function dayOfTick(sim: Sim, tick: number): number {
  const s = sim.state;
  const perYear = s.config.rules.seasonLengthDays * 4;
  return Math.floor((tick + s.env.calendar.startTick) / TICKS_PER_DAY) % perYear + 1;
}

/** Temperature of the chamber the brood lies in (or its carrier stands in), from the chamber records; null outside. */
function chamberTemp(sim: Sim, b: Brood): number | null {
  let chamberId = b.chamberId;
  if (b.carriedBy !== -1) { const c = sim.stores.ants.get(b.carriedBy); if (c) chamberId = c.chamberId; }
  if (chamberId < 0) return null;
  for (const n of sim.stores.nests.list) for (const c of n.chambers) if (c.id === chamberId) return round(c.temp);
  return null;
}
