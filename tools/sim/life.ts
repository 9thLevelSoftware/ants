// Colony-life run (int-1B-sim deliverable 3): a new game on a generated world, the founding completed through the
// founding module's own state machine at full speed (cheat.completeFounding: template carve, real seal, the colony's
// own laying, the time-lapse in the real environment, hand-over), then N game days with no player. Logs one row per
// game day and a health verdict; JSON on stdout (and --out), a Markdown table on stderr (and --out).
//
//   node tools/sim/run-ts.mjs tools/sim/life.ts --seed 1 --archetype woodland-edge --days 10
//   options: --seed S (1)  --archetype ID (woodland-edge)  --species ID (lasius-niger)  --difficulty ID (naturalist)
//            --days N (10)  --until-day D (instead of --days: live until game day D counted from the game start,
//                      founding included; whole days)  --out DIR (write life-<archetype>-<seed>.json / .md there)
//            --workers N (cheat: N extra workers at the start of colony life, to reach a colony size; economy check)
//            --food C,P (cheat: loads added to the stores with --workers)  --every K (invariant check period, 500)
//            --start-day D (start day of the season instead of the species default)
//            --perf T (performance mode: after the set-up, 600 warm-up ticks, then 3 segments of T ticks; the
//                      report's `perf` holds per-system ms per tick of the fastest segment; no day loop)
//            --cache DIR (development: reuse a snapshot taken at the hand-over for the same world and options)
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
}

export function parseLifeArgs(args: readonly string[]): LifeOptions {
  const o: LifeOptions = {
    seed: 1, archetype: 'woodland-edge', species: 'lasius-niger', difficulty: 'naturalist', days: 10, out: null,
    workers: 0, food: [0, 0], every: 500, startDay: null, cache: null, perf: 0, untilDay: 0,
  };
  for (let i = 0; i < args.length; i++) {
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
    else if (k === '--cache') o.cache = v;
    else if (k === '--perf') o.perf = Number(v);
    else if (k === '--until-day') o.untilDay = Number(v);
    else throw new Error(`life: unknown option ${k}`);
  }
  return o;
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
  founding: { phase: string; gd: number; workers: number; expected: { min: number; max: number }; outcome: unknown; ms: number };
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
}

/** Runs the founding to hand-over; returns the opening phase reached. */
function found(sim: Sim, maxDays: number): string {
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const end = sim.state.tick + maxDays * TICKS_PER_DAY;
  const op = () => sim.state.player.opening;
  while (sim.state.tick < end) {
    sim.tick();
    const p = op()?.phase;
    if (p === 'handover' || p === 'failed' || op()?.done) break;
  }
  return op()?.done ? 'done' : (op()?.phase ?? 'none');
}

/** File access for the development cache (injected: the tool's main has node:fs). */
export interface LifeIO { read(path: string): Uint8Array | null; write(path: string, data: Uint8Array): void }

export function runLife(o: LifeOptions, log: (s: string) => void = () => {}, io: LifeIO | null = null): LifeReport {
  const base = defaultGameConfig(o.species, o.seed, o.difficulty);
  const config = {
    ...base, cheats: true, ...(o.startDay ? { startDayOfSeason: o.startDay } : {}),
    world: { ...base.world, archetype: o.archetype },
  };
  const g0 = performance.now();
  const world = generateWorld(config.world);
  const genMs = performance.now() - g0;
  const cacheFile = o.cache && io ? `${o.cache}/founded-${o.species}-${o.archetype}-${o.seed}-${o.difficulty}-${o.startDay ?? 'd'}.bin` : null;
  const cached = cacheFile ? io!.read(cacheFile) : null;
  const state = cached ? restore(cached).state : createNewGame(config, world).state;
  const times: SysTime[] = [];
  const sim = createSim(state, world, { systems: timed(SYSTEMS, times) });
  const counter = new EventCounter(sim);
  const stuck = new StuckSampler(sim);
  const invariants = collectInvariants();
  const violations: InvariantViolation[] = [];
  let violationCount = 0;
  log(`world ${o.archetype} #${o.seed}: ${round(genMs)} ms, ${state.sources.filter((s) => s.alive).length} sources`);

  const f0 = performance.now(), t0 = sim.state.tick;
  const phase = cached ? (sim.state.player.opening?.phase ?? 'none') : found(sim, 16);
  if (cacheFile && !cached) io!.write(cacheFile, snapshot(sim));
  const foundMs = performance.now() - f0;
  const workers0 = readState(sim, 0, currentSeason(sim.state)).workers;
  const expected = requireSpecies(o.species).opening.expectedFirstWorkers;
  const founding = {
    phase, gd: round((sim.state.tick - t0) / TICKS_PER_DAY), workers: workers0, expected: { min: expected.min, max: expected.max },
    outcome: foundingView(sim)?.outcome ?? null, ms: round(foundMs),
  };
  log(`founding ${phase} after ${founding.gd} gd, ${workers0} workers (${round(foundMs / 1000)} s)`);
  counter.take(); stuck.take();
  if (o.workers > 0) {
    const col = sim.state.player.colonyId;
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col, n: o.workers, caste: 'worker', ageGd: 4, task: null, pos: null });
    if (o.food[0] > 0 || o.food[1] > 0) sim.enqueue({ type: 'cheat.addFood', colonyId: col, c: o.food[0], p: o.food[1], toxin: 0 });
  }

  if (o.perf > 0) return perfReport(sim, o, times, { world, genMs, founding });
  const days: DayRow[] = [rowOf(sim, 0, counter, stuck, 0, 1, times)];
  for (const t of times) { t.dayTotal = 0; t.dayMax = 0; }
  let runMs = 0;
  const ticksPerDay = TICKS_PER_DAY;
  const nDays = o.untilDay > 0 ? Math.max(1, Math.floor(o.untilDay - sim.state.tick / TICKS_PER_DAY)) : o.days;
  for (let d = 1; d <= nDays; d++) {
    let dayViol = 0;
    const r0 = performance.now();
    for (let i = 0; i < ticksPerDay; i++) {
      sim.tick();
      if (sim.state.tick % SAMPLE_TICKS === 0) stuck.sample();
      if (sim.state.tick % o.every === 0) {
        const all: InvariantViolation[] = [];
        const n = checkInvariants(sim, invariants, all);
        dayViol += n; violationCount += n;
        for (const v of all) if (violations.length < 30) violations.push(v);
      }
    }
    const ms = performance.now() - r0;
    runMs += ms;
    const row = rowOf(sim, d, counter, stuck, dayViol, ticksPerDay, times);
    row.msPerTick = round(ms / ticksPerDay);
    days.push(row);
    for (const t of times) { t.dayTotal = 0; t.dayMax = 0; }
    const s = row.state;
    log(`day ${d} ${s.season}: ${s.workers} workers, brood ${s.eggs}/${s.larvae}/${s.pupae}, C ${s.storesC} P ${s.storesP}, ` +
      `trips ${row.events.tripsStarted} deliveries ${row.events.deliveries}, chambers ${JSON.stringify(s.chambers)}, ` +
      `stuck ${row.stuck.stuckAnts}, viol ${dayViol}, ${row.msPerTick} ms/tick`);
    if (!s.queenAlive && s.workers === 0) break;
  }
  const ticks = Math.max(1, (days.length - 1) * ticksPerDay);
  const report: LifeReport = {
    tool: 'life', options: o,
    world: { fingerprint: world.meta.fingerprint, genMs: round(genMs), sizeMm: world.size, bu: world.bu, sources: state.sources.length },
    founding, days, violations, violationCount,
    systems: times.map((t) => ({ name: t.name, avgMsPerTick: round(t.total / Math.max(1, sim.state.tick - t0)), maxMs: round(t.max) }))
      .sort((a, b) => b.avgMsPerTick - a.avgMsPerTick),
    msPerTick: round(runMs / ticks),
    finalHash: stateHash(sim.state),
    verdict: { healthy: false, checks: [] },
  };
  report.verdict = judge(report);
  return report;
}

