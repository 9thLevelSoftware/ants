// colony-life round 8 (direction 16): the protein ledger of a life run, by game day after the hand-over.
// A measuring tool: it reads state and events and changes nothing. Stages, in the order protein moves:
//   standing   protein held by live sources within FUNNEL_RADIUS_BU of the entrance (R18), and how much the colony knows;
//              prey in the patches that reach that radius (count) and how many of those patches the colony knows;
//   arrived    protein of sources that appeared in the radius that day; gone: protein of sources that left it (eaten
//              by others, rotted, removed: the source's last sampled holding, by the removal cause);
//   trips      forage trips that set out for a protein source (the source holds more P than C) or for a known prey
//              patch (hunting trips, hunt.ts), and arrivals at a protein source;
//   choice     (means over the day's samples) foragers, those waiting at home, of them how many have a protein
//              source among the sources they can choose (choice.ts knownSources: lead, routes, entrance news), and
//              the colony's protein need, weights and room for P that score the choice (needs.ts, stores.ts);
//   hunt       patch prey that appeared (springtail, mite), chases the colony's ants began (phase hunt), escapes
//              from them, kills, chases that ended with the remains carried (item-collected from a hunt), vanished prey;
//   delivered  P brought home (delivery events, by kind), prey subdued by the colony's ants;
//   eaten      P fed to larvae and to the queen (feed events), the larvae's own P demand (inst.larvaP integrated);
//   lost       P spoiled in the stores (inst.spoilP integrated), larvae starved or cannibalised.
// Per arrival (colony-life round 10, direction 23 items 2 and 5): every protein source that appears in the radius, by
// kind and variant: found by the colony or not, game days from arrival to discovery, P the colony brought home from
// it, how it left (the removal cause), and the nearest any worker of the colony came to it while it stood (sampled).

import type { Ant, Sim } from '@/sim/types';
import { isWorkerCaste } from '@/sim/colony/census';
import { isDiscoveredBy } from '@/sim/ecology/sources/discovery';
import { patchKnownBy } from '@/sim/ants/behaviours/outdoor/hunt';
import { TICKS_PER_DAY } from '@/sim/time';
import { knownSources } from '@/sim/ants/behaviours/outdoor/choice';
import { nutrientWeights, poolSpace } from '@/sim/colony';
import { round } from './lifeMetrics';
import { FUNNEL_RADIUS_BU } from './lifeFunnel';

/** Sampling period of the standing census and of the rate integrals, ticks. */
const SAMPLE_TICKS = 300;
/** Outdoor engine phases a trip starts and arrives with (same values as lifeFunnel.ts PH). */
const PH_WAIT = 0, PH_OUTBOUND = 1, PH_DEPART = 10, PH_QUEUE = 3, PH_COLLECT = 4, PH_RETURN = 5, PH_HUNT = 14;
const PATCH_PREY = new Set(['springtail', 'mite']);

export interface ProteinDay {
  day: number;
  /** Mean over the day's samples: P held by protein sources in the radius, of it known to the colony, their count. */
  standP: number; knownP: number; sourcesP: number;
  /** Mean prey in patches reaching the radius, patches known to the colony (at the day's last sample). */
  patchPrey: number; patchesKnown: number;
  arrivedP: number; gone: Record<string, number>;
  tripsToP: number; tripsToPatch: number; arrivalsAtP: number;
  preyAppeared: number; chases: number; escapes: number; kills: number; remainsCarried: number; preyVanished: number;
  foragers: number; waiting: number; waitingKnowP: number; needP: number; wP: number; wC: number; roomP: number;
  delivered: Record<string, number>; deliveredP: number; preySubdued: number;
  fedLarvaeP: number; fedQueenP: number; larvalDemandP: number;
  spoiledP: number; storesP: number;
  larvaeStarved: number; larvaeCannibalised: number;
}

/** One protein source that appeared in the radius after the hand-over (round 10). */
interface Arrival {
  id: number; kind: string; p: number; day: number; tick: number;
  foundGd: number; homeP: number; fate: string; nearestBu: number;
}

