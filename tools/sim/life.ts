// Colony-life run (int-1B-sim deliverable 3): a new game on a generated world, the founding completed through the
// founding module's own state machine at full speed (cheat.completeFounding: template carve, real seal, the colony's
// own laying, the time-lapse in the real environment, hand-over), then N game days with no player. Logs one row per
// game day and a health verdict; JSON on stdout (and --out), a Markdown table on stderr (and --out).
//
//   node tools/sim/run-ts.mjs tools/sim/life.ts --seed 1 --archetype woodland-edge --days 10
//   options: --seed S (1)  --archetype ID (woodland-edge)  --species ID (lasius-niger)  --difficulty ID (naturalist)
//            --days N (10)  --until-day D (instead of --days: live until game day D counted from the game start,
//                      founding included; whole days)  --until winter (instead: live until the first tick of
//                      Winter 1; the viable verdict reads that state)  --out DIR (write life-<archetype>-<seed>.json /
//                      .md there)  --cache-any (with --cache: reuse a hand-over founded by older code, to iterate on
//                      the colony economy only; never for a final sweep)  --no-flood (probe-only: without the nest
//                      flood system)
//            --workers N (cheat: N extra workers at the start of colony life, to reach a colony size; economy check)
//            --food C,P (cheat: loads added to the stores with --workers)
//            --stores C,P (cheat: the stores set to these loads with --workers, e.g. 1,1 for the gate §6 "empty stores"
//                      economy check; econ-growth)  --every K (invariant check period, 500)
//            --start-day D (start day of the season instead of the species default)
//            --start-doy D (start on default-year day D, 1-based: spring 1-7, summer 8-14, autumn 15-21; econ-growth)
//            --perf T (performance mode: after the set-up, 600 warm-up ticks, then 3 segments of T ticks; the
//                      report's `perf` holds per-system ms per tick of the fastest segment; no day loop)
//            --cache DIR (development: reuse a snapshot taken at the hand-over for the same world, options and
//                      simulation code: the file name carries a hash of src/sim, src/worldgen and src/core, so any
//                      code change founds afresh)
//
// Wall clock and console live here, never in src/sim.

import type { ArchetypeId, DifficultyId, Sim, SpeciesId, System } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import { requireSpecies } from '@/sim/species';
import { foundingView } from '@/sim/colony/founding/view';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing/invariants';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';
import { EventCounter, readState, round, SAMPLE_TICKS, StuckSampler, type DayEvents, type DayState } from './lifeMetrics';
import { judge, type Verdict } from './lifeHealth';
import { deathsByCause, judgeViable, tripsPerForagerDay, tripsPerWorkerDay, type ViableVerdict } from './lifeViable';
import { stageRank } from '@/sim/colony/starvation';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';
import { HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P } from '@/sim/balance';
import { SEASONS } from '@/sim/types';
import { FoundingObserver, FunnelObserver, funnelMarkdown, type FunnelReport } from './lifeFunnel';

declare const process: { exitCode?: number };

export interface LifeOptions {
  seed: number;
  archetype: ArchetypeId;
  species: SpeciesId;
  difficulty: DifficultyId;
  days: number;
  out: string | null;
  workers: number;
  food: [number, number];
  every: number;
  startDay: number | null;
  cache: string | null;
  perf: number;
  untilDay: number;
  /** Live until the first tick of Winter 1 (`--until winter`). */
  untilWinter: boolean;
  /** Development: restore a cached hand-over whatever code founded it (`--cache-any`). */
  cacheAny: boolean;
  /**
   * Probe-only guard (`--no-flood`): the nest flood system is left out of the system list (viab-economy: the flood
   * model drowned dry nests; weather-fix2 owns it). Never in a verdict without saying so.
   */
  noFlood: boolean;
  /** `--stores C,P`: the stores set to these loads after the --workers spawn (economy check), null = untouched. */
  stores: [number, number] | null;
  /** Start on this default-year day (1-based doy, `--start-doy`), season and day of season derived; null = default. */
  startDoy: number | null;
}

