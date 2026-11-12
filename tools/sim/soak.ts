// Headless soak run of the pure simulation (architecture §5): a new game on the generated world, N game days,
// invariants every K ticks, per-system timing, a final JSON summary on stdout.
//
//   node tools/sim/run-ts.mjs tools/sim/soak.ts --days 2 --seed 1
//   options: --days N (default 1)  --seed S (default 1)  --species ID (default lasius-niger)
//            --every K (invariant check period in ticks, default 100)  --max-violations M (samples kept, default 20)
//            --workers N (cheat-spawn N workers next to the queen at the start, default 0)
//            --colony (Stage 1A scenario: template nest carved by the nest module, established queen, the
//                      --workers in the nest, brood, a sugar source and scripted foraging / brood care standing in
//                      for the Stage 1B behaviours; src/sim/testing/e2e/colonyScenario.ts)
//            --brood N (with --colony: N eggs, N larvae and N/2 pupae, default 8)
//   Stage 1A gate run: --days 3 --workers 60 --colony
//
// Invariants: src/sim/testing/invariants.ts (core: walker-finite, walker-free-space, non-negative,
// state-encodes) plus every module's exported `invariants` (pluggable, no edit here). Exit code 1 if any fails.

import type { Sim, SpeciesId, System } from '@/sim/types';
import { SPECIES_IDS } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { TICKS_PER_DAY } from '@/sim/time';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing/invariants';
import { scriptedBehaviours, scriptedCareSystem, setupColonyScenario } from '@/sim/testing/e2e/colonyScenario';

declare const process: { exitCode?: number };

interface SoakOptions {
  days: number;
  seed: number;
  species: SpeciesId;
  every: number;
  maxViolations: number;
  workers: number;
  colony: boolean;
  brood: number;
}

function parseArgs(args: readonly string[]): SoakOptions {
  const o: SoakOptions = { days: 1, seed: 1, species: 'lasius-niger', every: 100, maxViolations: 20, workers: 0, colony: false, brood: 8 };
  for (let i = 0; i < args.length; i++) {
    const k = args[i], v = args[i + 1];
    const num = (): number => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`soak: ${k} needs a non-negative number, got ${v}`);
      i++;
      return n;
    };
    if (k === '--days') o.days = num();
    else if (k === '--seed') o.seed = Math.floor(num());
    else if (k === '--every') o.every = Math.max(1, Math.floor(num()));
    else if (k === '--max-violations') o.maxViolations = Math.floor(num());
    else if (k === '--workers') o.workers = Math.floor(num());
    else if (k === '--brood') o.brood = Math.floor(num());
    else if (k === '--colony') o.colony = true;
    else if (k === '--species') {
      if (!(SPECIES_IDS as readonly string[]).includes(v)) throw new Error(`soak: unknown species ${v}`);
      o.species = v as SpeciesId;
      i++;
    } else throw new Error(`soak: unknown option ${k}`);
  }
  return o;
}

interface SystemTiming {
  name: string;
  phase: string;
  calls: number;
  totalMs: number;
  maxMs: number;
}

/** Wraps every system so its run time is measured (wall clock lives here, never in src/sim). */
function timedSystems(list: readonly System[], timings: SystemTiming[]): System[] {
  return list.map((s) => {
    const t: SystemTiming = { name: s.name, phase: s.phase ?? '-', calls: 0, totalMs: 0, maxMs: 0 };
    timings.push(t);
    return {
      ...s,
      run(sim: Sim) {
        const t0 = performance.now();
        s.run(sim);
        const dt = performance.now() - t0;
        t.calls++;
        t.totalMs += dt;
        if (dt > t.maxMs) t.maxMs = dt;
      },
    };
  });
}

