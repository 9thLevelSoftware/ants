// Difficulty comparison run (difficulty-rules task, AC3): one game on a generated world with a preset and optional
// custom rules, the founding completed with the cheat hand-over (as tools/sim/life.ts does), then N game days with no
// player; counts the events that differ between presets and between rule settings. JSON on stdout (and --out).
//
//   node tools/sim/run-ts.mjs tools/sim/difficultyRun.ts --preset harsh --days 28 --seed 1 --out test-output/difficulty
//   options: --preset gentle|naturalist|harsh (naturalist)  --seed S (1)  --archetype ID (woodland-edge)  --days N (28)
//            --rules '{"predators":"off","rivals":0,"humanActivity":"off"}'  --species ID (lasius-niger)
//            --workers N (cheat: N adult workers added at the hand-over, so the colony is big enough for losses to show)
//            --food C,P (cheat: loads added to the stores with --workers)
//            --cache DIR (reuse the founded hand-over snapshot of the same options; delete it when the code changed)
//
// Wall clock and files live here, never in src/sim.

import type { ArchetypeId, DifficultyId, SimEvent, SpeciesId } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { applyRules } from '@/sim/config/rules';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { effectiveParams } from '@/sim/balance';
import { airTemp } from '@/sim/environment';
import { CREATURE_STATS } from '@/sim/balance/creatures';

interface NodeFs {
  existsSync(p: string): boolean; readFileSync(p: string): Uint8Array; writeFileSync(p: string, d: Uint8Array | string): void;
  mkdirSync(p: string, o: { recursive: boolean }): void;
}
declare const process: { argv: string[]; exitCode?: number; stdout: { write(s: string): void }; stderr: { write(s: string): void } };

interface Opts {
  preset: DifficultyId; seed: number; archetype: ArchetypeId; days: number; rules: unknown; species: SpeciesId;
  out: string | null; cache: string | null; workers: number; food: [number, number];
}

function parse(args: string[]): Opts {
  const o: Opts = { preset: 'naturalist', seed: 1, archetype: 'woodland-edge', days: 28, rules: {}, species: 'lasius-niger', out: null, cache: null, workers: 0, food: [0, 0] };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (v === undefined) throw new Error(`difficultyRun: ${k} needs a value`);
    if (k === '--preset') o.preset = v as DifficultyId;
    else if (k === '--seed') o.seed = Number(v);
    else if (k === '--archetype') o.archetype = v as ArchetypeId;
    else if (k === '--days') o.days = Number(v);
    else if (k === '--rules') o.rules = JSON.parse(v);
    else if (k === '--species') o.species = v as SpeciesId;
    else if (k === '--out') o.out = v;
    else if (k === '--cache') o.cache = v;
    else if (k === '--workers') o.workers = Number(v);
    else if (k === '--food') { const [c, p] = v.split(',').map(Number); o.food = [c || 0, p || 0]; }
    else throw new Error(`difficultyRun: unknown option ${k}`);
  }
  return o;
}

const bump = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };

/** What one run reports. Weather is sampled every hour; threats and losses are event counts after the hand-over. */
export interface DifficultyReport {
  tool: 'difficultyRun';
  options: Opts;
  /** Effective parameter values the sim ran with (accessor output). */
  effective: Record<string, unknown>;
  rules: unknown;
  issues: unknown;
  founding: { phase: string; handoverTick: number };
  days: number;
  weather: { hoursByState: Record<string, number>; changes: number; thunder: number; rainMm: number; hoursOver30: number; minTempC: number; maxTempC: number };
  threats: {
    creaturesSpawned: Record<string, number>; predatorsSpawned: number; predatorStrikes: number; birdVisits: number; raidsOnPlayer: number;
    rivalRaids: number; rivalEncounters: number; humanEventsStarted: number; humanEventsByKind: Record<string, number>;
    humanCasualties: number; floods: number; collapses: number;
  };
  losses: { antDeaths: number; antDeathsByCause: Record<string, number>; broodDeaths: number; broodDeathsByCause: Record<string, number> };
  rivals: { colonies: number };
  colony: { workersEnd: number; workersMax: number };
  finalHash: string;
  wallS: number;
}

function found(sim: ReturnType<typeof createSim>, maxDays: number): { phase: string; handoverTick: number } {
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const end = sim.state.tick + maxDays * TICKS_PER_DAY;
  const op = () => sim.state.player.opening;
  while (sim.state.tick < end) {
    sim.tick();
    const p = op()?.phase;
    if (p === 'handover' || p === 'failed' || op()?.done) break;
  }
  return { phase: op()?.done ? 'done' : (op()?.phase ?? 'none'), handoverTick: sim.state.tick };
}