export function parseLifeArgs(args: readonly string[]): LifeOptions {
  const o: LifeOptions = {
    seed: 1, archetype: 'woodland-edge', species: 'lasius-niger', difficulty: 'naturalist', days: 10, out: null,
    workers: 0, food: [0, 0], every: 500, startDay: null, cache: null, perf: 0, untilDay: 0, untilWinter: false, cacheAny: false, noFlood: false, startDoy: null, stores: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cache-any') { o.cacheAny = true; continue; }
    if (args[i] === '--no-flood') { o.noFlood = true; continue; }
    const k = args[i], v = args[++i];
    if (v === undefined) throw new Error(`life: ${k} needs a value`);
    if (k === '--seed') o.seed = Number(v);
    else if (k === '--archetype') o.archetype = v as ArchetypeId;
    else if (k === '--species') o.species = v as SpeciesId;
    else if (k === '--difficulty') o.difficulty = v as DifficultyId;
    else if (k === '--days') o.days = Number(v);
    else if (k === '--out') o.out = v;
    else if (k === '--workers') o.workers = Number(v);
    else if (k === '--food') { const [c, p] = v.split(',').map(Number); o.food = [c || 0, p || 0]; }
    else if (k === '--every') o.every = Math.max(1, Number(v));
    else if (k === '--start-day') o.startDay = Number(v);
    else if (k === '--start-doy') o.startDoy = Number(v);
    else if (k === '--stores') { const [c, p] = v.split(',').map(Number); o.stores = [c || 0, p || 0]; }
    else if (k === '--cache') o.cache = v;
    else if (k === '--perf') o.perf = Number(v);
    else if (k === '--until' && v === 'winter') o.untilWinter = true;
    else if (k === '--until-day') o.untilDay = Number(v);
    else throw new Error(`life: unknown option ${k}`);
  }
  return o;
}

/** `--start-doy`: the config's start season and day of season for default-year day `doy` (7-day seasons). */
function startOfDoy(doy: number | null): { startSeason?: (typeof SEASONS)[number]; startDayOfSeason?: number } {
  if (!doy || doy < 1) return {};
  const i = Math.min(2, Math.floor((doy - 1) / 7));
  return { startSeason: SEASONS[i], startDayOfSeason: doy - 7 * i };
}

/** Surface activity from which a colony short of food counts as able to forage (econ-growth sweep columns). */
const ECON_ACTIVITY_MIN = 0.5;

/**
 * econ-growth sweep columns, sampled every SAMPLE_TICKS over the colony-life days: trips (returns of forage, scout and
 * tend ants) per worker per gd while a nutrient is under its stock target and surface activity >= ECON_ACTIVITY_MIN,
 * the share of trips that succeed, and intake / need per nutrient (need = the colony's need-rate EMAs over time).
 */
class EconSampler {
  condGd = 0; condWorkerGd = 0; condTrips = 0;
  inC = 0; inP = 0; needCGd = 0; needPGd = 0;
  private lastTrips: number; private trips0: number; private succ0: number; private cond = false;
  constructor(private readonly sim: Sim) {
    const col = this.col();
    this.lastTrips = this.trips0 = col?.counters.trips ?? 0;
    this.succ0 = col?.counters.tripSuccesses ?? 0;
    sim.events.on('delivery', (e) => { if (e.colonyId === sim.state.player.colonyId) { this.inC += e.c; this.inP += e.p; } });
  }
  private col() { return this.sim.stores.colonies.get(this.sim.state.player.colonyId); }
  sample(): void {
    const col = this.col();
    if (!col) return;
    const dt = SAMPLE_TICKS / TICKS_PER_DAY;
    if (this.cond) this.condTrips += col.counters.trips - this.lastTrips;
    this.lastTrips = col.counters.trips;
    this.needCGd += col.needs.rateC * dt; this.needPGd += col.needs.rateP * dt;
    const short = col.needs.needC > 0 || col.needs.needP > 0;
    this.cond = short && surfaceActivityOf(this.sim, col.species) >= ECON_ACTIVITY_MIN;
    if (this.cond) { this.condGd += dt; this.condWorkerGd += (col.core?.workers ?? 0) * dt; }
  }
  result(larvaeStarved: number): NonNullable<LifeReport['econ']> {
    const col = this.col();
    const trips = (col?.counters.trips ?? 0) - this.trips0, succ = (col?.counters.tripSuccesses ?? 0) - this.succ0;
    return {
      larvaeStarved, underTargetGd: round(this.condGd),
      tripsPerWorkerGdUnderTarget: round(this.condWorkerGd > 0 ? this.condTrips / this.condWorkerGd : 0),
      trips, tripSuccessShare: round(trips > 0 ? succ / trips : 0),
      intakeOverNeedC: round(this.needCGd > 0 ? this.inC / this.needCGd : 0), intakeOverNeedP: round(this.needPGd > 0 ? this.inP / this.needPGd : 0),
    };
  }
}

