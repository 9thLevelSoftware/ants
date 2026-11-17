// Colony health, pure part (GDD 08 4.4): ranking, the weighted factor lines with their nested cause chains (depth 3,
// cycles cut at the first repeat, at most 5 factors and an "Other" line), value words and the mapping of remedy ids to
// the controls they open. No DOM here; the component only draws what this returns.
import { DIAG_VALUE_WORD, FACTOR_CAUSE_WORD, REMEDY_WORD, STATUS_WORD } from '@/content/text/words';
import type { StatusKind } from '../../components/StatusChip';
import type { UiDiagFactor, UiDiagnostic, UiDiagStatus } from '../../api';
import { HEALTH_CHAIN_DEPTH, HEALTH_FACTORS_MAX, HEALTH_FACTOR_MIN_WEIGHT } from '../balance';

const RANK: Record<UiDiagStatus, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

/** Status chip kind of a diagnostic status. GDD 08 2.6: a diagnostic note shares the circle outline of "Good"; the word tells them apart. */
export function statusKind(s: UiDiagStatus): StatusKind {
  return s === 'info' ? 'ok' : s;
}

export function statusWord(s: UiDiagStatus): string {
  return STATUS_WORD[s];
}

/** Rows sorted for the list: bad, warn, info, ok; then newest `sinceTick` first; then id (GDD 08 4.4). */
export function rankRows(rows: readonly UiDiagnostic[]): UiDiagnostic[] {
  return [...rows].sort((a, b) => RANK[a.status] - RANK[b.status] || b.sinceTick - a.sinceTick || a.id.localeCompare(b.id));
}

/** Worst status of a list ('ok' for none). */
export function overallOf(rows: readonly UiDiagnostic[]): UiDiagStatus {
  let worst: UiDiagStatus = 'ok';
  for (const r of rows) if (RANK[r.status] < RANK[worst]) worst = r.status;
  return worst;
}

/** The record a factor's `diagId` names: the exact id, else the first record of that base id (per-subject ids). */
export function findDiag(rows: readonly UiDiagnostic[], id: string): UiDiagnostic | null {
  return rows.find((r) => r.id === id) ?? rows.find((r) => r.id.startsWith(`${id}:`)) ?? null;
}

