// Quiet-time observer (quiet-time task, step 1): changes no rule. From a cached hand-over snapshot it runs N game
// days (AI only, no possession) and reports, per alert kind, how often it was raised / updated / cleared, how many
// seconds it was on screen at warning and at critical, and which daytime hours it made loud for invariant I11
// (GDD 05 §6: an hour is loud when a major threat was active in it, or a warning/critical alert was on screen for
// >= 25 % of it); the quiet share per trailing 3-game-day window; human events started per game day by kind.
//
//   node tools/sim/run-ts.mjs tools/sim/quietRun.ts --archetype suburban-garden --seed 1 --days 6
//        [--preset gentle|naturalist|harsh] [--rules '{"humanActivity":"high"}'] [--cache DIR] [--out DIR] [--tag T]
//        [--workers N] [--food C,P] [--run-seed K] [--until-winter 1] [--snapshot FILE]
//
// The hour record is the sim's own (quietTracker); this file only attributes the loud hours. Wall clock and files
// live here, never in src/sim.

import type { ArchetypeId, DifficultyId, Sim } from '@/sim/types';
// first: the sim modules import each other in cycles, and entering through a deep module breaks system assembly
import { simFromSnapshot } from './threatFunnel';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '@/sim/time';
import { stateHash } from '@/sim/save';
import { calendarNow } from '@/sim/environment/calendar';
import { isWorkerCaste } from '@/sim/colony/census';
import { QUIET_ALERT_SHARE, QUIET_SAMPLE_EVERY, QUIET_WINDOW_GD } from '@/sim/balance/creatures';
import { canStartMajorThreat, quietTracker } from '@/sim/ecology/creatures';
import { rngFork } from '@/core/rng';
import { daysPerYear } from '@/sim/time';
import { HUMAN_EVENT_KINDS } from '@/sim/types';
import { dayContext, drawDayEvents } from '@/sim/environment/human/schedule';
import { expectedDay } from '@/sim/environment/human/testkit';

declare const process: { exitCode?: number };

export interface QuietOpts {
  archetype: ArchetypeId; seed: number; days: number; preset: DifficultyId | null; rules: Record<string, unknown> | null;
  cache: string; out: string | null; tag: string; snapshot: string | null; runSeed: number; workers: number; food: [number, number];
  untilWinter: boolean;
  /** Print the human-event counts per game day at humanActivity off / low / normal / high instead of running. */
  counts: boolean;
}

function parse(args: readonly string[]): QuietOpts {
  const o: QuietOpts = {
    archetype: 'suburban-garden', seed: 1, days: 6, preset: null, rules: null, cache: 'test-output/colony-life/round-4/cache',
    out: null, tag: '', snapshot: null, runSeed: 0, workers: 0, food: [0, 0], untilWinter: false, counts: false,
  };
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
    else if (k === '--run-seed') o.runSeed = Number(v);
    else if (k === '--workers') o.workers = Number(v);
    else if (k === '--food') o.food = v.split(',').map(Number) as [number, number];
    else if (k === '--until-winter') o.untilWinter = v === '1';
    else if (k === '--counts') o.counts = v === '1';
    else throw new Error(`quietRun: unknown option ${k}`);
  }
  return o;
}

/** Alerts raised by the people and the creatures (and rivals): the side this task and the creature soak answer for. */
const OUTSIDE_KINDS = new Set(['human-event-warning', 'predator-near', 'nest-attacked', 'raid-seen', 'queen-in-danger', 'possessed-danger']);
const isOutside = (label: string): boolean => OUTSIDE_KINDS.has(label.split('/')[0]);
const r2 = (x: number): number => Math.round(x * 100) / 100;
const bump = (m: Record<string, number>, k: string, n = 1): void => { m[k] = (m[k] ?? 0) + n; };

/** Per alert kind (human-event-warning split by event kind: `human-event-warning/mowing`). */
export interface KindStats {
  raised: number; updated: number; cleared: number;
  /** Seconds on screen (every tick) at each level. */
  warningS: number; criticalS: number;
  /** Loud daytime counted hours it was the main cause of / took part in (>= 25 % of the hour on its own). */
  loudMain: number; loudPart: number;
  /** Longest single stay, s. */
  longestS: number;
}