interface SysTime { name: string; total: number; max: number; dayTotal: number; dayMax: number }

function timed(list: readonly System[], acc: SysTime[]): System[] {
  return list.map((s) => {
    const t: SysTime = { name: s.name, total: 0, max: 0, dayTotal: 0, dayMax: 0 };
    acc.push(t);
    return { ...s, run(sim: Sim) {
      const t0 = performance.now();
      s.run(sim);
      const dt = performance.now() - t0;
      t.total += dt; t.dayTotal += dt;
      if (dt > t.max) t.max = dt;
      if (dt > t.dayMax) t.dayMax = dt;
    } };
  });
}

export interface DayRow { state: DayState; events: DayEvents; stuck: { maxStuck: number; stuckAnts: number; overTimeout: number; stuckWhat?: string[]; layOpenGd?: number }; violations: number; msPerTick: number; topSystems: { name: string; avgMs: number; maxMs: number }[] }

export interface LifeReport {
  tool: 'life';
  options: LifeOptions;
  world: { fingerprint: string | number; genMs: number; sizeMm: number; bu: number; sources: number };
  /** `forcedSeal`: the real founding failed (phase and gd given) and the hand-over came from a forced seal. */
  founding: { phase: string; gd: number; workers: number; expected: { min: number; max: number }; outcome: unknown; ms: number; forcedSeal?: string };
  days: DayRow[];
  violations: InvariantViolation[];
  violationCount: number;
  systems: { name: string; avgMsPerTick: number; maxMs: number }[];
  msPerTick: number;
  /** Performance mode: ms per tick of the fastest segment, whole tick and per system; workers and outside ants. */
  perf?: { tickMs: number; segmentsMs: number[]; systems: Record<string, number>; workers: number; outside: number };
  /** stateHash of the final state (determinism across processes). */
  finalHash: string;
  verdict: Verdict;
  /** Viability (viab-economy): longest stretch at a stage worse than lean, trips per worker per gd, deaths. */
  economy?: { longestBadStageGd: number; tripsPerWorkerDay: number; tripsPerForagerDay: number; deaths: Record<string, number> };
  viable?: ViableVerdict;
  /** econ-growth columns (EconSampler). */
  econ?: {
    larvaeStarved: number; underTargetGd: number; tripsPerWorkerGdUnderTarget: number; trips: number;
    tripSuccessShare: number; intakeOverNeedC: number; intakeOverNeedP: number;
  };
  /** colony-life funnel (tools/sim/lifeFunnel.ts): where worker time, trips, food and brood go after the hand-over. */
  funnel?: FunnelReport;
  /** What the founding produced (absent for a cached hand-over): eggs, eclosions, brood and adult losses. */
  foundingFunnel?: { eggsLaid: number; eclosed: number; broodDeaths: Record<string, number>; adultDeaths: Record<string, number> };
}

/**
 * Runs the founding to hand-over; returns the opening phase reached. `forceSeal` (the fallback when the real founding
 * fails, viab-economy method "use cheat hand-overs where the real founding fails"): as soon as the template cell is
 * carved (phase `seal`) it is declared sealed by cheat.setFoundingState instead of the queen's own seal; the clutch,
 * the time-lapse in the real environment and the hand-over then run as usual.
 */
function found(sim: Sim, maxDays: number, forceSeal = false): string {
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const end = sim.state.tick + maxDays * TICKS_PER_DAY;
  const op = () => sim.state.player.opening;
  let forced = false;
  while (sim.state.tick < end) {
    sim.tick();
    const p = op()?.phase;
    if (forceSeal && !forced && p === 'seal') {
      sim.enqueue({ type: 'cheat.setFoundingState', nestId: -1, state: 'sealed' });
      forced = true;
    }
    if (p === 'handover' || p === 'failed' || op()?.done) break;
  }
  return op()?.done ? 'done' : (op()?.phase ?? 'none');
}

/**
 * File access for the development cache (injected: the tool's main has node:fs). `codeTag` identifies the
 * simulation code (a hash of its sources), so a snapshot founded by other code is never restored (int-1B review:
 * sweeps 2-3 judged the founding from sweep-1 snapshots).
 */
export interface LifeIO { read(path: string): Uint8Array | null; write(path: string, data: Uint8Array): void; codeTag: string }