/** Performance mode (see the header): the fastest of 3 segments, per system from that segment. */
function perfReport(sim: Sim, o: LifeOptions, times: SysTime[], ctx: { world: { meta: { fingerprint: string | number }; size: number; bu: number }; genMs: number; founding: LifeReport['founding'] }): LifeReport {
  for (let i = 0; i < 600; i++) sim.tick();
  const segs: number[] = [];
  let best: Record<string, number> = {};
  for (let k = 0; k < 3; k++) {
    for (const t of times) t.dayTotal = 0;
    const t0 = performance.now();
    for (let i = 0; i < o.perf; i++) sim.tick();
    const ms = (performance.now() - t0) / o.perf;
    segs.push(round(ms));
    if (ms <= Math.min(...segs)) best = Object.fromEntries(times.map((t) => [t.name, round(t.dayTotal / o.perf)]));
  }
  const st = readState(sim, 0, currentSeason(sim.state));
  return {
    tool: 'life', options: o, world: { fingerprint: ctx.world.meta.fingerprint, genMs: round(ctx.genMs), sizeMm: ctx.world.size, bu: ctx.world.bu, sources: sim.state.sources.length },
    founding: ctx.founding, days: [], violations: [], violationCount: 0, systems: [], msPerTick: Math.min(...segs),
    perf: { tickMs: Math.min(...segs), segmentsMs: segs, systems: best, workers: st.workers, outside: st.outside },
    finalHash: stateHash(sim.state), verdict: { healthy: true, checks: [] },
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
    `Founding: ${r.founding.phase} after ${r.founding.gd} gd with ${r.founding.workers} first workers (expected ${r.founding.expected.min}-${r.founding.expected.max}). ` +
    `Verdict: **${r.verdict.healthy ? 'healthy' : 'UNHEALTHY'}**; ${r.violationCount} invariant violations; ${r.msPerTick} ms per tick; final stateHash ${r.finalHash}.`, '',
    '| day | season | workers | eggs/larvae/pupae | hunger | lay pot. | C | P | stage | trips | deliv. (C/P) | by kind | deaths | eggs laid | eclosed | plans +/done | pellets made/dumped/in nest | volume BU³ | chambers | trail cells | outside | stuck | over timeout | viol. | ms/tick |',
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
  const stuckDays = r.days.filter((d) => (d.stuck.stuckWhat ?? []).length > 0);
  if (stuckDays.length > 0) {
    lines.push('', 'Stuck ants (id task/state nav medium nest at x,y,z BU):');
    for (const d of stuckDays) lines.push(`- day ${d.state.day}: ${d.stuck.stuckWhat!.join('; ')}`);
  }
  lines.push('', 'Ants per behaviour state at the end: ' + kv(r.days[r.days.length - 1].state.byState));
  lines.push('', 'Slowest systems (ms per tick, whole run): ' + r.systems.slice(0, 8).map((s) => `${s.name} ${s.avgMsPerTick} (max ${s.maxMs})`).join(', '));
  return lines.join('\n');
}

export default async function main(args: string[]): Promise<void> {
  const o = parseLifeArgs(args);
  const fs = (await import('node:fs' as string)) as {
    mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string | Uint8Array): void; existsSync(p: string): boolean; readFileSync(p: string): Uint8Array;
  };
  const io: LifeIO = {
    read: (p) => (fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null),
    write: (p, d) => { fs.mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(p, d); },
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