/** Arrivals summed by source kind (and variant). */
export interface ArrivalKind {
  n: number; arrivedP: number; foundN: number; foundP: number; medianFoundGd: number; homeP: number;
  fates: Record<string, number>; medianNearestBuNotFound: number;
}

export interface ProteinReport {
  radiusBu: number;
  days: ProteinDay[];
  /** Round 10: arrivals by kind; the game days the report covers (for loads per gd). */
  arrivalsByKind?: Record<string, ArrivalKind>;
  arrivalDays?: number;
  totals: Omit<ProteinDay, 'day' | 'standP' | 'knownP' | 'sourcesP' | 'patchPrey' | 'patchesKnown' | 'storesP' | 'foragers' | 'waiting' | 'waitingKnowP' | 'needP' | 'wP' | 'wC' | 'roomP'> & {
    meanStandP: number; meanKnownP: number;
  };
}

const bump = (r: Record<string, number>, k: string, n = 1): void => { r[k] = (r[k] ?? 0) + n; };

function emptyDay(day: number): ProteinDay {
  return {
    day, standP: 0, knownP: 0, sourcesP: 0, patchPrey: 0, patchesKnown: 0, arrivedP: 0, gone: {}, tripsToP: 0, tripsToPatch: 0, arrivalsAtP: 0,
    preyAppeared: 0, chases: 0, escapes: 0, kills: 0, remainsCarried: 0, preyVanished: 0,
    foragers: 0, waiting: 0, waitingKnowP: 0, needP: 0, wP: 0, wC: 0, roomP: 0,
    delivered: {}, deliveredP: 0, preySubdued: 0, fedLarvaeP: 0, fedQueenP: 0, larvalDemandP: 0, spoiledP: 0, storesP: 0,
    larvaeStarved: 0, larvaeCannibalised: 0,
  };
}

export class ProteinLedger {
  private readonly col: number;
  private readonly t0: number;
  private readonly rows: ProteinDay[] = [];
  private cur: ProteinDay;
  private samples = 0;
  /** Last sampled P holding of each protein source in the radius (what it took with it when it went). */
  private readonly lastP = new Map<number, number>();
  private readonly lastPhase = new Map<number, number>();
  private readonly ids: number[] = [];
  /** Round 10: protein sources that appeared in the radius, by source id. */
  private readonly arrivals = new Map<number, Arrival>();
  /** Patch prey some ant of the colony has chased (creature ids). */
  private readonly chased = new Set<number>();

  constructor(private readonly sim: Sim) {
    this.col = sim.state.player.colonyId;
    this.t0 = sim.state.tick;
    this.cur = emptyDay(1);
    const mine = (antId: number): boolean => sim.stores.ants.get(antId)?.colony === this.col;
    sim.events.on('delivery', (e) => {
      if (e.colonyId !== this.col) return;
      bump(this.cur.delivered, e.kind, e.p); this.cur.deliveredP += e.p;
      const a = this.arrivals.get(e.sourceId);
      if (a) a.homeP += e.p;
    });
    sim.events.on('food-source-discovered', (e) => {
      const a = this.arrivals.get(e.sourceId);
      if (a && e.colonyId === this.col && a.foundGd < 0) a.foundGd = (sim.state.tick - a.tick) / TICKS_PER_DAY;
    });
    sim.events.on('feed', (e) => {
      if (!mine(e.giverId)) return;
      if (e.broodId >= 0) this.cur.fedLarvaeP += e.p;
      else if (e.receiverId === sim.stores.colonies.get(this.col)?.queenId) this.cur.fedQueenP += e.p;
    });
    sim.events.on('prey-subdued', (e) => { if (e.antIds.some(mine)) this.cur.preySubdued++; if (PATCH_PREY.has(e.kind) && e.antIds.some(mine)) this.cur.kills++; });
    sim.events.on('creature-spawned', (e) => { if (PATCH_PREY.has(e.kind)) this.cur.preyAppeared++; });
    sim.events.on('creature-despawned', (e) => { if (PATCH_PREY.has(e.kind) && e.cause === 'vanished') this.cur.preyVanished++; });
    // an escape is counted for the colony when one of its ants was chasing that prey
    sim.events.on('prey-escaped', (e) => { if (PATCH_PREY.has(e.kind) && this.chased.has(e.creatureId)) this.cur.escapes++; });
    sim.events.on('brood-died', (e) => {
      if (e.colonyId !== undefined && e.colonyId !== this.col) return;
      if (e.stage !== 'larva') return;
      if (e.cause === 'starvation') this.cur.larvaeStarved++;
      if (e.cause === 'cannibalised') this.cur.larvaeCannibalised++;
    });
    sim.events.on('food-source-spawned', (e) => {
      const s = sim.stores.sources.get(e.sourceId);
      const p = s ? this.heldP(s) : 0;
      if (s && p > 0 && this.inRadius(s.pos)) {
        this.cur.arrivedP += p; this.lastP.set(s.id, p);
        const kind = e.variant ? `${e.kind}:${e.variant}` : e.kind;
        this.arrivals.set(s.id, { id: s.id, kind, p, day: this.cur.day, tick: sim.state.tick, foundGd: isDiscoveredBy(sim, s, this.col) ? 0 : -1, homeP: 0, fate: 'standing', nearestBu: Infinity });
      }
    });
    sim.events.on('food-source-removed', (e) => {
      const p = this.lastP.get(e.sourceId);
      if (p === undefined) return;
      bump(this.cur.gone, e.cause, p); this.lastP.delete(e.sourceId);
      const a = this.arrivals.get(e.sourceId);
      if (a) a.fate = e.cause;
    });
  }