export function runLife(o: LifeOptions, log: (s: string) => void = () => {}, io: LifeIO | null = null): LifeReport {
  const base = defaultGameConfig(o.species, o.seed, o.difficulty);
  const config = {
    ...base, cheats: true, ...(o.startDay ? { startDayOfSeason: o.startDay } : {}), ...startOfDoy(o.startDoy),
    world: { ...base.world, archetype: o.archetype },
  };
  const g0 = performance.now();
  const world = generateWorld(config.world);
  const genMs = performance.now() - g0;
  const cacheFile = o.cache && io
    ? `${o.cache}/founded-${o.species}-${o.archetype}-${o.seed}-${o.difficulty}-${o.startDoy ? `doy${o.startDoy}` : o.startDay ?? 'd'}-${o.cacheAny ? 'any' : io.codeTag}.bin` : null;
  const cached = cacheFile ? io!.read(cacheFile) : null;
  const times: SysTime[] = [];
  const systems = o.noFlood ? SYSTEMS.filter((s) => s.name !== 'nest-flood') : SYSTEMS;
  let state = cached ? restore(cached).state : createNewGame(config, world).state;
  let sim = createSim(state, world, { systems: timed(systems, times) });
  const invariants = collectInvariants();
  const violations: InvariantViolation[] = [];
  let violationCount = 0;
  log(`world ${o.archetype} #${o.seed}: ${round(genMs)} ms, ${state.sources.filter((s) => s.alive).length} sources`);

  const f0 = performance.now(), t0 = sim.state.tick;
  let fobs = cached ? null : new FoundingObserver(sim);
  let phase = cached ? (sim.state.player.opening?.phase ?? 'none') : found(sim, 16);
  let realFailure: string | null = null;
  if (!cached && phase !== 'handover' && phase !== 'done') {
    // the real founding failed (viab-founding's module): judge the economy from a forced hand-over of a fresh game
    realFailure = `${phase} after ${round(sim.state.tick / TICKS_PER_DAY)} gd`;
    log(`founding ${realFailure}: retrying with a forced seal`);
    for (const t of times) { t.total = 0; t.max = 0; }
    state = createNewGame(config, world).state;
    sim = createSim(state, world, { systems: timed(systems, times) });
    fobs = new FoundingObserver(sim);
    phase = found(sim, 16, true);
  }
  const counter = new EventCounter(sim);
  const stuck = new StuckSampler(sim);
  fobs?.stop(); // the founding funnel ends at the hand-over (sweep 1 review: it counted colony-life deaths)
  const econ = new EconSampler(sim);
  const funnel = new FunnelObserver(sim);
  if (cacheFile && !cached && !realFailure && (phase === 'handover' || phase === 'done')) io!.write(cacheFile, snapshot(sim)); // never a failed founding
  const foundMs = performance.now() - f0;
  const workers0 = readState(sim, 0, currentSeason(sim.state)).workers;
  const expected = requireSpecies(o.species).opening.expectedFirstWorkers;
  // a cached run restores the hand-over snapshot of a new game, which started at tick 0
  const founding = {
    phase, gd: round((cached ? sim.state.tick : sim.state.tick - t0) / TICKS_PER_DAY), workers: workers0, expected: { min: expected.min, max: expected.max },
    outcome: foundingView(sim)?.outcome ?? null, ms: round(foundMs), ...(realFailure ? { forcedSeal: realFailure } : {}),
  };
  log(`founding ${phase} after ${founding.gd} gd, ${workers0} workers (${round(foundMs / 1000)} s)${realFailure ? ' (forced seal)' : ''}`);
  if (o.workers > 0) {
    const col = sim.state.player.colonyId;
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col, n: o.workers, caste: 'worker', ageGd: 4, task: null, pos: null });
    if (o.food[0] > 0 || o.food[1] > 0) sim.enqueue({ type: 'cheat.addFood', colonyId: col, c: o.food[0], p: o.food[1], toxin: 0 });
    if (o.stores) {
      sim.enqueue({ type: 'cheat.setStores', colonyId: col, c: o.stores[0], p: o.stores[1] });
      // "empty stores": the hand-over provisioning (viab-economy R2) would move the queen's reserve above her keep
      // into the pool over the next game days, so she is set to her keep
      sim.enqueue({ type: 'cheat.setQueen', colonyId: col, values: { reserve: HANDOVER_QUEEN_KEEP_C, reserveP: HANDOVER_QUEEN_KEEP_P } });
    }
  }

  if (o.perf > 0) return perfReport(sim, o, times, { world, genMs, founding });
  const days: DayRow[] = [rowOf(sim, 0, counter, stuck, 0, 1, times)];
  for (const t of times) { t.dayTotal = 0; t.dayMax = 0; }
  let runMs = 0;
  const ticksPerDay = TICKS_PER_DAY;
  const nDays = o.untilWinter ? 400 : o.untilDay > 0 ? Math.max(1, Math.floor(o.untilDay - sim.state.tick / TICKS_PER_DAY)) : o.days;
  const playerCol = () => sim.stores.colonies.get(sim.state.player.colonyId);
  const lifeT0 = sim.state.tick;
  let badSince = -1, longestBad = 0, winter = false;
  for (let d = 1; d <= nDays && !winter; d++) {
    let dayViol = 0;
    const r0 = performance.now();
    let ticksToday = 0;
    for (let i = 0; i < ticksPerDay; i++) {
      sim.tick();
      funnel.tick();
      ticksToday++;
      if (sim.state.tick % SAMPLE_TICKS === 0) {
        stuck.sample();
        econ.sample();
        // a stage worse than lean (rationing and on), the stretch measured in game days (viable verdict)
        const st = playerCol()?.starvationStage;
        if (st && stageRank(st) >= 2) { if (badSince < 0) badSince = sim.state.tick; }
        else badSince = -1;
        if (badSince >= 0) longestBad = Math.max(longestBad, (sim.state.tick - badSince) / TICKS_PER_DAY);
      }
      if (o.untilWinter && currentSeason(sim.state) === 'winter') { winter = true; break; }
      if (sim.state.tick % o.every === 0) {
        const all: InvariantViolation[] = [];
        const n = checkInvariants(sim, invariants, all);
        dayViol += n; violationCount += n;
        for (const v of all) if (violations.length < 30) violations.push(v);
      }
    }
    const ms = performance.now() - r0;
    runMs += ms;
    const row = rowOf(sim, d, counter, stuck, dayViol, Math.max(1, ticksToday), times);
    row.msPerTick = round(ms / Math.max(1, ticksToday));
    days.push(row);
    for (const t of times) { t.dayTotal = 0; t.dayMax = 0; }
    const s = row.state;
    log(`day ${d} ${s.season}: ${s.workers} workers, brood ${s.eggs}/${s.larvae}/${s.pupae}, C ${s.storesC} P ${s.storesP}, ` +
      `trips ${row.events.tripsStarted} deliveries ${row.events.deliveries}, chambers ${JSON.stringify(s.chambers)}, ` +
      `stuck ${row.stuck.stuckAnts}, viol ${dayViol}, ${row.msPerTick} ms/tick`);
    if (!s.queenAlive && s.workers === 0) break;
  }
  const ticks = Math.max(1, sim.state.tick - lifeT0);
  const report: LifeReport = {
    tool: 'life', options: o,
    world: { fingerprint: world.meta.fingerprint, genMs: round(genMs), sizeMm: world.size, bu: world.bu, sources: state.sources.length },
    founding, days, violations, violationCount,
    systems: times.map((t) => ({ name: t.name, avgMsPerTick: round(t.total / Math.max(1, sim.state.tick - t0)), maxMs: round(t.max) }))
      .sort((a, b) => b.avgMsPerTick - a.avgMsPerTick),
    msPerTick: round(runMs / ticks),
    finalHash: stateHash(sim.state),
    verdict: { healthy: false, netGrowth: false, checks: [] },
  };
  report.verdict = judge(report);
  report.economy = { longestBadStageGd: round(longestBad), tripsPerWorkerDay: round(tripsPerWorkerDay(report)), tripsPerForagerDay: round(tripsPerForagerDay(report)), deaths: deathsByCause(report) };
  report.viable = judgeViable(report);
  const starvedLarvae = report.days.reduce((a, d) => a + (d.events.broodDeathsByCause['larva:starvation'] ?? 0), 0);
  report.econ = econ.result(starvedLarvae);
  report.funnel = funnel.result();
  if (fobs) report.foundingFunnel = { eggsLaid: fobs.eggsLaid, eclosed: fobs.eclosed, broodDeaths: fobs.deaths, adultDeaths: fobs.adultDeaths };
  return report;
}

