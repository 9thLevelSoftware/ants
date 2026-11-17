// Threat funnel (threats-live task, step 1): a tool-side observer that changes no rule. From a cached hand-over
// snapshot it runs N game days on a chosen preset / rules and counts, per predator kind, how many are alive, where
// they are relative to the colony's surface ants, and how often each stage of the hunt happens:
//   sense (a colony ant on the surface inside the kind's sense range) -> select (the predator holds a target) ->
//   approach (stalk / orient / approach state) -> telegraph -> strike -> hit -> kill -> feed
// with the observed reason a stage does not happen. Same for the bird event (hourly gate, approach, landed, pecks,
// kills) and antlion pits (ants crossing a pit, flicks, grabs, kills).
//
//   node tools/sim/run-ts.mjs tools/sim/threatFunnel.ts --archetype woodland-edge --seed 1 --days 6
//        [--preset gentle|naturalist|harsh] [--rules '{"predators":"off"}'] [--cache DIR] [--out DIR] [--tag T]
//
// Wall clock and files live here, never in src/sim.

import type { Ant, ArchetypeId, Creature, CreatureKind, DifficultyId, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { TICKS_PER_DAY } from '@/sim/time';
import { generateWorld } from '@/worldgen';
import { restore, stateHash } from '@/sim/save';
import {
  BIRD_MIN_EXPOSED, BIRD_MIN_WORKERS, BIRD_TARGET_RADIUS_BU, CREATURE_LEVERS, CREATURE_STATS, LONE_ANT_L,
  NEST_EXCLUSION_WORKERS, PREY_MAX_MG, REF_BU_MM, windupMaxTargetSpeed,
} from '@/sim/balance/creatures';
import { isWorkerCaste } from '@/sim/colony/census';
import { calendarNow } from '@/sim/environment/calendar';
import { isExposedAnt } from '@/sim/ecology/creatures';
import { conditions } from '@/sim/ecology/creatures/conditions';

declare const process: { exitCode?: number };

export const HUNTERS: readonly CreatureKind[] = ['jumping-spider', 'wolf-spider', 'ant-spider', 'centipede', 'rove-beetle'];
/** States in which a kind holds a chosen target (select) and moves on it (approach). */
const APPROACH_STATES: Partial<Record<CreatureKind, readonly string[]>> = {
  'jumping-spider': ['stalk'], 'wolf-spider': ['orient', 'freeze'], 'ant-spider': ['approach'],
};
const SAMPLE_TICKS = 10;
const STAGES = ['sense', 'select', 'approach', 'telegraph', 'strike', 'hit', 'kill', 'feed'] as const;

interface Opts { archetype: ArchetypeId; seed: number; days: number; preset: DifficultyId | null; rules: Record<string, unknown> | null; cache: string; out: string | null; tag: string; snapshot: string | null }

function parse(args: readonly string[]): Opts {
  const o: Opts = { archetype: 'woodland-edge', seed: 1, days: 6, preset: null, rules: null, cache: 'test-output/colony-life/round-3/cache', out: null, tag: '', snapshot: null };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (k === '--archetype') o.archetype = v as ArchetypeId;
    else if (k === '--seed') o.seed = Number(v);
    else if (k === '--days') o.days = Number(v);
    else if (k === '--preset') o.preset = v as DifficultyId;
    else if (k === '--rules') o.rules = JSON.parse(v) as Record<string, unknown>;
    else if (k === '--cache') o.cache = v;
    else if (k === '--out') o.out = v;
    else if (k === '--tag') o.tag = v;
    else if (k === '--snapshot') o.snapshot = v;
    else throw new Error(`threatFunnel: unknown option ${k}`);
  }
  return o;
}

