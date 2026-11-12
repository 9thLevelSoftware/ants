// Runtime id index over an entity array that lives in SimState (e.g. state.ants).
//
// The store does not own the data: `list` IS the state array, so saving state needs nothing from the store.
// Removal is deferred: markDead() only flips `alive`; sweep() (end of tick) swap-removes dead entities.
// Consequences: iterating `list` by index is safe while entities die (they stay in place until sweep);
// entities added during iteration are appended and are visited if the loop re-reads `list.length`.
// get()/has() treat dead-but-unswept entities as missing, so stale id references are harmless.

export interface StoreEntity {
  id: number;
  alive: boolean;
}

const NONE_REMOVED: readonly never[] = Object.freeze([]);

export class Store<T extends StoreEntity> {
  /** The live state array (alive entities plus dead ones not yet swept). Do not splice it directly. */
  readonly list: T[];
  private readonly indexById = new Map<number, number>();
  private aliveCount = 0;

  constructor(list: T[]) {
    this.list = list;
    this.rebuild();
  }

  /** Number of alive entities. Exact when deaths go through markDead(); sweep()/rebuild() resync it otherwise. */
  get count(): number {
    return this.aliveCount;
  }

  /** Appends an entity. Its id must be unique in the store. */
  add(e: T): T {
    if (this.indexById.has(e.id)) throw new Error(`Store.add: duplicate id ${e.id}`);
    this.indexById.set(e.id, this.list.length);
    this.list.push(e);
    if (e.alive) this.aliveCount++;
    return e;
  }

  /** The alive entity with this id, or undefined (missing, dead, or id -1). */
  get(id: number): T | undefined {
    const i = this.indexById.get(id);
    if (i === undefined) return undefined;
    const e = this.list[i];
    return e.alive ? e : undefined;
  }

  has(id: number): boolean {
    return this.get(id) !== undefined;
  }

  /** Flags the entity dead (removed at the next sweep). Returns false if it was missing or already dead. */
  markDead(id: number): boolean {
    const e = this.get(id);
    if (!e) return false;
    e.alive = false;
    this.aliveCount--;
    return true;
  }

  /**
   * Swap-removes every entity with alive === false (including ones flagged without markDead) and returns them.
   * Order of the remaining entities changes deterministically. Returns a shared empty array when nothing died.
   */
  sweep(): readonly T[] {
    let removed: T[] | null = null;
    const list = this.list;
    let i = 0;
    while (i < list.length) {
      const e = list[i];
      if (e.alive) {
        i++;
        continue;
      }
      (removed ??= []).push(e);
      this.indexById.delete(e.id);
      const last = list.pop() as T;
      if (i < list.length) {
        list[i] = last;
        this.indexById.set(last.id, i);
      }
      // do not advance: re-check the entity moved into slot i
    }
    if (removed) this.recountAlive();
    return removed ?? NONE_REMOVED;
  }

  /** Rebuilds the id index from `list` (after load, or after the array was replaced/edited wholesale). */
  rebuild(): void {
    this.indexById.clear();
    for (let i = 0; i < this.list.length; i++) {
      const id = this.list[i].id;
      if (this.indexById.has(id)) throw new Error(`Store.rebuild: duplicate id ${id}`);
      this.indexById.set(id, i);
    }
    this.recountAlive();
  }

  private recountAlive(): void {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (this.list[i].alive) n++;
    this.aliveCount = n;
  }
}
