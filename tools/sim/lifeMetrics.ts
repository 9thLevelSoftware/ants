// Per-game-day colony read-out for tools/sim/life.ts: event counters (subscribed once), a state snapshot at the end
// of each day, a stuck-walker sampler, and the health verdict of a run. Reads only; never writes sim state.

import type { Ant, Sim, SimEvent } from '@/sim/types';
import { TRAIL_DETECT } from '@/sim/balance/pheromone';
import { isWorkerCaste } from '@/sim/colony/census';
import { stateTimeoutTicks } from '@/sim/ants/behaviours/nest/fsm';
import { speedMult } from '@/sim/environment/thermalResponse';
import { layingProteinPermitted } from '@/sim/colony/queen';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';

/** Event counts over one game day. */
export interface DayEvents {
  tripsStarted: number;
  deliveries: number;
  deliveredC: number;
  deliveredP: number;
  deliveriesByKind: Record<string, number>;
  deathsByCause: Record<string, number>;
  broodDeathsByCause: Record<string, number>;
  eggsLaid: number;
  eclosions: number;
  plansCreated: number;
  plansCompleted: number;
  pelletsMade: number;
  pelletsDumped: number;
  actionFailures: Record<string, number>;
  trailsEstablished: number;
}

function emptyEvents(): DayEvents {
  return {
    tripsStarted: 0, deliveries: 0, deliveredC: 0, deliveredP: 0, deliveriesByKind: {}, deathsByCause: {},
    broodDeathsByCause: {}, eggsLaid: 0, eclosions: 0, plansCreated: 0, plansCompleted: 0, pelletsMade: 0,
    pelletsDumped: 0, actionFailures: {}, trailsEstablished: 0,
  };
}

const bump = (r: Record<string, number>, k: string, n = 1): void => { r[k] = (r[k] ?? 0) + n; };

/** Is the plan one of the player colony's nests' plans? */
function playerPlan(sim: Sim, planId: number): boolean {
  const col = sim.state.player.colonyId;
  return sim.state.nests.some((n) => n.alive && n.colony === col && n.digPlans.some((p) => p.id === planId));
}

/** Counts the player colony's events into `day` (reset by the caller at each day boundary). */
export class EventCounter {
  day: DayEvents = emptyEvents();
  /** Plans of the player's nests seen created, and pellets its ants made (to attribute completions and dumps). */
  private readonly myPlans = new Set<number>();
  private readonly myPellets = new Set<number>();
  constructor(private readonly sim: Sim) {
    const col = (): number => sim.state.player.colonyId;
    const mine = (antId: number): boolean => sim.stores.ants.get(antId)?.colony === col();
    const on = <T extends SimEvent['type']>(t: T, f: (e: Extract<SimEvent, { type: T }>) => void): void => {
      sim.events.on(t, f as never);
    };
    on('forager-departed', (e) => { if (mine(e.antId)) this.day.tripsStarted++; });
    on('delivery', (e) => {
      if (e.colonyId !== col()) return;
      this.day.deliveries++; this.day.deliveredC += e.c; this.day.deliveredP += e.p; bump(this.day.deliveriesByKind, e.kind);
    });
    on('ant-died', (e) => { if (e.colonyId === col()) bump(this.day.deathsByCause, `${e.caste}:${e.cause}`); });
    on('brood-died', (e) => { if (e.colonyId === undefined || e.colonyId === col()) bump(this.day.broodDeathsByCause, `${e.stage}:${e.cause}`); });
    // rival colonies lay, plan and dig too (Stage 1B): every count below is filtered to the player colony
    on('egg-laid', (e) => {
      const brood = sim.stores.brood.get(e.broodId);
      if (brood ? brood.colony === col() : mine(e.queenId)) this.day.eggsLaid++;
    });
    on('ant-eclosed', (e) => { if (e.colonyId === col()) this.day.eclosions++; });
    on('plan-created', (e) => {
      if (!playerPlan(sim, e.planId)) return;
      this.myPlans.add(e.planId); this.day.plansCreated++;
    });
    on('plan-complete', (e) => { if (this.myPlans.delete(e.planId) || playerPlan(sim, e.planId)) this.day.plansCompleted++; });
    on('pellet-created', (e) => { if (mine(e.antId)) { this.myPellets.add(e.itemId); this.day.pelletsMade++; } });
    on('pellet-dumped', (e) => { if (this.myPellets.delete(e.itemId)) this.day.pelletsDumped++; });
    on('trail-established', (e) => { if (e.colonyId === col()) this.day.trailsEstablished++; });
    on('action-failed', (e) => { if (mine(e.antId)) bump(this.day.actionFailures, `${e.action}:${e.reason}`); });
  }
  take(): DayEvents {
    const d = this.day;
    this.day = emptyEvents();
    return d;
  }
}