const bump = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };
const r2 = (x: number): number => Math.round(x * 100) / 100;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface KindFunnel {
  territories: number;
  /** Territory centre to the player's first entrance: nearest, median, BU. */
  territoryToNestBu: { nearest: number | null; median: number | null };
  spawned: number;
  aliveSampleS: number;
  aliveAvg: number;
  /** Seconds (sampled) the kind spent in each state. */
  stateS: Record<string, number>;
  /** Distance from a live predator to the nearest colony worker on the surface: median and min, BU (hourly). */
  nearestAntBuMedian: number | null;
  nearestAntBuMin: number | null;
  /** Share of alive-seconds with a colony worker on the surface within the sense range. */
  inSenseShare: number;
  stages: Record<(typeof STAGES)[number], number>;
  /** Why a sensed ant is not a target (first failing filter of the victim rule, sampled each second while sensed). */
  senseFail: Record<string, number>;
  /** Approach seconds by blocking condition (target too fast for the wind-up gate, out of strike range, ...). */
  approachBlock: Record<string, number>;
  /** How approaches ended. */
  approachEnd: Record<string, number>;
}

function emptyKind(): KindFunnel {
  return {
    territories: 0, territoryToNestBu: { nearest: null, median: null }, spawned: 0, aliveSampleS: 0, aliveAvg: 0, stateS: {},
    nearestAntBuMedian: null, nearestAntBuMin: null, inSenseShare: 0,
    stages: { sense: 0, select: 0, approach: 0, telegraph: 0, strike: 0, hit: 0, kill: 0, feed: 0 },
    senseFail: {}, approachBlock: {}, approachEnd: {},
  };
}

export interface FunnelResult {
  tool: 'threatFunnel'; options: Opts; startGd: number; days: number;
  colony: { workersStart: number; workersEnd: number; outsideWorkerHours: number; outsideAvg: number };
  kinds: Record<string, KindFunnel>;
  antlion: { pits: number; pitToNestBuNearest: number | null; crossings: number; flicks: number; grabs: number; kills: number; antsOnSlopeS: number };
  bird: { hourlyChecks: number; gate: Record<string, number>; approaches: number; landed: number; pecks: number; kills: number };
  deathsByCause: Record<string, number>;
  workerDeathsPredatorByKind: Record<string, number>;
  events: Record<string, number>;
  finalHash: string; wallS: number;
}

/** The observer: reads state and events only. */
export class ThreatObserver {
  readonly kinds: Record<string, KindFunnel> = {};
  readonly antlion = { pits: 0, pitToNestBuNearest: null as number | null, crossings: 0, flicks: 0, grabs: 0, kills: 0, antsOnSlopeS: 0 };
  readonly bird = { hourlyChecks: 0, gate: {} as Record<string, number>, approaches: 0, landed: 0, pecks: 0, kills: 0 };
  readonly deathsByCause: Record<string, number> = {};
  readonly workerDeathsPredatorByKind: Record<string, number> = {};
  readonly events: Record<string, number> = {};
  outsideWorkerS = 0;
  samples = 0;
  private nearest: Record<string, number[]> = {};
  private inSenseS: Record<string, number> = {};
  private selecting = new Map<number, number>(); // creature id -> target id it held last sample
  private approaching = new Map<number, string>(); // creature id -> state
  private onSlope = new Set<number>();
  private lastHolder = new Map<number, Creature['kind']>(); // ant id -> kind that last seized / struck it
  private readonly bu: number;

