// IndexedDB back end (architecture §7). One database, four object stores (saves, meta, thumbs, profile) keyed by
// string. The structured clone keeps typed arrays as typed arrays, so a save stores the live SimState as it is.
//
// Every access to `indexedDB` is wrapped: in a sandboxed iframe or a private window the global itself may throw,
// open() may error or never answer, and any transaction may abort with QuotaExceededError. None of that escapes.
import { IDB_NAME, IDB_VERSION } from './constants';
import { deepCopy } from './deepCopy';
import {
  classifyError, failure, okVoid, STORE_NAMES, type SaveStorage, type StorageResult, type StoreName, type WriteOp,
} from './storage';

/** open() that has not answered after this long counts as unavailable (blocked upgrade, stuck profile). */
const OPEN_TIMEOUT_MS = 6000;

export interface IndexedDbStorageOptions {
  /** Factory override (tests, forced failure); default: globalThis.indexedDB read inside try/catch. */
  factory?: () => IDBFactory | null | undefined;
  name?: string;
}

function defaultFactory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

export class IndexedDbStorage implements SaveStorage {
  readonly kind = 'indexeddb' as const;
  readonly persistent = true;
  private db: IDBDatabase | null = null;
  private opening: Promise<StorageResult<undefined>> | null = null;
  private lastOpenFailure: StorageResult<undefined> | null = null;

  constructor(private readonly opts: IndexedDbStorageOptions = {}) {}

  open(): Promise<StorageResult<undefined>> {
    if (this.db) return Promise.resolve(okVoid);
    if (this.lastOpenFailure) return Promise.resolve(this.lastOpenFailure);
    if (!this.opening) this.opening = this.openOnce().then((r) => {
      this.opening = null;
      if (!r.ok) this.lastOpenFailure = r; // do not hammer a database that refused: one verdict per page
      return r;
    });
    return this.opening;
  }

  private openOnce(): Promise<StorageResult<undefined>> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: StorageResult<undefined>) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => done(failure('unavailable', 'Opening the browser storage timed out.')), OPEN_TIMEOUT_MS);
      try {
        const factory = (this.opts.factory ?? defaultFactory)();
        if (!factory) return done(failure('unavailable', 'This browser context has no IndexedDB.'));
        const req = factory.open(this.opts.name ?? IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of STORE_NAMES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        req.onblocked = () => done(failure('unavailable', 'Browser storage is blocked by another tab.'));
        req.onerror = () => { const c = classifyError(req.error); done(failure(c.status === 'quota' ? 'quota' : 'unavailable', c.message)); };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; };
          db.onclose = () => { if (this.db === db) this.db = null; };
          this.db = db;
          done(okVoid);
        };
      } catch (e) {
        const c = classifyError(e);
        done(failure('unavailable', c.message));
      }
    });
  }

  async get(store: StoreName, key: string): Promise<StorageResult<unknown>> {
    const opened = await this.open();
    if (!opened.ok) return opened;
    return this.run<unknown>(store, 'readonly', (os, resolve, fail) => {
      const req = os.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => fail(req.error);
    });
  }

  async getAll(store: StoreName): Promise<StorageResult<Record<string, unknown>>> {
    const opened = await this.open();
    if (!opened.ok) return opened;
    return this.run<Record<string, unknown>>(store, 'readonly', (os, resolve, fail) => {
      const out: Record<string, unknown> = {};
      const req = os.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out[String(c.key)] = c.value;
        c.continue();
      };
      req.onerror = () => fail(req.error);
    });
  }

  private run<T>(
    store: StoreName, mode: IDBTransactionMode,
    body: (os: IDBObjectStore, resolve: (v: T) => void, fail: (e: unknown) => void) => void,
  ): Promise<StorageResult<T>> {
    return new Promise((resolve) => {
      try {
        const db = this.db;
        if (!db) return resolve(failure('unavailable', 'Storage is closed.'));
        const tx = db.transaction(store, mode);
        const fail = (e: unknown) => { const c = classifyError(e); resolve(failure(c.status, c.message)); };
        tx.onabort = () => fail(tx.error);
        body(tx.objectStore(store), (v) => resolve({ ok: true, value: v }), fail);
      } catch (e) {
        const c = classifyError(e);
        resolve(failure(c.status, c.message));
      }
    });
  }

  write(ops: WriteOp[]): Promise<StorageResult<undefined>> {
    if (ops.length === 0) return Promise.resolve(okVoid);
    // Open already: put() below serialises the value synchronously, inside this call. Not open yet (first save
    // of a session): copy first so the caller's state may move on while the database opens.
    if (!this.db) {
      const copies = ops.map((o) => (o.op === 'put' ? { ...o, value: deepCopy(o.value) } : o));
      return this.open().then((r) => (r.ok ? this.writeOpen(copies) : r));
    }
    return this.writeOpen(ops);
  }

  private writeOpen(ops: WriteOp[]): Promise<StorageResult<undefined>> {
    return new Promise((resolve) => {
      let tx: IDBTransaction | null = null;
      try {
        const db = this.db;
        if (!db) return resolve(failure('unavailable', 'Storage is closed.'));
        const names = [...new Set(ops.map((o) => o.store))];
        tx = db.transaction(names, 'readwrite');
        const t = tx;
        t.oncomplete = () => resolve(okVoid);
        t.onabort = () => { const c = classifyError(t.error); resolve(failure(c.status, c.message)); };
        t.onerror = () => { /* the abort handler reports it */ };
        for (const o of ops) {
          const os = t.objectStore(o.store);
          if (o.op === 'put') os.put(o.value, o.key);
          else os.delete(o.key);
        }
      } catch (e) {
        // DataCloneError (a function or class instance in the state), TransactionInactiveError, closed database...
        try { tx?.abort(); } catch { /* already finished */ }
        const c = classifyError(e);
        resolve(failure(c.status, c.message));
      }
    });
  }

  close(): void {
    try { this.db?.close(); } catch { /* ignore */ }
    this.db = null;
    this.opening = null;
    this.lastOpenFailure = null;
  }
}
