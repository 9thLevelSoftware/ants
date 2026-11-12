// Codex data shapes (GDD 06 §10, GDD 08 §7.3). Pure data: no DOM, no three, no sim imports at runtime.

/** Codex categories, in the order of the book's rail (GDD 08 §7.3). */
export const CODEX_CATEGORY_IDS = [
  'species', 'castes', 'behaviours', 'creatures', 'plants-food', 'habitats', 'weather', 'human', 'interface',
] as const;
export type CodexCategory = (typeof CODEX_CATEGORY_IDS)[number];

/** Display names of the categories (GDD 08 §7.3 rail). */
export const CODEX_CATEGORY_TITLES: Record<CodexCategory, string> = {
  species: 'Species',
  castes: 'Castes and anatomy',
  behaviours: 'Behaviours',
  creatures: 'Creatures',
  'plants-food': 'Plants and food',
  habitats: 'Habitats and materials',
  weather: 'Weather and seasons',
  human: 'Human activity',
  interface: 'Interface (manual)',
};

/** Species tags of GDD 06 §10: LN Lasius niger, CP Camponotus pennsylvanicus, MB Messor barbarus, AT Atta texana. */
export const CODEX_SPECIES_TAGS = ['LN', 'CP', 'MB', 'AT', 'ALL'] as const;
export type CodexSpeciesTag = (typeof CODEX_SPECIES_TAGS)[number];

/** One codex entry as written. `id` is a `cx-*` id of the design index (`allCodexIds()`). */
export interface CodexEntry {
  id: string;
  /** Display title (sentence case). */
  title: string;
  category: CodexCategory;
  species: readonly CodexSpeciesTag[];
  /** Binomial name, for species and creature entries. */
  binomial?: string;
  /** The field note: 60-140 words, naturalist voice, hedged where the research is thin. */
  body: string;
  /** "In this colony" line: what the game abstracts or simplifies (GDD 08 §7.3). */
  inGame?: string;
  /** Related entry ids (shown as links). */
  related?: readonly string[];
  /** True for the Interface entries that are the manual: always unlocked (GDD 06 §10, GDD 08 §9.4). */
  alwaysUnlocked?: true;
  /** Input action or axis ids whose CURRENT bindings the entry page lists under "Controls" (Interface entries, GDD 08 §7.3). */
  controlActions?: readonly string[];
}

/** An entry plus the citation line derived from the provenance table (GDD 08 §7.3 "Source line"). */
export interface CodexEntryView extends CodexEntry {
  /** Short citation, e.g. "Hart et al. 2018, Ecography"; empty when the note rests on the game's own rules. */
  source: string;
}

/** Filter of `listCodexEntries`; every given field must match. */
export interface CodexFilter {
  category?: CodexCategory;
  /** Keeps entries tagged with this species tag or with `ALL`. */
  species?: Exclude<CodexSpeciesTag, 'ALL'>;
  /** Case-insensitive substring of the title or body. */
  text?: string;
}

export const CODEX_BODY_MIN_WORDS = 60;
export const CODEX_BODY_MAX_WORDS = 140;
