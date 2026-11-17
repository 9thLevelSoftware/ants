// Colony benches (colony-life round 3, integrator direction "steer by benches, confirm by sweep"): start from a
// cached hand-over snapshot and isolate one half of the colony. Measuring tools only: the bench write is tool-side
// (a system appended to this run's list, never part of the game) and changes no rule.
//
//   node tools/sim/run-ts.mjs tools/sim/bench-colony.ts --mode nest|forage --archetype A --seed S
//        --cache DIR (reads DIR/founded-lasius-niger-A-S-naturalist-d-any.bin)  --out DIR  [--days N]
//
//   nest:   every game hour the stores are topped up to BENCH_STORE_GD (2) game days of the colony's need rates in
//           C and P (foraging left on), as far as the nest can hold it (round 4: capacity-bound, P need without spoilage). Answers "does the nest raise workers when food is not the limit?".
//   forage: the colony's need rates are held at the hand-over colony's rates scaled to 30 workers (its brood scaled
//           with it), every tick after the economy, need indices recomputed from the stores (brood care left on).
//           Answers "what does foraging bring in against a fixed demand?", with the prey funnel.
//
// Runs until the first tick of winter (or --days). Wall clock and console live here, never in src/sim.

import type { Ant, ArchetypeId, Sim, System } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { restore, stateHash } from '@/sim/save';
import { needRates, refreshNeedIndices } from '@/sim/colony/needs';
import { poolSpace } from '@/sim/colony/stores';
import { isWorkerCaste } from '@/sim/colony/census';
import { readState, round, type DayState } from './lifeMetrics';
import { FunnelObserver, funnelMarkdown, type FunnelReport } from './lifeFunnel';

declare const process: { exitCode?: number };

/** Nest bench: stores topped up to this many game days of need, every game hour. */
const BENCH_STORE_GD = 2;
/** Forage bench: demand of this many workers (the hand-over colony's rates scaled to it). */
const BENCH_WORKERS = 30;
const HOUR_TICKS = Math.round(TICKS_PER_DAY / 24);
/** Outdoor engine phase `hunt` (src/sim/ants/behaviours/outdoor/keys.ts PHASE.hunt; persisted value). */
const PHASE_HUNT = 14;
const PATCH_KINDS = new Set(['springtail', 'mite']);

interface Opts { mode: 'nest' | 'forage'; archetype: ArchetypeId; seed: number; cache: string; out: string | null; days: number; snapshot: string | null; tag: string }

function parse(args: readonly string[]): Opts {
  const o: Opts = { mode: 'nest', archetype: 'woodland-edge', seed: 1, cache: 'test-output/colony-life/round-3/cache', out: null, days: 0, snapshot: null, tag: '' };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (k === '--mode') o.mode = v === 'forage' ? 'forage' : 'nest';
    else if (k === '--archetype') o.archetype = v as ArchetypeId;
    else if (k === '--seed') o.seed = Number(v);
    else if (k === '--cache') o.cache = v;
    else if (k === '--out') o.out = v;
    else if (k === '--days') o.days = Number(v);
    else if (k === '--snapshot') o.snapshot = v; // a hand-over snapshot file instead of the cache's (start-day benches)
    else if (k === '--tag') o.tag = v; // suffix of the output file names
  }
  return o;
}

// ---------------------------------------------------------------- bench writes (tool-side systems)

/**
 * Nest bench: every game hour the stores get what they lack of BENCH_STORE_GD days of the need rates, as far as the
 * nest can hold it (colony-life round 4: `cheat.addFood` is not bound by capacity, and the P need rate counts
 * spoilage, so the top-up chased its own rot: P stores up to 89 loads, the spoiled food lying among the brood as waste,
 * hygiene losses that a real colony cannot have). The P need without the spoilage rate; capped by `poolSpace`.
 */
function nestBenchSystem(colonyId: number, added: { c: number; p: number }): System {
  return {
    name: 'bench-nest-stores', phase: 'colony-economy',
    run(sim) {
      if (sim.state.tick % HOUR_TICKS !== 0) return;
      const col = sim.stores.colonies.get(colonyId);
      if (!col) return;
      const r = needRates(col);
      const needP = Math.max(0, r.p - (col.core?.acc['inst.spoilP'] ?? 0));
      const room = poolSpace(col);
      const dc = Math.min(room.c, Math.max(0, BENCH_STORE_GD * r.c - col.stores.c));
      const dp = Math.min(room.p, Math.max(0, BENCH_STORE_GD * needP - col.stores.p));
      if (dc + dp <= 0) return;
      sim.enqueue({ type: 'cheat.addFood', colonyId, c: dc, p: dp, toxin: 0 });
      added.c += dc; added.p += dp;
    },
  };
}

