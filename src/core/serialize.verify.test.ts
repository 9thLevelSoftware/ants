// Adversarial review tests for serialize.ts, store.ts, events.ts and timeSeries.ts (F1a review).
import { describe, expect, it } from 'vitest';
import { EventBus } from './events';
import { decode, decodeFromText, encode, encodeToText, fromBase64, toBase64 } from './serialize';
import { Store } from './store';
import { tsAt, tsCreate, tsPush, tsToArray } from './timeSeries';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('serialize (review)', () => {
  it('integer boundaries round-trip exactly (varint/float switch at 2^52)', () => {
    const vals = [0, 1, -1, 63, 64, -64, -65, 127, 128, 2 ** 31, -(2 ** 31), 2 ** 32, 2 ** 52, -(2 ** 52), 2 ** 52 + 1, 2 ** 53, -(2 ** 53), Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE, 1e300, 0.1];
    const back = decode(encode(vals)) as number[];
    for (let i = 0; i < vals.length; i++) expect(Object.is(back[i], vals[i])).toBe(true);
  });

  it('a typed array shared by two parents decodes as two equal, independent copies', () => {
    const shared = new Int16Array([1, -2, 3]);
    const back = decode(encode({ a: shared, b: shared })) as { a: Int16Array; b: Int16Array };
    expect(back.a).toEqual(shared);
    expect(back.b).toEqual(shared);
    back.a[0] = 99;
    expect(back.b[0]).toBe(1);
  });

  it('empty containers and empty typed arrays round-trip', () => {
    const v = { a: [], o: {}, t: new Float64Array(0), u: new Uint8Array(0), s: '' };
    expect(decode(encode(v))).toEqual(v);
  });

  it('fuzz: corrupted bytes throw an Error or decode to a value, never hang or crash differently', () => {
    const rnd = lcg(77);
    const base = encode({ ants: [{ id: 1, pos: { x: 1.5, y: -2, z: 3 } }], chunks: [new Uint8Array(64).fill(7)], name: 'colony é' });
    for (let k = 0; k < 3000; k++) {
      const b = base.slice();
      const flips = 1 + ((rnd() * 4) | 0);
      for (let f = 0; f < flips; f++) b[4 + ((rnd() * (b.length - 4)) | 0)] = (rnd() * 256) | 0;
      try {
        decode(b);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    }
  });

  it('decode of a hostile huge object-length header fails fast', () => {
    // "FDS" v1, Obj tag, varint length 2^49
    const bytes = new Uint8Array([0x46, 0x44, 0x53, 1, 7, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]);
    const t0 = performance.now();
    expect(() => decode(bytes)).toThrow();
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it('text form survives line wrapping and is deterministic', () => {
    const v = { seed: 7, grid: new Float32Array([0.5, Number.NaN, -0]) };
    const text = encodeToText(v);
    expect(encodeToText(v)).toBe(text);
    const wrapped = text.replace(/(.{20})/g, '$1\r\n');
    const back = decodeFromText(wrapped) as typeof v;
    expect(back.seed).toBe(7);
    expect(Number.isNaN(back.grid[1])).toBe(true);
    expect(Object.is(back.grid[2], -0)).toBe(true);
    expect(fromBase64(toBase64(new Uint8Array([255, 254, 253, 0])))).toEqual(new Uint8Array([255, 254, 253, 0]));
  });
});

describe('Store (review)', () => {
  interface E { id: number; alive: boolean; hp: number }

  it('random add/kill/sweep sequences match a reference model', () => {
    const rnd = lcg(31);
    const list: E[] = [];
    const store = new Store(list);
    const ref = new Map<number, E>();
    let nextId = 0;
    for (let step = 0; step < 20000; step++) {
      const op = rnd();
      if (op < 0.45) {
        const e = { id: nextId++, alive: true, hp: step };
        store.add(e);
        ref.set(e.id, e);
      } else if (op < 0.85 && nextId > 0) {
        const id = (rnd() * nextId) | 0;
        expect(store.markDead(id)).toBe(ref.has(id));
        ref.delete(id);
      } else {
        store.sweep();
        expect(list.every((e) => e.alive)).toBe(true);
        expect(list.length).toBe(ref.size);
      }
      expect(store.count).toBe(ref.size);
    }
    for (const [id, e] of ref) expect(store.get(id)).toBe(e);
    expect(store.get(-1)).toBeUndefined();
  });
});

describe('EventBus (review)', () => {
  it('a handler that unsubscribes itself during flush still gets later events only until it unsubscribes', () => {
    const bus = new EventBus<{ a: { n: number } }>();
    const seen: number[] = [];
    const off = bus.on('a', (p) => {
      seen.push(p.n);
      if (p.n === 2) off();
    });
    for (let n = 1; n <= 4; n++) bus.queue('a', { n });
    expect(bus.flush()).toBe(4);
    expect(seen).toEqual([1, 2]);
    expect(bus.pending).toBe(0);
  });

  it('flush after a loop-guard trip leaves the bus usable', () => {
    const bus = new EventBus<{ ping: { n: number } }>();
    let count = 0;
    bus.on('ping', (p) => {
      count++;
      if (p.n < 1e9) bus.queue('ping', { n: p.n + 1 });
    });
    bus.queue('ping', { n: 0 });
    expect(bus.flush(50)).toBe(50);
    expect(bus.droppedCount).toBe(1);
    expect(bus.pending).toBe(0);
    count = 0;
    bus.queue('ping', { n: 1e9 });
    expect(bus.flush()).toBe(1);
    expect(count).toBe(1);
  });
});

describe('timeSeries (review)', () => {
  it('cap 1 and JSON round-trip after wrap-around', () => {
    const one = tsCreate(1);
    tsPush(one, 3);
    tsPush(one, 4);
    expect(tsToArray(one)).toEqual([4]);
    const ts = tsCreate(5);
    for (let i = 0; i < 13; i++) tsPush(ts, i);
    const back = JSON.parse(JSON.stringify(ts));
    expect(tsToArray(back)).toEqual([8, 9, 10, 11, 12]);
    expect(tsAt(back, -1)).toBe(12);
    expect(tsAt(back, 5)).toBeUndefined();
    expect(() => tsCreate(0)).toThrow(RangeError);
    expect(() => tsCreate(2.5)).toThrow(RangeError);
  });
});
