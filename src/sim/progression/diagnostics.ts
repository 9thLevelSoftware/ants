// Diagnostics registry (the "why" view, GDD 08 §4.4, GDD 02 §14, GDD 06 App. D): modules publish records, this file
// stores one current record per id, keeps `sinceTick` of an unchanged status, emits `diagnostic-changed` on a status
// change, feeds the alert engine (and raises an alert the cooldown held back once the cooldown is over, if the
// status still holds), ranks the records for the Colony health view and follows cause chains.
// Modules compute their own factors and statuses; nothing here judges another module's numbers.

import type { AlertKind, AlertLevel, Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim } from '@/sim/types';
import { ALERT_LEVELS } from '@/sim/types';
import { CAUSE_CHAIN_DEPTH, DIAG_VALUE_MAX } from '@/sim/balance';
import { alertRefusal, clearAlert, raiseAlert } from './alerts';
import { engineOf, memGet, memSet } from './engine';

/** Status order for ranking: worst first. */
const STATUS_RANK: Record<DiagnosticStatus, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

/**
 * Alerts raised on a diagnostic's status change, for diagnostics whose owner does not raise an alert of its own
 * (GDD 08 §6.5 catalogue; level = the catalogue level on `warn`, one level higher on `bad`). The colony raises its
 * own food, brood, trail and starvation alerts (GDD 02 §14), so those diagnostics are not listed.
 */
export const DIAGNOSTIC_ALERTS: Readonly<Record<string, { kind: AlertKind; level: AlertLevel; warnOnly?: boolean }>> = {
  'diag-nest-space': { kind: 'nest-crowded', level: 'notice' },
  'diag-dig-progress': { kind: 'dig-stalled', level: 'notice' },
  'diag-nest-flood': { kind: 'nest-flooding', level: 'critical' },
  'diag-nest-stability': { kind: 'nest-collapse-risk', level: 'warning' },
  'diag-heat-exposure': { kind: 'heat-danger', level: 'warning' },
  'diag-overwinter-readiness': { kind: 'winter-coming', level: 'notice' },
  // `bad` = orphaned: the colony raises `queen-died` itself, so only the low-reserve warning comes from here
  'diag-queen-condition': { kind: 'queen-reserves-low', level: 'warning', warnOnly: true },
  'diag-threats': { kind: 'predator-near', level: 'warning' },
  'diag-defence': { kind: 'raid-seen', level: 'warning' },
  'diag-garden': { kind: 'garden-failing', level: 'warning' },
  'diag-granary': { kind: 'granary-spoiling', level: 'warning' },
  'diag-wood': { kind: 'wood-drying', level: 'warning' },
  'diag-storage': { kind: 'save-failed', level: 'warning' },
};

function finite(v: number, fallback = 0): number {
  if (Number.isNaN(v)) return fallback;
  if (v === Infinity) return DIAG_VALUE_MAX;
  if (v === -Infinity) return -DIAG_VALUE_MAX;
  return Math.max(-DIAG_VALUE_MAX, Math.min(DIAG_VALUE_MAX, v));
}

/** A clean copy: finite numbers (a ratio over a zero capacity arrives as Infinity), weights in 0..1 summing to 1. */
export function sanitizeDiagnostic(d: Diagnostic): Diagnostic {
  const factors: DiagnosticFactor[] = (d.factors ?? []).map((f) => ({
    cause: String(f.cause), weight: Math.max(0, finite(f.weight)), detail: String(f.detail ?? ''), diagId: f.diagId ?? null,
  }));
  const sum = factors.reduce((a, f) => a + f.weight, 0);
  if (sum > 0) for (const f of factors) f.weight /= sum;
  factors.sort((a, b) => b.weight - a.weight || a.cause.localeCompare(b.cause));
  return {
    id: d.id, system: d.system, status: d.status, label: d.label, value: finite(d.value), factors,
    remedies: [...(d.remedies ?? [])], sinceTick: Number.isFinite(d.sinceTick) ? d.sinceTick : 0,
    focus: d.focus ? { ...d.focus, pos: { ...d.focus.pos } } : null,
  };
}