/** Performance mode (see the header): the fastest of 3 segments, per system from that segment. */
function perfReport(sim: Sim, o: LifeOptions, times: SysTime[], ctx: { world: { meta: { fingerprint: string | number }; size: number; bu: number }; genMs: number; founding: LifeReport['founding'] }): LifeReport {
  for (let i = 0; i < 600; i++) sim.tick();
  const segs: number[] = [];
  // per system the minimum over the segments (each segment's mean ms per tick), so a load spike in one segment does
  // not hide in the figure of another system
  const best: Record<string, number> = {};
  for (let k = 0; k < 3; k++) {
    for (const t of times) t.dayTotal = 0;
    const t0 = performance.now();
    for (let i = 0; i < o.perf; i++) sim.tick();
    segs.push(round((performance.now() - t0) / o.perf));
    for (const t of times) best[t.name] = Math.min(best[t.name] ?? Infinity, round(t.dayTotal / o.perf));
  }
  const st = readState(sim, 0, currentSeason(sim.state));
  return {
    tool: 'life', options: o, world: { fingerprint: ctx.world.meta.fingerprint, genMs: round(ctx.genMs), sizeMm: ctx.world.size, bu: ctx.world.bu, sources: sim.state.sources.length },
    founding: ctx.founding, days: [], violations: [], violationCount: 0, systems: [], msPerTick: Math.min(...segs),
    perf: { tickMs: Math.min(...segs), segmentsMs: segs, systems: best, workers: st.workers, outside: st.outside },
    finalHash: stateHash(sim.state), verdict: { healthy: true, netGrowth: false, checks: [] },
  };
}

