// The Journal's milestone timeline, pure part (GDD 08 7.2): one tick per game day, season bands, pins with titles laid
// out in lanes so labels do not overlap, and the wording of pins and event log lines from the content tables.
import { ALERT_TEXT, aimText, alertText, journalEntryText, SEASON_WORD } from '@/content/text';
import { getCodexEntry } from '@/content/codex';
import type { UiEventLogLine, UiJournal, UiJournalEntry } from '../../api';
import { calDay, dayLabel, seasonBands, type SeasonBand } from './charts';

export interface Pin {
  id: number;
  key: string;
  tick: number;
  /** Calendar day (fractional). */
  day: number;
  title: string;
  text: string;
  thumb: string | null;
  /** Lane (row) the label sits in, 0 = closest to the axis. */
  lane: number;
  /** "Summer · Day 3" style date. */
  date: string;
}

/** Date line of a tick: "Summer · Day 3 · Year 1". */
export function dateLine(j: Pick<UiJournal, 'startTick' | 'seasonLength'>, tick: number): string {
  const d = Math.floor(calDay(j, tick));
  const year = Math.floor(d / (j.seasonLength * 4)) + 1;
  const inYear = d - (year - 1) * j.seasonLength * 4;
  const season = Math.min(3, Math.floor(inYear / j.seasonLength));
  return `${SEASON_WORD[season]} · Day ${inYear - season * j.seasonLength + 1} · Year ${year}`;
}

/** Wording of a journal entry; a key without wording shows its id so the gap is visible. */
export function entryWording(e: UiJournalEntry): { title: string; text: string } {
  const w = journalEntryText(e.key, e.tokens);
  return w ?? { title: e.key, text: '' };
}

/** The milestone entries as pins (lanes not yet assigned). */
export function milestonePins(j: UiJournal): Pin[] {
  return j.entries.filter((e) => e.kind === 'milestone').map((e) => {
    const w = entryWording(e);
    return { id: e.id, key: e.key, tick: e.tick, day: calDay(j, e.tick), title: w.title, text: w.text, thumb: j.thumbs[e.key] ?? null, lane: 0, date: dateLine(j, e.tick) };
  }).sort((a, b) => a.tick - b.tick || a.id - b.id);
}

/**
 * Greedy lane assignment: a pin takes the lowest lane whose last label ended before this pin starts. `pxPerDay` and
 * `labelPx` (the width a title needs) decide what overlaps.
 */
export function layoutPins(pins: readonly Pin[], pxPerDay: number, labelPx: (p: Pin) => number): Pin[] {
  const laneEnd: number[] = [];
  return pins.map((p) => {
    const x = p.day * pxPerDay;
    let lane = laneEnd.findIndex((end) => end <= x);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
    laneEnd[lane] = x + labelPx(p) + 8;
    return { ...p, lane };
  });
}

export interface TimelineAxis {
  /** Calendar days the axis covers (whole days, from the first game day to the current one inclusive). */
  d0: number;
  d1: number;
  days: { day: number; label: string; major: boolean }[];
  bands: SeasonBand[];
}

/** One tick per game day; a label every `labelEvery` days. */
export function timelineAxis(j: UiJournal, labelEvery = 5): TimelineAxis {
  const d0 = Math.floor(j.startTick / 6000);
  const d1 = Math.floor(calDay(j, j.nowTick)) + 1;
  const days: TimelineAxis['days'] = [];
  for (let d = d0; d < d1; d++) days.push({ day: d, label: dayLabel(j, d), major: (d - d0) % labelEvery === 0 });
  return { d0, d1, days, bands: seasonBands(d0, d1, j.seasonLength) };
}

/** Event log line: the sim's own text when it wrote one, else the content table's wording of its key. */
export function eventWording(e: UiEventLogLine): string {
  if (e.text) return e.text;
  if (e.kind === 'codex') return `Codex: ${getCodexEntry(e.key)?.title ?? e.key}`;
  if (e.kind === 'milestone') return journalEntryText(e.key, e.tokens)?.title ?? e.key;
  if (e.kind === 'possession') return 'A worker was possessed';
  if (e.kind === 'game-over') return 'The colony has ended';
  if (e.key in ALERT_TEXT) {
    const a = alertText(e.key as never, e.tokens);
    return a.cause ? `${a.title} — ${a.cause}` : a.title;
  }
  const j = journalEntryText(e.key, e.tokens);
  return j ? j.title : e.key.replace(/[-.]/g, ' ');
}

/** The aim's one-line text and its open / done state words. */
export function aimLine(id: string, species: string): string {
  try {
    return aimText(id as never, species as never).text;
  } catch {
    return id;
  }
}

/** The codex entry each aim points at ("Open codex" under an open aim); aims without a fitting entry have none. */
export const AIM_CODEX: Readonly<Record<string, string>> = {
  'aim-find-site': 'cx-claustral-founding', 'aim-dig-chamber': 'cx-claustral-founding', 'aim-seal': 'cx-claustral-founding',
  'aim-first-clutch': 'cx-brood-stages', 'aim-first-workers': 'cx-callow', 'aim-first-protein': 'cx-protein-larvae',
  'aim-first-trail': 'cx-trail-pheromone', 'aim-stores-winter': 'cx-hibernation', 'aim-midden': 'cx-necrophoresis',
  'aim-garden': 'cx-fungus-garden', 'aim-herd': 'cx-aphid-tending', 'aim-alates': 'cx-nuptial-flight', 'aim-flight': 'cx-nuptial-flight',
  'aim-satellite': 'cx-satellite-nests', 'aim-trunk-trail': 'cx-trunk-trail', 'aim-find-wood': 'cx-wood-moisture',
  'aim-plant-garden': 'cx-fungus-pellet', 'aim-first-food': 'cx-honeydew',
};

/** "Summer · Day 3 · 14:20": date and clock of a tick (event log rows). */
export function timeLine(j: Pick<UiJournal, 'startTick' | 'seasonLength'>, tick: number): string {
  const cal = tick + j.startTick;
  const h = ((cal % 6000) / 6000) * 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${dateLine(j, tick)} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