/**
 * Forage bench: the need-rate EMAs held at the 30-worker rates, every tick, need indices recomputed. The rates are
 * the hand-over colony's (first run) scaled by BENCH_WORKERS / its workers.
 */
function forageBenchSystem(colonyId: number, rates: { c: number; p: number; set: boolean }): System {
  return {
    name: 'bench-forage-demand', phase: 'colony-economy',
    run(sim) {
      const col = sim.stores.colonies.get(colonyId);
      if (!col) return;
      if (!rates.set) {
        const r = needRates(col);
        let w = 0;
        for (const a of sim.stores.ants.list) if (a.alive && a.colony === colonyId && isWorkerCaste(a.caste)) w++;
        rates.c = (r.c * BENCH_WORKERS) / Math.max(1, w); rates.p = (r.p * BENCH_WORKERS) / Math.max(1, w); rates.set = true;
      }
      col.needs.rateC = rates.c; col.needs.rateP = rates.p;
      refreshNeedIndices(col);
    },
  };
}

// ---------------------------------------------------------------- prey funnel (forage bench)

/** What became of every patch prey that appeared ahead of a colony ant (tool-side observer, reads state only). */
class PreyObserver {
  appeared: Record<string, number> = {};
  /** Nearest colony ant's state when the prey appeared (within 6 BU), by "task.state". */
  nearestAt: Record<string, number> = {};
  chased = 0;
  subdued = 0;
  biteEscapes = 0;
  /** Jumps not caused by a bite (position moved > 30 mm in one tick without a prey-escaped event that tick). */
  touchJumps = 0;
  /** Outcome of every chased prey (despawn cause or subdued). */
  chasedOutcome: Record<string, number> = {};
  outcome: Record<string, number> = {};
  remainsLifted = 0;
  loadsHome = 0;
  pHome = 0;
  minGapBu: number[] = [];
  private live = new Map<number, { x: number; z: number; chased: boolean; gap: number; escTick: number }>();
  private carrying = new Set<number>();
  constructor(private readonly sim: Sim, private readonly col: number) {
    const bu = sim.world.bu;
    sim.events.on('creature-spawned', (e) => {
      if (!PATCH_KINDS.has(e.kind)) return;
      const c = sim.stores.creatures.get(e.id);
      if (!c) return;
      let best: Ant | undefined, bd = (6 * bu) ** 2;
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== col || !isWorkerCaste(a.caste)) continue;
        const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = a; }
      }
      if (!best) return; // appeared ahead of another colony's ant
      this.appeared[e.kind] = (this.appeared[e.kind] ?? 0) + 1;
      const crop = best.cropC + best.cropP > 0.05 ? 'crop' : 'empty';
      const k = `${best.state} ${best.carry.kind !== 'none' ? 'laden' : crop}`;
      this.nearestAt[k] = (this.nearestAt[k] ?? 0) + 1;
      this.live.set(e.id, { x: c.pos.x, z: c.pos.z, chased: false, gap: Infinity, escTick: -1 });
    });
    sim.events.on('prey-escaped', (e) => { const t = this.live.get(e.creatureId); if (t) { this.biteEscapes++; t.escTick = sim.state.tick; } });
    sim.events.on('prey-subdued', (e) => {
      const t = this.live.get(e.creatureId);
      if (!t) return;
      this.subdued++;
      this.end(e.creatureId, 'subdued');
    });
    sim.events.on('creature-despawned', (e) => { if (this.live.has(e.id)) this.end(e.id, `despawn:${e.cause}`); });
    sim.events.on('creature-died', (e) => { if (this.live.has(e.id)) this.end(e.id, `died:${e.cause}`); });
    sim.events.on('delivery', (e) => {
      // the remains' delivery (a springtail 0.25 P, a mite 0.08), not a crop unloaded by the same ant
      if (!this.carrying.has(e.antId) || e.p < 0.05) return;
      this.carrying.delete(e.antId);
      this.loadsHome++; this.pHome += e.p;
    });
  }

  private end(id: number, why: string): void {
    const t = this.live.get(id)!;
    this.outcome[why] = (this.outcome[why] ?? 0) + 1;
    if (t.chased) {
      this.chasedOutcome[why] = (this.chasedOutcome[why] ?? 0) + 1;
      if (Number.isFinite(t.gap)) this.minGapBu.push(round(t.gap / this.sim.world.bu));
    }
    this.live.delete(id);
  }

  tick(): void {
    const sim = this.sim;
    for (const [id, t] of this.live) {
      const c = sim.stores.creatures.get(id);
      if (!c) continue;
      const dx = c.pos.x - t.x, dz = c.pos.z - t.z;
      if (dx * dx + dz * dz > 30 * 30 && t.escTick !== sim.state.tick) this.touchJumps++;
      t.x = c.pos.x; t.z = c.pos.z;
    }
    if (sim.state.tick % 2 !== 0) return;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || a.bb['fo.ph'] !== PHASE_HUNT) continue;
      if (a.carry.kind === 'item' && !this.carrying.has(a.id)) { this.carrying.add(a.id); this.remainsLifted++; }
      const t = this.live.get(a.bb['fo.prey'] ?? -1);
      if (!t) continue;
      if (!t.chased) { t.chased = true; this.chased++; }
      const c = sim.stores.creatures.get(a.bb['fo.prey']);
      if (c) { const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z; t.gap = Math.min(t.gap, Math.sqrt(dx * dx + dz * dz)); }
    }
  }

  result() {
    const g = [...this.minGapBu].sort((a, b) => a - b);
    return {
      appeared: this.appeared, nearestAt: this.nearestAt, chased: this.chased, subdued: this.subdued, biteEscapes: this.biteEscapes,
      touchJumps: this.touchJumps, outcome: this.outcome, chasedOutcome: this.chasedOutcome, remainsLifted: this.remainsLifted,
      loadsHome: this.loadsHome, pHome: round(this.pHome), chasedMinGapBuMedian: g.length ? g[Math.floor(g.length / 2)] : null,
    };
  }
}

