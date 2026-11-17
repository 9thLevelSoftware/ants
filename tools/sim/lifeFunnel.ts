// Colony-life funnel (colony-life task, method step 1): a tool-side observer of a life run that accounts for where
// the colony's time and food go. It reads sim state every tick and listens to events; it never writes sim state.
//
//   - worker time by state (in nest idle / working, waiting to depart, travelling out, searching, handling,
//     travelling home, delivering, fleeing, outside on nest work, stuck), in worker-gd;
//   - trips by outcome: the reason the ant turned home with, whether it reached a source, success, per nutrient;
//   - the protein and carbohydrate paths: sources within FUNNEL_RADIUS_BU of the entrance by kind (count, what they
//     hold, how many the colony knows), prey creatures in that radius, visits, items taken, delivered, fed;
//   - brood: eggs laid, stage changes, losses by stage and cause, time per stage, larvae in diapause;
//   - the queen: share of time her laying potential is open, protein released, gut P present;
//   - deaths by cause (the per-day rows have them too).

import type { Ant, Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { REASON_CODES } from '@/sim/types/ids/ants';
import { isWorkerCaste } from '@/sim/colony/census';
import { layingProteinPermitted, winterReserveShort } from '@/sim/colony/queen';
import { isDiscoveredBy } from '@/sim/ecology/sources/discovery';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { round } from './lifeMetrics';

/** Radius around the main entrance the source census covers (R18: 300 BU). */
export const FUNNEL_RADIUS_BU = 300;
/** Worker-time sampling period, ticks. */
const TIME_SAMPLE_TICKS = 10;
/** An ant on an active walk that moved less than STUCK_MOVE_BU over STUCK_WINDOW_TICKS counts as stuck. */
const STUCK_WINDOW_TICKS = 600;
const STUCK_MOVE_BU = 1;

/** Outdoor engine phases (src/sim/ants/behaviours/outdoor/keys.ts PHASE; persisted values). */
const PH = { wait: 0, outbound: 1, search: 2, queue: 3, collect: 4, return: 5, deliver: 6, rest: 7, fleeRun: 8, fleeFreeze: 9, depart: 10, explore: 11, investigate: 12, assess: 13 } as const;
const OUTDOOR_TASKS = new Set(['forage', 'scout', 'tend']);

const bump = (r: Record<string, number>, k: string, n = 1): void => { r[k] = (r[k] ?? 0) + n; };

function timeBucket(a: Ant): string {
  const inside = a.nestId >= 0;
  if (OUTDOOR_TASKS.has(a.task)) {
    const ph = a.bb['fo.ph'];
    if (ph === undefined) return inside ? 'wait' : `out.${a.state}`;
    switch (ph) {
      case PH.wait: case PH.depart: case PH.rest: return inside ? 'wait' : 'out.rest';
      case PH.outbound: return 'travel.out';
      case PH.search: case PH.explore: case PH.investigate: case PH.assess: return 'search';
      case PH.queue: case PH.collect: return 'handling';
      case PH.return: return 'travel.home';
      case PH.deliver: return 'deliver';
      case PH.fleeRun: case PH.fleeFreeze: return 'flee';
      default: return `phase${ph}`;
    }
  }
  if (!inside) return a.task === 'idle' || a.task === 'rest' ? 'out.idle' : 'out.nestwork';
  if (a.task === 'idle' || a.task === 'rest' || /^(idle|rest)\./.test(a.state) || /groom$/.test(a.state)) return 'nest.idle';
  return 'nest.work';
}

interface TripNow { task: string; reached: boolean; kind: string }

export interface FunnelReport {
  days: number;
  workerTimeGd: Record<string, number>;
  workerTimeShare: Record<string, number>;
  /** worker-gd per task (allocation result). */
  taskTimeGd: Record<string, number>;
  /** trips ended (turned home or abandoned in the nest), by `task reason reached|not success|fail`. */
  trips: Record<string, number>;
  tripsByNutrient: Record<string, { trips: number; ok: number }>;
  sources: {
    atStart: Record<string, { n: number; known: number; c: number; p: number }>;
    atEnd: Record<string, { n: number; known: number; c: number; p: number }>;
    preyCreatures: { atStart: Record<string, number>; atEnd: Record<string, number>; meanAlive: number };
  };
  visits: Record<string, number>;
  itemsTaken: Record<string, number>;
  delivered: Record<string, { n: number; c: number; p: number }>;
  fedLarvae: { feeds: number; c: number; p: number };
  fedQueen: { feeds: number; c: number; p: number };
  brood: {
    eggsLaid: number; hatched: number; pupated: number; eclosed: number;
    deaths: Record<string, number>; meanStageGd: Record<string, number>; diapauseAtEnd: number; aliveAtEnd: Record<string, number>;
  };
  queen: { potentialOpenShare: number; permittedShare: number; winterReserveShortShare: number; gutPShare: number; meanPotential: number };
  deaths: Record<string, number>;
  stuckAntGd: number;
}

export class FunnelObserver {
  private readonly col: number;
  private readonly t0: number;
  private samples = 0;
  private readonly time: Record<string, number> = {};
  private readonly taskTime: Record<string, number> = {};
  private readonly lastPhase = new Map<number, number>();
  private readonly trip = new Map<number, TripNow>();
  private readonly trips: Record<string, number> = {};
  private readonly byNutrient: Record<string, { trips: number; ok: number }> = {};
  private readonly visits: Record<string, number> = {};
  private readonly items: Record<string, number> = {};
  private readonly delivered: Record<string, { n: number; c: number; p: number }> = {};
  private readonly fedLarvae = { feeds: 0, c: 0, p: 0 };
  private readonly fedQueen = { feeds: 0, c: 0, p: 0 };
  private readonly brood = { eggsLaid: 0, hatched: 0, pupated: 0, eclosed: 0, deaths: {} as Record<string, number> };
  private readonly stageStart = new Map<number, number>();
  private readonly stageGd: Record<string, { sum: number; n: number }> = {};
  private readonly deaths: Record<string, number> = {};
  private readonly startSources: FunnelReport['sources']['atStart'];
  private readonly startPrey: Record<string, number>;
  private preyAliveSum = 0; private preySamples = 0;
  private q = { open: 0, permitted: 0, winterShort: 0, gutP: 0, potential: 0, n: 0 };
  private readonly lastPos = new Map<number, { x: number; y: number; z: number; tick: number }>();
  private stuckSamples = 0;

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    const mine = (antId: number): boolean => sim.stores.ants.get(antId)?.colony === this.col;
    sim.events.on('delivery', (e) => {
      if (e.colonyId !== this.col) return;
      const d = (this.delivered[e.kind] ??= { n: 0, c: 0, p: 0 });
      d.n++; d.c += e.c; d.p += e.p;
    });
    sim.events.on('feed', (e) => {
      if (!mine(e.giverId)) return;
      const t = e.broodId >= 0 ? this.fedLarvae : e.receiverId === sim.stores.colonies.get(this.col)?.queenId ? this.fedQueen : null;
      if (!t) return;
      t.feeds++; t.c += e.c; t.p += e.p;
    });
    sim.events.on('egg-laid', (e) => {
      const b = sim.stores.brood.get(e.broodId);
      if (!b || b.colony !== this.col) return;
      this.brood.eggsLaid++;
      this.stageStart.set(e.broodId, sim.state.tick);
    });
    sim.events.on('brood-stage', (e) => {
      const b = sim.stores.brood.get(e.broodId);
      if (!b || b.colony !== this.col) return;
      if (e.from === 'egg') this.brood.hatched++;
      if (e.from === 'larva' && e.to === 'pupa') this.brood.pupated++;
      this.closeStage(e.broodId, e.from);
      this.stageStart.set(e.broodId, sim.state.tick);
    });
    sim.events.on('brood-died', (e) => {
      if (e.colonyId !== undefined && e.colonyId !== this.col) return;
      bump(this.brood.deaths, `${e.stage}:${e.cause}`);
      this.stageStart.delete(e.broodId);
    });
    sim.events.on('ant-eclosed', (e) => { if (e.colonyId === this.col) this.brood.eclosed++; });
    sim.events.on('ant-died', (e) => { if (e.colonyId === this.col) bump(this.deaths, `${e.caste}:${e.cause}`); });
    this.startSources = this.sourceCensus();
    this.startPrey = this.preyCensus();
  }

  private closeStage(broodId: number, stage: string): void {
    const t = this.stageStart.get(broodId);
    if (t === undefined) return;
    const s = (this.stageGd[stage] ??= { sum: 0, n: 0 });
    s.sum += (this.sim.state.tick - t) / TICKS_PER_DAY; s.n++;
  }

  private entrancePos(): { x: number; y: number; z: number } | null {
    for (const n of this.sim.stores.nests.list) {
      if (!n.alive || n.colony !== this.col) continue;
      const e = n.entrances.find((x) => x.status !== 'sealed') ?? n.entrances[0];
      if (e) return e.pos;
    }
    return null;
  }

  /** Sources within FUNNEL_RADIUS_BU of the entrance by kind: count, known by the colony, C and P they hold now. */
  private sourceCensus(): FunnelReport['sources']['atStart'] {
    const sim = this.sim, e = this.entrancePos(), out: FunnelReport['sources']['atStart'] = {};
    if (!e) return out;
    const r = FUNNEL_RADIUS_BU * sim.world.bu;
    for (const s of sim.stores.sources.list) {
      if (!s.alive) continue;
      const dx = s.pos.x - e.x, dz = s.pos.z - e.z;
      if (dx * dx + dz * dz > r * r) continue;
      const k = `${s.kind}${s.variant ? `/${s.variant}` : ''}`;
      const o = (out[k] ??= { n: 0, known: 0, c: 0, p: 0 });
      o.n++;
      if (isDiscoveredBy(sim, s, this.col)) o.known++;
      // a pool source holds `pool` loads of liquid (nutrients per load c, p); a solid source `units` pieces of c, p
      const amount = s.pool >= 0 ? s.pool : s.units;
      o.c = round(o.c + amount * s.c); o.p = round(o.p + amount * s.p);
    }
    return out;
  }

  private preyCensus(): Record<string, number> {
    const sim = this.sim, e = this.entrancePos(), out: Record<string, number> = {};
    if (!e) return out;
    const r = FUNNEL_RADIUS_BU * sim.world.bu;
    for (const c of sim.stores.creatures.list) {
      if (!c.alive || CREATURE_STATS[c.kind]?.family !== 'prey' || c.kind === 'aphid') continue;
      const dx = c.pos.x - e.x, dz = c.pos.z - e.z;
      if (dx * dx + dz * dz <= r * r) bump(out, c.kind);
    }
    return out;
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, tick = sim.state.tick;
    const sample = tick % TIME_SAMPLE_TICKS === 0;
    if (sample) this.samples++;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || !isWorkerCaste(a.caste)) continue;
      if (OUTDOOR_TASKS.has(a.task)) this.watchTrip(a);
      else if (this.trip.has(a.id)) this.trip.delete(a.id);
      if (sample) {
        bump(this.time, timeBucket(a));
        bump(this.taskTime, a.task);
        if (this.isStuck(a)) this.stuckSamples++;
      }
    }
    if (tick % 300 === 0) {
      const prey = this.preyCensus();
      this.preyAliveSum += Object.values(prey).reduce((x, y) => x + y, 0); this.preySamples++;
      const c = sim.stores.colonies.get(this.col);
      const qn = c ? sim.stores.ants.get(c.queenId) : undefined;
      const acc = c?.core?.acc;
      if (c && qn?.queen && acc && acc['cen.valid'] === 1) {
        const pot = acc['lay.potential'] ?? 0;
        this.q.n++; this.q.potential += pot;
        if (pot > 0.5) this.q.open++;
        if (layingProteinPermitted(sim, c)) this.q.permitted++;
        if (winterReserveShort(sim, c, c.core?.workers ?? 0)) this.q.winterShort++;
        if (qn.queen.gut.p >= 0.04) this.q.gutP++;
      }
    }
  }

  private isStuck(a: Ant): boolean {
    const p = this.lastPos.get(a.id), t = this.sim.state.tick, bu = this.sim.world.bu;
    if (a.nav.status !== 'moving') { this.lastPos.delete(a.id); return false; }
    if (!p) { this.lastPos.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, tick: t }); return false; }
    const dx = a.pos.x - p.x, dy = a.pos.y - p.y, dz = a.pos.z - p.z;
    if (dx * dx + dy * dy + dz * dz > (STUCK_MOVE_BU * bu) ** 2) { this.lastPos.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, tick: t }); return false; }
    return t - p.tick > STUCK_WINDOW_TICKS;
  }

  private kindOf(srcId: number): string {
    const s = srcId >= 0 ? this.sim.stores.sources.get(srcId) : undefined;
    return s ? s.kind : 'none';
  }

  private nutrientOf(kind: string): string {
    if (kind === 'none') return 'none';
    for (const s of this.sim.stores.sources.list) if (s.kind === kind) return s.p > s.c ? 'P' : 'C';
    return kind === 'carrion' || kind === 'prey' ? 'P' : 'C';
  }

  private watchTrip(a: Ant): void {
    const ph = a.bb['fo.ph'] ?? -1;
    const prev = this.lastPhase.get(a.id) ?? -1;
    if (ph === prev) return;
    this.lastPhase.set(a.id, ph);
    const tr = this.trip.get(a.id);
    if (ph === PH.outbound || ph === PH.explore || ph === PH.depart) {
      if (!tr) this.trip.set(a.id, { task: a.task, reached: false, kind: this.kindOf(a.bb['fo.src'] ?? -1) });
      return;
    }
    if ((ph === PH.collect || ph === PH.queue) && tr) {
      if (!tr.reached) bump(this.visits, this.kindOf(a.bb['fo.src'] ?? -1));
      tr.reached = true; tr.kind = this.kindOf(a.bb['fo.src'] ?? -1);
      return;
    }
    if (ph === PH.return && tr) {
      const r = a.mem.decisions[0];
      const reason = this.reasonNow(a);
      const ok = (a.bb['fo.ok'] ?? 0) === 1;
      const kind = tr.reached ? tr.kind : this.kindOf(a.bb['fo.src'] ?? -1);
      bump(this.trips, `${tr.task} ${reason} ${tr.reached ? 'reached' : 'not-reached'} ${ok ? 'ok' : 'fail'}`);
      const nut = `${tr.task}:${this.nutrientOf(kind)}`;
      const t = (this.byNutrient[nut] ??= { trips: 0, ok: 0 });
      t.trips++; if (ok) t.ok++;
      if (ok && a.carry.kind === 'item') bump(this.items, kind);
      this.trip.delete(a.id);
      return;
    }
    if (ph === PH.wait && tr && a.nestId >= 0) {
      // the trip was abandoned before the ant left (abandonTrip): counted with the reason it gave up
      const r = a.mem.decisions[0];
      const reason = this.reasonNow(a);
      bump(this.trips, `${tr.task} ${reason} never-left fail`);
      this.trip.delete(a.id);
    }
  }

  /**
   * The reason the ant gave for its last decision, if it was logged by the tick that just ran (the tick counter has
   * advanced by one since). The ring keeps only the base code ('job:home' reads 'job').
   */
  private reasonNow(a: Ant): string {
    const r = a.mem.decisions[0];
    return r && r.tick >= this.sim.state.tick - 1 ? (REASON_CODES[r.code] ?? `code${r.code}`) : 'unlogged';
  }

  result(): FunnelReport {
    const sim = this.sim, days = (sim.state.tick - this.t0) / TICKS_PER_DAY;
    const perGd = TIME_SAMPLE_TICKS / TICKS_PER_DAY;
    const time: Record<string, number> = {}, share: Record<string, number> = {}, task: Record<string, number> = {};
    const total = Object.values(this.time).reduce((x, y) => x + y, 0) || 1;
    for (const [k, v] of Object.entries(this.time).sort((x, y) => y[1] - x[1])) { time[k] = round(v * perGd); share[k] = round(v / total); }
    for (const [k, v] of Object.entries(this.taskTime).sort((x, y) => y[1] - x[1])) task[k] = round(v * perGd);
    const meanStageGd: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.stageGd)) meanStageGd[k] = round(v.sum / Math.max(1, v.n));
    let diap = 0;
    const alive: Record<string, number> = {};
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== this.col) continue;
      bump(alive, b.stage);
      if ((b.flags & BroodFlag.DIAPAUSE) !== 0) diap++;
    }
    const q = this.q, qn = Math.max(1, q.n);
    const rd = (o: Record<string, { n: number; c: number; p: number }>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { n: v.n, c: round(v.c), p: round(v.p) }]));
    return {
      days: round(days), workerTimeGd: time, workerTimeShare: share, taskTimeGd: task,
      trips: Object.fromEntries(Object.entries(this.trips).sort((x, y) => y[1] - x[1])), tripsByNutrient: this.byNutrient,
      sources: {
        atStart: this.startSources, atEnd: this.sourceCensus(),
        preyCreatures: { atStart: this.startPrey, atEnd: this.preyCensus(), meanAlive: round(this.preyAliveSum / Math.max(1, this.preySamples)) },
      },
      visits: this.visits, itemsTaken: this.items, delivered: rd(this.delivered),
      fedLarvae: { feeds: this.fedLarvae.feeds, c: round(this.fedLarvae.c), p: round(this.fedLarvae.p) },
      fedQueen: { feeds: this.fedQueen.feeds, c: round(this.fedQueen.c), p: round(this.fedQueen.p) },
      brood: { ...this.brood, meanStageGd, diapauseAtEnd: diap, aliveAtEnd: alive },
      queen: {
        potentialOpenShare: round(q.open / qn), permittedShare: round(q.permitted / qn), winterReserveShortShare: round(q.winterShort / qn),
        gutPShare: round(q.gutP / qn), meanPotential: round(q.potential / qn),
      },
      deaths: this.deaths,
      stuckAntGd: round(this.stuckSamples * perGd),
    };
  }
}

