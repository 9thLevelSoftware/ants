// The save manager (task save, GDD 06 §15, GDD 08 §7.6): slots, metadata, save / load / delete / list, quota
// handling, export / import, the status the UI shows. Everything is wrapped: public methods resolve with a
// SaveOutcome and never throw or reject, whatever the storage does.
//
// Capture rule: the state is captured at the moment write() is called, in the same synchronous run as the decision
// to save (IndexedDB serialises inside put(), the memory back end copies), so the saved state is the one at that
// tick boundary even though the write finishes later. See docs in storage.ts.
import { createLogger } from '@/core/log';
import type { Sim, SimState } from '@/sim/types';
import { AUTO_RING_SIZE, THUMB_CACHE_MAX_AGE_S } from './constants';
import { blockReason, type BlockContext } from './blocks';
import { bytesToText, exportFileName, packContainer, parseBytes, parseText, type ParsedSave } from './container';
import { copyText, downloadBytes } from './download';
import { IndexedDbStorage } from './indexedDbStorage';
import { restoreSave, type LoaderDeps } from './loader';
import { isCheckpointLabel } from './autosavePolicy';
import { buildMeta, isValidMeta } from './meta';
import { MemoryStorage } from './memoryStorage';
import {
  ALL_KEYS, AUTO_KEYS, autoGenerations, chooseAutoKey, isAutoKey, isManualTarget, nextGeneration, oldestDroppable, slotOfKey, titleOfKey,
} from './slots';
import type { SaveStorage, StorageFailure, WriteOp } from './storage';
import type {
  AutosaveLabel, SaveCode, SaveEvent, SaveListing, SaveMeta, SaveOutcome, SaveRecord, SaveStatus,
} from './types';

const log = createLogger('save');

/** What the manager needs from the running game (src/game/save/gameHost.ts adapts Game to this). */
export interface SaveHost {
  /** The running sim, null outside a game. */
  getSim(): Sim | null;
  /** Game mode and view, for the "may we save now" rules. */
  context(): BlockContext;
  /** A 160x90 JPEG data URL of the current view, or null (test mode, refused). May throw. */
  thumbnail?(): string | null;
  /** Replaces the running game with a loaded sim. */
  adopt(sim: Sim, meta: SaveMeta): void;
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

const MESSAGES: Record<string, string> = {
  unavailable: 'Saving to this browser is not available here. Use Export to keep your colony.',
  quota: 'The browser storage is full. Delete an old save or export your colony.',
  busy: 'Another save or load is still running.',
  'not-found': 'There is no save in that slot.',
};

export class SaveManager {
  private storage: SaveStorage;
  private readonly host: SaveHost;
  private readonly fallback: () => SaveStorage;
  private readonly loaderDeps: LoaderDeps;
  private readonly now: () => number;
  private readonly noDownload: boolean;
  private readonly cache = new Map<string, SaveMeta>();
  private readonly damaged = new Set<string>();
  private readonly listeners = new Set<(e: SaveEvent) => void>();
  private initPromise: Promise<SaveStatus> | null = null;
  private ready = false;
  private working = false;
  private thumb: { url: string | null; atMs: number } | null = null;
  private notedUnavailable = false;
  private lastKind: 'auto' | 'quick' | 'manual' | null = null;
  private lastLabel = '';
  private st: SaveStatus = {
    availability: 'unknown', backend: 'indexeddb', persistent: true, lastCode: 'ok', lastMessage: '', autosaveDisabled: false,
    busy: false, lastSaveMs: -1, diagnostic: 'ok',
  };
  /** Real seconds of play, set by the autosave driver and restored by load. */
  playTimeS = 0;

  constructor(opts: SaveManagerOptions) {
    this.host = opts.host;
    this.storage = opts.storage ?? new IndexedDbStorage();
    this.fallback = opts.fallback ?? (() => new MemoryStorage());
    this.loaderDeps = opts.loader ?? {};
    this.now = opts.now ?? (() => Date.now());
    this.noDownload = opts.noDownload === true;
    this.st.backend = this.storage.kind;
    this.st.persistent = this.storage.persistent;
  }