export interface HourRecord {
  /** Clock hour index since the start of the run. */
  h: number;
  /** -1 not counted, 0 loud, 1 quiet (the sim's own code). */
  code: number;
  /** Who made a loud hour loud: 'threat' and/or alert labels with their share of the hour. */
  by: { threat: number; alerts: Record<string, number> } | null;
  /** Share of the hour with any warning/critical alert on screen. */
  alertShare: number;
  /** The same for the outside kinds only (people, predators, rivals): the share the colony's own alerts do not touch. */
  outsideShare: number;
}

export interface QuietResult {
  tool: 'quietRun'; options: QuietOpts; startGd: number; days: number;
  colony: { workersStart: number; workersEnd: number };
  kinds: Record<string, KindStats>;
  hours: { total: number; counted: number; quiet: number; loudByThreat: number; loudByAlert: number; loudByBoth: number };
  /** Windows of QUIET_WINDOW_GD x 24 clock hours ending at a counted hour, from the first full window on. */
  windows: { n: number; min: number | null; minAtGd: number | null; failing: number; minCountedHours: number };
  /** Same over every window with at least 24 counted hours (a run shorter than 3 game days has no full window). */
  partialWindows: { n: number; min: number | null; minAtGd: number | null };
  runShare: number | null;
  /** What the quiet share would be with only the outside alerts (people, predators, rivals) and threats counted. */
  outsideOnly: { runShare: number | null; windows: number; min: number | null; failing: number };
  perDay: { gd: number; counted: number; quiet: number }[];
  humanStartsByKind: Record<string, number>; humanCancelledByKind: Record<string, number>; humanDays: number;
  threats: { started: number; startedByKind: Record<string, number>; blockedHours: number; blockedByShareHours: number };
  /** Counts of the alert events seen: raise / update (includes acknowledgement) / clear. */
  hourRecords: HourRecord[];
  finalHash: string; wallS: number;
}

/** Labels an alert for the table: kind, plus the event kind of a human warning. */
export function alertLabel(a: { kind: string; tokens?: Record<string, string | number> }): string {
  return a.kind === 'human-event-warning' && a.tokens?.event ? `${a.kind}/${String(a.tokens.event)}` : a.kind;
}

const emptyKind = (): KindStats => ({ raised: 0, updated: 0, cleared: 0, warningS: 0, criticalS: 0, loudMain: 0, loudPart: 0, longestS: 0 });

/** The observer: reads state and events only. */
export class QuietObserver {
  readonly kinds: Record<string, KindStats> = {};
  readonly hourRecords: HourRecord[] = [];
  readonly humanStarts: Record<string, number> = {};
  readonly humanCancelled: Record<string, number> = {};
  readonly startedByKind: Record<string, number> = {};
  blockedHours = 0; blockedByShareHours = 0;
  private lastTotal: number;
  private hourSamples = 0; private hourAlertSamples = 0; private hourOutsideSamples = 0; private hourThreat = false;
  private hourKinds: Record<string, number> = {};
  private blockedSeen = false; private blockedShare = false;
  private since = new Map<number, number>();
  private firstHour = 0;
  private prevActive: string | null = null;

  constructor(private readonly sim: Sim) {
    this.lastTotal = quietTracker(sim).total;
    this.firstHour = Math.floor(sim.state.tick / TICKS_PER_HOUR);
    const on = (t: string, f: (e: never) => void) => sim.events.on(t as never, f as never);
    on('alert', (e: { op: string; alert: { id: number; kind: string; level: string; tokens?: Record<string, string | number> } }) => {
      const k = this.kind(alertLabel(e.alert));
      if (e.op === 'raise') { k.raised++; this.since.set(e.alert.id, this.sim.state.tick); }
      else if (e.op === 'update') k.updated++;
      else if (e.op === 'clear') {
        k.cleared++;
        const t0 = this.since.get(e.alert.id);
        if (t0 !== undefined) k.longestS = Math.max(k.longestS, (this.sim.state.tick - t0) / TICKS_PER_SECOND);
        this.since.delete(e.alert.id);
      }
    });
    on('human.start', (e: { kind: string }) => bump(this.humanStarts, e.kind));
    on('human.cancelled', (e: { kind: string }) => bump(this.humanCancelled, e.kind));
  }

  private kind(label: string): KindStats { return (this.kinds[label] ??= emptyKind()); }

