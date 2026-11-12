// Typed event bus with immediate (`emit`) and queued (`queue` + `flush`) delivery.
//
// The sim queues events during a tick and flushes them after it (docs/03-architecture.md §3). Handlers may queue
// further events while a flush runs; they are delivered in the same flush, in order, up to a loop guard.
// This is a runtime service, never part of persisted state.

/** Maps event type names to payload types, e.g. `{ antDied: { id: number }; dayStarted: { day: number } }`. */
export type EventMapBase = Record<string, unknown>;

/** Builds an event map from a discriminated union `{ type: 'a', ... } | { type: 'b', ... }` (payload = whole object). */
export type EventMapOf<U extends { type: string }> = { [K in U['type']]: Extract<U, { type: K }> };

export type Handler<P> = (payload: P) => void;
export type AnyHandler<M> = (type: keyof M, payload: M[keyof M]) => void;

/** Default maximum number of events one flush delivers before it gives up (an event loop is a bug). */
export const DEFAULT_FLUSH_LIMIT = 100_000;

export class EventBus<M extends EventMapBase> {
  // Listener arrays are replaced (copy-on-write) by on/off, so dispatch can iterate them without copying even
  // when a handler subscribes or unsubscribes during delivery.
  private listeners: { [K in keyof M]?: Handler<M[K]>[] } = {};
  private anyListeners: AnyHandler<M>[] = [];
  private queuedTypes: (keyof M)[] = [];
  private queuedPayloads: M[keyof M][] = [];
  private head = 0;
  private flushing = false;
  /** Events discarded by the flush loop guard since creation. Non-zero means some handler loops forever. */
  droppedCount = 0;

  /** Subscribes; returns an unsubscribe function. */
  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    const cur = this.listeners[type];
    this.listeners[type] = cur ? [...cur, fn] : [fn];
    return () => this.off(type, fn);
  }

  /** Removes one subscription of fn (no-op when absent). */
  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void {
    const cur = this.listeners[type];
    if (!cur) return;
    const i = cur.indexOf(fn);
    if (i < 0) return;
    const next = cur.slice();
    next.splice(i, 1);
    this.listeners[type] = next;
  }

  /** Receives every event (after the type-specific handlers). Returns an unsubscribe function. */
  onAny(fn: AnyHandler<M>): () => void {
    this.anyListeners = [...this.anyListeners, fn];
    return () => {
      this.anyListeners = this.anyListeners.filter((f) => f !== fn);
    };
  }

  /** Delivers immediately, synchronously, to current subscribers. */
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const list = this.listeners[type];
    if (list) for (let i = 0; i < list.length; i++) list[i](payload);
    const any = this.anyListeners;
    for (let i = 0; i < any.length; i++) any[i](type, payload);
  }

  /** Stores the event for the next flush(). */
  queue<K extends keyof M>(type: K, payload: M[K]): void {
    this.queuedTypes.push(type);
    this.queuedPayloads.push(payload);
  }

  /** Number of queued, undelivered events. */
  get pending(): number {
    return this.queuedTypes.length - this.head;
  }

  /**
   * Delivers queued events in FIFO order, including events queued by handlers during this flush.
   * Stops after `limit` deliveries: the rest is discarded and counted in `droppedCount`.
   * Returns the number delivered. A handler that throws aborts the flush; undelivered events stay queued.
   * Re-entrant calls (flush from inside a handler) return 0 and leave delivery to the outer flush.
   */
  flush(limit = DEFAULT_FLUSH_LIMIT): number {
    if (this.flushing) return 0;
    this.flushing = true;
    let delivered = 0;
    try {
      while (this.head < this.queuedTypes.length) {
        if (delivered >= limit) {
          this.droppedCount += this.queuedTypes.length - this.head;
          this.head = this.queuedTypes.length;
          break;
        }
        const i = this.head++;
        const type = this.queuedTypes[i];
        const payload = this.queuedPayloads[i];
        this.queuedPayloads[i] = undefined as M[keyof M]; // release the payload for GC
        delivered++;
        this.emit(type, payload);
      }
    } finally {
      if (this.head >= this.queuedTypes.length) {
        this.queuedTypes.length = 0;
        this.queuedPayloads.length = 0;
        this.head = 0;
      }
      this.flushing = false;
    }
    return delivered;
  }

  /** Drops all queued events without delivering them. */
  clearQueue(): void {
    this.queuedTypes.length = 0;
    this.queuedPayloads.length = 0;
    this.head = 0;
  }

  /** Removes every subscription (queued events are kept). */
  clearListeners(): void {
    this.listeners = {};
    this.anyListeners = [];
  }
}
