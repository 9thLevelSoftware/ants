// In-memory back end: the fallback when IndexedDB is unavailable (saves then last for the page's life only) and the
// back end of every unit test. Optional failure injection (`quotaBytes`, `failNextWrites`, `failOpen`) lets tests
// drive the quota-retry and unavailable paths without a browser.
import { deepCopy, estimateBytes } from './deepCopy';
import { classifyError, failure, okVoid, STORE_NAMES, type SaveStorage, type StorageResult, type StoreName, type WriteOp } from './storage';

export interface MemoryStorageOptions {
  /** Writes that would take the stored total above this many (estimated) bytes fail with `quota`. */
  quotaBytes?: number;
  /** Make open() resolve `unavailable` (simulates blocked IndexedDB, used behind the fallback in tests). */
  failOpen?: boolean;
}

export class MemoryStorage implements SaveStorage {
  readonly kind = 'memory' as const;
  readonly persistent = false;
  private readonly data = new Map<StoreName, Map<string, unknown>>();
  private readonly sizes = new Map<string, number>();
  /** Make the next N write() calls fail with this status (tests). */
  failNextWrites = 0;
  failStatus: 'quota' | 'failed' | 'unavailable' = 'failed';
  /** Number of write() calls that reached the store (tests). */
  writes = 0;

  constructor(private readonly opts: MemoryStorageOptions = {}) {
    for (const s of STORE_NAMES) this.data.set(s, new Map());
  }

  async open(): Promise<StorageResult<undefined>> {
    return this.opts.failOpen ? failure('unavailable', 'Storage is not available (simulated).') : okVoid;
  }

  async get(store: StoreName, key: string): Promise<StorageResult<unknown>> {
    try {
      const v = this.data.get(store)?.get(key);
      return { ok: true, value: v === undefined ? undefined : deepCopy(v) };
    } catch (e) {
      const c = classifyError(e);
      return failure(c.status, c.message);
    }
  }

  async getAll(store: StoreName): Promise<StorageResult<Record<string, unknown>>> {
    try {
      const out: Record<string, unknown> = {};
      for (const [k, v] of this.data.get(store) ?? []) out[k] = deepCopy(v);
      return { ok: true, value: out };
    } catch (e) {
      const c = classifyError(e);
      return failure(c.status, c.message);
    }
  }

  write(ops: WriteOp[]): Promise<StorageResult<undefined>> {
    // Everything is captured and applied synchronously: the promise only reports the outcome.
    return Promise.resolve(this.writeNow(ops));
  }

  private writeNow(ops: WriteOp[]): StorageResult<undefined> {
    if (this.failNextWrites > 0) {
      this.failNextWrites--;
      return failure(this.failStatus, `Simulated ${this.failStatus} failure.`);
    }
    try {
      // Stage on copies, check the quota, then commit: all or nothing.
      const staged: { op: WriteOp; copy?: unknown; size: number }[] = ops.map((op) => {
        if (op.op === 'put') return { op, copy: deepCopy(op.value), size: this.opts.quotaBytes === undefined ? 0 : estimateBytes(op.value) };
        return { op, size: 0 };
      });
      if (this.opts.quotaBytes !== undefined) {
        const sizes = new Map(this.sizes);
        for (const s of staged) {
          const id = `${s.op.store}/${s.op.key}`;
          if (s.op.op === 'put') sizes.set(id, s.size); else sizes.delete(id);
        }
        let total = 0;
        for (const n of sizes.values()) total += n;
        if (total > this.opts.quotaBytes) return failure('quota', 'The browser storage is full (simulated quota).');
        this.sizes.clear();
        for (const [k, n] of sizes) this.sizes.set(k, n);
      }
      for (const s of staged) {
        const store = this.data.get(s.op.store);
        if (!store) return failure('failed', `Unknown store ${s.op.store}`);
        if (s.op.op === 'put') store.set(s.op.key, s.copy);
        else store.delete(s.op.key);
      }
      this.writes++;
      return okVoid;
    } catch (e) {
      const c = classifyError(e);
      return failure(c.status, c.message);
    }
  }

  close(): void {}
}