/**
 * Walkers that should be moving but are not: sampled every SAMPLE_S; an ant whose nav status stayed 'moving' while
 * it moved less than 1 BU over STUCK_SAMPLES consecutive samples is stuck. In-nest FSM states past 1.5 x their own
 * timeout are counted separately (the timeout should have restarted them).
 */
export class StuckSampler {
  static readonly SAMPLE_S = 30;
  static readonly STUCK_SAMPLES = 6;
  private last = new Map<number, { x: number; y: number; z: number; n: number }>();
  stuckNow = new Set<number>();
  dayMaxStuck = 0;
  dayStuckIds = new Set<number>();
  dayTimeouts = new Set<number>();
  /** Per stuck ant (first time flagged in the day): state, nav, where (BU), for the diagnosis. */
  dayStuckWhat = new Map<number, string>();
  /** Samples of the day where the queen could lay (potential > 0.5 egg/gd) and the workers permitted laying protein. */
  dayLayOpen = 0;
  constructor(private readonly sim: Sim) {}

  sample(): void {
    const sim = this.sim, bu = sim.world.bu, col = sim.state.player.colonyId;
    this.stuckNow.clear();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col || a.caste === 'queen') continue;
      const p = this.last.get(a.id);
      // a walker the cold (or heat) holds still is not stuck: GDD 06 §2.6 speedMult(Tb) near 0
      const able = speedMult(sim, a.tb, sim.stores.colonies.get(a.colony)?.species ?? sim.species.id) > 0.05;
      const moving = a.nav.status === 'moving' && able;
      if (!p || !moving || Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z) > bu) {
        this.last.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, n: 0 });
      } else if (++p.n >= StuckSampler.STUCK_SAMPLES) {
        this.stuckNow.add(a.id); this.dayStuckIds.add(a.id);
        if (!this.dayStuckWhat.has(a.id)) {
          this.dayStuckWhat.set(a.id, `${a.id} ${a.task}/${a.state} nav ${a.nav.mode} ${a.medium} nest ${a.nestId} at ${(a.pos.x / bu).toFixed(0)},${(a.pos.y / bu).toFixed(1)},${(a.pos.z / bu).toFixed(0)}`);
        }
      }
      if (a.nestId >= 0 && /^(nurse|dig|haul|store|queen-care|idle|rest|guard)\./.test(a.state)
        && sim.state.tick - a.stateTick > 1.5 * stateTimeoutTicks(a.state)) this.dayTimeouts.add(a.id);
    }
    for (const id of this.last.keys()) if (!sim.stores.ants.get(id)) this.last.delete(id);
    const pc = sim.stores.colonies.get(col);
    // read-only: with the colony cycle's census snapshot present, layingProteinPermitted touches no per-tick cache
    const acc = pc?.core?.acc;
    if (pc && acc && acc['cen.valid'] === 1 && (acc['lay.potential'] ?? 0) > 0.5 && layingProteinPermitted(sim, pc)) this.dayLayOpen++;
    if (this.stuckNow.size > this.dayMaxStuck) this.dayMaxStuck = this.stuckNow.size;
  }

  take(): { maxStuck: number; stuckAnts: number; overTimeout: number; stuckWhat: string[]; layOpenGd: number } {
    const r = {
      maxStuck: this.dayMaxStuck, stuckAnts: this.dayStuckIds.size, overTimeout: this.dayTimeouts.size,
      stuckWhat: [...this.dayStuckWhat.values()].slice(0, 8), layOpenGd: round((this.dayLayOpen * SAMPLE_TICKS) / TICKS_PER_DAY),
    };
    this.dayMaxStuck = 0; this.dayStuckIds.clear(); this.dayTimeouts.clear(); this.dayStuckWhat.clear(); this.dayLayOpen = 0;
    return r;
  }
}

