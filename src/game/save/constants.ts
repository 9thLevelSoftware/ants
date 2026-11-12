// Persistence constants (GDD 06 §15, GDD 08 §7.4/§7.6, 00-index C1 and B6). Game layer, real-time values:
// none of these is simulation balance, so they live here and not in src/sim/balance.

/** Real seconds of unpaused, visible play between interval autosaves (`autosaveMin` setting changes it). */
export const AUTOSAVE_INTERVAL_REAL_S = 300;
/** Autosave interval choices of the Gameplay settings tab, minutes (0 = off). */
export const AUTOSAVE_MINUTES_CHOICES = [0, 2, 5, 10] as const;
/** Minimum real seconds between any two autosaves (GDD 06 §15 rule 2). */
export const AUTOSAVE_MIN_GAP_S = 5;
/** A failed autosave is retried once after this many real seconds; failing again disables autosave (rule 7). */
export const AUTOSAVE_RETRY_S = 30;
/** An autosave blocked by combat of the possessed ant is deferred at most this long (GDD 08 §7.6). */
export const AUTOSAVE_DEFER_MAX_S = 30;
/** Number of generations in the `auto` ring (00-index B6, E-84). */
export const AUTO_RING_SIZE = 3;
/** Manual slots `slot-1`..`slot-N`. */
export const MANUAL_SLOT_COUNT = 5;
/** Quit / load confirmations are asked when the last save is older than this (real s; GDD 01 QUIT_CONFIRM_UNSAVED_S). */
export const QUIT_CONFIRM_UNSAVED_S = 60;
/** The thumbnail is cut to this size (GDD 06 §15 rule 5: 160 x 90, JPEG quality 0.7, GDD 08 §7.6). */
export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 90;
export const THUMB_JPEG_QUALITY = 0.7;
/** A cached thumbnail younger than this is reused by an autosave (the capture itself touches the GPU). */
export const THUMB_CACHE_MAX_AGE_S = 120;
/** The cache is refreshed this many real seconds before an interval autosave falls due. */
export const THUMB_PRECAPTURE_LEAD_S = 2;

/** IndexedDB database name and schema version. */
export const IDB_NAME = 'foundress';
export const IDB_VERSION = 1;

/** Export text form (00-index B6): `FOUNDRESS1:` + base64 of the `.foundress` bytes (+ `:` + 8 hex checksum). */
export const EXPORT_TEXT_PREFIX = 'FOUNDRESS1:';
export const EXPORT_FILE_EXTENSION = '.foundress';
/** Format tag inside the exported container (a foreign gzip that decodes but lacks it is rejected). */
export const EXPORT_FORMAT_TAG = 'foundress-save';
export const EXPORT_FORMAT_VERSION = 1;
/** Import refuses payloads above this many bytes (a pasted multi-hundred-MB text would only freeze the tab). */
export const IMPORT_MAX_BYTES = 256 * 1024 * 1024;

/** localStorage keys (00-index). */
export const SETTINGS_STORAGE_KEY = 'foundress.settings.v1';
export const PROFILE_STORAGE_KEY = 'foundress.profile.v1';
/** Settings are written this long after the last change (ms); also flushed on pagehide. */
export const SETTINGS_WRITE_DEBOUNCE_MS = 250;
