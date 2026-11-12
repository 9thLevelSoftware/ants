// The profile store (`foundress.profile.v1`, GDD 06 §12, GDD 08 App. A): hints seen, codex unlocks, lineage.
// Lives in IndexedDB (`profile` object store) with a localStorage fallback, and never inside a save. Updates are
// merge-safe: before every write the stored profile is read and merged into memory, so a second tab or a failed
// earlier write cannot erase progress, and a hint never moves backwards.
import { createLogger } from '@/core/log';
import type { CodexUnlock, DaughterRecord, DeviceProfile, FlightRecord, HintId, LineageColonyRecord } from '@/sim/types';
import { PROFILE_STORAGE_KEY, PROFILE_WRITE_DEBOUNCE_MS } from '../save/constants';
import type { LocalKv } from '../save/localKv';
import type { SaveStorage } from '../save/storage';
import { cleanCodex, cleanColony, cleanDaughter, cleanFlight, mergeHint, mergeProfiles, sanitizeProfile, trimLineage } from './merge';
import { emptyProfile, PROFILE_KEY, PROFILE_SCHEMA_VERSION, type ProfilePart, type StoredHint } from './model';

const log = createLogger('profile');

export interface ProfileStatus {
  /** Where the profile is kept now. */
  backend: 'indexeddb' | 'localstorage' | 'memory';
  /** The profile survives a reload (false: memory only). */
  persistent: boolean;
  loaded: 'none' | 'ok' | 'damaged' | 'pending';
  /** The last write failed; progress is kept in memory and retried at the next change. */
  writeFailed: boolean;
  message: string;
}

interface Envelope {
  v: number;
  profile: unknown;
}

export interface ProfileOptions {
  /** The save storage (its `profile` object store). Null = go straight to localStorage. */
  storage?: SaveStorage | null;
  kv?: LocalKv | null;
  /** Wall clock ISO text for new codex unlocks (default: new Date().toISOString()). */
  nowIso?: () => string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  debounceMs?: number;
}

export class ProfileStore {
  private data: DeviceProfile = emptyProfile();
  private readonly listeners = new Set<(p: DeviceProfile, part: ProfilePart) => void>();
  private readonly storage: SaveStorage | null;
  private readonly kv: LocalKv | null;
  private readonly nowIso: () => string;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly debounceMs: number;
  private timer: unknown = null;
  private writing: Promise<void> | null = null;
  private dirty = false;
  /** Reads and writes go through the storage's `profile` store (it answered and is persistent). */
  private viaStorage = false;
  private st: ProfileStatus = { backend: 'memory', persistent: false, loaded: 'pending', writeFailed: false, message: '' };

  constructor(opts: ProfileOptions = {}) {
    this.storage = opts.storage ?? null;
    this.kv = opts.kv ?? null;
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.debounceMs = opts.debounceMs ?? PROFILE_WRITE_DEBOUNCE_MS;
  }

  // ------------------------------------------------------------------ reading
  get(): DeviceProfile {
    return this.data;
  }

  status(): ProfileStatus {
    return { ...this.st };
  }

