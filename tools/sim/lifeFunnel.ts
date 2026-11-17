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
import { patchKnownBy } from '@/sim/ants/behaviours/outdoor/hunt';
import { odourRadiusMm } from '@/sim/ecology/sources/def';
import { smelledSource } from '@/sim/ants/perception';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
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

/**
 * A trip in progress. `reason` and `ok` are what the ant gave when it turned home; the trip is counted when it ends at
 * home (ant.mem.trips increments: colony.recordForagerReturn, the same count as col.counters.trips and report.econ).
 */
/** One scout trip outside (sampled every TIME_SAMPLE_TICKS): how far it went, how long, how close it came to food. */
interface ScoutTrip { t0: number; maxD: number; path: number; last: { x: number; z: number }; gap: Map<number, number>; smelled: Set<number> }

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface TripNow { task: string; reached: boolean; kind: string; reason: string | null }

export interface FunnelReport {
  days: number;
  workerTimeGd: Record<string, number>;
  workerTimeShare: Record<string, number>;
  /** worker-gd per task (allocation result). */
  taskTimeGd: Record<string, number>;
  /**
   * Trips ended at home by `task reason reached|not-reached ok|fail` (the colony's trip count, = report.econ.trips;
   * reason = what the ant turned home with), plus trips abandoned before leaving, listed as `never-left (not counted)`.
   */
  trips: Record<string, number>;
  /** Trips ended at home and the successful ones (equal to report.econ.trips / successes over the same span). */
  tripsHome: { n: number; ok: number };
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
  /**
   * Scout trips outside (colony-life round 2): distance reached from the entrance and time outside (median, p90),
   * path length; per source kind within FUNNEL_RADIUS_BU, the trips that came within its odour radius (plan view), the
   * trips that smelled it (perception), and the sources the colony discovered (by kind; `byScout` those found by
   * scouts). `nearestGapBu`: per trip the closest approach to the odour edge of a P (resp. C) source, median.
   */
  scouting: {
    trips: number; maxDistBu: { median: number; p90: number }; outS: { median: number; p90: number }; pathBu: { median: number };
    inOdour: Record<string, number>; smelled: Record<string, number>; discovered: Record<string, number>; byScout: Record<string, number>;
    nearestGapBu: { P: number; C: number };
  };
  /**
   * Prey patches (GDD 05 §2.3, R18) within FUNNEL_RADIUS_BU: count, nearest edge from the entrance (BU), summed K and
   * prey count at start / end; patch prey that appeared (springtail, mite: they appear only ahead of a forager or
   * scout inside a patch), prey subdued by the colony's ants, and patch prey that vanished untouched.
   */
  /** Game days from the start until the colony first knew a protein source within FUNNEL_RADIUS_BU or a prey patch (null: never). */
  proteinKnownGd: number | null;
  preyPatches: { n: number; nearestBu: number; k: number; countStart: number; countEnd: number; appeared: Record<string, number>; subdued: Record<string, number>; vanished: Record<string, number> };
}