  /** After every sim.tick(). */
  tick(): void {
    const sim = this.sim, q = quietTracker(sim);
    let loudNow = false, outsideNow = false;
    const seenKinds = new Set<string>();
    for (const a of sim.state.progression.alerts) {
      if (a.level !== 'warning' && a.level !== 'critical') continue;
      loudNow = true;
      const label = alertLabel(a), k = this.kind(label);
      if (a.level === 'warning') k.warningS += 1 / TICKS_PER_SECOND; else k.criticalS += 1 / TICKS_PER_SECOND;
      seenKinds.add(label);
      if (isOutside(label)) outsideNow = true;
    }
    const active = sim.state.rivals.threatDirector.activeKind;
    if (active !== null) this.hourThreat = true;
    if (active !== this.prevActive) { if (active !== null) bump(this.startedByKind, active); this.prevActive = active; }
    if (sim.state.tick % QUIET_SAMPLE_EVERY === 0) {
      this.hourSamples++;
      if (loudNow) this.hourAlertSamples++;
      if (outsideNow) this.hourOutsideSamples++;
      for (const l of seenKinds) bump(this.hourKinds, l);
    }
    if (sim.state.tick % TICKS_PER_HOUR === 1) this.checkBlocked();
    if (q.total === this.lastTotal) return;
    this.lastTotal = q.total;
    this.closeHour(q.hours[(q.head - 1 + q.hours.length) % q.hours.length]);
  }

  /** Once per clock hour: would the director refuse a new major threat now, and is the share the reason? */
  private checkBlocked(): void {
    const sim = this.sim, td = sim.state.rivals.threatDirector;
    if (quietTracker(sim).curCounted !== 1) return;
    if (td.activeKind !== null || canStartMajorThreat(sim)) return;
    this.blockedHours++;
    // the gap since the last threat alone would not refuse it: the quiet share did
    const gapOk = td.lastEndTick < 0 || sim.state.tick - td.lastEndTick >= 0.25 * TICKS_PER_DAY;
    if (gapOk) this.blockedByShareHours++;
  }

  private closeHour(code: number): void {
    const sim = this.sim;
    const hourIdx = Math.floor(sim.state.tick / TICKS_PER_HOUR) - this.firstHour - 1;
    const n = Math.max(1, this.hourSamples);
    const alertShare = this.hourAlertSamples / n;
    let by: HourRecord['by'] = null;
    if (code === 0) {
      const alerts: Record<string, number> = {};
      for (const [l, c] of Object.entries(this.hourKinds)) alerts[l] = r2(c / n);
      by = { threat: this.hourThreat ? 1 : 0, alerts };
      const ranked = Object.entries(alerts).sort((a, b) => b[1] - a[1]);
      const loudAlerts = alertShare >= QUIET_ALERT_SHARE;
      if (loudAlerts && ranked.length > 0) {
        const solo = ranked.filter(([, s]) => s >= QUIET_ALERT_SHARE);
        for (const [l] of solo.length > 0 ? solo : ranked) this.kind(l).loudPart++;
        if (!this.hourThreat) this.kind(ranked[0][0]).loudMain++;
      }
    }
    this.hourRecords.push({ h: hourIdx, code, by, alertShare: r2(alertShare), outsideShare: r2(this.hourOutsideSamples / n) });
    this.hourSamples = 0; this.hourAlertSamples = 0; this.hourOutsideSamples = 0; this.hourThreat = sim.state.rivals.threatDirector.activeKind !== null;
    this.hourKinds = {};
  }

