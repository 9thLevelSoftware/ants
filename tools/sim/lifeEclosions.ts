// colony-life round 8 (direction 16): where the year-two workers come from. A measuring tool: reads state and events.
// Every worker eclosion of the player's colony with its year and day of the year, and the year its egg was laid:
// "overwintered" = laid in an earlier year (an overwintering larva or pupa), "same-year" = an egg of this year.
// The eclosed pupa is identified among the colony's pupae (tracked from their larva -> pupa stage change, with the
// brood's own laidTick) as the one that is gone without a death event; "unknown" when none is (a pupa that existed
// before the observer started, or a pupa removed some other way). The first version keyed every brood from its egg
// event and mislabelled the year-two eclosions of the r30 long runs (round 8 ledger, 11:28).

import type { Sim } from '@/sim/types';
import { isWorkerCaste } from '@/sim/colony/census';
import { currentDayOfYear, currentYear } from '@/sim/time';

export interface EclosionRecord { year: number; doy: number; laidYear: number; origin: 'overwintered' | 'same-year' | 'unknown' }

/** Sampling period of the year boundaries, ticks. */
const YEAR_SAMPLE_TICKS = 300;

export class EclosionObserver {
  private readonly col: number;
  /** The colony's pupae by id: the sim tick their egg was laid. */
  private readonly pupaLaidTick = new Map<number, number>();
  /** First sampled sim tick of each calendar year. */
  private readonly yearStart = new Map<number, number>();
  readonly records: EclosionRecord[] = [];

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.noteYear();
    for (const b of sim.stores.brood.list) if (b.alive && b.colony === this.col && b.stage === 'pupa') this.pupaLaidTick.set(b.id, b.laidTick);
    sim.events.on('brood-stage', (e) => {
      if (e.to !== 'pupa') return;
      const b = sim.stores.brood.get(e.broodId);
      if (b && b.colony === this.col) this.pupaLaidTick.set(b.id, b.laidTick);
    });
    sim.events.on('brood-died', (e) => { this.pupaLaidTick.delete(e.broodId); });
    sim.events.on('ant-eclosed', (e) => {
      if (e.colonyId !== this.col || !isWorkerCaste(e.caste)) return;
      let laidTick = -1;
      for (const [id, t] of this.pupaLaidTick) {
        const b = sim.stores.brood.get(id);
        if (b && b.alive) continue;
        laidTick = t; this.pupaLaidTick.delete(id);
        break;
      }
      const year = currentYear(sim.state);
      const laidYear = laidTick >= 0 ? this.yearOfTick(laidTick) : -1;
      const origin = laidYear < 0 ? 'unknown' : laidYear < year ? 'overwintered' : 'same-year';
      this.records.push({ year, doy: currentDayOfYear(sim.state), laidYear, origin });
    });
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    if (this.sim.state.tick % YEAR_SAMPLE_TICKS === 0) this.noteYear();
  }

  private noteYear(): void {
    const y = currentYear(this.sim.state);
    if (!this.yearStart.has(y)) this.yearStart.set(y, this.sim.state.tick);
  }

  /** The calendar year a sim tick fell in (the latest year whose first sampled tick is not after it). */
  private yearOfTick(tick: number): number {
    let best = -1, bestStart = -Infinity;
    for (const [y, t] of this.yearStart) if (t <= tick && t > bestStart) { best = y; bestStart = t; }
    // laid before the observer started: the year it started in
    return best >= 0 ? best : Math.min(...this.yearStart.keys());
  }
}