function summary(sim: Sim) {
  const s = sim.state;
  const count = (list: readonly { alive: boolean }[]): number => list.filter((e) => e.alive).length;
  return {
    tick: s.tick,
    ants: count(s.ants), brood: count(s.brood), items: count(s.items), sources: count(s.sources),
    creatures: count(s.creatures), nests: count(s.nests), markers: count(s.markers),
    colonies: s.colonies.map((c) => ({
      id: c.id, alive: c.alive, isPlayer: c.isPlayer, livingAnts: c.livingAnts,
      stores: { c: round(c.stores.c), p: round(c.stores.p) },
    })),
    carveChunks: s.worldDelta.carve.keys.length,
    weather: s.env.weather.state,
  };
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

export default function main(args: string[]): void {
  const o = parseArgs(args);
  const t0 = performance.now();
  const cheats = o.workers > 0 || o.colony; // cheats only to spawn workers, brood and food
  const config = { ...defaultGameConfig(o.species, o.seed), cheats };
  const { state, world } = createNewGame(config);
  const createMs = performance.now() - t0;
  const timings: SystemTiming[] = [];
  const systems = o.colony ? [...SYSTEMS, scriptedCareSystem()] : SYSTEMS;
  const sim = createSim(state, world, { systems: timedSystems(systems, timings), behaviours: o.colony ? scriptedBehaviours() : undefined });
  if (o.colony) {
    setupColonyScenario(sim, { workers: o.workers, eggs: o.brood, larvae: o.brood, pupae: Math.floor(o.brood / 2) });
  } else if (o.workers > 0) {
    const col = state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: o.workers, caste: 'worker', ageGd: 5, task: null, pos: null });
  }
  const invariants = collectInvariants();
  const violations: InvariantViolation[] = [];
  let checks = 0, total = 0, checkMs = 0;
  const check = (): number => {
    const c0 = performance.now();
    const all: InvariantViolation[] = [];
    total += checkInvariants(sim, invariants, all);
    for (const v of all) if (violations.length < o.maxViolations) violations.push(v);
    checks++;
    const dt = performance.now() - c0;
    checkMs += dt;
    return dt;
  };
  check(); // the fresh game too (outside the run's clock)
  const ticks = Math.round(o.days * TICKS_PER_DAY);
  let runCheckMs = 0; // checks made inside the run loop, subtracted from its wall time
  const r0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (sim.state.tick % o.every === 0) runCheckMs += check();
  }
  const runMs = performance.now() - r0 - runCheckMs;
  check(); // final state
  const sysMs = timings.reduce((a, t) => a + t.totalMs, 0);
  const report = {
    tool: 'soak', seed: o.seed, species: o.species, days: o.days, ticks, worldSizeMm: world.size, bu: world.bu,
    scenario: o.colony ? { colony: true, workers: o.workers, brood: o.brood } : { colony: false, workers: o.workers },
    invariants: invariants.map((i) => i.name), checks, violationCount: total, violations,
    timing: {
      createGameMs: round(createMs), runMs: round(runMs), checkMs: round(checkMs),
      msPerTick: round(runMs / Math.max(1, ticks)),
      outsideSystemsMs: round(runMs - sysMs), // index refresh, sweep, event flush
      systems: timings.map((t) => ({
        name: t.name, phase: t.phase, calls: t.calls, totalMs: round(t.totalMs),
        meanUs: round(t.calls > 0 ? (t.totalMs * 1000) / t.calls : 0),
        perTickUs: round(ticks > 0 ? (t.totalMs * 1000) / ticks : 0), maxMs: round(t.maxMs),
      })),
    },
    final: summary(sim),
  };
  printTable(report.timing.systems, report.timing.msPerTick);
  console.log(JSON.stringify(report, null, 2));
  if (total > 0) process.exitCode = 1;
}

/** Human-readable per-system timing table on stderr (the JSON on stdout stays machine-readable). */
function printTable(rows: { name: string; phase: string; calls: number; meanUs: number; perTickUs: number; maxMs: number }[], msPerTick: number): void {
  const pad = (v: string | number, n: number) => String(v).padStart(n);
  const lines = [`${'system'.padEnd(22)}${'phase'.padEnd(18)}${pad('calls', 8)}${pad('mean us', 10)}${pad('us/tick', 10)}${pad('max ms', 9)}`];
  for (const r of [...rows].sort((a, b) => b.perTickUs - a.perTickUs)) {
    lines.push(`${r.name.padEnd(22)}${r.phase.padEnd(18)}${pad(r.calls, 8)}${pad(r.meanUs.toFixed(1), 10)}${pad(r.perTickUs.toFixed(1), 10)}${pad(r.maxMs.toFixed(2), 9)}`);
  }
  lines.push(`total ${msPerTick.toFixed(3)} ms per tick (wall, checks excluded)`);
  console.error(lines.join('\n'));
}
