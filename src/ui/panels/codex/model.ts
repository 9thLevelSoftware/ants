// The codex, pure part (GDD 08 7.3, GDD 06 10): entries of a category, locked or unlocked, search, and the counts of
// the rail's "12 / 30 observed" headers. Locked entries show their title only, so a search never reaches into the text of an
// entry the player has not observed. Entries come from src/content/codex; nothing here is written prose.
import { codexCategories, listCodexEntries, type CodexCategory, type CodexEntryView } from '@/content/codex';

export interface CodexUnlocks {
  /** Ids observed in this game (progression.codexSeen). */
  seen: Readonly<Record<string, { label: string }>>;
  /** Ids unlocked on this device (the profile); optional. */
  device?: Readonly<Record<string, { label: string }>>;
}

export const NO_UNLOCKS: CodexUnlocks = { seen: {} };

/** True when the entry is open: the manual (always unlocked), observed in this game, or unlocked on this device. */
export function isUnlocked(e: Pick<CodexEntryView, 'id' | 'alwaysUnlocked'>, u: CodexUnlocks): boolean {
  return !!e.alwaysUnlocked || !!u.seen[e.id] || !!u.device?.[e.id];
}

/** "Observed: Spring · Day 2 · Year 1" or "Not yet observed". */
export function observedLine(e: Pick<CodexEntryView, 'id' | 'alwaysUnlocked'>, u: CodexUnlocks): string {
  const hit = u.seen[e.id] ?? u.device?.[e.id];
  if (hit) return hit.label ? `Observed: ${hit.label}` : 'Observed';
  return e.alwaysUnlocked ? 'Part of the manual' : 'Not yet observed';
}

export interface CodexQuery {
  category: CodexCategory | 'all';
  text: string;
}

export interface CodexRow {
  entry: CodexEntryView;
  unlocked: boolean;
}

/** Rows for the entry list: the category (or all), the search text, locked rows matching on their title only. */
export function codexRows(q: CodexQuery, u: CodexUnlocks): CodexRow[] {
  const text = q.text.trim().toLowerCase();
  const rows = listCodexEntries(q.category === 'all' ? {} : { category: q.category }).map((entry) => ({ entry, unlocked: isUnlocked(entry, u) }));
  if (!text) return rows;
  return rows.filter((r) => r.entry.title.toLowerCase().includes(text) || (r.unlocked && r.entry.body.toLowerCase().includes(text)));
}

export interface CategoryCount {
  id: CodexCategory;
  title: string;
  observed: number;
  total: number;
}

/** Per category: entries observed (open) and the total, for the rail headers. */
export function categoryCounts(u: CodexUnlocks): CategoryCount[] {
  const all = listCodexEntries({});
  return codexCategories().map((c) => {
    const inCat = all.filter((e) => e.category === c.id);
    return { id: c.id, title: c.title, observed: inCat.filter((e) => isUnlocked(e, u)).length, total: inCat.length };
  });
}

/** Spider entries follow the comfort setting: anything but "off" draws a neutral ring in place of a silhouette. */
export const SPIDER_ENTRIES: ReadonlySet<string> = new Set(['cx-jumping-spider', 'cx-wolf-spider', 'cx-ant-spiders']);

/** The line shown in place of a field note that has not been written (a guard: every entry has one today). */
export const NO_PROSE_LINE = 'No field note has been written for this entry yet.';

export function fieldNote(e: Pick<CodexEntryView, 'body'>): string {
  return e.body.trim().length > 0 ? e.body : NO_PROSE_LINE;
}
