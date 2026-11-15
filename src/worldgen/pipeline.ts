// The generation pipeline (GDD 04 §4): attempts with seed_a = hash32(seed, a), the 11 steps with their own RNG
// streams and progress weights, registered placers in their steps, validation, regeneration (8 attempts), the
// repair of the best attempt, and the fingerprint. Pure and deterministic: the optional clock only measures.

import { hash2u } from '@/core/math/noise';
import type { WorldData, WorldgenCheck, WorldParams } from '@/sim/types';
import { checkParams, worldDims, type WorldDims } from './params';
import { createContext, emptyLayout, type GenContext } from './kit/context';
import { buildRegistry, discoveredModules, placersFor, type Registry, type WorldgenModule } from './kit/registry';
import { buildLayout, zoneDefs } from './layout';
import { buildHeightfield } from './terrain/heightfield';
import { buildStrata } from './terrain/strata';
import { deriveMaps } from './maps';
import type { ColumnFn } from './kit/column';
import { startPlacer } from './maps/start';
import { shellPlacer } from './structures/shell';
import { runChecks, type CheckResult } from './validate/checks';
import { BUILTIN_REPAIRS } from './validate/repair';
import { worldFingerprint } from './fingerprint';
import { STEPS, WORLDGEN_MAX_ATTEMPTS, type PlacerStep, type StepId } from './tuning/pipeline';

export interface WorldgenProgress { step: StepId; fraction: number; attempt: number }

export interface GenerateOptions {
  onProgress?: (p: WorldgenProgress) => void;
  /** Wall clock in ms (performance.now) for the report's timings; never affects the output. */
  now?: () => number;
  /** Debug `world.forceValidationFail`: the check fails on the first `attempts` attempts. */
  forceFail?: { check: WorldgenCheck; attempts: number };
  /** Content modules (default: those discovered in src/worldgen/{place,populate,catalog}). */
  modules?: readonly WorldgenModule[];
  /** Test hook: the column routine of the derived maps (default the analytic one; the equivalence test passes primColumn). */
  columns?: ColumnFn;
}

export interface WorldgenReport {
  world: WorldData;
  checks: CheckResult[];
  attempts: number;
  repairs: string[];
  /** Failed checks of every rejected attempt (the `worldgen.retry` event payloads). */
  retries: { attempt: number; failedChecks: WorldgenCheck[]; details: string[] }[];
  /** Per-step wall time of the returned attempt (and 'total'), ms; empty without a clock. */
  timingsMs: Record<string, number>;
  notes: string[];
}

/** Built-in placers (replaceable by id) and repairs. */
export const DEFAULT_MODULE: WorldgenModule = { placers: [shellPlacer, startPlacer], repairs: BUILTIN_REPAIRS };

const STEP_ORDER = STEPS.map((s) => s.id);
const weightBefore = (id: StepId) => {
  let w = 0;
  for (const s of STEPS) { if (s.id === id) break; w += s.weight; }
  return w;
};

interface Attempt { ctx: GenContext; checks: CheckResult[]; score: number; timings: Record<string, number> }

/** Runs the placers registered for a step; returns how many ran. */
function runPlacers(ctx: GenContext, reg: Registry, step: PlacerStep): number {
  const list = placersFor(reg, step, ctx.params.archetype);
  for (const p of list) {
    for (const k of p.provides ?? []) ctx.provides.add(k);
    p.run(ctx);
  }
  return list.length;
}