  constructor(private readonly sim: Sim, private readonly col: number) {
    this.bu = sim.world.bu;
    for (const k of [...HUNTERS, 'antlion' as CreatureKind]) this.kinds[k] = emptyKind();
    const entrance = this.entrance();
    const terrDist: Record<string, number[]> = {};
    for (const t of sim.state.ecology.director.territories) {
      if (!this.kinds[t.kind]) continue;
      this.kinds[t.kind].territories++;
      if (entrance) (terrDist[t.kind] ??= []).push(Math.hypot(t.center.x - entrance.x, t.center.z - entrance.z) / this.bu);
    }
    for (const [k, ds] of Object.entries(terrDist)) {
      ds.sort((a, b) => a - b);
      this.kinds[k].territoryToNestBu = { nearest: r2(ds[0]), median: r2(ds[Math.floor(ds.length / 2)]) };
    }
    const on = (t: string, f: (e: never) => void) => sim.events.on(t as never, f as never);
    on('creature-spawned', (e: { kind: CreatureKind }) => { if (this.kinds[e.kind]) this.kinds[e.kind].spawned++; });
    on('predator-telegraph', (e: { kind: CreatureKind; targetId: number }) => {
      if (!this.kinds[e.kind]) return;
      this.kinds[e.kind].stages.telegraph++;
      this.lastHolder.set(e.targetId, e.kind);
    });
    on('predator-strike', (e: { creatureId: number; targetId: number; hit: boolean }) => {
      const c = sim.stores.creatures.get(e.creatureId);
      const k = c ? c.kind : this.lastHolder.get(e.targetId);
      if (!k || !this.kinds[k]) return;
      this.kinds[k].stages.strike++;
      if (e.hit) this.kinds[k].stages.hit++;
      this.lastHolder.set(e.targetId, k);
    });
    on('ant-seized', (e: { antId: number; by: number }) => {
      const c = sim.stores.creatures.get(e.by);
      if (c) this.lastHolder.set(e.antId, c.kind);
    });
    on('antlion-flick', () => { this.antlion.flicks++; });
    on('antlion-grab', (e: { antId: number }) => { this.antlion.grabs++; this.lastHolder.set(e.antId, 'antlion'); });
    on('bird-approach', () => { this.bird.approaches++; });
    on('bird-landed', () => { this.bird.landed++; });
    on('bird-peck', () => { this.bird.pecks++; });
    on('ant-died', (e: { antId: number; colonyId: number; cause: string; caste: string }) => {
      if (e.colonyId !== this.col) return;
      bump(this.deathsByCause, e.cause);
      if (e.cause === 'bird') this.bird.kills++;
      if (e.cause === 'antlion') this.antlion.kills++;
      if (e.cause === 'predation' || e.cause === 'antlion' || e.cause === 'bird') {
        const k = e.cause === 'bird' ? 'bird' : e.cause === 'antlion' ? 'antlion' : (this.lastHolder.get(e.antId) ?? 'unknown');
        if (isWorkerCaste(e.caste as Ant['caste'])) bump(this.workerDeathsPredatorByKind, k);
        if (this.kinds[k] && e.cause === 'predation') this.kinds[k].stages.kill++;
      }
    });
    for (const t of ['ant-freed', 'ant-paralysed', 'alert', 'alarm-raised', 'creature-died', 'creature-despawned']) on(t, () => bump(this.events, t));
  }

  private entrance(): { x: number; z: number } | null {
    const n = this.sim.state.nests.find((x) => x.alive && x.colony === this.col);
    return n && n.entrances.length > 0 ? { x: n.entrances[0].pos.x, z: n.entrances[0].pos.z } : null;
  }

  private surfaceWorkers(out: Ant[]): Ant[] {
    out.length = 0;
    for (const a of this.sim.stores.ants.list) {
      if (a.alive && a.colony === this.col && isWorkerCaste(a.caste) && a.nestId < 0 && a.medium === 'surface') out.push(a);
    }
    return out;
  }

  /** First filter of the victim rule (predator.ts canPrey / findVictim, spiders.ts / hunters.ts activity) that fails. */
  private failReason(c: Creature, a: Ant, workers: number, entrance: { x: number; z: number } | null): string {
    const cond = conditions(this.sim);
    const lv = CREATURE_LEVERS[this.sim.state.config.difficulty.preset] ?? CREATURE_LEVERS.naturalist;
    if (c.kind === 'jumping-spider' && !(cond.day && cond.airC >= 15)) return 'inactive (night or < 15 C)';
    if ((c.kind === 'centipede' || c.kind === 'rove-beetle') && !(cond.dark && !cond.winter)) return 'inactive (day)';
    if (c.kind === 'ant-spider' && !cond.dark) return 'inactive (day)';
    if (c.kind === 'wolf-spider' && c.state === 'rest') return 'resting (day x0.4)';
    if (a.massMg > (PREY_MAX_MG[c.kind] ?? 0)) return `ant too heavy (${r2(a.massMg)} mg)`;
    if ((a.flags & AntFlag.FOUNDING) !== 0 && !lv.targetFoundingQueen) return 'founding queen protected';
    if (lv.nestExclusionBu > 0 && workers < NEST_EXCLUSION_WORKERS && entrance
      && Math.hypot(a.pos.x - entrance.x, a.pos.z - entrance.z) < lv.nestExclusionBu * REF_BU_MM) return 'nest exclusion';
    if ((a.bb['cr.immune'] ?? 0) > this.sim.state.tick || (a.combat && a.combat.seizedBy >= 0)) return 'immune / held';
    if (c.kind === 'jumping-spider' || c.kind === 'rove-beetle') {
      const L = (a.lengthBu > 0 ? a.lengthBu : 1) * this.bu;
      for (const b of this.sim.stores.ants.list) {
        if (b !== a && b.alive && b.colony === a.colony && dist(a.pos, b.pos) <= LONE_ANT_L * L) return 'not lone (nestmate within 3 L)';
      }
    }
    if (c.kind === 'centipede' || c.kind === 'rove-beetle') {
      const gate = windupMaxTargetSpeed(c.kind, lv.telegraphMult) * (c.kind === 'centipede' ? 3 : 1);
      if (a.speed > gate) return `ant faster than ${r2(gate)} mm/s`;
    }
    return 'eligible';
  }

