// Headless soak run of the pure simulation (architecture §5): a new game on the generated world, N game days,
// invariants every K ticks, per-system timing, a final JSON summary on stdout.
//
//   node tools/sim/run-ts.mjs tools/sim/soak.ts --days 2 --seed 1
//   options: --days N (default 1)  --seed S (default 1)  --species ID (default lasius-niger)
//            --every K (invariant check period in ticks, default 100)  --max-violations M (samples kept, default 20)
//            --workers N (cheat-spawn N workers next to the queen at the start, default 0)
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

declare const process: { exitCode?: number };

interface SoakOptions {
  days: number;
  seed: number;
  species: SpeciesId;
  every: number;
  maxViolations: number;
  workers: number;
}

function parseArgs(args: readonly string[]): SoakOptions {
  const o: SoakOptions = { days: 1, seed: 1, species: 'lasius-niger', every: 100, maxViolations: 20, workers: 0 };
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
  const config = { ...defaultGameConfig(o.species, o.seed), cheats: o.workers > 0 }; // cheats only to spawn workers
  const { state, world } = createNewGame(config);
  const createMs = performance.now() - t0;
  const timings: SystemTiming[] = [];
  const sim = createSim(state, world, { systems: timedSystems(SYSTEMS, timings) });
  if (o.workers > 0) {
    const col = state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: o.workers, caste: 'worker', ageGd: 5, task: null, pos: null });
  }
  const invariants = collectInvariants();
  const violations: InvariantViolation[] = [];
  let checks = 0, total = 0, checkMs = 0;
  const check = (): void => {
    const c0 = performance.now();
    const all: InvariantViolation[] = [];
    total += checkInvariants(sim, invariants, all);
    for (const v of all) if (violations.length < o.maxViolations) violations.push(v);
    checks++;
    checkMs += performance.now() - c0;
  };
  check(); // the fresh game too
  const ticks = Math.round(o.days * TICKS_PER_DAY);
  const r0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (sim.state.tick % o.every === 0) check();
  }
  const runMs = performance.now() - r0 - checkMs;
  check(); // final state
  const sysMs = timings.reduce((a, t) => a + t.totalMs, 0);
  const report = {
    tool: 'soak', seed: o.seed, species: o.species, days: o.days, ticks, worldSizeMm: world.size, bu: world.bu,
    invariants: invariants.map((i) => i.name), checks, violationCount: total, violations,
    timing: {
      createGameMs: round(createMs), runMs: round(runMs), checkMs: round(checkMs),
      msPerTick: round(runMs / Math.max(1, ticks)),
      outsideSystemsMs: round(runMs - sysMs), // index refresh, sweep, event flush
      systems: timings.map((t) => ({
        name: t.name, phase: t.phase, calls: t.calls, totalMs: round(t.totalMs),
        meanUs: round(t.calls > 0 ? (t.totalMs * 1000) / t.calls : 0), maxMs: round(t.maxMs),
      })),
    },
    final: summary(sim),
  };
  console.log(JSON.stringify(report, null, 2));
  if (total > 0) process.exitCode = 1;
}