// ---------------------------------------------------------------- nursing sampler (both benches)

/** Per game day: worker-gd by task among nest tasks, larva-gd (feeding, not diapause), hungry larva-gd (gut below the
 * feed request), larva-gd with no nurse at all, untended egg/pupa-gd (pile clock over UNTENDED). Sampled every 50 ticks. */
interface CareDay { nurseGd: number; queenCareGd: number; haulGd: number; digGd: number; idleGd: number; larvaGd: number; hungryLarvaGd: number; noNurseLarvaGd: number; untendedGd: number }
const CARE_EVERY = 50;
class CareSampler {
  days: CareDay[] = [];
  private cur: CareDay = CareSampler.zero();
  constructor(private readonly sim: Sim, private readonly col: number) {}
  static zero(): CareDay { return { nurseGd: 0, queenCareGd: 0, haulGd: 0, digGd: 0, idleGd: 0, larvaGd: 0, hungryLarvaGd: 0, noNurseLarvaGd: 0, untendedGd: 0 }; }
  tick(): void {
    const sim = this.sim;
    if (sim.state.tick % CARE_EVERY !== 0) return;
    const w = CARE_EVERY / TICKS_PER_DAY, c = this.cur;
    let nurses = 0;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== this.col || !isWorkerCaste(a.caste)) continue;
      if (a.task === 'nurse') { c.nurseGd += w; nurses++; } else if (a.task === 'queen-care') c.queenCareGd += w;
      else if (a.task === 'haul') c.haulGd += w; else if (a.task === 'dig') c.digGd += w; else if (a.task === 'idle' || a.task === 'rest') c.idleGd += w;
    }
    const untendedTicks = 0.25 * TICKS_PER_DAY; // UNTENDED_GD (GDD 02 §2.5)
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== this.col) continue;
      if (b.stage === 'larva' && (b.flags & BroodFlag.DIAPAUSE) === 0) {
        c.larvaGd += w;
        if (b.gutC + b.gutP < 0.15) c.hungryLarvaGd += w;
        if (nurses === 0) c.noNurseLarvaGd += w;
      } else if (b.stage !== 'larva' && sim.state.tick - b.lastTendedTick > untendedTicks) c.untendedGd += w;
    }
  }
  closeDay(): void { const r = (x: number) => round(x); const c = this.cur; this.days.push(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r(v)])) as unknown as CareDay); this.cur = CareSampler.zero(); }
}

// ---------------------------------------------------------------- run

export interface BenchReport {
  tool: 'bench-colony'; options: Opts;
  handover: { gd: number; workers: number; rates: { c: number; p: number }; benchRates?: { c: number; p: number } };
  days: DayState[]; care: CareDay[]; funnel: FunnelReport; prey?: ReturnType<PreyObserver['result']>;
  added?: { c: number; p: number }; gd: number; finalHash: string; ms: number;
}