  result(startTick: number): Pick<QuietResult, 'kinds' | 'hours' | 'windows' | 'partialWindows' | 'runShare' | 'outsideOnly' | 'perDay' | 'hourRecords'> {
    const rec = this.hourRecords;
    let counted = 0, quiet = 0, byThreat = 0, byAlert = 0, byBoth = 0;
    for (const h of rec) {
      if (h.code < 0) continue;
      counted++; quiet += h.code;
      if (h.code === 0 && h.by) {
        const al = h.alertShare >= QUIET_ALERT_SHARE;
        if (h.by.threat && al) byBoth++; else if (h.by.threat) byThreat++; else byAlert++;
      }
    }
    const W = QUIET_WINDOW_GD * 24;
    const win = (from: number, minCounted: number, codeOf: (h: HourRecord) => number = (h) => h.code) => {
      let n = 0, min: number | null = null, at: number | null = null, failing = 0, minCounted0 = 0;
      for (let i = Math.max(1, from); i <= rec.length; i++) {
        if (rec[i - 1].code < 0) continue;
        const w = rec.slice(Math.max(0, i - W), i).filter((x) => x.code >= 0);
        if (w.length < minCounted) continue;
        const share = w.reduce((a, b) => a + codeOf(b), 0) / w.length;
        n++;
        if (min === null || share < min) { min = share; at = i; minCounted0 = w.length; }
        if (share < 0.6) failing++;
      }
      return { n, min: min === null ? null : r2(min), at: at === null ? null : r2((startTick + at * TICKS_PER_HOUR) / TICKS_PER_DAY), failing, minCounted: minCounted0 };
    };
    const full = win(W, 1), part = win(1, 24);
    const outsideCode = (h: HourRecord): number => (h.by?.threat || h.outsideShare >= QUIET_ALERT_SHARE ? 0 : 1);
    const out = win(W, 1, outsideCode);
    const outCounted = rec.filter((h) => h.code >= 0);
    const outsideOnly = { runShare: outCounted.length ? r2(outCounted.reduce((a, b) => a + outsideCode(b), 0) / outCounted.length) : null, windows: out.n, min: out.min, failing: out.failing };
    const perDay: QuietResult['perDay'] = [];
    for (let d = 0; d * 24 < rec.length; d++) {
      const day = rec.slice(d * 24, d * 24 + 24).filter((x) => x.code >= 0);
      perDay.push({ gd: d, counted: day.length, quiet: day.reduce((a, b) => a + b.code, 0) });
    }
    return {
      kinds: this.kinds, hours: { total: rec.length, counted, quiet, loudByThreat: byThreat, loudByAlert: byAlert, loudByBoth: byBoth },
      windows: { n: full.n, min: full.min, minAtGd: full.at, failing: full.failing, minCountedHours: full.minCounted },
      partialWindows: { n: part.n, min: part.min, minAtGd: part.at },
      runShare: counted > 0 ? r2(quiet / counted) : null, outsideOnly, perDay, hourRecords: rec,
    };
  }
}

export function runQuiet(o: QuietOpts, snap: Uint8Array, log: (s: string) => void): QuietResult {
  const t0 = Date.now();
  const sim = simFromSnapshot(o, snap);
  return observe(sim, o, log, t0);
}

/** Runs an already built sim for `o.days` game days (or until winter) under the observer. */
export function observe(sim: Sim, o: QuietOpts, log: (s: string) => void, t0 = Date.now()): QuietResult {
  const col = sim.state.player.colonyId;
  const workers = () => sim.stores.ants.list.filter((a) => a.alive && a.colony === col && isWorkerCaste(a.caste)).length;
  const w0 = workers();
  const startTick = sim.state.tick;
  const obs = new QuietObserver(sim);
  const end = startTick + o.days * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    if (o.untilWinter && calendarNow(sim).season === 'winter') break;
    sim.tick();
    obs.tick();
    if (sim.state.tick % TICKS_PER_DAY === 0) log(`gd ${r2((sim.state.tick - startTick) / TICKS_PER_DAY)}: workers ${workers()}, quiet ${quietTracker(sim).quiet}/${quietTracker(sim).counted}`);
  }
  const r = obs.result(startTick);
  const q = quietTracker(sim);
  return {
    tool: 'quietRun', options: o, startGd: r2(startTick / TICKS_PER_DAY), days: r2((sim.state.tick - startTick) / TICKS_PER_DAY),
    colony: { workersStart: w0, workersEnd: workers() },
    ...r,
    humanStartsByKind: obs.humanStarts, humanCancelledByKind: obs.humanCancelled, humanDays: r2((sim.state.tick - startTick) / TICKS_PER_DAY),
    threats: { started: q.threats, startedByKind: obs.startedByKind, blockedHours: obs.blockedHours, blockedByShareHours: obs.blockedByShareHours },
    finalHash: stateHash(sim.state), wallS: Math.round((Date.now() - t0) / 100) / 10,
  };
}