  subscribe(fn: (p: DeviceProfile, part: ProfilePart) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(part: ProfilePart): void {
    for (const fn of [...this.listeners]) {
      try { fn(this.data, part); } catch (e) { log.warn('profile listener threw', e); }
    }
  }

  hint(id: HintId): StoredHint | undefined {
    return this.data.hints[id];
  }

  /** Hint states as the debug API shows them (`hints()`): id -> { uses, state }. */
  hints(): Record<string, StoredHint> {
    return { ...(this.data.hints as Record<string, StoredHint>) };
  }

  // ------------------------------------------------------------------ hints
  /** The hint was shown (pending -> shown); never moves a learned or dismissed hint back. */
  markHintShown(id: HintId): void {
    this.setHint(id, { uses: this.data.hints[id]?.uses ?? 0, state: 'shown' });
  }

  /** One more use of the taught action; `learnAt` uses make it `learned`. */
  recordHintUse(id: HintId, learnAt = 1, uses = 1): void {
    const cur = this.data.hints[id] ?? { uses: 0, state: 'pending' as const };
    const total = cur.uses + uses;
    this.setHint(id, { uses: total, state: total >= learnAt ? 'learned' : cur.state === 'pending' ? 'shown' : cur.state });
  }

  learnHint(id: HintId): void {
    this.setHint(id, { uses: Math.max(1, this.data.hints[id]?.uses ?? 0), state: 'learned' });
  }

  dismissHint(id: HintId): void {
    this.setHint(id, { uses: this.data.hints[id]?.uses ?? 0, state: 'dismissed' });
  }

  private setHint(id: HintId, next: StoredHint): void {
    const merged = mergeHint(this.data.hints[id], next);
    if (!merged) return;
    const cur = this.data.hints[id];
    if (cur && cur.uses === merged.uses && cur.state === merged.state) return;
    this.data = { ...this.data, hints: { ...this.data.hints, [id]: merged } };
    this.changed('hints');
  }

  /** "Reset hints" (Settings > Gameplay): every hint is pending again. Codex and lineage stay. */
  resetHints(): void {
    this.reset(['hints']);
  }

  // ------------------------------------------------------------------ codex
  /** First unlock wins; a repeat changes nothing. Returns true when the entry is new. */
  unlockCodex(id: string, info: Omit<CodexUnlock, 'firstSeenIso'> & { firstSeenIso?: string }): boolean {
    if (this.data.codex[id] || !/^cx-[a-z0-9-]+$/.test(id)) return false;
    const entry = cleanCodex({ ...info, firstSeenIso: info.firstSeenIso ?? this.nowIso() });
    if (!entry) return false;
    this.data = { ...this.data, codex: { ...this.data.codex, [id]: entry } };
    this.changed('codex');
    return true;
  }

  isCodexUnlocked(id: string): boolean {
    return !!this.data.codex[id];
  }

  // ------------------------------------------------------------------ lineage
  /** Adds or merges a colony record by id (an ended record never goes back to living; counters only grow). */
  upsertColony(rec: LineageColonyRecord): void {
    const c = cleanColony(rec);
    if (c) this.mergeIn({ ...emptyProfile(), lineage: { ...emptyProfile().lineage, colonies: [c] } }, 'lineage');
  }

  upsertFlight(rec: FlightRecord): void {
    const f = cleanFlight(rec);
    if (f) this.mergeIn({ ...emptyProfile(), lineage: { ...emptyProfile().lineage, flights: [f] } }, 'lineage');
  }

  upsertDaughters(recs: DaughterRecord[]): void {
    const ds = recs.map(cleanDaughter).filter((d): d is DaughterRecord => d !== null);
    if (ds.length > 0) this.mergeIn({ ...emptyProfile(), lineage: { ...emptyProfile().lineage, daughters: ds } }, 'lineage');
  }

  /** Marks a daughter founded or lost (one use). Unknown ids are ignored. */
  setDaughterState(id: string, state: DaughterRecord['state']): void {
    const d = this.data.lineage.daughters.find((x) => x.id === id);
    if (d) this.upsertDaughters([{ ...d, state }]);
  }

  setLineageSetting(key: string, value: string | number | boolean): void {
    if (this.data.lineage.settings[key] === value) return;
    this.data = { ...this.data, lineage: { ...this.data.lineage, settings: { ...this.data.lineage.settings, [key]: value } } };
    this.changed('lineage');
  }

  /** The Lineage screen's `lineage.json` export. */
  exportLineageJson(): string {
    return JSON.stringify({ format: 'foundress-lineage', v: PROFILE_SCHEMA_VERSION, lineage: this.data.lineage }, null, 2);
  }

  // ------------------------------------------------------------------ merge / reset
  /** Merges another profile (stored copy, import) into memory; nothing in memory is lost. */
  merge(other: unknown): void {
    this.mergeIn(sanitizeProfile(other), 'lineage', true);
  }

  private mergeIn(incoming: DeviceProfile, part: ProfilePart, all = false): void {
    const next = mergeProfiles(this.data, incoming);
    if (JSON.stringify(next) === JSON.stringify(this.data)) return;
    this.data = next;
    this.changed(all ? 'hints' : part);
    if (all) { this.emit('codex'); this.emit('lineage'); }
  }

  /** Resets parts of the profile (default all). Persisted like any change. */
  reset(parts: ProfilePart[] = ['hints', 'codex', 'lineage']): void {
    const next = { ...this.data };
    if (parts.includes('hints')) next.hints = {};
    if (parts.includes('codex')) next.codex = {};
    if (parts.includes('lineage')) next.lineage = emptyProfile().lineage;
    this.data = trimLineage(next);
    for (const p of parts) this.pendingResets.set(p, ++this.resetCounter);
    for (const p of parts) this.emit(p);
    this.scheduleWrite();
  }

  /**
   * Parts reset in memory whose reset is not yet in the stored profile. Until a write succeeds, the stored copy of
   * such a part must not be merged back in (it holds exactly what the player erased). The value is a counter, so a
   * write only retires the resets it actually contained: a reset made while that write was running stays pending.
   */
  private readonly pendingResets = new Map<ProfilePart, number>();
  private resetCounter = 0;

  /** Merges a stored copy into memory, except for the parts with a pending reset. */
  private mergeStored(raw: unknown): void {
    const before = this.data;
    const merged = mergeProfiles(before, sanitizeProfile(raw));
    for (const part of this.pendingResets.keys()) (merged as unknown as Record<string, unknown>)[part] = before[part];
    if (JSON.stringify(merged) === JSON.stringify(before)) return;
    this.data = merged;
    this.emit('hints'); this.emit('codex'); this.emit('lineage');
  }

  private changed(part: ProfilePart): void {
    this.emit(part);
    this.scheduleWrite();
  }

  // ------------------------------------------------------------------ persistence
  /** Loads the stored profile (IndexedDB, then localStorage) and merges it into memory. Never throws. */
  async load(): Promise<ProfileStatus> {
    const stored = await this.readStored();
    if (stored.kind === 'found') {
      this.st.loaded = 'ok';
      this.mergeStored(stored.profile);
    } else this.st.loaded = stored.kind === 'damaged' ? 'damaged' : 'none';
    return this.status();
  }

  private async readStored(): Promise<{ kind: 'found'; profile: unknown } | { kind: 'none' } | { kind: 'damaged' }> {
    // The storage's `profile` store, when it is the persistent one (a volatile fallback is no place for a profile).
    if (this.storage && this.storage.persistent) {
      const r = await this.storage.get('profile', PROFILE_KEY);
      if (r.ok) {
        this.st.backend = this.storage.kind === 'indexeddb' ? 'indexeddb' : 'memory';
        this.st.persistent = true;
        this.viaStorage = true;
        const env = r.value as Envelope | undefined;
        if (env && typeof env === 'object' && 'profile' in env) return { kind: 'found', profile: env.profile };
        if (env !== undefined) return { kind: 'damaged' };
        return this.readLocal(true); // nothing in IndexedDB yet: a localStorage copy is migrated on the first write
      }
    }
    return this.readLocal(false);
  }

  /** localStorage copy: the fallback when IndexedDB is unavailable (or a migration source when it is empty). */
  private readLocal(idbWorked: boolean): { kind: 'found'; profile: unknown } | { kind: 'none' } | { kind: 'damaged' } {
    if (!idbWorked) {
      this.st.backend = this.kv?.available ? 'localstorage' : 'memory';
      this.st.persistent = !!this.kv?.available;
    }
    const text = this.kv?.get(PROFILE_STORAGE_KEY) ?? null;
    if (text === null) return { kind: 'none' };
    try {
      const env = JSON.parse(text) as Envelope | null;
      return env && typeof env === 'object' && 'profile' in env ? { kind: 'found', profile: env.profile } : { kind: 'damaged' };
    } catch {
      return { kind: 'damaged' };
    }
  }

  private scheduleWrite(): void {
    this.dirty = true;
    if (this.timer === null) this.timer = this.setTimer(() => { this.timer = null; void this.flush(); }, this.debounceMs);
  }

  /** Writes now (pagehide, tests, end of a game). Merge-safe: the stored profile is merged in first. */
  async flush(): Promise<void> {
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
    if (this.writing) { await this.writing; if (!this.dirty) return; }
    if (!this.dirty) return;
    this.writing = this.writeOnce().finally(() => { this.writing = null; });
    await this.writing;
  }

  private async writeOnce(): Promise<void> {
    this.dirty = false;
    try {
      const stored = await this.readStored();
      if (stored.kind === 'found') this.mergeStored(stored.profile); // after the await: sees a reset made meanwhile
      const resetsInThisWrite = new Map(this.pendingResets);
      const env: Envelope = { v: PROFILE_SCHEMA_VERSION, profile: this.data };
      let ok = false;
      if (this.storage && this.viaStorage) {
        const w = await this.storage.write([{ op: 'put', store: 'profile', key: PROFILE_KEY, value: env }]);
        ok = w.ok;
        if (!w.ok) log.warn('profile write to IndexedDB failed:', w.message);
      }
      if (!ok && this.kv?.available) {
        ok = this.kv.set(PROFILE_STORAGE_KEY, JSON.stringify(env));
        if (ok && !this.viaStorage) { this.st.backend = 'localstorage'; this.st.persistent = true; }
      }
      if (ok) for (const [part, n] of resetsInThisWrite) if (this.pendingResets.get(part) === n) this.pendingResets.delete(part);
      this.st.writeFailed = !ok && (this.st.persistent || this.kv?.available === true || this.storage?.persistent === true);
      this.st.message = ok || !this.st.writeFailed ? '' : 'Progress could not be stored in this browser; it is kept until you close the page.';
    } catch (e) {
      this.st.writeFailed = true;
      this.st.message = e instanceof Error ? e.message : String(e);
      log.warn('profile write failed', e);
    }
  }

  dispose(): void {
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
  }
}

