// Option and result shapes of the save manager (manager.ts): the host it needs from the game, its constructor and
// call options, and the export result.
import type { Sim } from '@/sim/types';
import type { LoaderDeps } from './loader';
import type { BlockContext } from './blocks';
import type { SaveStorage } from './storage';
import type { AutosaveLabel, SaveMeta } from './types';

/** What the manager needs from the running game (src/game/save/gameHost.ts adapts Game to this). */
export interface SaveHost {
  /** The running sim, null outside a game. */
  getSim(): Sim | null;
  /** Game mode and view, for the "may we save now" rules. */
  context(): BlockContext;
  /** A 160x90 JPEG data URL of the current view, or null (test mode, refused). May throw. */
  thumbnail?(): string | null;
  /** Replaces the running game with a loaded sim (may be asynchronous: the renderers build the world first). */
  adopt(sim: Sim, meta: SaveMeta): Promise<void> | void;
  /** Shows the loading state before the (blocking) world rebuild; resolve after the browser could paint. */
  loadingBegin?(): Promise<void> | void;
  /** The load failed: leave the loading state. (On success `adopt` replaces it.) */
  loadingEnd?(): void;
}

export interface SaveManagerOptions {
  host: SaveHost;
  /** Primary back end (default IndexedDB). */
  storage?: SaveStorage;
  /** Back end used when the primary is unavailable (default in-memory). */
  fallback?: () => SaveStorage;
  loader?: LoaderDeps;
  /** Wall clock in ms (default Date.now). */
  now?: () => number;
  /** `?nodownload=1`: never try a file download, always offer the text form. */
  noDownload?: boolean;
}

export interface SaveOptions {
  /** Written by the game, not the player: goes to the `auto` ring (or `opening-start`). */
  autosave?: boolean;
  label?: AutosaveLabel | string;
  /** Overrides the thumbnail (null = none). Default: captured (manual) or the cached one (autosave). */
  thumbnail?: string | null;
}

export interface ExportValue {
  method: 'download' | 'text' | 'bytes';
  filename: string;
  sizeBytes: number;
  /** `FOUNDRESS1:` text (always set for method `text`). */
  text?: string;
  bytes?: Uint8Array;
  /** The clipboard copy worked (text method with copy requested). */
  copied?: boolean;
}

export interface ExportOptions {
  /** `auto`: try a download, fall back to text. `text`: only text. `bytes`: only return bytes (no side effects). */
  method?: 'auto' | 'text' | 'bytes';
  /** Try the clipboard after producing text. */
  copy?: boolean;
}