export function runBench(o: Opts, snap: Uint8Array, log: (s: string) => void): BenchReport {
  const base = defaultGameConfig('lasius-niger', o.seed, 'naturalist');
  // the world depends only on the world params; a snapshot founded on another start day carries its own calendar
  const config = { ...base, cheats: true, world: { ...base.world, archetype: o.archetype } };
  const world = generateWorld(config.world);
  const state = restore(snap).state;
  const colId = state.player.colonyId;
  const added = { c: 0, p: 0 };
  const benchRates = { c: 0, p: 0, set: false };
  const extra: System = o.mode === 'nest' ? nestBenchSystem(colId, added) : forageBenchSystem(colId, benchRates);
  const sim = createSim(state, world, { systems: [...SYSTEMS, extra] });
  const workers0 = readState(sim, 0, currentSeason(sim.state)).workers;
  const rates0 = needRates(sim.stores.colonies.get(colId)!);
  const t0 = sim.state.tick;
  const funnel = new FunnelObserver(sim);
  const prey = o.mode === 'forage' ? new PreyObserver(sim, colId) : null;
  const care = new CareSampler(sim, colId);
  const days: DayState[] = [readState(sim, 0, currentSeason(sim.state))];
  const w0 = performance.now();
  const maxDays = o.days > 0 ? o.days : 400;
  let winter = false;
  for (let d = 1; d <= maxDays && !winter; d++) {
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      sim.tick();
      funnel.tick();
      prey?.tick();
      care.tick();
      if (currentSeason(sim.state) === 'winter') { winter = true; break; }
    }
    const s = readState(sim, d, currentSeason(sim.state));
    days.push(s);
    care.closeDay();
    log(`day ${d} ${s.season}: workers ${s.workers}, brood ${s.eggs}/${s.larvae}/${s.pupae}, C ${s.storesC} P ${s.storesP}, brood ${s.broodTempC} C, lay ${s.layPotential}`);
    if (!s.queenAlive && s.workers === 0) break;
  }
  return {
    tool: 'bench-colony', options: o,
    handover: { gd: round(t0 / TICKS_PER_DAY), workers: workers0, rates: { c: round(rates0.c), p: round(rates0.p) }, ...(o.mode === 'forage' ? { benchRates: { c: round(benchRates.c), p: round(benchRates.p) } } : {}) },
    days, care: care.days, funnel: funnel.result(), ...(prey ? { prey: prey.result() } : {}), ...(o.mode === 'nest' ? { added: { c: round(added.c), p: round(added.p) } } : {}),
    gd: round((sim.state.tick - t0) / TICKS_PER_DAY), finalHash: stateHash(sim.state), ms: Math.round(performance.now() - w0),
  };
}

function markdown(r: BenchReport): string {
  const o = r.options, last = r.days[r.days.length - 1];
  const lines = [
    `### bench ${o.mode}: ${o.archetype} #${o.seed}`, '',
    `Hand-over ${r.handover.gd} gd, ${r.handover.workers} workers; need rates C ${r.handover.rates.c} P ${r.handover.rates.p} loads/gd` +
    `${r.handover.benchRates ? `; bench demand C ${r.handover.benchRates.c} P ${r.handover.benchRates.p}` : ''}${r.added ? `; bench added C ${r.added.c} P ${r.added.p}` : ''}.` +
    ` Ran ${r.gd} gd to ${last.season}; workers ${r.handover.workers} -> ${last.workers}; final hash ${r.finalHash}; ${Math.round(r.ms / 1000)} s.`, '',
    '| day | workers | eggs/larvae/pupae | brood C | lay pot. | C | P | nurse / queen-care / haul / dig / idle worker-gd | larva-gd (hungry, no nurse) | untended egg+pupa-gd |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...r.days.map((d, i) => {
      const c = i > 0 ? r.care[i - 1] : undefined;
      return `| ${d.day} | ${d.workers} | ${d.eggs}/${d.larvae}/${d.pupae} | ${d.broodTempC ?? '-'} | ${d.layPotential} | ${d.storesC} | ${d.storesP} | ` +
        (c ? `${c.nurseGd} / ${c.queenCareGd} / ${c.haulGd} / ${c.digGd} / ${c.idleGd} | ${c.larvaGd} (${c.hungryLarvaGd}, ${c.noNurseLarvaGd}) | ${c.untendedGd} |` : '- | - | - |');
    }),
  ];
  if (r.prey) lines.push('', `Prey: ${JSON.stringify(r.prey)}`);
  lines.push(funnelMarkdown(r.funnel));
  return lines.join('\n');
}

interface NodeFs { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void; existsSync(p: string): boolean; readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const o = parse(args);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const file = o.snapshot ?? `${o.cache}/founded-lasius-niger-${o.archetype}-${o.seed}-naturalist-d-any.bin`;
  if (!fs.existsSync(file)) { console.error(`no hand-over snapshot ${file}`); process.exitCode = 2; return; }
  const r = runBench(o, new Uint8Array(fs.readFileSync(file)), (s) => console.error(`[bench ${o.mode} ${o.archetype} #${o.seed}] ${s}`));
  const md = markdown(r);
  console.error(md);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    const b = `${o.out}/bench-${o.mode}-${o.archetype}-${o.seed}${o.tag}`;
    fs.writeFileSync(`${b}.json`, JSON.stringify(r, null, 1));
    fs.writeFileSync(`${b}.md`, md);
  } else console.log(JSON.stringify(r));
}