export class FunnelObserver {
  private readonly col: number;
  private readonly t0: number;
  private samples = 0;
  private readonly time: Record<string, number> = {};
  private readonly taskTime: Record<string, number> = {};
  private readonly lastPhase = new Map<number, number>();
  private readonly trip = new Map<number, TripNow>();
  /** Per ant: mem.trips and mem.lastSuccessTick last seen (a change = a trip ended at home, and whether it succeeded). */
  private readonly homeTrips = new Map<number, { n: number; okTick: number }>();
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
  private tripsHome = 0; private tripsHomeOk = 0;
  private readonly scout = new Map<number, ScoutTrip>();
  private readonly scoutDone = { maxD: [] as number[], outS: [] as number[], path: [] as number[], gapP: [] as number[], gapC: [] as number[] };
  private readonly inOdour: Record<string, number> = {};
  private readonly smelledKinds: Record<string, number> = {};
  private readonly discovered: Record<string, number> = {};
  private readonly discoveredByScout: Record<string, number> = {};
  private readonly preyAppeared: Record<string, number> = {};
  private readonly preySubdued: Record<string, number> = {};
  private readonly preyVanished: Record<string, number> = {};
  private readonly patchStart: { n: number; nearestBu: number; k: number; count: number };

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
    sim.events.on('food-source-discovered', (e) => {
      if (e.colonyId !== this.col) return;
      const k = `${e.kind}${e.variant ? `/${e.variant}` : ''}`;
      bump(this.discovered, k);
      if (sim.stores.ants.get(e.byAntId)?.task === 'scout') bump(this.discoveredByScout, k);
    });
    const patchKinds = new Set(['springtail', 'mite']);
    sim.events.on('creature-spawned', (e) => { if (patchKinds.has(e.kind)) bump(this.preyAppeared, e.kind); });
    sim.events.on('creature-despawned', (e) => { if (patchKinds.has(e.kind)) bump(this.preyVanished, `${e.kind}:${e.cause}`); });
    sim.events.on('prey-subdued', (e) => { if (e.antIds.some(mine)) bump(this.preySubdued, e.kind); });
    this.patchStart = this.patchCensus();
    this.startSources = this.sourceCensus();
    this.startPrey = this.preyCensus();
  }

  /** First tick (300-tick samples) the colony knew a live protein source within FUNNEL_RADIUS_BU or a prey patch; -1. */
  private proteinKnownTick = -1;

  /** Does the colony know a live source holding protein (carrion, prey remains, crumbs with P) or a prey patch now? */
  private proteinKnownNow(): boolean {
    const sim = this.sim, e = this.entrancePos();
    if (!e) return false;
    const r = FUNNEL_RADIUS_BU * sim.world.bu;
    for (const s of sim.stores.sources.list) {
      if (!s.alive || s.p <= 0 || (s.pool >= 0 ? s.pool : s.units) <= 0) continue;
      const dx = s.pos.x - e.x, dz = s.pos.z - e.z;
      if (dx * dx + dz * dz <= r * r && isDiscoveredBy(sim, s, this.col)) return true;
    }
    return sim.state.ecology.preyPatches.some((p) => patchKnownBy(sim, p, this.col));
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

  /** Prey patches whose disc reaches within FUNNEL_RADIUS_BU of the entrance. */
  private patchCensus(): { n: number; nearestBu: number; k: number; count: number } {
    const sim = this.sim, e = this.entrancePos(), bu = sim.world.bu;
    const out = { n: 0, nearestBu: Infinity, k: 0, count: 0 };
    if (!e) return out;
    for (const p of sim.state.ecology.preyPatches) {
      const edge = (Math.sqrt((p.center.x - e.x) ** 2 + (p.center.z - e.z) ** 2) - p.radius) / bu;
      if (edge > FUNNEL_RADIUS_BU) continue;
      out.n++; out.nearestBu = Math.min(out.nearestBu, Math.max(0, edge)); out.k += p.k; out.count += p.count;
    }
    return { n: out.n, nearestBu: out.n ? round(out.nearestBu) : -1, k: round(out.k), count: round(out.count) };
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
      this.watchHome(a);
      if (sample) this.watchScout(a);
      if (sample) {
        bump(this.time, timeBucket(a));
        bump(this.taskTime, a.task);
        if (this.isStuck(a)) this.stuckSamples++;
      }
    }
    if (tick % 300 === 0) {
      if (this.proteinKnownTick < 0 && this.proteinKnownNow()) this.proteinKnownTick = tick;
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

  /** Scout trip samples (see FunnelReport.scouting); a trip ends when the scout is back inside or no longer scouting. */
  private watchScout(a: Ant): void {
    const sim = this.sim, bu = sim.world.bu, e = this.entrancePos();
    let tr = this.scout.get(a.id);
    if (a.task !== 'scout' || a.nestId >= 0 || !e) { if (tr) this.closeScout(a.id, tr); return; }
    if (!tr) { tr = { t0: sim.state.tick, maxD: 0, path: 0, last: { x: a.pos.x, z: a.pos.z }, gap: new Map(), smelled: new Set() }; this.scout.set(a.id, tr); }
    const dx = a.pos.x - e.x, dz = a.pos.z - e.z;
    tr.maxD = Math.max(tr.maxD, Math.sqrt(dx * dx + dz * dz) / bu);
    const sx = a.pos.x - tr.last.x, sz = a.pos.z - tr.last.z;
    tr.path += Math.sqrt(sx * sx + sz * sz) / bu; tr.last.x = a.pos.x; tr.last.z = a.pos.z;
    const r300 = FUNNEL_RADIUS_BU * bu;
    for (const s of sim.stores.sources.list) {
      if (!s.alive) continue;
      const ex = s.pos.x - e.x, ez = s.pos.z - e.z;
      if (ex * ex + ez * ez > r300 * r300) continue;
      const qx = s.pos.x - a.pos.x, qz = s.pos.z - a.pos.z;
      const g = (Math.sqrt(qx * qx + qz * qz) - odourRadiusMm(s, bu)) / bu;
      if (g < (tr.gap.get(s.id) ?? Infinity)) tr.gap.set(s.id, g);
    }
    const sm = smelledSource(a);
    if (sm >= 0) tr.smelled.add(sm);
  }

  private closeScout(antId: number, tr: ScoutTrip): void {
    this.scout.delete(antId);
    const d = this.scoutDone, sim = this.sim;
    d.maxD.push(tr.maxD); d.outS.push((sim.state.tick - tr.t0) / TICKS_PER_SECOND); d.path.push(tr.path);
    let gapP = Infinity, gapC = Infinity;
    const kinds = new Set<string>();
    for (const [id, g] of tr.gap) {
      const s = sim.stores.sources.get(id);
      if (!s) continue;
      if (s.p > s.c) gapP = Math.min(gapP, g); else gapC = Math.min(gapC, g);
      if (g <= 0) kinds.add(`${s.kind}${s.variant ? `/${s.variant}` : ''}`);
    }
    for (const k of kinds) bump(this.inOdour, k);
    const smelt = new Set<string>();
    for (const id of tr.smelled) { const s = sim.stores.sources.get(id); if (s) smelt.add(`${s.kind}${s.variant ? `/${s.variant}` : ''}`); }
    for (const k of smelt) bump(this.smelledKinds, k);
    if (gapP < Infinity) d.gapP.push(gapP);
    if (gapC < Infinity) d.gapC.push(gapC);
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
      if (!tr) this.trip.set(a.id, { task: a.task, reached: false, kind: this.kindOf(a.bb['fo.src'] ?? -1), reason: null });
      return;
    }
    if ((ph === PH.collect || ph === PH.queue) && tr) {
      if (!tr.reached) bump(this.visits, this.kindOf(a.bb['fo.src'] ?? -1));
      tr.reached = true; tr.kind = this.kindOf(a.bb['fo.src'] ?? -1);
      return;
    }
    if (ph === PH.return && tr && tr.reason === null) {
      // the reason it turned home with; the trip is counted when it ends at home (watchHome)
      tr.reason = this.reasonNow(a);
      if (!tr.reached) tr.kind = this.kindOf(a.bb['fo.src'] ?? -1);
      if (a.carry.kind === 'item') bump(this.items, tr.kind);
      return;
    }
    if (ph === PH.wait && tr && a.nestId >= 0 && tr.reason === null) {
      // the trip was abandoned before the ant left (abandonTrip): not a trip of the colony's count, listed apart
      bump(this.trips, `${tr.task} ${this.reasonNow(a)} never-left (not counted)`);
      this.trip.delete(a.id);
    }
  }

  /**
   * A trip ended at home: ant.mem.trips went up this tick (phaseNest finishTrip -> colony.recordForagerReturn, the
   * only writer), success when mem.lastSuccessTick moved with it. Keyed by the task and reason seen on the way out;
   * `untracked` when the trip began before the funnel saw it (or outside the outdoor phases it watches).
   */
  private watchHome(a: Ant): void {
    const seen = this.homeTrips.get(a.id);
    const now = { n: a.mem.trips, okTick: a.mem.lastSuccessTick };
    this.homeTrips.set(a.id, now);
    if (!seen || now.n <= seen.n) return;
    const ok = now.okTick !== seen.okTick;
    const tr = this.trip.get(a.id);
    this.trip.delete(a.id);
    const task = tr?.task ?? a.task;
    bump(this.trips, `${task} ${tr?.reason ?? 'untracked'} ${tr?.reached ? 'reached' : 'not-reached'} ${ok ? 'ok' : 'fail'}`);
    const t = (this.byNutrient[`${task}:${this.nutrientOf(tr?.kind ?? 'none')}`] ??= { trips: 0, ok: 0 });
    t.trips++; if (ok) t.ok++;
    this.tripsHome++; if (ok) this.tripsHomeOk++;
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
      tripsHome: { n: this.tripsHome, ok: this.tripsHomeOk },
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
      scouting: this.scoutingResult(),
      proteinKnownGd: this.proteinKnownTick >= 0 ? round((this.proteinKnownTick - this.t0) / TICKS_PER_DAY) : null,
      preyPatches: {
        n: this.patchStart.n, nearestBu: this.patchStart.nearestBu, k: this.patchStart.k, countStart: this.patchStart.count,
        countEnd: this.patchCensus().count, appeared: this.preyAppeared, subdued: this.preySubdued, vanished: this.preyVanished,
      },
    };
  }

  private scoutingResult(): FunnelReport['scouting'] {
    const d = this.scoutDone;
    const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] : 0);
    return {
      trips: d.maxD.length,
      maxDistBu: { median: round(median(d.maxD)), p90: round(p90(d.maxD)) },
      outS: { median: round(median(d.outS)), p90: round(p90(d.outS)) },
      pathBu: { median: round(median(d.path)) },
      inOdour: this.inOdour, smelled: this.smelledKinds, discovered: this.discovered, byScout: this.discoveredByScout,
      nearestGapBu: { P: round(median(d.gapP)), C: round(median(d.gapC)) },
    };
  }
}

