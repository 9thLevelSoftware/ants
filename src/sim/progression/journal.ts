// Journal timeline (GDD 06 §9.1) and the event log ring (GDD 08 §7.2 / App. A). Entries carry a text id (`key`)
// and token values only; the interface formats them through the content tables (src/content/text).

import type { AlertLevel, EventLogEntry, JournalEntry, JournalKind, Sim, TargetRef } from '@/sim/types';
import { EVENT_LOG_CAP, JOURNAL_CAP } from '@/sim/balance';
import { calendarTick, currentYear, dayOfYear, dayOfSeason, seasonOf, yearOf } from '@/sim/time';
import { engineOf } from './engine';

export type Tokens = Record<string, string | number>;

/** Kinds merged first when the timeline is full (GDD 06 §9.1: older season / weather entries go first). */
const MERGEABLE: readonly JournalKind[] = ['weather', 'season'];

/** Key of a per-year summary of season and weather notes: tokens {year} {seasons} {weather} (counts merged). */
export const SEASON_SUMMARY_KEY = 'season-summary';

/** Appends a timeline entry and emits `journal.entry`; returns its id. */
export function addJournal(sim: Sim, kind: JournalKind, key: string, tokens: Tokens = {}, refs: string[] = []): number {
  const eng = engineOf(sim);
  const entries = sim.state.progression.journal.entries;
  const entry: JournalEntry = {
    id: eng.nextJournalId++, tick: sim.state.tick, kind, title: '', text: '', refs, key, tokens, calTick: calendarTick(sim.state),
  };
  entries.push(entry);
  if (entries.length > JOURNAL_CAP) trimJournal(sim, entries);
  sim.emit({ type: 'journal.entry', entryId: entry.id });
  return entry.id;
}

const isMergeable = (e: JournalEntry): boolean => MERGEABLE.includes(e.kind) && e.key !== SEASON_SUMMARY_KEY;

/**
 * Calendar tick of a journal entry or log row. Entries written before `calTick` existed fall back to `tick` plus
 * today's anchor, which is only right if no winter lapse moved the anchor since.
 */
export function entryCalTick(sim: Sim, e: { tick: number; calTick?: number }): number {
  return e.calTick ?? e.tick + sim.state.env.calendar.startTick;
}

/** In-game date of an entry: 1-based year, day of year, season and day of season. */
export function entryDate(sim: Sim, e: { tick: number; calTick?: number }): { year: number; doy: number; season: string; dayOfSeason: number } {
  const ct = entryCalTick(sim, e);
  const cfg = sim.state.config;
  return { year: yearOf(ct, cfg), doy: dayOfYear(ct, cfg), season: seasonOf(ct, cfg), dayOfSeason: dayOfSeason(ct, cfg) };
}

/**
 * Makes room in a full timeline (GDD 06 §9.1): the season and weather notes of the oldest earlier year that has at
 * least two are merged into one per-year summary in place of the first of them. When no year can be merged (all
 * such notes are this year's, or already summaries), the oldest season / weather note goes, else the oldest entry.
 */
function trimJournal(sim: Sim, entries: JournalEntry[]): void {
  const cfg = sim.state.config;
  const yearOfEntry = (e: JournalEntry): number => yearOf(entryCalTick(sim, e), cfg);
  const thisYear = currentYear(sim.state);
  const perYear = new Map<number, number>();
  for (const e of entries) {
    if (!isMergeable(e)) continue;
    const y = yearOfEntry(e);
    if (y < thisYear) perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  const year = [...perYear.keys()].sort((a, b) => a - b).find((y) => perYear.get(y)! >= 2);
  if (year === undefined) {
    const i = entries.findIndex(isMergeable);
    entries.splice(i < 0 ? 0 : i, 1);
    return;
  }
  let seasons = 0;
  let weather = 0;
  let first = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!isMergeable(e) || yearOfEntry(e) !== year) continue;
    if (e.kind === 'season') seasons++;
    else weather++;
    if (first < 0) first = i;
  }
  const head = entries[first];
  const summary: JournalEntry = {
    id: head.id, tick: head.tick, kind: 'season', title: '', text: '', refs: [], key: SEASON_SUMMARY_KEY,
    tokens: { year, seasons, weather }, calTick: entryCalTick(sim, head),
  };
  let w = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (i === first) entries[w++] = summary;
    else if (!(isMergeable(e) && yearOfEntry(e) === year)) entries[w++] = e;
  }
  entries.length = w;
}

/** Pushes an event-log row (ring of EVENT_LOG_CAP). */
export function logEvent(sim: Sim, kind: string, level: AlertLevel, key: string, tokens: Tokens = {}, focus: TargetRef | null = null, text = ''): void {
  const log = sim.state.progression.eventLog;
  const row: EventLogEntry = { tick: sim.state.tick, kind, level, text, focus, key, tokens, calTick: calendarTick(sim.state) };
  log.push(row);
  if (log.length > EVENT_LOG_CAP) log.splice(0, log.length - EVENT_LOG_CAP);
}

/** Timeline entries, newest last, optionally filtered by kind (plain copies for the interface). */
export function journalEntries(sim: Sim, kinds?: readonly JournalKind[]): JournalEntry[] {
  const all = sim.state.progression.journal.entries;
  const list = kinds ? all.filter((e) => kinds.includes(e.kind)) : all;
  return list.map((e) => ({ ...e, refs: [...e.refs], tokens: { ...(e.tokens ?? {}) } }));
}
