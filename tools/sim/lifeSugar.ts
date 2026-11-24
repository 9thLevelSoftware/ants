// winter-sugar item 4: where a colony's carbohydrate comes from and where it goes, by game day. A measuring tool: it
// reads state and events and changes nothing.
//   days        per game day: C delivered by source class (honeydew from a herd, honeydew film, nectar, crumbs,
//               sugar / spill, fruit, other = C carried in with protein loads, unknown source), C spent (worker
//               upkeep, queen, larvae, spoiled, departure rations: the colony's lifetime ledger), worker-gd by task
//               for tend and forage, mean tend demand and target, workable / known herds, mean needC, the carbohydrate
//               forage want, stores and R27's winter need at the day's end;
//   firsts      the first tick after the hand-over with an open entrance, and after it the first tick with a tender
//               (allocation actual), a tend demand, a workable herd, and a worker outside in a tend state.

import type { Colony, Sim } from '@/sim/types';
import { currentDayOfYear, currentYear, TICKS_PER_DAY } from '@/sim/time';
import { herdWorkable } from '@/sim/ecology/plants/demand';
import { herdSourceOf } from '@/sim/ecology/plants/links';
import { colonySlotBit } from '@/sim/entities';
import { forageWant } from '@/sim/colony/allocation/demand';
import { winterStoresNeed } from '@/sim/colony/overwinter/storesNeed';
import { ti } from '@/sim/colony/taskIdx';
import { round } from './lifeMetrics';

/** Ticks between samples of the head-counts (0.1 game hour). */
const EVERY = 25;

export interface SugarDay {
  day: number; year: number; doy: number;
  /** C delivered, loads, by source class. */
  cIn: Record<string, number>;
  /** C spent from the pool, loads: workers, queen, larvae, spoiled, ration. */
  cOut: Record<string, number>;
  tendGd: number; forageGd: number; tendDemand: number; tendTarget: number;
  herdsWorkable: number; herdsKnown: number; needC: number; wantC: number;
  storesC: number; winterNeedC: number; workers: number;
}
export interface SugarReport {
  days: SugarDay[];
  /** Ticks after the start of the run (-1 never). */
  firsts: { entranceOpen: number; tender: number; tendDemand: number; herdWorkable: number; tenderOutside: number };
}

type Life = NonNullable<Colony['core']>['life'];

function sourceClass(sim: Sim, sourceId: number, kind: string): string {
  const s = sourceId >= 0 ? sim.stores.sources.get(sourceId) : undefined;
  if (!s) return kind === 'honeydew' ? 'honeydew-unknown' : 'unknown';
  if (s.herdId >= 0) return 'honeydew-herd';
  if (s.kind === 'honeydew') return 'honeydew-film';
  if (s.kind === 'nectar' || s.kind === 'crumb' || s.kind === 'sugar' || s.kind === 'fruit') return s.kind;
  return 'other';
}