function rowOf(sim: Sim, d: number, counter: EventCounter, stuck: StuckSampler, viol: number, ticks: number, times: SysTime[]): DayRow {
  const topSystems = [...times].sort((a, b) => b.dayTotal - a.dayTotal).slice(0, 6)
    .map((t) => ({ name: t.name, avgMs: round(t.dayTotal / ticks), maxMs: round(t.dayMax) }));
  return { state: readState(sim, d, currentSeason(sim.state)), events: counter.take(), stuck: stuck.take(), violations: viol, msPerTick: 0, topSystems };
}

/** Markdown table of the per-day rows. */
export function lifeMarkdown(r: LifeReport): string {
  const o = r.options;
  const lines = [
    `### ${o.species} on ${o.archetype} #${o.seed} (${o.difficulty})`, '',
    `Founding: ${r.founding.phase} after ${r.founding.gd} gd with ${r.founding.workers} first workers (expected ${r.founding.expected.min}-${r.founding.expected.max})` +
    `${r.founding.forcedSeal ? ` **from a forced seal** (the real founding: ${r.founding.forcedSeal})` : ''}. ` +
    `Verdict: **${r.verdict.healthy ? 'healthy' : 'UNHEALTHY'}** (net worker growth: ${r.verdict.netGrowth ? 'yes' : 'no'}); ${r.violationCount} invariant violations; ${r.msPerTick} ms per tick; final stateHash ${r.finalHash}.`, '',
    '| day | season | workers | eggs/larvae/pupae | hunger | lay pot. | C | P | stage | departures (activation path only) | deliv. (C/P) | by kind | deaths | eggs laid | eclosed | plans +/done | pellets made/dumped/in nest | volume BU³ | chambers | trail cells | outside | stuck | over timeout | viol. | ms/tick |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const kv = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  for (const d of r.days) {
    const s = d.state, e = d.events;
    lines.push(`| ${s.day} | ${s.season} | ${s.workers} | ${s.eggs}/${s.larvae}/${s.pupae} | ${s.meanLarvalHunger} | ${s.layPotential} | ${s.storesC} | ${s.storesP} | ${s.starvationStage} | ` +
      `${e.tripsStarted} | ${e.deliveries} (${round(e.deliveredC)}/${round(e.deliveredP)}) | ${kv(e.deliveriesByKind)} | ${kv(e.deathsByCause)} | ${e.eggsLaid} | ${e.eclosions} | ` +
      `${e.plansCreated}/${e.plansCompleted} | ${e.pelletsMade}/${e.pelletsDumped}/${s.pelletsInNest} | ${s.nestVolumeBu3} | ${kv(s.chambers)} | ${s.trailCells} | ${s.outside} | ` +
      `${d.stuck.stuckAnts} | ${d.stuck.overTimeout} | ${d.violations} | ${d.msPerTick} |`);
  }
  lines.push('', 'Health checks:', ...r.verdict.checks.map((c) => `- ${c.ok ? 'ok' : 'FAIL'} ${c.name}: ${c.detail}`));
  if (r.viable) {
    lines.push('', `Viable: **${r.viable.viable ? 'yes' : 'NO'}**; trips per worker per gd ${r.economy?.tripsPerWorkerDay ?? '-'} (per forager ${r.economy?.tripsPerForagerDay ?? '-'}); deaths ${JSON.stringify(r.economy?.deaths ?? {})}`,
      ...r.viable.checks.map((c) => `- ${c.ok ? 'ok' : 'FAIL'} ${c.name}: ${c.detail}`));
  }
  if (r.econ) {
    const e = r.econ;
    lines.push('', `Economy (econ-growth): larvae starved ${e.larvaeStarved}; trips per worker per gd while a nutrient is under target `
      + `and surface activity >= ${ECON_ACTIVITY_MIN}: ${e.tripsPerWorkerGdUnderTarget} (over ${e.underTargetGd} gd); trips ${e.trips}, `
      + `${Math.round(e.tripSuccessShare * 100)} % successful; intake / need C ${e.intakeOverNeedC}, P ${e.intakeOverNeedP}`);
  }
  if (r.foundingFunnel) {
    const ff = r.foundingFunnel;
    lines.push('', `Founding funnel: eggs laid ${ff.eggsLaid}, eclosed ${ff.eclosed}, brood losses ${kv(ff.broodDeaths)}, adult deaths ${kv(ff.adultDeaths)}`);
  }
  if (r.funnel) lines.push(funnelMarkdown(r.funnel));
  const stuckDays = r.days.filter((d) => (d.stuck.stuckWhat ?? []).length > 0);
  if (stuckDays.length > 0) {
    lines.push('', 'Stuck ants (id task/state nav medium nest at x,y,z BU):');
    for (const d of stuckDays) lines.push(`- day ${d.state.day}: ${d.stuck.stuckWhat!.join('; ')}`);
  }
  lines.push('', 'Ants per behaviour state at the end: ' + kv(r.days[r.days.length - 1].state.byState));
  lines.push('', 'Slowest systems (ms per tick, whole run): ' + r.systems.slice(0, 8).map((s) => `${s.name} ${s.avgMsPerTick} (max ${s.maxMs})`).join(', '));
  return lines.join('\n');
}

