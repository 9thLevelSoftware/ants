// Types shared by the save layer. Plain data; the UI reads these through the GameFacade and the debug surface.
import type { AutosaveLabel as RegistryAutosaveLabel, SaveSlotId } from '@/sim/types/ids/progression';
import type { SpeciesId } from '@/sim/types';

/** Logical slot a caller names: `auto` is the ring, `quick`, `slot-1`..`slot-5`, hidden `opening-start`. */
export type SlotId = SaveSlotId;

/**
 * Why an autosave was written; shown on the card of an `auto` generation: the registry's labels (B6) plus the three
 * the game layer adds (`interval` is in the 00-index text, `quit` and `hidden` are written when the game is left).
 */
export type AutosaveLabel = RegistryAutosaveLabel | 'interval' | 'quit' | 'hidden';

/**
 * Outcome words of the save layer. `ok` is success; every other value is a failure the UI can word:
 * unavailable (no storage), quota (full), failed (transaction or clone error), busy (another save is running),
 * blocked (a transition / time-lapse / no game forbids saving now), not-found (empty slot), corrupt (damaged data),
 * newer-version / too-old (save format), world-mismatch (regenerated world differs from the saved one),
 * foreign (not a FOUNDRESS file), too-large (import above IMPORT_MAX_BYTES).
 */
export type SaveCode =
  | 'ok' | 'unavailable' | 'quota' | 'failed' | 'busy' | 'blocked' | 'not-found' | 'corrupt' | 'newer-version'
  | 'too-old' | 'world-mismatch' | 'foreign' | 'too-large';

/** Metadata kept next to every save (GDD 08 App. A "Save meta", GDD 06 §15 rule 5). */
export interface SaveMeta {
  /** Physical key this save lives under (`auto-1`, `quick`, `slot-3`, `opening-start`). */
  key: string;
  /** Logical slot (`auto` for every ring cell). */
  slot: SlotId;
  /** Monotonic write counter of the ring: the largest is the newest generation. 0 outside the ring. */
  generation: number;
  /** Autosave trigger label, or '' for manual saves. */
  label: string;
  /** A pinned generation (`final`) is not overwritten by ring rotation until a new game starts. */
  pinned: boolean;
  species: SpeciesId;
  /** e.g. "lasius-niger"; the UI maps it to the binomial. */
  archetype: string;
  /** uint32 world seed and its 4F7A-21C9 style code. */
  seed: number;
  seedCode: string;
  sizeClass: string;
  difficulty: string;
  stage: string;
  /** Sim tick (game time since game start). */
  tick: number;
  /** "Summer · Day 5 · Year 2". */
  dateLabel: string;
  /** 0-based game day since the start (colony age in days). */
  colonyDay: number;
  /** Simulated workers of the player colony ("population N"). */
  population: number;
  /** Real seconds of play (unpaused, visible) up to this save. */
  playTimeS: number;
  /** Wall-clock stamp when saved (ISO text and ms since epoch). */
  savedAtIso: string;
  savedAtMs: number;
  saveVersion: number;
  generatorVersion: number;
  /** Fingerprint of the world generated from `config.world`; the loader verifies it. */
  worldFingerprint: number;
  appVersion: string;
  /** JPEG data URL (160 x 90) or null (test mode, capture refused). */
  thumbnail: string | null;
}

/** What a stored save record holds (the `saves` object store value). */
export interface SaveRecord {
  /** Format tag so foreign data under our key is rejected. */
  format: 'foundress-save-record';
  meta: SaveMeta;
  /** SimState (structured clone; typed arrays stay typed arrays). */
  state: unknown;
}

/** Card data of one listed save (the Save/Load screen's slot card). */
export interface SaveListing {
  key: string;
  slot: SlotId;
  /** Display name: "Auto-save", "Quick save", "Slot 3". */
  title: string;
  generation: number;
  label: string;
  pinned: boolean;
  meta: SaveMeta;
  /** The record failed validation: show "damaged", offer the next generation. */
  damaged: boolean;
  /** Hidden checkpoint (`opening-start`): only listed on request. */
  hidden: boolean;
}

/** Availability of persistent storage as the UI shows it. */
export type Availability = 'unknown' | 'ok' | 'unavailable';

export interface SaveStatus {
  availability: Availability;
  /** Which back end holds saves right now. */
  backend: 'indexeddb' | 'memory';
  /** Saves survive a page reload (false on the in-memory fallback). */
  persistent: boolean;
  /** Last operation's word and message (the diagnostic `diag-storage`: ok / warn / bad). */
  lastCode: SaveCode;
  lastMessage: string;
  /** Autosave was switched off for this session after repeated failures. */
  autosaveDisabled: boolean;
  /** An operation is running now. */
  busy: boolean;
  /** Real-time ms stamp of the last successful save, -1 none (for the unsaved-progress confirmation). */
  lastSaveMs: number;
  /** `ok` | `warn` | `bad` for `diag-storage`. */
  diagnostic: 'ok' | 'warn' | 'bad';
}

/** Result of every public save-manager call. Never thrown; never a rejected promise. */
export interface SaveOutcome<T = undefined> {
  ok: boolean;
  /** Same words as the UI's SaveResult.status plus the finer `code`. */
  status: 'ok' | 'unavailable' | 'failed';
  code: SaveCode;
  message: string;
  /** The save went to the in-memory fallback and is lost on reload. */
  volatile?: boolean;
  value?: T;
}

/** Events the save layer emits (the UI turns them into toasts / alerts / the HUD icon). */
export type SaveEvent =
  | { type: 'save-result'; slot: string; key: string; ok: boolean; code: SaveCode; message: string; autosave: boolean; label: string }
  | { type: 'load-result'; slot: string; ok: boolean; code: SaveCode; message: string }
  | { type: 'export-result'; method: 'download' | 'text' | 'bytes'; ok: boolean; code: SaveCode; message: string }
  | { type: 'storage-unavailable'; message: string }
  | { type: 'autosave-disabled'; message: string }
  | { type: 'status-changed'; status: SaveStatus };