export class SugarObserver {
  private readonly col: number;
  private readonly t0: number;
  private readonly days: SugarDay[] = [];
  private cIn: Record<string, number> = {};
  private lastLife: Life | null = null;
  private samples = 0;
  private sum = { tend: 0, forage: 0, tendDemand: 0, tendTarget: 0, needC: 0, wantC: 0 };
  private readonly firsts = { entranceOpen: -1, tender: -1, tendDemand: -1, herdWorkable: -1, tenderOutside: -1 };
  private day = -1;

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    this.day = Math.floor(sim.state.tick / TICKS_PER_DAY);
    this.lastLife = this.lifeCopy();
    sim.events.on('delivery', (e) => {
      if (e.colonyId !== this.col || e.c <= 0) return;
      const k = sourceClass(sim, e.sourceId, e.kind);
      this.cIn[k] = (this.cIn[k] ?? 0) + e.c;
    });
  }

  private colony(): Colony | undefined { return this.sim.stores.colonies.get(this.col); }

  private lifeCopy(): Life | null {
    const l = this.colony()?.core?.life;
    return l ? { ...l } : null;
  }

  tick(): void {
    const sim = this.sim, col = this.colony();
    if (!col) return;
    const rel = sim.state.tick - this.t0;
    const f = this.firsts;
    if (f.entranceOpen < 0 && this.entranceOpen()) f.entranceOpen = rel;
    if (f.entranceOpen >= 0) {
      if (f.tender < 0 && col.alloc.actual[ti('tend')] > 0) f.tender = rel;
      if (f.tendDemand < 0 && col.alloc.demand[ti('tend')] > 0) f.tendDemand = rel;
      if (sim.state.tick % EVERY === 0) {
        if (f.herdWorkable < 0 && this.herdCounts(col).workable > 0) f.herdWorkable = rel;
        if (f.tenderOutside < 0 && this.tenderOutside()) f.tenderOutside = rel;
      }
    }
    if (sim.state.tick % EVERY === 0) {
      const s = this.sum;
      s.tend += col.alloc.actual[ti('tend')];
      s.forage += col.alloc.actual[ti('forage')];
      s.tendDemand += col.alloc.demand[ti('tend')];
      s.tendTarget += col.alloc.target[ti('tend')];
      s.needC += col.needs.needC;
      s.wantC += forageWant(col).c;
      this.samples++;
    }
    const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
    if (day !== this.day) { this.closeDay(col); this.day = day; }
  }

  private entranceOpen(): boolean {
    for (const n of this.sim.stores.nests.list) {
      if (!n.alive || n.colony !== this.col) continue;
      for (const e of n.entrances) if (e.status === 'open') return true;
    }
    return false;
  }

  private tenderOutside(): boolean {
    for (const a of this.sim.stores.ants.list) {
      if (a.alive && a.colony === this.col && a.task === 'tend' && a.nestId < 0) return true;
    }
    return false;
  }

  private herdCounts(col: Colony): { workable: number; known: number } {
    const bit = colonySlotBit(this.sim, col.id);
    let workable = 0, known = 0;
    for (const h of this.sim.stores.herds.list) {
      if (!h.alive) continue;
      const src = herdSourceOf(this.sim, h);
      if (src && bit !== 0 && (src.discoveredBy & bit) !== 0) known++;
      if (herdWorkable(this.sim, col, h)) workable++;
    }
    return { workable, known };
  }

  private closeDay(col: Colony): void {
    const sim = this.sim, life = this.lifeCopy(), prev = this.lastLife;
    const n = Math.max(1, this.samples), gd = (this.samples * EVERY) / TICKS_PER_DAY;
    const d = (k: keyof Life): number => (life && prev ? (life[k] as number) - (prev[k] as number) : 0);
    const herds = this.herdCounts(col);
    const r = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)]));
    this.days.push({
      day: this.days.length + 1, year: currentYear(sim.state), doy: currentDayOfYear(sim.state),
      cIn: r(this.cIn),
      cOut: r({ workers: d('outWorkersC'), queen: d('outQueenC'), larvae: d('outLarvaeC'), spoiled: d('outSpoiledC'), ration: d('outRationC') }),
      tendGd: round((this.sum.tend / n) * gd), forageGd: round((this.sum.forage / n) * gd),
      tendDemand: round(this.sum.tendDemand / n), tendTarget: round(this.sum.tendTarget / n),
      herdsWorkable: herds.workable, herdsKnown: herds.known,
      needC: round(this.sum.needC / n), wantC: round(this.sum.wantC / n),
      storesC: round(col.stores.c), winterNeedC: round(winterStoresNeed(sim, col).needC),
      workers: col.core?.workers ?? 0,
    });
    this.cIn = {};
    this.lastLife = life;
    this.samples = 0;
    this.sum = { tend: 0, forage: 0, tendDemand: 0, tendTarget: 0, needC: 0, wantC: 0 };
  }

  result(): SugarReport {
    const col = this.colony();
    if (col && this.samples > 0) this.closeDay(col);
    return { days: this.days, firsts: { ...this.firsts } };
  }
}