  // ------------------------------------------------------------------ status and events
  status(): SaveStatus {
    return { ...this.st, busy: this.working };
  }

  on(fn: (e: SaveEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: SaveEvent): void {
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { log.warn('save listener threw', err); }
    }
  }

  private setLast(code: SaveCode, message: string): void {
    this.st.lastCode = code;
    this.st.lastMessage = message;
    this.st.diagnostic = this.st.availability === 'unavailable' ? 'bad' : code === 'ok' ? 'ok' : 'warn';
    this.emit({ type: 'status-changed', status: this.status() });
  }

  /** The autosave driver reports that it switched itself off (rule 7). */
  noteAutosaveDisabled(message: string): void {
    this.st.autosaveDisabled = true;
    this.emit({ type: 'autosave-disabled', message });
    this.emit({ type: 'status-changed', status: this.status() });
  }

  /** Seconds since the last successful save of any kind in this game; Infinity when none. */
  secondsSinceSave(): number {
    return this.st.lastSaveMs < 0 ? Infinity : (this.now() - this.st.lastSaveMs) / 1000;
  }

  /** `UiSnapshot.lastSave` (pause menu "Saved 3 min ago", the unsaved-progress warning): null = never saved this game. */
  lastSaveInfo(): { agoS: number; kind: 'auto' | 'quick' | 'manual'; timeLabel?: string } | null {
    if (this.st.lastSaveMs < 0 || !this.lastKind) return null;
    return { agoS: this.secondsSinceSave(), kind: this.lastKind, timeLabel: this.lastLabel };
  }

  /** A new game started: nothing of it is saved yet. */
  noteNewGame(): void {
    this.st.lastSaveMs = -1;
    this.lastKind = null;
  }

  private noteSaved(key: string, dateLabel: string): void {
    this.st.lastSaveMs = this.now();
    this.lastKind = isAutoKey(key) || key === 'opening-start' ? 'auto' : key === 'quick' ? 'quick' : 'manual';
    this.lastLabel = dateLabel;
  }

  /** The back end in use now (IndexedDB, or the in-memory fallback after a failure). The profile store shares it. */
  currentStorage(): SaveStorage {
    return this.storage;
  }

  // ------------------------------------------------------------------ init and fallback
  /** Opens the storage (falling back to memory when it is unavailable) and reads the metadata. Idempotent. */
  init(): Promise<SaveStatus> {
    if (!this.initPromise) this.initPromise = this.initOnce();
    return this.initPromise;
  }

  private async initOnce(): Promise<SaveStatus> {
    const opened = await this.storage.open();
    if (opened.ok) {
      this.st.availability = 'ok';
    } else {
      this.degrade(opened.message);
      await this.storage.open();
    }
    await this.loadMetaCache();
    this.ready = true;
    return this.status();
  }

  /** Switches to the in-memory fallback: saves keep working for this page's life, nothing survives a reload. */
  private degrade(message: string): void {
    log.warn('persistent storage unavailable:', message);
    try { this.storage.close(); } catch { /* ignore */ }
    this.storage = this.fallback();
    this.st.availability = 'unavailable';
    this.st.backend = this.storage.kind;
    this.st.persistent = this.storage.persistent;
    this.cache.clear();
    this.setLast('unavailable', MESSAGES.unavailable);
    if (!this.notedUnavailable) {
      this.notedUnavailable = true;
      this.emit({ type: 'storage-unavailable', message: MESSAGES.unavailable });
    }
  }

  private async loadMetaCache(): Promise<void> {
    const all = await this.storage.getAll('meta');
    if (!all.ok) { this.setLast(all.status === 'unavailable' ? 'unavailable' : 'failed', all.message); return; }
    this.cache.clear();
    this.damaged.clear();
    for (const [k, v] of Object.entries(all.value)) {
      if (!ALL_KEYS.includes(k)) continue;
      if (isValidMeta(v) && v.key === k) this.cache.set(k, v); else this.damaged.add(k);
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) await this.init();
  }

