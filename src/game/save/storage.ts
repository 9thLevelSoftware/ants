// The one small storage interface of the save layer, and its result words. Two back ends implement it: IndexedDB
// (indexedDbStorage.ts) and an in-memory fallback (memoryStorage.ts). Every method resolves, never rejects and
// never throws: failures come back as { ok: false, status, message }.

/** Object stores. `saves` holds SaveRecord values, `meta` SaveMeta (so listing never loads a state), `thumbs`
 *  JPEG data URLs, `profile` the device profile. */
export type StoreName = 'saves' | 'meta' | 'thumbs' | 'profile';
export const STORE_NAMES: readonly StoreName[] = ['saves', 'meta', 'thumbs', 'profile'];

export type StorageFailure = 'unavailable' | 'quota' | 'failed';

export type StorageResult<T> = { ok: true; value: T } | { ok: false; status: StorageFailure; message: string };

export type WriteOp =
  | { op: 'put'; store: StoreName; key: string; value: unknown }
  | { op: 'delete'; store: StoreName; key: string };

export interface SaveStorage {
  readonly kind: 'indexeddb' | 'memory';
  /** True when written data survives a page reload. */
  readonly persistent: boolean;
  /** Opens the database (idempotent; concurrent callers share one attempt). Resolves unavailable when it cannot. */
  open(): Promise<StorageResult<undefined>>;
  /** Value of one key, `undefined` when absent. The result is the caller's own copy. */
  get(store: StoreName, key: string): Promise<StorageResult<unknown>>;
  /** Every key/value pair of a store (the caller's own copies). */
  getAll(store: StoreName): Promise<StorageResult<Record<string, unknown>>>;
  /**
   * One atomic batch: all operations apply or none does (an IndexedDB transaction), so an interrupted or
   * over-quota write leaves the previous save intact. Values are captured BEFORE the call returns: the caller may
   * mutate its state right away (IndexedDB serialises synchronously inside put(); the memory back end copies).
   */
  write(ops: WriteOp[]): Promise<StorageResult<undefined>>;
  /** Releases the connection (tests, hot reload). */
  close(): void;
}

export const okVoid: StorageResult<undefined> = { ok: true, value: undefined };

export function failure(status: StorageFailure, message: string): { ok: false; status: StorageFailure; message: string } {
  return { ok: false, status, message };
}

/** Classifies a thrown value: quota overflow, a missing/blocked database, or any other failure. */
export function classifyError(e: unknown): { status: StorageFailure; message: string } {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) return { status: 'quota', message: 'The browser storage is full.' };
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotFoundError' || /denied|blocked|not allowed|unavailable/i.test(msg)) {
    return { status: 'unavailable', message: `Storage is not available: ${msg}` };
  }
  return { status: 'failed', message: msg || 'Storage operation failed.' };
}