/** Founding read-out (hand-over count: what set it). Subscribe before the founding runs. */
export class FoundingObserver {
  eggsLaid = 0; eclosed = 0; deaths: Record<string, number> = {}; adultDeaths: Record<string, number> = {};
  /** Set at the hand-over (stop()): later events belong to the colony-life funnel, not to the founding. */
  private stopped = false;
  constructor(sim: Sim) {
    const col = sim.state.player.colonyId;
    const live = () => !this.stopped;
    sim.events.on('egg-laid', (e) => { const b = sim.stores.brood.get(e.broodId); if (live() && b && b.colony === col) this.eggsLaid++; });
    sim.events.on('brood-died', (e) => { if (live() && (e.colonyId === undefined || e.colonyId === col)) bump(this.deaths, `${e.stage}:${e.cause}`); });
    sim.events.on('ant-eclosed', (e) => { if (live() && e.colonyId === col) this.eclosed++; });
    sim.events.on('ant-died', (e) => { if (live() && e.colonyId === col) bump(this.adultDeaths, `${e.caste}:${e.cause}`); });
  }
  /** The founding is over: count nothing more. */
  stop(): void { this.stopped = true; }
}

/** Markdown block of the funnel for the run's .md. */
export function funnelMarkdown(f: FunnelReport): string {
  const kv = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  const src = (m: FunnelReport['sources']['atStart']) => Object.entries(m).map(([k, v]) => `${k} ${v.n} (known ${v.known}, C ${v.c}, P ${v.p})`).join('; ') || '-';
  return [
    '', `Funnel over ${f.days} gd (tools/sim/lifeFunnel.ts):`,
    `- worker time (share): ${kv(f.workerTimeShare)}; stuck ${f.stuckAntGd} worker-gd`,
    `- task time (worker-gd): ${kv(f.taskTimeGd)}`,
    `- trips ended at home ${f.tripsHome.n}, ${f.tripsHome.ok} successful: ${kv(f.trips)}`,
    `- trips by nutrient: ${Object.entries(f.tripsByNutrient).map(([k, v]) => `${k} ${v.ok}/${v.trips}`).join(', ') || '-'}`,
    `- sources within ${FUNNEL_RADIUS_BU} BU at start: ${src(f.sources.atStart)}`,
    `- sources at end: ${src(f.sources.atEnd)}`,
    `- prey creatures within ${FUNNEL_RADIUS_BU} BU: start ${kv(f.sources.preyCreatures.atStart)}, end ${kv(f.sources.preyCreatures.atEnd)}, mean alive ${f.sources.preyCreatures.meanAlive}`,
    `- visits ${kv(f.visits)}; items taken ${kv(f.itemsTaken)}; delivered ${Object.entries(f.delivered).map(([k, v]) => `${k} ${v.n} (C ${v.c} P ${v.p})`).join(', ') || '-'}`,
    `- fed to larvae ${f.fedLarvae.feeds} feeds (C ${f.fedLarvae.c} P ${f.fedLarvae.p}); to the queen ${f.fedQueen.feeds} (C ${f.fedQueen.c} P ${f.fedQueen.p})`,
    `- brood: laid ${f.brood.eggsLaid}, hatched ${f.brood.hatched}, pupated ${f.brood.pupated}, eclosed ${f.brood.eclosed}; losses ${kv(f.brood.deaths)}; mean stage gd ${kv(f.brood.meanStageGd)}; alive at end ${kv(f.brood.aliveAtEnd)} (diapause ${f.brood.diapauseAtEnd})`,
    `- queen: potential > 0.5 egg/gd ${f.queen.potentialOpenShare}, laying protein permitted ${f.queen.permittedShare}, winter reserve short ${f.queen.winterReserveShortShare}, gut P for an egg ${f.queen.gutPShare}, mean potential ${f.queen.meanPotential}`,
    `- deaths: ${kv(f.deaths)}`,
    `- scouting: ${f.scouting.trips} trips outside; reached median ${f.scouting.maxDistBu.median} BU (p90 ${f.scouting.maxDistBu.p90}) in ${f.scouting.outS.median} s (p90 ${f.scouting.outS.p90}), path ${f.scouting.pathBu.median} BU; ` +
      `trips in odour range of ${kv(f.scouting.inOdour)}; smelled ${kv(f.scouting.smelled)}; nearest odour edge median P ${f.scouting.nearestGapBu.P} BU, C ${f.scouting.nearestGapBu.C} BU; ` +
      `discovered ${kv(f.scouting.discovered)} (by scouts ${kv(f.scouting.byScout)})`,
    `- prey patches within ${FUNNEL_RADIUS_BU} BU: ${f.preyPatches.n} (nearest edge ${f.preyPatches.nearestBu} BU, K ${f.preyPatches.k}, count ${f.preyPatches.countStart} -> ${f.preyPatches.countEnd}); ` +
      `patch prey appeared on the whole map ${kv(f.preyPatches.appeared)} (vanished ${kv(f.preyPatches.vanished)}), subdued by the colony ${kv(f.preyPatches.subdued)}`,
  ].join('\n');
}