  private readonly _w: Ant[] = [];

  /** Called every tick after sim.tick(). */
  tick(): void {
    const sim = this.sim;
    if (sim.state.tick % SAMPLE_TICKS !== 0) return;
    const dt = SAMPLE_TICKS / 10;
    this.samples++;
    const workersAll = sim.stores.ants.list.filter((a) => a.alive && a.colony === this.col && isWorkerCaste(a.caste)).length;
    const surf = this.surfaceWorkers(this._w);
    this.outsideWorkerS += surf.length * dt;
    const entrance = this.entrance();
    const hourly = sim.state.tick % Math.round(TICKS_PER_DAY / 24) === 0;
    const lv = CREATURE_LEVERS[sim.state.config.difficulty.preset] ?? CREATURE_LEVERS.naturalist;
    const seenNow = new Set<number>();
    for (const c of sim.stores.creatures.list) {
      if (!c.alive) continue;
      const kf = this.kinds[c.kind];
      if (!kf) continue;
      seenNow.add(c.id);
      kf.aliveSampleS += dt;
      bump(kf.stateS, c.state, dt);
      if (c.kind === 'antlion') continue;
      const sense = CREATURE_STATS[c.kind].senseMm;
      let best: Ant | null = null, bd = Infinity;
      for (const a of surf) { const d = dist(a.pos, c.pos); if (d < bd) { bd = d; best = a; } }
      if (hourly && best) (this.nearest[c.kind] ??= []).push(bd / this.bu);
      if (best && bd <= sense) {
        bump(this.inSenseS, c.kind, dt);
        kf.stages.sense++;
        bump(kf.senseFail, this.failReason(c, best, workersAll, entrance), dt);
      }
      // select / approach (state machine as it is: target held in bb.tgt while in an approach state)
      const appr = APPROACH_STATES[c.kind];
      const inAppr = appr ? appr.includes(c.state) : (c.nav.status === 'moving' && (c.state === 'prowl' || c.state === 'forage') && sim.stores.ants.has(c.bb.tgt ?? -1));
      const prev = this.approaching.get(c.id);
      if (inAppr && prev === undefined) { kf.stages.select++; kf.stages.approach++; }
      if (!inAppr && prev !== undefined) bump(kf.approachEnd, c.state);
      if (inAppr) {
        this.approaching.set(c.id, c.state);
        const t = sim.stores.ants.get(c.bb.tgt ?? -1);
        if (t) {
          const gate = windupMaxTargetSpeed(c.kind, lv.telegraphMult);
          const d = dist(t.pos, c.pos);
          const range = c.kind === 'jumping-spider' ? 16 : c.kind === 'wolf-spider' ? 30 : c.kind === 'ant-spider' ? 6 : 15;
          bump(kf.approachBlock, d > range ? 'out of strike range' : t.speed > gate ? `in range, ant faster than ${r2(gate)} mm/s` : 'in range and slow', dt);
        } else bump(kf.approachBlock, 'target gone', dt);
      } else this.approaching.delete(c.id);
      if (c.state === 'feed' && this.selecting.get(c.id) !== -2) { kf.stages.feed++; this.selecting.set(c.id, -2); }
      else if (c.state !== 'feed' && this.selecting.get(c.id) === -2) this.selecting.delete(c.id);
    }
    for (const id of [...this.approaching.keys()]) if (!seenNow.has(id)) this.approaching.delete(id);
    // antlion pits: ants on a live pit's slope
    for (const h of sim.state.ecology.hazards) {
      if (h.kind !== 'antlion-pit' || h.untilTick !== undefined) continue;
      for (const a of surf) {
        const on = Math.hypot(a.pos.x - h.pos.x, a.pos.z - h.pos.z) <= h.radius;
        const key = a.id * 100003 + h.id;
        if (on) { this.antlion.antsOnSlopeS += dt; if (!this.onSlope.has(key)) { this.onSlope.add(key); this.antlion.crossings++; } }
        else this.onSlope.delete(key);
      }
    }
    if (hourly) this.birdGate(workersAll);
  }