/** A factor in words: from the content table, falling back to the id spaced out. */
export function causeWord(cause: string): string {
  const w = FACTOR_CAUSE_WORD[cause];
  if (w) return w;
  const s = cause.replace(/[-_]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface FactorLine {
  cause: string;
  /** Words of the cause. */
  label: string;
  /** 0..100, whole percent. */
  pct: number;
  detail: string;
  /** The diagnostic that explains it, null none. */
  diag: UiDiagnostic | null;
  /** The explaining diagnostic exists but is not expanded: a repeat on the path ("cycle") or the depth limit. */
  cut: 'cycle' | 'depth' | null;
  /** Nested lines of the explaining diagnostic (indented 16 dp). */
  chain: FactorTree | null;
}

export interface FactorTree {
  lines: FactorLine[];
  /** Whole percent of the factors that did not fit ("Other (8 %)"), 0 when all fit. */
  otherPct: number;
}

/** The ranked factor lines of `d`, with nested chains (depth <= 3). `path` holds the ids already on the way down. */
export function factorTree(d: UiDiagnostic, rows: readonly UiDiagnostic[], depth = 1, path: readonly string[] = []): FactorTree {
  const here = [...path, d.id];
  const ranked = [...d.factors].filter((f) => f.weight >= HEALTH_FACTOR_MIN_WEIGHT).sort((a, b) => b.weight - a.weight || a.cause.localeCompare(b.cause));
  const shown = ranked.slice(0, HEALTH_FACTORS_MAX);
  const rest = ranked.slice(HEALTH_FACTORS_MAX);
  const lines = shown.map((f) => factorLine(f, rows, depth, here));
  const otherPct = rest.length ? Math.round(rest.reduce((a, f) => a + f.weight, 0) * 100) : 0;
  return { lines, otherPct };
}

function factorLine(f: UiDiagFactor, rows: readonly UiDiagnostic[], depth: number, path: readonly string[]): FactorLine {
  const target = f.diagId ? findDiag(rows, f.diagId) : null;
  let cut: FactorLine['cut'] = null;
  let chain: FactorTree | null = null;
  if (target) {
    if (path.includes(target.id)) cut = 'cycle';
    else if (depth >= HEALTH_CHAIN_DEPTH) cut = 'depth';
    else chain = factorTree(target, rows, depth + 1, path);
  }
  return { cause: f.cause, label: causeWord(f.cause), pct: Math.round(f.weight * 100), detail: f.detail, diag: target, cut, chain };
}

/** Diagnostic id without a per-subject suffix (`diag-dig-progress:42` -> `diag-dig-progress`). */
export function baseDiagId(id: string): string {
  const k = id.indexOf(':');
  return k < 0 ? id : id.slice(0, k);
}

const oneDecimalBelow10 = (n: number): string => (Math.abs(n) < 10 ? n.toFixed(1) : String(Math.round(n)));

/**
 * The main value in words with its unit (GDD 08 4.4). The sim publishes a different quantity per diagnostic (a ratio of
 * need, a share of capacity, a death rate, a tally), so the unit comes from the content table per id; an id the table
 * does not know shows its bare number. '' when the value means nothing to the player (it is then left out).
 */
export function valueWord(d: UiDiagnostic): string {
  const v = d.value;
  if (!Number.isFinite(v)) return 'no reading';
  const spec = DIAG_VALUE_WORD[baseDiagId(d.id)];
  if (!spec) return oneDecimalBelow10(v);
  switch (spec.kind) {
    case 'none': return '';
    case 'ratio': return `${oneDecimalBelow10(v)} ${spec.unit}`;
    case 'percent': return `${oneDecimalBelow10(v * 100)} % ${spec.unit}`;
    case 'count': return `${Math.round(v)} ${spec.unit}`;
  }
}

/** What opening a remedy does. Remedies never apply anything: they open the control concerned. */
export type RemedyAction =
  | { kind: 'directives'; group: 'forage' | 'nurse' | 'dig' | 'defend' | null; control: 'workforce' | 'diet' | 'stock' | 'stance' | 'architect' | 'brood' }
  | { kind: 'tool'; tool: 'forage' | 'avoid' | 'rally' | 'entrance' | 'move-brood' | 'move-queen' | 'dig' }
  | { kind: 'plan'; chamberType: 'food' | 'nursery' | 'rest' }
  | { kind: 'possess'; role: 'forager' | 'digger' | 'nurse' }
  | { kind: 'advice' };

export interface RemedyLink {
  id: string;
  label: string;
  action: RemedyAction;
}

const REMEDY_ACTION: Readonly<Record<string, RemedyAction>> = {
  'remedy.slider.forage': { kind: 'directives', group: 'forage', control: 'workforce' },
  'remedy.slider.tend': { kind: 'directives', group: 'forage', control: 'workforce' },
  'remedy.slider.nurse': { kind: 'directives', group: 'nurse', control: 'workforce' },
  'remedy.slider.dig': { kind: 'directives', group: 'dig', control: 'workforce' },
  'remedy.diet.protein': { kind: 'directives', group: null, control: 'diet' },
  'remedy.stock.low': { kind: 'directives', group: null, control: 'stock' },
  'remedy.stance.cautious': { kind: 'directives', group: null, control: 'stance' },
  'remedy.architect.auto': { kind: 'directives', group: null, control: 'architect' },
  'remedy.marker.forage': { kind: 'tool', tool: 'forage' },
  'remedy.marker.avoid': { kind: 'tool', tool: 'avoid' },
  'remedy.marker.rally': { kind: 'tool', tool: 'rally' },
  'remedy.marker.entrance': { kind: 'tool', tool: 'entrance' },
  'remedy.marker.move-brood': { kind: 'tool', tool: 'move-brood' },
  'remedy.marker.move-queen': { kind: 'tool', tool: 'move-queen' },
  'remedy.dig.food': { kind: 'plan', chamberType: 'food' },
  'remedy.dig.nursery': { kind: 'plan', chamberType: 'nursery' },
  'remedy.dig.rest': { kind: 'plan', chamberType: 'rest' },
  'remedy.dig.general': { kind: 'tool', tool: 'dig' },
  'remedy.possess.forage': { kind: 'possess', role: 'forager' },
  'remedy.possess.tend': { kind: 'possess', role: 'forager' },
  // species economy remedies (granary, wood): the nearest control the player has today
  'remedy.slider.mill': { kind: 'directives', group: 'nurse', control: 'workforce' },
  'remedy.slider.store': { kind: 'directives', group: 'nurse', control: 'workforce' },
  'remedy.granary.hygiene': { kind: 'directives', group: 'nurse', control: 'workforce' },
  'remedy.caste-emphasis': { kind: 'directives', group: null, control: 'brood' },
  'remedy.guard.entrance': { kind: 'directives', group: 'defend', control: 'workforce' },
  'remedy.dig.granary': { kind: 'tool', tool: 'dig' },
  'remedy.dig.drain-chamber': { kind: 'tool', tool: 'dig' },
  // no satellite marker yet: the new-entrance marker is where a satellite starts
  'remedy.marker.satellite': { kind: 'tool', tool: 'entrance' },
  // the species toggles (directiveExtras) have no control of their own yet: open the Nest section
  'remedy.toggle.hideFrass': { kind: 'directives', group: null, control: 'architect' },
};

/** Words and action of a remedy id; an unknown id is shown as plain advice. */
export function remedyLink(id: string): RemedyLink {
  const label = REMEDY_WORD[id] ?? causeWord(id.replace(/^remedy\./, '').replace(/\./g, ' '));
  return { id, label, action: REMEDY_ACTION[id] ?? { kind: 'advice' } };
}

/** CSS selector (inside the Directives drawer) of the control a directives remedy points at. */
export function remedySelector(a: Extract<RemedyAction, { kind: 'directives' }>): string {
  switch (a.control) {
    case 'workforce': return a.group ? `[data-group="${a.group}"]` : '[data-testid="dir-workforce"]';
    case 'diet': return '[data-testid="dir-diet"]';
    case 'stock':
    case 'stance': return '[data-testid="dir-safety"]';
    case 'architect': return '[data-testid="dir-nest"]';
    case 'brood': return '[data-testid="dir-brood"]';
  }
}

/** Accessible name of a row: "Brood growth, Failing, 0.6 of normal, since Summer Day 4, 09:00". */
export function rowName(d: UiDiagnostic): string {
  const value = valueWord(d);
  return `${d.label}, ${statusWord(d.status)}, ${value ? `${value}, ` : ''}since ${d.sinceLabel}`;
}