/** Publishes (replaces) a diagnostic record by id; emits `diagnostic-changed` on a status change. */
export function publishDiagnostic(sim: Sim, d: Diagnostic): void {
  const list = sim.state.progression.diagnostics;
  const rec = sanitizeDiagnostic(d);
  const i = list.findIndex((x) => x.id === rec.id);
  const prev = i >= 0 ? list[i] : undefined;
  // a negative or missing sinceTick means "not given": the tick of the status change, kept while the status holds
  const given = Number.isFinite(d.sinceTick) && d.sinceTick >= 0;
  if (prev && prev.status === rec.status) rec.sinceTick = given ? Math.min(prev.sinceTick, d.sinceTick) : prev.sinceTick;
  else if (!given) rec.sinceTick = sim.state.tick;
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  noteStatus(sim, rec);
  if (!prev || prev.status !== rec.status) {
    sim.emit({ type: 'diagnostic-changed', id: rec.id, status: rec.status, topCause: rec.factors[0]?.cause ?? '' });
    alertOnChange(sim, rec, prev?.status ?? 'ok');
  }
}

const STATUS_KEY = (id: string): string => `dstat:${id}`;
const STATUS_CODES: readonly DiagnosticStatus[] = ['ok', 'info', 'warn', 'bad'];

/** Remembers the status progression last saw for a record (change detection of directly written records). */
function noteStatus(sim: Sim, d: Diagnostic): void {
  memSet(sim, STATUS_KEY(d.id), STATUS_CODES.indexOf(d.status));
}

/**
 * Registry upkeep (diagnostics system, every DIAGNOSTICS_EVERY ticks): records a module wrote straight into the list
 * are sanitised (an Infinity value from a zero capacity becomes DIAG_VALUE_MAX) and their status changes get the
 * same event and alert as a published change.
 */
export function refreshDiagnostics(sim: Sim): void {
  const list = sim.state.progression.diagnostics;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const bad = !Number.isFinite(d.value) || d.factors.some((f) => !Number.isFinite(f.weight));
    if (bad) list[i] = sanitizeDiagnostic(d);
    const seen = memGet(sim, STATUS_KEY(d.id), -1);
    const now = STATUS_CODES.indexOf(list[i].status);
    if (seen === now) {
      retryHeldAlert(sim, list[i]);
      continue;
    }
    noteStatus(sim, list[i]);
    sim.emit({ type: 'diagnostic-changed', id: list[i].id, status: list[i].status, topCause: list[i].factors[0]?.cause ?? '' });
    alertOnChange(sim, list[i], seen >= 0 ? STATUS_CODES[seen] : 'ok');
  }
}

/** Removes a record (a subject that no longer exists, e.g. a finished dig plan). */
export function retractDiagnostic(sim: Sim, id: string): void {
  const list = sim.state.progression.diagnostics;
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  delete engineOf(sim).mem[STATUS_KEY(id)];
  delete engineOf(sim).mem[HELD_KEY(id)];
  const map = DIAGNOSTIC_ALERTS[baseId(id)];
  if (map) clearAlert(sim, map.kind, subjectOf(id));
}

/** Diagnostic id without a per-subject suffix (`diag-dig-progress:42` -> `diag-dig-progress`). */
export function baseId(id: string): string {
  const k = id.indexOf(':');
  return k < 0 ? id : id.slice(0, k);
}

function subjectOf(id: string): number {
  const k = id.indexOf(':');
  const n = k < 0 ? -1 : Number(id.slice(k + 1));
  return Number.isInteger(n) ? n : -1;
}

/** Marks a diagnostic whose alert raise was refused (cooldown or full list) while its status holds. */
const HELD_KEY = (id: string): string => `dheld:${id}`;

/** The alert a diagnostic's status asks for, or null when the status asks for none (or a clear). */
function alertFor(d: Diagnostic): { kind: AlertKind; level: AlertLevel; subject: number } | null {
  const map = DIAGNOSTIC_ALERTS[baseId(d.id)];
  if (!map) return null;
  if (d.status === 'ok' || d.status === 'info' || (map.warnOnly && d.status === 'bad')) return null;
  const li = ALERT_LEVELS.indexOf(map.level);
  const level = d.status === 'bad' ? ALERT_LEVELS[Math.min(ALERT_LEVELS.length - 1, li + 1)] : map.level;
  return { kind: map.kind, level, subject: subjectOf(d.id) };
}

function raiseFor(sim: Sim, d: Diagnostic, a: { kind: AlertKind; level: AlertLevel; subject: number }): void {
  const top = d.factors[0];
  const id = raiseAlert(sim, {
    kind: a.kind, level: a.level, subjectId: a.subject, title: d.label, cause: top ? top.detail || top.cause : '',
    focus: d.focus, diagnosticId: d.id,
  });
  // a refused raise is retried by the registry upkeep while the status holds (the condition must not go unseen)
  if (id < 0) memSet(sim, HELD_KEY(d.id), 1);
  else delete engineOf(sim).mem[HELD_KEY(d.id)];
}