  /** Why an hourly bird roll would not start (the gates of bird.ts birdHourly, read only). */
  private birdGate(workers: number): void {
    const sim = this.sim;
    this.bird.hourlyChecks++;
    const cond = conditions(sim);
    if (sim.state.ecology.birdEvent) { bump(this.bird.gate, 'event active'); return; }
    if (cond.raining || cond.winter) { bump(this.bird.gate, 'rain / winter'); return; }
    const cal = calendarNow(sim);
    if (cal.hour < cal.sunrise + 1 || cal.hour > cal.sunset - 1) { bump(this.bird.gate, 'outside daylight window'); return; }
    if (workers < BIRD_MIN_WORKERS) { bump(this.bird.gate, `colony < ${BIRD_MIN_WORKERS} workers`); return; }
    const r = BIRD_TARGET_RADIUS_BU * REF_BU_MM;
    let bestN = 0;
    const surf = this.surfaceWorkers(this._w);
    for (const p of surf) {
      let n = 0;
      for (const a of surf) if (dist(a.pos, p.pos) <= r && isExposedAnt(sim, a)) n++;
      if (n > bestN) bestN = n;
    }
    bump(this.bird.gate, bestN < BIRD_MIN_EXPOSED ? `< ${BIRD_MIN_EXPOSED} exposed ants within 25 BU` : 'eligible (roll)');
  }

  result(): Pick<FunnelResult, 'kinds' | 'antlion' | 'bird' | 'deathsByCause' | 'workerDeathsPredatorByKind' | 'events'> {
    for (const [k, kf] of Object.entries(this.kinds)) {
      kf.aliveAvg = r2(kf.aliveSampleS / Math.max(1, this.samples));
      kf.inSenseShare = r2((this.inSenseS[k] ?? 0) / Math.max(1e-9, kf.aliveSampleS));
      const ds = (this.nearest[k] ?? []).sort((a, b) => a - b);
      kf.nearestAntBuMedian = ds.length ? r2(ds[Math.floor(ds.length / 2)]) : null;
      kf.nearestAntBuMin = ds.length ? r2(ds[0]) : null;
      for (const m of [kf.stateS, kf.senseFail, kf.approachBlock]) for (const key of Object.keys(m)) m[key] = Math.round(m[key]);
    }
    const ent = this.entrance();
    const pits = this.sim.state.ecology.hazards.filter((h) => h.kind === 'antlion-pit');
    this.antlion.pits = pits.length;
    if (ent && pits.length) this.antlion.pitToNestBuNearest = r2(Math.min(...pits.map((h) => Math.hypot(h.pos.x - ent.x, h.pos.z - ent.z))) / this.bu);
    this.antlion.antsOnSlopeS = Math.round(this.antlion.antsOnSlopeS);
    return { kinds: this.kinds, antlion: this.antlion, bird: this.bird, deathsByCause: this.deathsByCause, workerDeathsPredatorByKind: this.workerDeathsPredatorByKind, events: this.events };
  }
}

/** Restores a hand-over snapshot with its world and applies the preset / rules to the run (setDifficulty command). */
export function simFromSnapshot(o: Pick<Opts, 'archetype' | 'seed' | 'preset' | 'rules'>, snap: Uint8Array): Sim {
  const base = defaultGameConfig('lasius-niger', o.seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: o.archetype });
  const sim = createSim(restore(snap).state, world);
  if (o.preset || o.rules) {
    sim.enqueue({ type: 'setDifficulty', ...(o.preset ? { preset: o.preset } : {}), ...(o.rules ? { custom: o.rules } : {}) } as never);
    sim.tick();
  }
  return sim;
}