/** State read-out at a day boundary. */
export interface DayState {
  day: number;
  tick: number;
  season: string;
  workers: number;
  byCaste: Record<string, number>;
  queenAlive: boolean;
  eggs: number;
  larvae: number;
  pupae: number;
  meanLarvalHunger: number;
  storesC: number;
  storesP: number;
  starvationStage: string;
  /** Queen's laying potential at the day end, eggs per gd (season x temperature x health x size; GDD 02 §3.1). */
  layPotential: number;
  nestVolumeBu3: number;
  chambers: Record<string, number>;
  entrancesOpen: number;
  pelletsInNest: number;
  trailCells: number;
  outside: number;
  byState: Record<string, number>;
  byTask: Record<string, number>;
  /** The colony's need-rate EMAs (consumption, GDD 02 §5.5) and forager yield EMA at the day end, loads/gd. */
  needRateC?: number;
  needRateP?: number;
  yieldPerForager?: number;
  /** Mean temperature of the chambers holding brood (else the royal / founding cell) at the day end, C; null none. */
  broodTempC?: number | null;
  /** Adult carbohydrate need (worker upkeep + queen C) of the last colony cycle, loads/gd (viable verdict). */
  adultNeedC?: number;
}

export function readState(sim: Sim, day: number, season: string): DayState {
  const s = sim.state, col = sim.stores.colonies.get(s.player.colonyId);
  const byCaste: Record<string, number> = {}, byState: Record<string, number> = {}, byTask: Record<string, number> = {};
  let workers = 0, outside = 0, queenAlive = false;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== s.player.colonyId) continue;
    bump(byCaste, a.caste);
    if (a.caste === 'queen') { queenAlive = true; continue; }
    if (isWorkerCaste(a.caste)) workers++;
    bump(byState, a.state);
    bump(byTask, a.task);
    if (a.nestId < 0) outside++;
  }
  let eggs = 0, larvae = 0, pupae = 0, hunger = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== s.player.colonyId) continue;
    if (b.stage === 'egg') eggs++; else if (b.stage === 'larva') { larvae++; hunger += b.hunger; } else if (b.stage === 'pupa') pupae++;
  }
  const chambers: Record<string, number> = {};
  let volume = 0, open = 0, pellets = 0, broodT = 0, broodN = 0, cellT = 0, cellN = 0;
  for (const n of sim.stores.nests.list) {
    if (!n.alive || n.colony !== s.player.colonyId) continue;
    volume += n.volumeOpen;
    for (const c of n.chambers) {
      bump(chambers, c.type);
      if (c.occupancy.brood > 0) { broodT += c.temp; broodN++; }
      if (c.type === 'royal' || c.type === 'founding') { cellT += c.temp; cellN++; }
    }
    for (const e of n.entrances) if (e.status === 'open') open++;
  }
  const broodTempC = broodN > 0 ? round(broodT / broodN) : cellN > 0 ? round(cellT / cellN) : null;
  const mine = new Set(sim.stores.nests.list.filter((n) => n.alive && n.colony === s.player.colonyId).map((n) => n.id));
  for (const it of sim.stores.items.list) {
    if (it.alive && it.kind === 'soil-pellet' && mine.has(it.nestId) && it.carrierIds.length === 0) pellets++;
  }
  return {
    day, tick: s.tick, season, workers, byCaste, queenAlive, eggs, larvae, pupae,
    meanLarvalHunger: larvae > 0 ? round(hunger / larvae) : 0,
    storesC: round(col?.stores.c ?? 0), storesP: round(col?.stores.p ?? 0), starvationStage: col?.starvationStage ?? '-',
    layPotential: round(col?.core?.acc['lay.potential'] ?? 0),
    nestVolumeBu3: round(volume), chambers, entrancesOpen: open, pelletsInNest: pellets,
    trailCells: trailCells(sim), outside, byState, byTask,
    needRateC: round(col?.needs.rateC ?? 0), needRateP: round(col?.needs.rateP ?? 0), yieldPerForager: round(col?.yieldPerForager ?? 0),
    broodTempC,
    adultNeedC: round((col?.core?.acc['inst.upkeepC'] ?? 0) + (col?.core?.acc['inst.queenC'] ?? 0)),
  };
}

/** Trail cells of the player colony at or above TRAIL_DETECT. */
export function trailCells(sim: Sim): number {
  let n = 0;
  for (const l of sim.state.phero.layers) {
    if (l.colony !== sim.state.player.colonyId || l.channel !== 'trail') continue;
    for (const c of l.chunks) for (let i = 0; i < c.length; i++) if (c[i] >= TRAIL_DETECT) n++;
  }
  return n;
}

export const round = (v: number): number => Math.round(v * 1000) / 1000;

/** True for an ant the tool counts as a forager trip-maker (debug read-outs). */
export function isOutsideWorker(a: Ant): boolean {
  return a.alive && isWorkerCaste(a.caste) && a.nestId < 0;
}

export const SAMPLE_TICKS = StuckSampler.SAMPLE_S * TICKS_PER_SECOND;
export const DAY_TICKS = TICKS_PER_DAY;
