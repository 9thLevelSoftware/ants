import { describe, expect, it } from 'vitest';
import { EventBus, type EventMapOf } from './events';

type Ev = { type: 'born'; id: number } | { type: 'died'; id: number; cause: string } | { type: 'tick'; n: number };
type Map = EventMapOf<Ev>;

describe('EventBus', () => {
  it('emit delivers synchronously to typed subscribers in subscription order', () => {
    const bus = new EventBus<Map>();
    const log: string[] = [];
    bus.on('born', (e) => log.push(`a${e.id}`));
    bus.on('born', (e) => log.push(`b${e.id}`));
    bus.on('died', (e) => log.push(`died ${e.cause}`));
    bus.emit('born', { type: 'born', id: 1 });
    bus.emit('died', { type: 'died', id: 1, cause: 'age' });
    expect(log).toEqual(['a1', 'b1', 'died age']);
  });

  it('on returns an unsubscribe function; off removes a handler; unknown off is a no-op', () => {
    const bus = new EventBus<Map>();
    let n = 0;
    const fn = () => n++;
    const unsub = bus.on('tick', fn);
    bus.emit('tick', { type: 'tick', n: 1 });
    unsub();
    bus.emit('tick', { type: 'tick', n: 2 });
    expect(n).toBe(1);
    bus.on('tick', fn);
    bus.off('tick', fn);
    bus.off('tick', fn);
    bus.off('born', () => {});
    bus.emit('tick', { type: 'tick', n: 3 });
    expect(n).toBe(1);
  });

  it('subscribing/unsubscribing during dispatch does not affect the current delivery', () => {
    const bus = new EventBus<Map>();
    const log: string[] = [];
    const late = () => log.push('late');
    let unsubB: () => void = () => {};
    bus.on('tick', () => {
      log.push('a');
      bus.on('tick', late);
      unsubB();
    });
    unsubB = bus.on('tick', () => log.push('b'));
    bus.emit('tick', { type: 'tick', n: 1 });
    expect(log).toEqual(['a', 'b']); // b still ran, late not yet
    log.length = 0;
    bus.emit('tick', { type: 'tick', n: 2 });
    expect(log).toEqual(['a', 'late']);
  });

  it('queue holds events until flush, which delivers them in FIFO order', () => {
    const bus = new EventBus<Map>();
    const got: number[] = [];
    bus.on('tick', (e) => got.push(e.n));
    bus.queue('tick', { type: 'tick', n: 1 });
    bus.queue('tick', { type: 'tick', n: 2 });
    expect(got).toEqual([]);
    expect(bus.pending).toBe(2);
    expect(bus.flush()).toBe(2);
    expect(got).toEqual([1, 2]);
    expect(bus.pending).toBe(0);
    expect(bus.flush()).toBe(0);
  });

  it('handlers may queue more events during flush; they are delivered in order in the same flush', () => {
    const bus = new EventBus<Map>();
    const order: string[] = [];
    bus.on('born', (e) => {
      order.push(`born${e.id}`);
      if (e.id < 3) bus.queue('born', { type: 'born', id: e.id + 1 });
      bus.queue('tick', { type: 'tick', n: e.id });
    });
    bus.on('tick', (e) => order.push(`tick${e.n}`));
    bus.queue('born', { type: 'born', id: 1 });
    bus.queue('tick', { type: 'tick', n: 0 });
    expect(bus.flush()).toBe(7);
    expect(order).toEqual(['born1', 'tick0', 'born2', 'tick1', 'born3', 'tick2', 'tick3']);
  });

  it('flush guards against infinite event loops', () => {
    const bus = new EventBus<Map>();
    bus.on('tick', (e) => bus.queue('tick', { type: 'tick', n: e.n + 1 }));
    bus.queue('tick', { type: 'tick', n: 0 });
    expect(bus.flush(1000)).toBe(1000);
    expect(bus.droppedCount).toBe(1);
    expect(bus.pending).toBe(0);
  });

  it('a throwing handler aborts the flush but keeps the remaining events queued', () => {
    const bus = new EventBus<Map>();
    const got: number[] = [];
    bus.on('tick', (e) => {
      if (e.n === 2) throw new Error('bad');
      got.push(e.n);
    });
    for (const n of [1, 2, 3]) bus.queue('tick', { type: 'tick', n });
    expect(() => bus.flush()).toThrow('bad');
    expect(got).toEqual([1]);
    expect(bus.pending).toBe(1);
    bus.flush();
    expect(got).toEqual([1, 3]);
  });

  it('onAny sees every event after typed handlers; nested flush is ignored', () => {
    const bus = new EventBus<Map>();
    const seen: string[] = [];
    bus.on('born', () => seen.push('typed'));
    const unsub = bus.onAny((type) => {
      seen.push(`any:${String(type)}`);
      expect(bus.flush()).toBe(0); // re-entrant flush does nothing
    });
    bus.queue('born', { type: 'born', id: 1 });
    bus.queue('died', { type: 'died', id: 1, cause: 'x' });
    bus.flush();
    expect(seen).toEqual(['typed', 'any:born', 'any:died']);
    unsub();
    bus.emit('born', { type: 'born', id: 2 });
    expect(seen).toHaveLength(4);
  });

  it('clearQueue drops events and clearListeners removes subscriptions', () => {
    const bus = new EventBus<Map>();
    let n = 0;
    bus.on('tick', () => n++);
    bus.queue('tick', { type: 'tick', n: 1 });
    bus.clearQueue();
    expect(bus.flush()).toBe(0);
    bus.clearListeners();
    bus.emit('tick', { type: 'tick', n: 2 });
    expect(n).toBe(0);
  });
});
