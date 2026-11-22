// colony-life round 10 (direction 23 item 3): who kills the colony's workers. A measuring tool: it reads events and
// state and changes nothing. For every adult death by predation (also antlion and bird) after the hand-over: the game
// day, the killer's kind (the last creature that struck, seized or paralysed that ant), whether it is a resident of
// a worldgen territory, a colony-range hunter the director sited where the colony walks (R25), or a visitor without
// a territory, its distance from the colony's entrance, and the colony's worker count that day.

import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { isColonyRangeTerritory } from '@/sim/ecology/creatures/colonyRange';
import { round } from './lifeMetrics';

const KILL_CAUSES = new Set(['predation', 'antlion', 'bird']);

export interface PredationDeath {
  day: number; cause: string; kind: string; origin: 'resident' | 'colony-range' | 'visitor' | 'unknown';
  distBu: number; workers: number; task: string;
}

export interface PredationReport {
  deaths: PredationDeath[];
  /** Deaths summed by "kind origin". */
  byKiller: Record<string, number>;
  /** Most deaths in one game day and that day's worker count. */
  worstDay: { day: number; deaths: number; workers: number };
}

export class PredationRecorder {
  private readonly col: number;
  private readonly t0: number;
  /** Ant id -> creature id of the last strike, seizure or paralysis. */
  private readonly lastBy = new Map<number, number>();
  /** Creature id -> kind and origin when it last acted (it may be gone when the death is filed). */
  private readonly who = new Map<number, { kind: string; origin: PredationDeath['origin'] }>();
  private readonly deaths: PredationDeath[] = [];

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    const by = (antId: number, creatureId: number) => {
      const a = sim.stores.ants.get(antId);
      if (!a || a.colony !== this.col) return;
      this.lastBy.set(antId, creatureId);
      const c = sim.stores.creatures.get(creatureId);
      if (c) this.who.set(creatureId, { kind: c.kind, origin: c.territoryId < 0 ? 'visitor' : isColonyRangeTerritory(sim, c.territoryId) ? 'colony-range' : 'resident' });
    };
    sim.events.on('predator-strike', (e) => by(e.targetId, e.creatureId));
    sim.events.on('ant-seized', (e) => by(e.antId, e.by));
    sim.events.on('ant-paralysed', (e) => by(e.antId, e.by));
    sim.events.on('ant-died', (e) => {
      if (e.colonyId !== this.col || !KILL_CAUSES.has(e.cause)) return;
      // the killing strike's event can follow the death in the same flush (soakScene.ts): file at the next tick
      this.pending.push({ antId: e.antId, cause: e.cause, pos: e.pos, task: e.task, tick: sim.state.tick });
    });
  }

  private readonly pending: { antId: number; cause: string; pos: { x: number; z: number }; task: string; tick: number }[] = [];

  /** Call once after every sim.tick(). */
  tick(): void {
    if (this.pending.length === 0) return;
    const sim = this.sim;
    const e = this.entrancePos();
    const workers = sim.stores.colonies.get(this.col)?.core?.workers ?? 0;
    for (const p of this.pending) {
      const cid = this.lastBy.get(p.antId);
      const w = cid !== undefined ? this.who.get(cid) : undefined;
      const kind = p.cause === 'bird' ? 'bird' : w?.kind ?? 'unknown';
      const distBu = e ? Math.sqrt((p.pos.x - e.x) ** 2 + (p.pos.z - e.z) ** 2) / sim.world.bu : -1;
      this.deaths.push({
        day: Math.floor((p.tick - this.t0) / TICKS_PER_DAY) + 1, cause: p.cause, kind,
        origin: p.cause === 'bird' ? 'visitor' : w?.origin ?? 'unknown', distBu: round(distBu), workers, task: p.task,
      });
      this.lastBy.delete(p.antId);
    }
    this.pending.length = 0;
  }

  private entrancePos(): { x: number; z: number } | null {
    for (const n of this.sim.stores.nests.list) {
      if (!n.alive || n.colony !== this.col) continue;
      const en = n.entrances.find((x) => x.status !== 'sealed') ?? n.entrances[0];
      if (en) return en.pos;
    }
    return null;
  }

  result(): PredationReport {
    const byKiller: Record<string, number> = {};
    const perDay = new Map<number, { n: number; workers: number }>();
    for (const d of this.deaths) {
      const k = `${d.kind} ${d.origin}`;
      byKiller[k] = (byKiller[k] ?? 0) + 1;
      const x = perDay.get(d.day) ?? { n: 0, workers: d.workers };
      x.n++; perDay.set(d.day, x);
    }
    let worstDay = { day: 0, deaths: 0, workers: 0 };
    for (const [day, x] of perDay) if (x.n > worstDay.deaths) worstDay = { day, deaths: x.n, workers: x.workers };
    return { deaths: this.deaths, byKiller, worstDay };
  }
}