/** Founding read-out (hand-over count: what set it). Subscribe before the founding runs. */
export class FoundingObserver {
  eggsLaid = 0; eclosed = 0; deaths: Record<string, number> = {}; adultDeaths: Record<string, number> = {};
  constructor(sim: Sim) {
    const col = sim.state.player.colonyId;
    sim.events.on('egg-laid', (e) => { const b = sim.stores.brood.get(e.broodId); if (b && b.colony === col) this.eggsLaid++; });
    sim.events.on('brood-died', (e) => { if (e.colonyId === undefined || e.colonyId === col) bump(this.deaths, `${e.stage}:${e.cause}`); });
    sim.events.on('ant-eclosed', (e) => { if (e.colonyId === col) this.eclosed++; });
    sim.events.on('ant-died', (e) => { if (e.colonyId === col) bump(this.adultDeaths, `${e.caste}:${e.cause}`); });
  }
}

/** Markdown block of the funnel for the run's .md. */
export function funnelMarkdown(f: FunnelReport): string {
  const kv = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  const src = (m: FunnelReport['sources']['atStart']) => Object.entries(m).map(([k, v]) => `${k} ${v.n} (known ${v.known}, C ${v.c}, P ${v.p})`).join('; ') || '-';
  return [
    '', `Funnel over ${f.days} gd (tools/sim/lifeFunnel.ts):`,
    `- worker time (share): ${kv(f.workerTimeShare)}; stuck ${f.stuckAntGd} worker-gd`,
    `- task time (worker-gd): ${kv(f.taskTimeGd)}`,
    `- trips: ${kv(f.trips)}`,
    `- trips by nutrient: ${Object.entries(f.tripsByNutrient).map(([k, v]) => `${k} ${v.ok}/${v.trips}`).join(', ') || '-'}`,
    `- sources within ${FUNNEL_RADIUS_BU} BU at start: ${src(f.sources.atStart)}`,
    `- sources at end: ${src(f.sources.atEnd)}`,
    `- prey creatures within ${FUNNEL_RADIUS_BU} BU: start ${kv(f.sources.preyCreatures.atStart)}, end ${kv(f.sources.preyCreatures.atEnd)}, mean alive ${f.sources.preyCreatures.meanAlive}`,
    `- visits ${kv(f.visits)}; items taken ${kv(f.itemsTaken)}; delivered ${Object.entries(f.delivered).map(([k, v]) => `${k} ${v.n} (C ${v.c} P ${v.p})`).join(', ') || '-'}`,
    `- fed to larvae ${f.fedLarvae.feeds} feeds (C ${f.fedLarvae.c} P ${f.fedLarvae.p}); to the queen ${f.fedQueen.feeds} (C ${f.fedQueen.c} P ${f.fedQueen.p})`,
    `- brood: laid ${f.brood.eggsLaid}, hatched ${f.brood.hatched}, pupated ${f.brood.pupated}, eclosed ${f.brood.eclosed}; losses ${kv(f.brood.deaths)}; mean stage gd ${kv(f.brood.meanStageGd)}; alive at end ${kv(f.brood.aliveAtEnd)} (diapause ${f.brood.diapauseAtEnd})`,
    `- queen: potential > 0.5 egg/gd ${f.queen.potentialOpenShare}, laying protein permitted ${f.queen.permittedShare}, winter reserve short ${f.queen.winterReserveShortShare}, gut P for an egg ${f.queen.gutPShare}, mean potential ${f.queen.meanPotential}`,
    `- deaths: ${kv(f.deaths)}`,
  ].join('\n');
}