export function runDifficulty(o: Opts, fs: NodeFs): DifficultyReport {
  const t0 = Date.now();
  const base = defaultGameConfig(o.species, o.seed, o.preset);
  const applied = applyRules({ ...base, cheats: true, world: { ...base.world, archetype: o.archetype } }, o.rules);
  const config = applied.config;
  const world = generateWorld(config.world);
  const key = `${o.cache}/difficulty-${o.species}-${o.archetype}-${o.seed}-${o.preset}-${JSON.stringify(o.rules).replace(/[^a-z0-9]+/gi, '_')}.bin`;
  const cached = o.cache && fs.existsSync(key) ? restore(new Uint8Array(fs.readFileSync(key))).state : null;
  const state = cached ?? createNewGame(config, world).state;
  const sim = createSim(state, world);
  let founding = { phase: 'cached', handoverTick: sim.state.tick };
  if (!cached) {
    founding = found(sim, 16);
    if (o.cache) { fs.mkdirSync(o.cache, { recursive: true }); fs.writeFileSync(key, snapshot(sim)); }
  }
  const col = (): number => sim.state.player.colonyId;
  if (o.workers > 0) {
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col(), n: o.workers, caste: 'worker', ageGd: 4, task: null, pos: null });
    if (o.food[0] > 0 || o.food[1] > 0) sim.enqueue({ type: 'cheat.addFood', colonyId: col(), c: o.food[0], p: o.food[1], toxin: 0 });
  }
  const r: DifficultyReport = {
    tool: 'difficultyRun', options: o, effective: effectiveParams(sim.state.config) as unknown as Record<string, unknown>,
    rules: sim.state.config.rules, issues: applied.issues, founding, days: o.days,
    weather: { hoursByState: {}, changes: 0, thunder: 0, rainMm: 0, hoursOver30: 0, minTempC: 99, maxTempC: -99 },
    threats: {
      creaturesSpawned: {}, predatorsSpawned: 0, predatorStrikes: 0, birdVisits: 0, raidsOnPlayer: 0, rivalRaids: 0, rivalEncounters: 0,
      humanEventsStarted: 0, humanEventsByKind: {}, humanCasualties: 0, floods: 0, collapses: 0,
    },
    losses: { antDeaths: 0, antDeathsByCause: {}, broodDeaths: 0, broodDeathsByCause: {} },
    rivals: { colonies: 0 }, colony: { workersEnd: 0, workersMax: 0 }, finalHash: '', wallS: 0,
  };
  const on = <T extends SimEvent['type']>(t: T, f: (e: Extract<SimEvent, { type: T }>) => void): void => { sim.events.on(t, f as never); };
  on('weather.changed', () => { r.weather.changes++; });
  on('weather.thunder', () => { r.weather.thunder++; });
  on('creature-spawned', (e) => {
    bump(r.threats.creaturesSpawned, e.kind);
    if (CREATURE_STATS[e.kind]?.family === 'ant-predator') r.threats.predatorsSpawned++;
  });
  on('predator-strike', () => { r.threats.predatorStrikes++; });
  on('bird-approach', () => { r.threats.birdVisits++; });
  on('rival-raid-started', (e) => { r.threats.rivalRaids++; if (e.target === col()) r.threats.raidsOnPlayer++; });
  on('rival-encounter', () => { r.threats.rivalEncounters++; });
  on('human.start', (e) => { r.threats.humanEventsStarted++; bump(r.threats.humanEventsByKind, e.kind); });
  on('human.casualties', (e) => { r.threats.humanCasualties += e.killed; });
  on('flood-started', () => { r.threats.floods++; });
  on('collapse', () => { r.threats.collapses++; });
  on('ant-died', (e) => { if (e.colonyId === col()) { r.losses.antDeaths++; bump(r.losses.antDeathsByCause, e.cause); } });
  on('brood-died', (e) => { if (e.colonyId === undefined || e.colonyId === col()) { r.losses.broodDeaths++; bump(r.losses.broodDeathsByCause, e.cause); } });

  const end = sim.state.tick + o.days * TICKS_PER_DAY;
  const HOUR = TICKS_PER_DAY / 24;
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % HOUR === 0) {
      const w = sim.state.env.weather;
      bump(r.weather.hoursByState, w.state);
      r.weather.rainMm += w.rainRateMmH;
      const air = airTemp(sim);
      if (air < r.weather.minTempC) r.weather.minTempC = Math.round(air * 10) / 10;
      if (air > r.weather.maxTempC) r.weather.maxTempC = Math.round(air * 10) / 10;
      if (air > 30) r.weather.hoursOver30++;
    }
    if (sim.state.tick % TICKS_PER_DAY === 0) {
      const n = sim.state.ants.filter((a) => a.alive && a.colony === col() && a.caste === 'worker').length;
      if (n > r.colony.workersMax) r.colony.workersMax = n;
    }
  }
  const workers = sim.state.ants.filter((a) => a.alive && a.colony === col() && a.caste === 'worker').length;
  r.colony.workersEnd = workers;
  r.colony.workersMax = Math.max(r.colony.workersMax, workers);
  r.rivals.colonies = sim.state.colonies.filter((c) => c.alive && !c.isPlayer).length;
  r.finalHash = stateHash(sim.state);
  r.wallS = Math.round((Date.now() - t0) / 100) / 10;
  return r;
}

export default async function main(): Promise<void> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  const o = parse(process.argv.slice(2));
  const rep = runDifficulty(o, fs);
  const text = JSON.stringify(rep);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    fs.writeFileSync(`${o.out}/difficulty-${o.preset}-${o.seed}${o.workers ? `-w${o.workers}` : ''}${Object.keys(o.rules as object).length ? '-custom' : ''}.json`, text);
  }
  process.stdout.write(text + '\n');
}
