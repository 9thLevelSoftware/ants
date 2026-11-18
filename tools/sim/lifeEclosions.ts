// colony-life round 8 (direction 16): where the year-two workers come from. A measuring tool: reads events only.
// Every worker eclosion of the player's colony with its year and day of the year, and the year its egg was laid
// (brood alive when the observer starts counts as laid then): "overwintered" = laid in an earlier year (an
// overwintering larva or pupa), "same-year" = an egg of this year.

import type { Sim } from '@/sim/types';
import { isWorkerCaste } from '@/sim/colony/census';
import { currentDayOfYear, currentYear } from '@/sim/time';

export interface EclosionRecord { year: number; doy: number; laidYear: number; origin: 'overwintered' | 'same-year' }

export class EclosionObserver {
  private readonly col: number;
  /** Brood of the colony by id: the year its egg was laid. */
  private readonly laidYear = new Map<number, number>();
  readonly records: EclosionRecord[] = [];

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    const y0 = currentYear(sim.state);
    for (const b of sim.stores.brood.list) if (b.alive && b.colony === this.col) this.laidYear.set(b.id, y0);
    sim.events.on('egg-laid', (e) => {
      const b = sim.stores.brood.get(e.broodId);
      if (b && b.colony === this.col) this.laidYear.set(e.broodId, currentYear(sim.state));
    });
    sim.events.on('brood-died', (e) => { this.laidYear.delete(e.broodId); });
    sim.events.on('ant-eclosed', (e) => {
      if (e.colonyId !== this.col || !isWorkerCaste(e.caste)) return;
      // the eclosed pupa is the one brood of the colony that is gone without a death event
      let laid = -1;
      for (const [id, y] of this.laidYear) {
        const b = sim.stores.brood.get(id);
        if (b && b.alive) continue;
        laid = y; this.laidYear.delete(id);
        break;
      }
      const year = currentYear(sim.state);
      this.records.push({ year, doy: currentDayOfYear(sim.state), laidYear: laid, origin: laid >= 0 && laid < year ? 'overwintered' : 'same-year' });
    });
  }
}