export function runFunnel(o: Opts, snap: Uint8Array, log: (s: string) => void): FunnelResult {
  const t0 = Date.now();
  const sim = simFromSnapshot(o, snap);
  const col = sim.state.player.colonyId;
  const workers = () => sim.stores.ants.list.filter((a) => a.alive && a.colony === col && isWorkerCaste(a.caste)).length;
  const w0 = workers();
  const startTick = sim.state.tick;
  const obs = new ThreatObserver(sim, col);
  const end = startTick + o.days * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    sim.tick();
    obs.tick();
    if (sim.state.tick % TICKS_PER_DAY === 0) log(`gd ${r2((sim.state.tick - startTick) / TICKS_PER_DAY)}: workers ${workers()}, telegraphs ${HUNTERS.map((k) => obs.kinds[k].stages.telegraph).join('/')}`);
  }
  const days = (sim.state.tick - startTick) / TICKS_PER_DAY;
  const outsideH = obs.outsideWorkerS / 25; // 1 clock hour = 25 s
  return {
    tool: 'threatFunnel', options: o, startGd: r2(startTick / TICKS_PER_DAY), days: r2(days),
    colony: { workersStart: w0, workersEnd: workers(), outsideWorkerHours: Math.round(outsideH), outsideAvg: r2(obs.outsideWorkerS / Math.max(1, obs.samples)) },
    ...obs.result(), finalHash: stateHash(sim.state), wallS: Math.round((Date.now() - t0) / 100) / 10,
  };
}

/** Markdown funnel table of one or more runs (summed). */
export function funnelTable(runs: FunnelResult[]): string {
  const lines = ['| kind | territories (nearest BU) | alive avg | in-sense share | ' + STAGES.join(' | ') + ' | top sense filter | top approach block |', '|' + '---|'.repeat(STAGES.length + 6)];
  for (const k of [...HUNTERS, 'antlion']) {
    const st: Record<string, number> = {}, sf: Record<string, number> = {}, ab: Record<string, number> = {};
    let terr = 0, alive = 0, share = 0, near = Infinity;
    for (const r of runs) {
      const kf = r.kinds[k];
      terr += kf.territories; alive += kf.aliveAvg; share += kf.inSenseShare;
      if (kf.territoryToNestBu.nearest !== null) near = Math.min(near, kf.territoryToNestBu.nearest);
      for (const s of STAGES) bump(st, s, kf.stages[s]);
      for (const [a, b] of Object.entries(kf.senseFail)) bump(sf, a, b);
      for (const [a, b] of Object.entries(kf.approachBlock)) bump(ab, a, b);
    }
    const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a, b]) => `${a} ${b}s`).join('; ') || '-';
    lines.push(`| ${k} | ${terr} (${Number.isFinite(near) ? Math.round(near) : '-'}) | ${r2(alive)} | ${r2(share / runs.length)} | ${STAGES.map((s) => st[s]).join(' | ')} | ${top(sf)} | ${top(ab)} |`);
  }
  return lines.join('\n');
}

interface NodeFs { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void; existsSync(p: string): boolean; readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const o = parse(args);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const file = o.snapshot ?? `${o.cache}/founded-lasius-niger-${o.archetype}-${o.seed}-naturalist-d-any.bin`;
  if (!fs.existsSync(file)) { console.error(`no hand-over snapshot ${file}`); process.exitCode = 2; return; }
  const r = runFunnel(o, new Uint8Array(fs.readFileSync(file)), (s) => console.error(`[funnel ${o.archetype} #${o.seed} ${o.preset ?? 'snap'}] ${s}`));
  const md = funnelTable([r]);
  console.error(md);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    const b = `${o.out}/funnel-${o.archetype}-${o.seed}-${o.preset ?? 'naturalist'}${o.rules ? '-custom' : ''}${o.tag}`;
    fs.writeFileSync(`${b}.json`, JSON.stringify(r, null, 1));
    fs.writeFileSync(`${b}.md`, md + '\n');
  } else console.log(JSON.stringify(r));
}
