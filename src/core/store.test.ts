import { describe, expect, it } from 'vitest';
import { Store } from './store';

interface Ant { id: number; alive: boolean; hp: number }

const ant = (id: number, hp = 10): Ant => ({ id, alive: true, hp });

describe('Store', () => {
  it('wraps the state array in place: add pushes into it and get finds by id', () => {
    const state: Ant[] = [];
    const s = new Store(state);
    s.add(ant(5));
    s.add(ant(9));
    expect(s.list).toBe(state);
    expect(state.map((a) => a.id)).toEqual([5, 9]);
    expect(s.get(9)?.id).toBe(9);
    expect(s.get(-1)).toBeUndefined();
    expect(s.has(5)).toBe(true);
    expect(s.count).toBe(2);
    expect(() => s.add(ant(5))).toThrow(/duplicate/);
  });

  it('markDead hides the entity immediately but keeps it in the array until sweep', () => {
    const s = new Store<Ant>([]);
    for (const id of [1, 2, 3]) s.add(ant(id));
    expect(s.markDead(2)).toBe(true);
    expect(s.markDead(2)).toBe(false);
    expect(s.markDead(77)).toBe(false);
    expect(s.get(2)).toBeUndefined();
    expect(s.has(2)).toBe(false);
    expect(s.list).toHaveLength(3);
    expect(s.count).toBe(2);
  });

  it('sweep swap-removes dead entities, returns them, and id lookup stays correct', () => {
    const s = new Store<Ant>([]);
    for (let id = 100; id < 110; id++) s.add(ant(id));
    for (const id of [100, 104, 109, 105]) s.markDead(id);
    const removed = s.sweep();
    expect(removed.map((a) => a.id).sort()).toEqual([100, 104, 105, 109]);
    expect(s.list).toHaveLength(6);
    expect(s.count).toBe(6);
    for (const a of s.list) {
      expect(a.alive).toBe(true);
      expect(s.get(a.id)).toBe(a);
    }
    for (const id of [100, 104, 105, 109]) expect(s.get(id)).toBeUndefined();
    expect(s.sweep()).toHaveLength(0);
  });

  it('removing the last element and consecutive dead entities at the end works', () => {
    const s = new Store<Ant>([]);
    for (const id of [1, 2, 3, 4]) s.add(ant(id));
    s.markDead(3);
    s.markDead(4);
    s.sweep();
    expect(s.list.map((a) => a.id)).toEqual([1, 2]);
    s.markDead(1);
    s.markDead(2);
    s.sweep();
    expect(s.list).toHaveLength(0);
    expect(s.count).toBe(0);
  });

  it('iteration by index is safe while entities die and spawn during the loop', () => {
    const s = new Store<Ant>([]);
    for (let id = 0; id < 20; id++) s.add(ant(id));
    const visited: number[] = [];
    let nextId = 1000;
    for (let i = 0; i < s.list.length; i++) {
      const a = s.list[i];
      if (!a.alive) continue;
      visited.push(a.id);
      if (a.id % 3 === 0) s.markDead((a.id + 1) % 20); // kill a later (or earlier) neighbour
      if (a.id === 5) s.add(ant(nextId++)); // spawn: appended, visited later in this loop
    }
    expect(visited).toContain(1000);
    expect(visited).not.toContain(1);
    expect(visited).not.toContain(4);
    s.sweep();
    expect(s.list.every((a) => a.alive)).toBe(true);
    expect(new Set(s.list.map((a) => a.id)).size).toBe(s.list.length);
  });

  it('sweep also removes entities flagged dead without markDead and resyncs count', () => {
    const s = new Store<Ant>([]);
    for (const id of [1, 2, 3]) s.add(ant(id));
    s.list[0].alive = false;
    expect(s.sweep().map((a) => a.id)).toEqual([1]);
    expect(s.count).toBe(2);
    expect(s.get(2)?.id).toBe(2);
  });

  it('rebuild indexes a loaded array (including dead entries) and rejects duplicate ids', () => {
    const loaded: Ant[] = JSON.parse(JSON.stringify([ant(4), { ...ant(8), alive: false }, ant(15)]));
    const s = new Store(loaded);
    expect(s.get(15)?.hp).toBe(10);
    expect(s.get(8)).toBeUndefined();
    expect(s.count).toBe(2);
    loaded.reverse();
    s.rebuild();
    expect(s.get(4)).toBe(loaded[2]);
    expect(() => new Store([ant(1), ant(1)])).toThrow(/duplicate/);
  });

  it('stress: random adds/kills/sweeps keep the index consistent with the array', () => {
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const s = new Store<Ant>([]);
    let nextId = 0;
    const alive = new Set<number>();
    for (let step = 0; step < 3000; step++) {
      const r = rnd();
      if (r < 0.5) {
        s.add(ant(nextId));
        alive.add(nextId++);
      } else if (r < 0.9 && alive.size > 0) {
        const ids = [...alive];
        const id = ids[Math.floor(rnd() * ids.length)];
        s.markDead(id);
        alive.delete(id);
      } else {
        s.sweep();
      }
      expect(s.count).toBe(alive.size);
    }
    s.sweep();
    expect(s.list.map((a) => a.id).sort((a, b) => a - b)).toEqual([...alive].sort((a, b) => a - b));
    for (const id of alive) expect(s.get(id)?.id).toBe(id);
  });
});