/** Markdown table of one run: per alert kind, then the hour and window summary. */
export function quietTable(r: QuietResult): string {
  const L: string[] = [];
  L.push(`${r.options.archetype} #${r.options.seed} ${r.options.preset ?? 'naturalist'} workers ${r.colony.workersStart}->${r.colony.workersEnd}, gd ${r.startGd} + ${r.days}`);
  L.push('| alert | raised | updated | cleared | warning s | critical s | longest s | loud (main) | loud (part) |', );
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const [k, s] of Object.entries(r.kinds).sort((a, b) => b[1].loudPart - a[1].loudPart || b[1].warningS - a[1].warningS)) {
    L.push(`| ${k} | ${s.raised} | ${s.updated} | ${s.cleared} | ${Math.round(s.warningS)} | ${Math.round(s.criticalS)} | ${Math.round(s.longestS)} | ${s.loudMain} | ${s.loudPart} |`);
  }
  const h = r.hours;
  L.push('');
  L.push(`counted hours ${h.counted} (quiet ${h.quiet}; loud: threat ${h.loudByThreat}, alert ${h.loudByAlert}, both ${h.loudByBoth}); run share ${r.runShare}; full 3-gd windows ${r.windows.n}, min ${r.windows.min} (at gd ${r.windows.minAtGd}), partial (>= 24 counted h) ${r.partialWindows.n}, min ${r.partialWindows.min}`);
  L.push(`outside alerts only (people, predators, rivals; colony, nest and weather alerts silent): run share ${r.outsideOnly.runShare}, full windows ${r.outsideOnly.windows}, min ${r.outsideOnly.min}`);
  L.push(`human starts per gd: ${Object.entries(r.humanStartsByKind).map(([k, n]) => `${k} ${r2(n / Math.max(0.01, r.humanDays))}`).join(', ')}`);
  L.push(`threats started ${r.threats.started}; hours the director refused one ${r.threats.blockedHours} (share the reason ${r.threats.blockedByShareHours})`);
  return L.join('\n');
}

/** Human events per game day by kind, drawn over a default year (seeded) and expected, at each humanActivity setting. */
export function humanCountTable(sim: Sim): string {
  const days = daysPerYear(sim.state.config);
  const L = [`| kind | ${['off', 'low', 'normal', 'high'].map((a) => `${a} drawn / expected`).join(' | ')} |`, '|---|---|---|---|---|'];
  const per: Record<string, Record<string, [number, number]>> = {};
  for (const a of ['off', 'low', 'normal', 'high'] as const) {
    sim.state.config.difficulty.custom = { humanActivity: a };
    sim.state.config.rules.humanActivity = a;
    const rng = rngFork(11, 'quiet.counts');
    for (let d = 0; d < days; d++) {
      const ctx = { ...dayContext(sim, d), heat: false };
      for (const [k, e] of Object.entries(expectedDay(sim, ctx))) ((per[k] ??= {})[a] ??= [0, 0])[1] += e.mean / days;
      for (const e of drawDayEvents(sim, ctx, rng)) {
        if ((e.kind === 'car' || e.kind === 'footsteps') && (e.hour >= 22 || e.hour < 6)) continue; // the quiet-hour extras are outside the table
        ((per[e.kind] ??= {})[a] ??= [0, 0])[0] += 1 / days;
      }
    }
  }
  for (const k of HUMAN_EVENT_KINDS) {
    const row = per[k]; if (!row) continue;
    L.push(`| ${k} | ${(['off', 'low', 'normal', 'high'] as const).map((a) => `${r2(row[a]?.[0] ?? 0)} / ${r2(row[a]?.[1] ?? 0)}`).join(' | ')} |`);
  }
  return L.join('\n');
}

interface NodeFs { mkdirSync(p: string, o: object): void; writeFileSync(p: string, d: string): void; existsSync(p: string): boolean; readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const o = parse(args);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const file = o.snapshot ?? `${o.cache}/founded-lasius-niger-${o.archetype}-${o.seed}-naturalist-d-any.bin`;
  if (!fs.existsSync(file)) { console.error(`no hand-over snapshot ${file}`); process.exitCode = 2; return; }
  if (o.counts) {
    const md = `${o.archetype} #${o.seed}, events per game day over a default year (drawn, seeded / expected)\n${humanCountTable(simFromSnapshot(o, new Uint8Array(fs.readFileSync(file))))}`;
    console.error(md);
    if (o.out) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(`${o.out}/counts-${o.archetype}-${o.seed}.md`, md + '\n'); }
    return;
  }
  const r = runQuiet(o, new Uint8Array(fs.readFileSync(file)), (s) => console.error(`[quiet ${o.archetype} #${o.seed}] ${s}`));
  const md = quietTable(r);
  console.error(md);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    const b = `${o.out}/quiet-${o.archetype}-${o.seed}-${o.preset ?? 'naturalist'}${o.workers ? `-w${o.workers}` : ''}${o.runSeed ? `-r${o.runSeed}` : ''}${o.tag}`;
    fs.writeFileSync(`${b}.json`, JSON.stringify(r, null, 1));
    fs.writeFileSync(`${b}.md`, md + '\n');
  } else console.log(JSON.stringify({ ...r, hourRecords: undefined }));
}