  private entrancePos(): { x: number; z: number } | null {
    for (const n of this.sim.stores.nests.list) {
      if (!n.alive || n.colony !== this.col) continue;
      const e = n.entrances.find((x) => x.status !== 'sealed') ?? n.entrances[0];
      if (e) return e.pos;
    }
    return null;
  }

  private inRadius(pos: { x: number; z: number }): boolean {
    const e = this.entrancePos();
    if (!e) return false;
    const r = FUNNEL_RADIUS_BU * this.sim.world.bu, dx = pos.x - e.x, dz = pos.z - e.z;
    return dx * dx + dz * dz <= r * r;
  }

  /** P a source holds now if it is a protein source (more P than C per unit), else 0. */
  private heldP(s: { alive: boolean; p: number; c: number; pool: number; units: number }): number {
    if (!s.alive || s.p <= s.c) return 0;
    return Math.max(0, s.pool >= 0 ? s.pool : s.units) * s.p;
  }

  /** Call once after every sim.tick(). */
  tick(): void {
    const sim = this.sim, tick = sim.state.tick;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || !isWorkerCaste(a.caste)) continue;
      if (a.task === 'forage' || a.task === 'scout') this.watchHunt(a);
      if (a.task === 'forage') this.watchTrip(a);
    }
    if (tick % SAMPLE_TICKS === 0) this.sample();
    if ((tick - this.t0) % TICKS_PER_DAY === 0 && tick > this.t0) this.closeDay();
  }

  private readonly huntPhase = new Map<number, number>();

  /** Chases begun (phase becomes hunt) and chases that end on the way home with the remains (forager or scout). */
  private watchHunt(a: Ant): void {
    const ph = a.bb['fo.ph'] ?? -1;
    const prev = this.huntPhase.get(a.id) ?? -1;
    if (ph === prev) return;
    this.huntPhase.set(a.id, ph);
    if (ph === PH_HUNT) { this.cur.chases++; const c = a.bb['fo.prey'] ?? -1; if (c >= 0) this.chased.add(c); }
    if (prev === PH_HUNT && ph === PH_RETURN && a.carry.kind === 'item') this.cur.remainsCarried++;
  }

  private watchTrip(a: Ant): void {
    const ph = a.bb['fo.ph'] ?? -1;
    const prev = this.lastPhase.get(a.id) ?? -1;
    if (ph === prev) return;
    this.lastPhase.set(a.id, ph);
    const setsOut = (ph === PH_OUTBOUND || ph === PH_DEPART) && prev !== PH_OUTBOUND && prev !== PH_DEPART;
    if (setsOut && (a.bb['fo.patch'] ?? -1) >= 0) this.cur.tripsToPatch++;
    const s = this.sim.stores.sources.get(a.bb['fo.src'] ?? -1);
    if (!s || s.p <= s.c) return;
    if (setsOut) this.cur.tripsToP++;
    if ((ph === PH_QUEUE || ph === PH_COLLECT) && prev !== PH_QUEUE && prev !== PH_COLLECT) this.cur.arrivalsAtP++;
  }

  private sample(): void {
    const sim = this.sim, d = this.cur, dtGd = SAMPLE_TICKS / TICKS_PER_DAY;
    this.samples++;
    let stand = 0, known = 0, n = 0;
    for (const s of sim.stores.sources.list) {
      const p = this.heldP(s);
      if (p <= 0 || !this.inRadius(s.pos)) continue;
      this.lastP.set(s.id, p);
      stand += p; n++;
      if (isDiscoveredBy(sim, s, this.col)) known += p;
    }
    d.standP += stand; d.knownP += known; d.sourcesP += n;
    this.sampleNearest();
    const e = this.entrancePos(), bu = sim.world.bu;
    let prey = 0, kn = 0;
    if (e) {
      for (const p of sim.state.ecology.preyPatches) {
        const edge = (Math.sqrt((p.center.x - e.x) ** 2 + (p.center.z - e.z) ** 2) - p.radius) / bu;
        if (edge > FUNNEL_RADIUS_BU) continue;
        prey += p.count;
        if (patchKnownBy(sim, p, this.col)) kn++;
      }
    }
    d.patchPrey += prey; d.patchesKnown = kn;
    const col = sim.stores.colonies.get(this.col);
    if (col) {
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== this.col || a.task !== 'forage') continue;
        d.foragers++;
        if (a.nestId < 0 || (a.bb['fo.ph'] ?? 0) !== PH_WAIT) continue;
        d.waiting++;
        if (knownSources(sim, a, this.ids).some((id) => { const s = sim.stores.sources.get(id); return !!s && this.heldP(s) > 0; })) d.waitingKnowP++;
      }
      const w = nutrientWeights(col);
      d.needP += col.needs.needP; d.wP += w.wP; d.wC += w.wC; d.roomP += poolSpace(col).p;
    }
    const acc = col?.core?.acc;
    if (acc) {
      d.larvalDemandP += (acc['inst.larvaP'] ?? 0) * dtGd;
      d.spoiledP += (acc['inst.spoilP'] ?? 0) * dtGd;
    }
  }

  /** Nearest approach of any outside worker of the colony to each standing arrival not yet found (round 10). */
  private sampleNearest(): void {
    const sim = this.sim, bu = sim.world.bu;
    const open: Arrival[] = [];
    for (const a of this.arrivals.values()) if (a.fate === 'standing' && a.foundGd < 0) open.push(a);
    if (open.length === 0) return;
    for (const ant of sim.stores.ants.list) {
      if (!ant.alive || ant.colony !== this.col || ant.nestId >= 0 || !isWorkerCaste(ant.caste)) continue;
      for (const a of open) {
        const s = sim.stores.sources.get(a.id);
        if (!s) continue;
        const dx = ant.pos.x - s.pos.x, dz = ant.pos.z - s.pos.z, dBu = Math.sqrt(dx * dx + dz * dz) / bu;
        if (dBu < a.nearestBu) a.nearestBu = dBu;
      }
    }
  }

  private arrivalSummary(): Record<string, ArrivalKind> {
    const by = new Map<string, Arrival[]>();
    for (const a of this.arrivals.values()) { const l = by.get(a.kind) ?? []; l.push(a); by.set(a.kind, l); }
    const med = (xs: number[]) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? round(v[Math.floor(v.length / 2)]) : -1; };
    const out: Record<string, ArrivalKind> = {};
    for (const [k, l] of [...by.entries()].sort()) {
      const found = l.filter((a) => a.foundGd >= 0), fates: Record<string, number> = {};
      for (const a of l) bump(fates, a.fate, round(a.p));
      out[k] = {
        n: l.length, arrivedP: round(l.reduce((x, a) => x + a.p, 0)), foundN: found.length,
        foundP: round(found.reduce((x, a) => x + a.p, 0)), medianFoundGd: med(found.map((a) => a.foundGd)),
        homeP: round(l.reduce((x, a) => x + a.homeP, 0)), fates,
        medianNearestBuNotFound: med(l.filter((a) => a.foundGd < 0).map((a) => a.nearestBu)),
      };
    }
    return out;
  }

  private closeDay(): void {
    const d = this.cur, k = Math.max(1, this.samples);
    d.standP /= k; d.knownP /= k; d.sourcesP /= k; d.patchPrey /= k;
    d.foragers /= k; d.waiting /= k; d.waitingKnowP /= k; d.needP /= k; d.wP /= k; d.wC /= k; d.roomP /= k;
    d.storesP = this.sim.stores.colonies.get(this.col)?.stores.p ?? 0;
    this.rows.push(d);
    this.cur = emptyDay(d.day + 1);
    this.samples = 0;
  }

  result(): ProteinReport {
    if (this.samples > 0) this.closeDay();
    const r = (x: number) => round(x);
    const days = this.rows.map((d) => ({
      ...d, foragers: r(d.foragers), waiting: r(d.waiting), waitingKnowP: r(d.waitingKnowP), needP: r(d.needP), wP: r(d.wP), wC: r(d.wC), roomP: r(d.roomP),
      standP: r(d.standP), knownP: r(d.knownP), sourcesP: r(d.sourcesP), patchPrey: r(d.patchPrey),
      arrivedP: r(d.arrivedP), gone: Object.fromEntries(Object.entries(d.gone).map(([c, v]) => [c, r(v)])),
      delivered: Object.fromEntries(Object.entries(d.delivered).map(([c, v]) => [c, r(v)])), deliveredP: r(d.deliveredP),
      fedLarvaeP: r(d.fedLarvaeP), fedQueenP: r(d.fedQueenP), larvalDemandP: r(d.larvalDemandP), spoiledP: r(d.spoiledP), storesP: r(d.storesP),
    }));
    const sum = (f: (d: ProteinDay) => number) => r(this.rows.reduce((x, d) => x + f(d), 0));
    const merge = (f: (d: ProteinDay) => Record<string, number>) => {
      const o: Record<string, number> = {};
      for (const d of this.rows) for (const [c, v] of Object.entries(f(d))) bump(o, c, v);
      return Object.fromEntries(Object.entries(o).map(([c, v]) => [c, r(v)]));
    };
    const nd = Math.max(1, this.rows.length);
    return {
      radiusBu: FUNNEL_RADIUS_BU, days, arrivalsByKind: this.arrivalSummary(), arrivalDays: this.rows.length,
      totals: {
        meanStandP: r(sum((d) => d.standP) / nd), meanKnownP: r(sum((d) => d.knownP) / nd),
        arrivedP: sum((d) => d.arrivedP), gone: merge((d) => d.gone), tripsToP: sum((d) => d.tripsToP), tripsToPatch: sum((d) => d.tripsToPatch),
        preyAppeared: sum((d) => d.preyAppeared), chases: sum((d) => d.chases), escapes: sum((d) => d.escapes), kills: sum((d) => d.kills),
        remainsCarried: sum((d) => d.remainsCarried), preyVanished: sum((d) => d.preyVanished), arrivalsAtP: sum((d) => d.arrivalsAtP),
        delivered: merge((d) => d.delivered), deliveredP: sum((d) => d.deliveredP), preySubdued: sum((d) => d.preySubdued),
        fedLarvaeP: sum((d) => d.fedLarvaeP), fedQueenP: sum((d) => d.fedQueenP), larvalDemandP: sum((d) => d.larvalDemandP),
        spoiledP: sum((d) => d.spoiledP), larvaeStarved: sum((d) => d.larvaeStarved), larvaeCannibalised: sum((d) => d.larvaeCannibalised),
      },
    };
  }
}