  // ------------------------------------------------------------------ thumbnails
  /** Captures a fresh thumbnail now (null when the host cannot). */
  captureThumbnail(): string | null {
    let url: string | null = null;
    try { url = this.host.thumbnail?.() ?? null; } catch (e) { log.warn('thumbnail capture failed', e); }
    this.thumb = { url, atMs: this.now() };
    return url;
  }

  private thumbnailFor(opts: SaveOptions, autosave: boolean): string | null {
    if (opts.thumbnail !== undefined) return opts.thumbnail;
    if (autosave && this.thumb && (this.now() - this.thumb.atMs) / 1000 <= THUMB_CACHE_MAX_AGE_S) return this.thumb.url;
    return this.captureThumbnail();
  }

  // ------------------------------------------------------------------ list
  async list(opts: { includeHidden?: boolean } = {}): Promise<SaveOutcome<SaveListing[]>> {
    await this.ensureReady();
    const thumbs = await this.storage.getAll('thumbs');
    const thumbOf = (k: string): string | null => {
      const v = thumbs.ok ? thumbs.value[k] : null;
      return typeof v === 'string' ? v : null;
    };
    const out: SaveListing[] = [];
    const push = (key: string) => {
      const meta = this.cache.get(key);
      const hidden = key === 'opening-start';
      if (hidden && !opts.includeHidden) return;
      if (meta) {
        out.push({
          key, slot: meta.slot, title: titleOfKey(key), generation: meta.generation, label: meta.label, pinned: meta.pinned,
          meta: { ...meta, thumbnail: thumbOf(key) }, damaged: this.damaged.has(key), hidden,
        });
      } else if (this.damaged.has(key)) {
        out.push({ key, slot: slotOfKey(key) ?? 'quick', title: titleOfKey(key), generation: 0, label: '', pinned: false, meta: stubMeta(key), damaged: true, hidden });
      }
    };
    for (const m of autoGenerations(this.cache)) push(m.key);
    for (const k of AUTO_KEYS) if (!this.cache.has(k)) push(k);
    for (const k of ALL_KEYS.filter((x) => !isAutoKey(x))) push(k);
    return this.done('ok', 'ok', '', { value: out });
  }

  /** Metadata of the newest valid autosave or quick save (the Title's "Continue"), null when none. */
  async newestSave(): Promise<SaveMeta | null> {
    await this.ensureReady();
    const metas = [...this.cache.values()].filter((m) => m.key !== 'opening-start' && !this.damaged.has(m.key));
    if (metas.length === 0) return null;
    return metas.reduce((a, b) => (b.savedAtMs > a.savedAtMs ? b : a));
  }