interface NodeFs {
  mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string | Uint8Array): void; existsSync(p: string): boolean;
  readFileSync(p: string): Uint8Array; readdirSync(p: string, o: { recursive: true }): string[];
}

/** FNV-1a (32 bit) over the paths and bytes of every non-test .ts file under the directories, as 8 hex digits. */
function sourceTag(fs: NodeFs, dirs: string[]): string {
  let h = 0x811c9dc5;
  const mix = (b: number) => { h = Math.imul(h ^ b, 0x01000193) >>> 0; };
  for (const dir of dirs) {
    const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
    for (const f of files) {
      for (let i = 0; i < f.length; i++) mix(f.charCodeAt(i) & 255);
      const bytes = fs.readFileSync(`${dir}/${f}`);
      for (let i = 0; i < bytes.length; i++) mix(bytes[i]);
    }
  }
  return h.toString(16).padStart(8, '0');
}

export default async function main(args: string[]): Promise<void> {
  const o = parseLifeArgs(args);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const io: LifeIO = {
    read: (p) => (fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null),
    write: (p, d) => { fs.mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(p, d); },
    codeTag: o.cache ? sourceTag(fs, ['src/sim', 'src/worldgen', 'src/core']) : '',
  };
  const r = runLife(o, (s) => console.error(`[life] ${s}`), io);
  const md = r.perf ? `perf ${o.archetype} #${o.seed} +${o.workers} workers: ${JSON.stringify(r.perf)}` : lifeMarkdown(r);
  console.error(md);
  const json = JSON.stringify(r, null, 1);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    const base = `${o.out}/life-${o.species}-${o.archetype}-${o.seed}${o.workers ? `-w${o.workers}` : ''}`;
    fs.writeFileSync(`${base}.json`, json);
    fs.writeFileSync(`${base}.md`, md);
  } else console.log(json);
  if (!r.verdict.healthy) process.exitCode = 1;
}