function runAttempt(params: WorldParams, dims: WorldDims, a: number, reg: Registry, opts: GenerateOptions): Attempt {
  const seed = hash2u(params.seed | 0, a) | 0;
  const timings: Record<string, number> = {};
  let ctx = createContext(params, dims, a, seed, emptyLayout(dims));
  const step = (id: StepId, fn: () => void) => {
    opts.onProgress?.({ step: id, fraction: weightBefore(id), attempt: a });
    const t0 = opts.now?.() ?? 0;
    fn();
    if (opts.now) timings[id] = opts.now() - t0;
  };
  step('zones', () => {
    const layout = buildLayout(ctx.rng('wg/zones'), params, dims, seed);
    ctx = createContext(params, dims, a, seed, layout);
    ctx.world.zones = zoneDefs(layout, dims);
    ctx.world.maps.zone.data.set(layout.cells);
    ctx.world.edges = layout.edges;
  });
  step('height', () => {
    buildHeightfield(ctx, ctx.rng('wg/height'));
    buildStrata(ctx, ctx.rng('wg/height/strata'));
  });
  for (const id of ['structures', 'props', 'plants'] as const) step(id, () => runPlacers(ctx, reg, id));
  step('derived', () => deriveMaps(ctx, { column: opts.columns }));
  let late = 0;
  for (const id of ['resources', 'rivals', 'cavities'] as const) step(id, () => { late += runPlacers(ctx, reg, id); });
  // Steps 7-9 can change anything the maps read (primitives, holes, water bodies, ground paint, height edits,
  // food anchors for fSpecial, rival sites for fRival, pre-carve cavities): any placer there means re-deriving.
  if (late > 0) {
    // timed apart from the steps (no progress event: the GDD lists step 6 once)
    const t0 = opts.now?.() ?? 0;
    deriveMaps(ctx, { column: opts.columns });
    if (opts.now) timings.rederive = opts.now() - t0;
  }
  step('start', () => runPlacers(ctx, reg, 'start'));
  let checks: CheckResult[] = [];
  step('validate', () => {
    checks = runChecks(ctx);
    const f = opts.forceFail;
    if (f && a < f.attempts) {
      const c = checks.find((x) => x.id === f.check);
      if (c) { c.status = 'fail'; c.detail += ' (forced)'; }
    }
  });
  const score = checks.filter((c) => c.status !== 'fail').length;
  return { ctx, checks, score, timings };
}

/** Applies the repairs of every failed check to the attempt, re-derives and re-validates it. */
function repairAttempt(best: Attempt, reg: Registry, column?: ColumnFn): string[] {
  const ctx = best.ctx;
  const applied: string[] = [];
  const failed = best.checks.filter((c) => c.status === 'fail').map((c) => c.id);
  const repairs = [...reg.repairs].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const r of repairs) {
    if (!failed.includes(r.check) || applied.includes(r.id)) continue;
    if (r.run(ctx)) {
      applied.push(r.id);
      deriveMaps(ctx, { column });
    }
  }
  if (applied.length > 0) {
    // a repaired world may move the start pose (its own placer decides), then the checks run again
    runPlacers(ctx, reg, 'start');
    best.checks = runChecks(ctx);
    best.score = best.checks.filter((c) => c.status !== 'fail').length;
  }
  return applied;
}

/** Runs the pipeline. Never fails: after 8 failed attempts the best one is repaired and returned. */
export function generateWorldReport(params: WorldParams, opts: GenerateOptions = {}): WorldgenReport {
  checkParams(params);
  const t0 = opts.now?.() ?? 0;
  const dims = worldDims(params);
  const reg = buildRegistry(DEFAULT_MODULE, opts.modules ?? discoveredModules());
  let best: Attempt | null = null;
  let attempts = 0;
  let repairs: string[] = [];
  const retries: WorldgenReport['retries'] = [];
  for (let a = 0; a < WORLDGEN_MAX_ATTEMPTS; a++) {
    const at = runAttempt(params, dims, a, reg, opts);
    attempts = a + 1;
    if (!best || at.score > best.score) best = at;
    if (at.checks.every((c) => c.status !== 'fail')) { best = at; break; }
    const failed = at.checks.filter((c) => c.status === 'fail');
    retries.push({ attempt: a, failedChecks: failed.map((c) => c.id), details: failed.map((c) => `${c.id}: ${c.detail}`) });
    // failures no other attempt can fix (missing content) go straight to repair
    if (failed.every((c) => c.regenerate === false) && !(opts.forceFail && a < opts.forceFail.attempts)) { best = at; break; }
  }
  const chosen = best!;
  if (chosen.checks.some((c) => c.status === 'fail')) repairs = repairAttempt(chosen, reg, opts.columns);
  const w = chosen.ctx.world;
  w.meta.attempts = attempts;
  w.meta.repairs = repairs;
  w.meta.fingerprint = worldFingerprint(w);
  opts.onProgress?.({ step: 'validate', fraction: 1, attempt: attempts - 1 });
  const timingsMs = { ...chosen.timings };
  if (opts.now) timingsMs.total = opts.now() - t0;
  return { world: w, checks: chosen.checks, attempts, repairs, retries, timingsMs, notes: chosen.ctx.notes };
}

export { STEP_ORDER };
