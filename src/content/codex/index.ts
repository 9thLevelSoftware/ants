// Codex content API (task codex-content). Pure data and pure lookups: no DOM, no three, no sim state.
// Ids are the `cx-*` ids of the design index (`allCodexIds()` in src/sim/types/ids.ts); the panels that show the
// codex belong to a later task and read entries only through the functions below.
import { SPECIES_ENTRIES } from './entries/species';
import { CASTE_ENTRIES } from './entries/castes';
import { BEHAVIOUR_ENTRIES } from './entries/behaviours';
import { PLANT_FOOD_ENTRIES } from './entries/plantsFood';
import { CREATURE_ENTRIES } from './entries/creatures';
import { HABITAT_ENTRIES } from './entries/habitats';
import { MATERIAL_ENTRIES } from './entries/materials';
import { WEATHER_ENTRIES } from './entries/weather';
import { HUMAN_ENTRIES } from './entries/human';
import { INTERFACE_ENTRIES } from './entries/interface';
import { citationOf } from './citations';
import { resolveKeyTokens } from './keys';
import { defaultBindings } from '@/input/bindings';
import type { BindingSet } from '@/input/bindings';
import { CODEX_CATEGORY_IDS, CODEX_CATEGORY_TITLES, CODEX_SPECIES_TAGS } from './types';
import type { CodexCategory, CodexEntry, CodexEntryView, CodexFilter } from './types';

export {
  CODEX_BODY_MAX_WORDS, CODEX_BODY_MIN_WORDS, CODEX_CATEGORY_IDS, CODEX_CATEGORY_TITLES, CODEX_SPECIES_TAGS,
} from './types';
export type { CodexCategory, CodexEntry, CodexEntryView, CodexFilter, CodexSpeciesTag } from './types';

/** Every entry as written, grouped by file. Order here is the order of the default list within a category. */
export const ALL_CODEX_ENTRIES: readonly CodexEntry[] = [
  ...SPECIES_ENTRIES, ...CASTE_ENTRIES, ...BEHAVIOUR_ENTRIES, ...PLANT_FOOD_ENTRIES, ...CREATURE_ENTRIES,
  ...HABITAT_ENTRIES, ...MATERIAL_ENTRIES, ...WEATHER_ENTRIES, ...HUMAN_ENTRIES, ...INTERFACE_ENTRIES,
];

// The views carry the in-game line with the default keys filled in; `codexInGameLine` re-resolves it for rebound keys.
const VIEWS: readonly CodexEntryView[] = ALL_CODEX_ENTRIES.map((e) => ({
  ...e, ...(e.inGame ? { inGame: resolveKeyTokens(e.inGame) } : {}), source: citationOf(e.id),
}));
const BY_ID: ReadonlyMap<string, CodexEntryView> = new Map(VIEWS.map((e) => [e.id, e]));

/** The entry with this id, or undefined for an id that is not in the codex. */
export function getCodexEntry(id: string): CodexEntryView | undefined {
  return BY_ID.get(id);
}

/** The "in the game" line of an entry with the keys of `set` (the player's bindings); undefined when there is none. */
export function codexInGameLine(id: string, set: BindingSet = defaultBindings()): string | undefined {
  const raw = ALL_CODEX_ENTRIES.find((e) => e.id === id)?.inGame;
  return raw === undefined ? undefined : resolveKeyTokens(raw, set);
}

/** True if the id has an entry. */
export function hasCodexEntry(id: string): boolean {
  return BY_ID.has(id);
}

/** Entries matching the filter (all of its given fields), in category rail order and then the order written. */
export function listCodexEntries(filter: CodexFilter = {}): CodexEntryView[] {
  const text = filter.text?.trim().toLowerCase() ?? '';
  const out = VIEWS.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.species && !e.species.includes(filter.species) && !e.species.includes('ALL')) return false;
    if (text && !e.title.toLowerCase().includes(text) && !e.body.toLowerCase().includes(text)) return false;
    return true;
  });
  const rank = (c: CodexCategory) => CODEX_CATEGORY_IDS.indexOf(c);
  return out.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.category) - rank(b.e.category) || a.i - b.i).map((x) => x.e);
}

/** Entry counts per category (for the rail's "n / total observed" headers, with the total here). */
export function codexCategoryCounts(): Record<CodexCategory, number> {
  const counts = Object.fromEntries(CODEX_CATEGORY_IDS.map((c) => [c, 0])) as Record<CodexCategory, number>;
  for (const e of VIEWS) counts[e.category]++;
  return counts;
}

/** Category ids with their display titles, in rail order. */
export function codexCategories(): { id: CodexCategory; title: string }[] {
  return CODEX_CATEGORY_IDS.map((id) => ({ id, title: CODEX_CATEGORY_TITLES[id] }));
}

/** Related ids of an entry that exist in the codex (broken links are dropped). */
export function relatedEntries(id: string): CodexEntryView[] {
  const e = BY_ID.get(id);
  if (!e?.related) return [];
  return e.related.map((r) => BY_ID.get(r)).filter((r): r is CodexEntryView => r !== undefined);
}

/** True for a species tag the entry applies to (an `ALL` entry applies to every species). */
export function entryAppliesTo(entry: CodexEntry, species: Exclude<(typeof CODEX_SPECIES_TAGS)[number], 'ALL'>): boolean {
  return entry.species.includes(species) || entry.species.includes('ALL');
}