function alertOnChange(sim: Sim, d: Diagnostic, from: DiagnosticStatus): void {
  const map = DIAGNOSTIC_ALERTS[baseId(d.id)];
  if (!map) return;
  const want = alertFor(d);
  if (want) {
    raiseFor(sim, d, want);
    return;
  }
  delete engineOf(sim).mem[HELD_KEY(d.id)];
  if (from === 'warn' || from === 'bad') clearAlert(sim, map.kind, subjectOf(d.id));
}

/** Raises a held-back alert once nothing refuses it any more, if the diagnostic still asks for it. */
function retryHeldAlert(sim: Sim, d: Diagnostic): void {
  if (memGet(sim, HELD_KEY(d.id)) <= 0) return;
  const want = alertFor(d);
  if (!want) {
    delete engineOf(sim).mem[HELD_KEY(d.id)];
    return;
  }
  if (alertRefusal(sim, { kind: want.kind, level: want.level, subjectId: want.subject }) === null) raiseFor(sim, d, want);
}

export function getDiagnostic(sim: Sim, id: string): Diagnostic | undefined {
  return sim.state.progression.diagnostics.find((x) => x.id === id);
}

/** One row of the Colony health view. */
export interface HealthRow {
  diagnostic: Diagnostic;
  /** Rank position (0 = first shown). */
  rank: number;
}

/** Records sorted for the Colony health view: bad -> warn -> info -> ok, then newest `sinceTick` first, then id. */
export function rankedDiagnostics(sim: Sim): Diagnostic[] {
  return sim.state.progression.diagnostics
    .map(sanitizeDiagnostic)
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.sinceTick - a.sinceTick || a.id.localeCompare(b.id));
}

/** Overall status of the colony: the worst published status ('ok' when there is none). */
export function overallStatus(sim: Sim): DiagnosticStatus {
  let worst: DiagnosticStatus = 'ok';
  for (const d of sim.state.progression.diagnostics) if (STATUS_RANK[d.status] < STATUS_RANK[worst]) worst = d.status;
  return worst;
}

/** One link of a cause chain: the diagnostic and the factor that leads on to the next link (null at the end). */
export interface CauseLink {
  diagId: string;
  status: DiagnosticStatus;
  label: string;
  depth: number;
  factor: DiagnosticFactor | null;
}

/**
 * The cause chain of a diagnostic, in order from the symptom down: at each step the heaviest factor that cites
 * another published diagnostic is followed. Depth limit CAUSE_CHAIN_DEPTH links after the first; a cycle is cut at
 * the first repeat (GDD 08 §4.4).
 */
export function causeChain(sim: Sim, diagId: string, maxDepth = CAUSE_CHAIN_DEPTH): CauseLink[] {
  const out: CauseLink[] = [];
  const seen = new Set<string>();
  let id: string | null = diagId;
  while (id && !seen.has(id) && out.length <= maxDepth) {
    const d = getDiagnostic(sim, id);
    if (!d) break;
    seen.add(id);
    const next = d.factors
      .filter((f) => f.diagId && !seen.has(f.diagId) && getDiagnostic(sim, f.diagId))
      .sort((a, b) => b.weight - a.weight)[0] ?? null;
    out.push({ diagId: d.id, status: d.status, label: d.label, depth: out.length, factor: next });
    id = next ? next.diagId : null;
  }
  return out;
}

/** Nested factor tree of a diagnostic for the expanded Colony health row (every chained factor, depth-limited). */
export interface CauseNode {
  factor: DiagnosticFactor;
  children: CauseNode[];
}

export function causeTree(sim: Sim, diagId: string, maxDepth = CAUSE_CHAIN_DEPTH): CauseNode[] {
  const walk = (id: string, depth: number, seen: Set<string>): CauseNode[] => {
    const d = getDiagnostic(sim, id);
    if (!d) return [];
    const next = new Set(seen).add(id);
    return d.factors.map((f) => ({
      factor: { ...f },
      children: f.diagId && depth < maxDepth && !next.has(f.diagId) ? walk(f.diagId, depth + 1, next) : [],
    }));
  };
  return walk(diagId, 0, new Set());
}

/** The worst current diagnostic's chain of ids plus the last link's heaviest cause (epitaph, `colony.extinct`). */
export function worstCauseChain(sim: Sim): string[] {
  const top = rankedDiagnostics(sim).find((d) => d.status === 'bad' || d.status === 'warn');
  if (!top) return [];
  const chain = causeChain(sim, top.id);
  const out = chain.map((l) => l.diagId);
  const cause = getDiagnostic(sim, chain[chain.length - 1].diagId)?.factors[0]?.cause;
  if (cause) out.push(cause);
  return out;
}