  // ------------------------------------------------------------------ save
  async saveTo(slot: string, opts: SaveOptions = {}): Promise<SaveOutcome<SaveMeta>> {
    const autosave = opts.autosave === true;
    const label = typeof opts.label === 'string' ? opts.label : '';
    if (!autosave && !isManualTarget(slot)) return this.result(slot, slot, autosave, label, 'failed', 'That is not a slot you can save to.');
    if (autosave && slot !== 'auto' && slot !== 'opening-start') return this.result(slot, slot, autosave, label, 'failed', 'Unknown autosave slot.');
    // No await when the manager is ready: the state must be captured in the caller's synchronous run (a quit
    // autosave is followed at once by the session's disposal).
    if (!this.ready) await this.init();
    if (this.working) return this.result(slot, slot, autosave, label, 'busy', MESSAGES.busy);
    this.working = true;
    try {
      let relieved = 0;
      let degraded = false;
      for (;;) {
        const sim = this.host.getSim();
        const why = blockReason(sim?.state ?? null, this.host.context(), autosave ? 'autosave' : 'manual', { checkpoint: autosave && isCheckpointLabel(label) });
        if (why || !sim) return this.result(slot, slot, autosave, label, 'blocked', why ?? 'There is no game to save.');
        const key = this.keyFor(slot, label, autosave);
        const meta = buildMeta(sim.state, {
          key, generation: isAutoKey(key) ? nextGeneration(this.cache) : 0, label, pinned: label === 'final',
          playTimeS: this.playTimeS, nowMs: this.now(), worldFingerprint: sim.world.meta.fingerprint, thumbnail: this.thumbnailFor(opts, autosave),
        });
        const thumb = meta.thumbnail;
        const stored: SaveMeta = { ...meta, thumbnail: null };
        const record: SaveRecord = { format: 'foundress-save-record', meta: stored, state: sim.state };
        const ops: WriteOp[] = [
          { op: 'put', store: 'saves', key, value: record },
          { op: 'put', store: 'meta', key, value: stored },
          thumb ? { op: 'put', store: 'thumbs', key, value: thumb } : { op: 'delete', store: 'thumbs', key },
        ];
        const w = await this.storage.write(ops);
        if (w.ok) {
          this.cache.set(key, stored);
          this.damaged.delete(key);
          this.noteSaved(key, stored.dateLabel);
          const volatile = !this.storage.persistent;
          return this.result(slot, key, autosave, label, 'ok', volatile
            ? 'Saved for this session only: this browser cannot store saves. Use Export to keep your colony.'
            : 'Saved.', { value: { ...stored, thumbnail: thumb }, volatile });
        }
        if (w.status === 'quota' && relieved < AUTO_RING_SIZE) {
          // Drop the oldest autosave generation (never the one being replaced, never a pinned `final`) and retry.
          const victim = oldestDroppable(this.cache, key);
          if (victim) {
            relieved++;
            const d = await this.storage.write(deleteOps(victim.key));
            if (d.ok) { this.cache.delete(victim.key); continue; }
          }
        }
        if (w.status === 'unavailable' && this.storage.persistent && !degraded) {
          degraded = true;
          this.degrade(w.message);
          await this.storage.open();
          continue;
        }
        return this.result(slot, key, autosave, label, w.status, messageFor(w.status, w.message));
      }
    } catch (e) {
      return this.result(slot, slot, autosave, label, 'failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.working = false;
    }
  }

  /** Writes an autosave generation (or the hidden checkpoint for `opening-start`). */
  autosave(label: AutosaveLabel): Promise<SaveOutcome<SaveMeta>> {
    return this.saveTo('auto', { autosave: true, label });
  }

  /** Writes the hidden `opening-start` checkpoint (GDD 06 §5). */
  checkpointOpening(): Promise<SaveOutcome<SaveMeta>> {
    return this.saveTo('opening-start', { autosave: true, label: 'opening-start' });
  }

  private keyFor(slot: string, label: string, autosave: boolean): string {
    if (!autosave) return slot;
    if (slot === 'opening-start') return 'opening-start';
    if (label === 'final') {
      for (const m of this.cache.values()) if (isAutoKey(m.key) && m.pinned) return m.key; // a new `final` replaces the old one
    }
    return chooseAutoKey(this.cache);
  }

  /** A new game started: the pinned `final` generation becomes an ordinary one (GDD 06 §15). */
  async clearPinned(): Promise<void> {
    await this.ensureReady();
    for (const m of [...this.cache.values()]) {
      if (!m.pinned) continue;
      const unpinned: SaveMeta = { ...m, pinned: false };
      const rec = await this.storage.get('saves', m.key);
      if (!rec.ok || !rec.value) continue;
      const record = rec.value as SaveRecord;
      const w = await this.storage.write([
        { op: 'put', store: 'saves', key: m.key, value: { ...record, meta: unpinned } },
        { op: 'put', store: 'meta', key: m.key, value: unpinned },
      ]);
      if (w.ok) this.cache.set(m.key, unpinned);
    }
  }

  // ------------------------------------------------------------------ load
  /**
   * Loads a slot: `auto` = the newest valid generation (a damaged one is skipped), `quick` = the quick save or, when
   * empty and `fallbackToAuto`, the newest autosave, or any physical key. `skipPinned` leaves out the `final` generation
   * (the Epitaph's "Load the last autosave"). Replaces the running game on success.
   */
  async load(slot: string, opts: { fallbackToAuto?: boolean; skipPinned?: boolean } = {}): Promise<SaveOutcome<SaveMeta>> {
    await this.ensureReady();
    if (this.working) return this.loadResult(slot, 'busy', MESSAGES.busy);
    this.working = true;
    try {
      let keys: string[];
      const generations = () => autoGenerations(this.cache).filter((m) => !(opts.skipPinned && m.pinned)).map((m) => m.key);
      if (slot === 'auto') keys = generations();
      else if (ALL_KEYS.includes(slot)) keys = [slot];
      else return this.loadResult(slot, 'failed', 'Unknown slot.');
      if (slot === 'quick' && opts.fallbackToAuto !== false && !this.cache.has('quick') && !this.damaged.has('quick')) {
        keys = generations();
      }
      if (keys.length === 0 && !this.damaged.has(slot)) return this.loadResult(slot, 'not-found', MESSAGES['not-found']);
      let sawDamaged = false;
      for (const key of keys.length > 0 ? keys : [slot]) {
        const got = await this.storage.get('saves', key);
        if (!got.ok) return this.loadResult(slot, got.status, messageFor(got.status, got.message));
        const rec = got.value as Partial<SaveRecord> | undefined;
        if (rec === undefined) { this.cache.delete(key); continue; }
        if (!rec || rec.format !== 'foundress-save-record' || !isValidMeta(rec.meta) || !rec.state) { this.markDamaged(key); sawDamaged = true; continue; }
        const a = await this.adoptState(rec.meta, rec.state);
        if (a.ok) return this.loadResult(slot, 'ok', 'Loaded.', rec.meta);
        if (a.code === 'corrupt') { this.markDamaged(key); sawDamaged = true; continue; }
        return this.loadResult(slot, a.code, a.message); // version / world problems are not "damage": do not try older ones
      }
      return sawDamaged || this.damaged.has(slot)
        ? this.loadResult(slot, 'corrupt', 'This save is damaged and cannot be loaded.')
        : this.loadResult(slot, 'not-found', MESSAGES['not-found']);
    } catch (e) {
      return this.loadResult(slot, 'failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.working = false;
    }
  }

  private markDamaged(key: string): void {
    this.damaged.add(key);
  }

  // ------------------------------------------------------------------ delete
  async delete(slot: string): Promise<SaveOutcome> {
    await this.ensureReady();
    const keys = slot === 'auto' ? [...AUTO_KEYS] : ALL_KEYS.includes(slot) ? [slot] : [];
    if (keys.length === 0) return this.done('failed', 'failed', 'Unknown slot.');
    const w = await this.storage.write(keys.flatMap(deleteOps));
    if (!w.ok) return this.done(w.status === 'unavailable' ? 'unavailable' : 'failed', w.status, messageFor(w.status, w.message));
    for (const k of keys) { this.cache.delete(k); this.damaged.delete(k); }
    return this.done('ok', 'ok', 'Deleted.');
  }

  // ------------------------------------------------------------------ export
  /** Exports the running game (works without any storage). */
  async exportCurrent(opts: ExportOptions = {}): Promise<SaveOutcome<ExportValue>> {
    const sim = this.host.getSim();
    if (!sim) return this.exportDone('text', 'blocked', 'There is no game to export.');
    const meta = buildMeta(sim.state, {
      key: 'quick', generation: 0, label: 'export', pinned: false, playTimeS: this.playTimeS, nowMs: this.now(),
      worldFingerprint: sim.world.meta.fingerprint, thumbnail: this.captureThumbnail(),
    });
    return this.finishExport(meta, sim.state, opts);
  }

  /** Exports a stored slot. */
  async exportSlot(slot: string, opts: ExportOptions = {}): Promise<SaveOutcome<ExportValue>> {
    await this.ensureReady();
    const key = slot === 'auto' ? autoGenerations(this.cache)[0]?.key : slot;
    if (!key || !ALL_KEYS.includes(key) || !this.cache.has(key)) return this.exportDone('text', 'not-found', MESSAGES['not-found']);
    const got = await this.storage.get('saves', key);
    if (!got.ok) return this.exportDone('text', got.status, messageFor(got.status, got.message));
    const rec = got.value as Partial<SaveRecord> | undefined;
    if (!rec || rec.format !== 'foundress-save-record' || !isValidMeta(rec.meta) || !rec.state) {
      this.markDamaged(key);
      return this.exportDone('text', 'corrupt', 'This save is damaged and cannot be exported.');
    }
    const th = await this.storage.get('thumbs', key);
    const thumbnail = th.ok && typeof th.value === 'string' ? th.value : null;
    return this.finishExport({ ...rec.meta, thumbnail }, rec.state as SimState, opts);
  }

  private async finishExport(meta: SaveMeta, state: SimState, opts: ExportOptions): Promise<SaveOutcome<ExportValue>> {
    let bytes: Uint8Array;
    try {
      bytes = packContainer(meta, state);
    } catch (e) {
      return this.exportDone('text', 'failed', `The colony could not be packed for export: ${e instanceof Error ? e.message : String(e)}`);
    }
    const filename = exportFileName(meta);
    const method = opts.method ?? 'auto';
    if (method === 'bytes') return this.exportDone('bytes', 'ok', 'Ready.', { method: 'bytes', filename, sizeBytes: bytes.length, bytes });
    if (method === 'auto' && downloadBytes(bytes, filename, { noDownload: this.noDownload })) {
      return this.exportDone('download', 'ok', 'The save file was downloaded.', { method: 'download', filename, sizeBytes: bytes.length });
    }
    const text = bytesToText(bytes);
    const copied = opts.copy ? await copyText(text) : false;
    return this.exportDone('text', 'ok', 'Copy this text to keep your colony.', { method: 'text', filename, sizeBytes: bytes.length, text, copied });
  }

  // ------------------------------------------------------------------ import
  /** Validates a file's bytes or pasted text. Nothing is stored or loaded; the result carries the parsed save. */
  parseImport(input: Uint8Array | string): SaveOutcome<ParsedSave> {
    const r = typeof input === 'string' ? parseText(input) : parseBytes(input);
    if (!r.ok) return this.done('failed', r.code, r.message);
    return this.done('ok', 'ok', 'This is a FOUNDRESS save.', { value: { meta: r.meta, state: r.state } });
  }

  /** Stores a parsed import into a manual slot or `quick` (the player picked the target). */
  async importToSlot(parsed: ParsedSave, slot: string): Promise<SaveOutcome<SaveMeta>> {
    if (!isManualTarget(slot)) return this.result(slot, slot, false, '', 'failed', 'That is not a slot you can import into.');
    await this.ensureReady();
    if (this.working) return this.result(slot, slot, false, '', 'busy', MESSAGES.busy);
    this.working = true;
    try {
      const stored: SaveMeta = { ...parsed.meta, key: slot, slot: slotOfKey(slot) ?? 'quick', generation: 0, pinned: false, label: '', thumbnail: null };
      const record: SaveRecord = { format: 'foundress-save-record', meta: stored, state: parsed.state };
      const thumb = parsed.meta.thumbnail;
      const w = await this.storage.write([
        { op: 'put', store: 'saves', key: slot, value: record },
        { op: 'put', store: 'meta', key: slot, value: stored },
        thumb ? { op: 'put', store: 'thumbs', key: slot, value: thumb } : { op: 'delete', store: 'thumbs', key: slot },
      ]);
      if (!w.ok) return this.result(slot, slot, false, '', w.status, messageFor(w.status, w.message));
      this.cache.set(slot, stored);
      this.damaged.delete(slot);
      return this.result(slot, slot, false, '', 'ok', 'Imported.', { value: { ...stored, thumbnail: thumb }, volatile: !this.storage.persistent });
    } finally {
      this.working = false;
    }
  }

  /** "Load now": restores a parsed import and replaces the running game (nothing is written to a slot). */
  async loadParsed(parsed: ParsedSave): Promise<SaveOutcome<SaveMeta>> {
    const a = await this.adoptState(parsed.meta, parsed.state);
    return a.ok ? this.loadResult('import', 'ok', 'Loaded.', parsed.meta) : this.loadResult('import', a.code, a.message);
  }

  /** Rebuilds the sim (migration, world, fingerprint) and hands it to the game. The only place a load happens. */
  private async adoptState(meta: SaveMeta, state: unknown): Promise<{ ok: true } | { ok: false; code: SaveCode; message: string }> {
    try { await this.host.loadingBegin?.(); } catch (e) { log.warn('loadingBegin threw', e); }
    const r = restoreSave(meta, state, this.loaderDeps);
    if (!r.ok) { this.host.loadingEnd?.(); return r; }
    try {
      this.host.adopt(r.sim, meta);
    } catch (e) {
      this.host.loadingEnd?.();
      return { ok: false, code: 'failed', message: `The game could not start from this save: ${e instanceof Error ? e.message : String(e)}` };
    }
    this.playTimeS = meta.playTimeS;
    this.noteSaved(meta.key, meta.dateLabel); // the game now equals that save: no unsaved progress
    return { ok: true };
  }

  // ------------------------------------------------------------------ outcomes
  private done<T>(
    status: SaveOutcome['status'], code: SaveCode, message: string, extra: { value?: T } = {},
  ): SaveOutcome<T> {
    return { ok: code === 'ok', status, code, message, value: extra.value };
  }

  private result(
    slot: string, key: string, autosave: boolean, label: string, code: SaveCode, message: string,
    extra: { value?: SaveMeta; volatile?: boolean } = {},
  ): SaveOutcome<SaveMeta> {
    const ok = code === 'ok';
    const unavailable = !ok && code === 'unavailable';
    const volatile = extra.volatile === true;
    if (ok || code !== 'blocked') this.setLast(volatile ? 'unavailable' : code, message);
    if (!(autosave && code === 'blocked')) this.emit({ type: 'save-result', slot, key, ok, code, message, autosave, label });
    return {
      ok, status: ok ? (volatile ? 'unavailable' : 'ok') : unavailable ? 'unavailable' : 'failed', code, message,
      ...(volatile ? { volatile: true } : {}), value: extra.value,
    };
  }

  private loadResult(slot: string, code: SaveCode, message: string, meta?: SaveMeta): SaveOutcome<SaveMeta> {
    const ok = code === 'ok';
    this.emit({ type: 'load-result', slot, ok, code, message });
    return { ok, status: ok ? 'ok' : code === 'unavailable' ? 'unavailable' : 'failed', code, message, value: meta };
  }

  private exportDone(method: ExportValue['method'], code: SaveCode, message: string, value?: ExportValue): SaveOutcome<ExportValue> {
    const ok = code === 'ok';
    this.emit({ type: 'export-result', method, ok, code, message });
    return { ok, status: ok ? 'ok' : code === 'unavailable' ? 'unavailable' : 'failed', code, message, value };
  }
}

function deleteOps(key: string): WriteOp[] {
  return [
    { op: 'delete', store: 'saves', key },
    { op: 'delete', store: 'meta', key },
    { op: 'delete', store: 'thumbs', key },
  ];
}

function messageFor(status: StorageFailure | SaveCode, raw: string): string {
  return MESSAGES[status] ?? raw;
}

function stubMeta(key: string): SaveMeta {
  return {
    key, slot: slotOfKey(key) ?? 'quick', generation: 0, label: '', pinned: false, species: 'lasius-niger', archetype: '', seed: 0,
    seedCode: '', sizeClass: '', difficulty: '', stage: '', tick: 0, dateLabel: '', colonyDay: 0, population: 0, playTimeS: 0,
    savedAtIso: '', savedAtMs: 0, saveVersion: 0, generatorVersion: 0, worldFingerprint: 0, appVersion: '', thumbnail: null,
  };
}
