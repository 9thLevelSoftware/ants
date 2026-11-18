// colony-life direction 12 (sim-seams item 8.2): commands applied while paused deliver their events at once, as a
// tick does, and only once; inside a tick the commands system leaves them to the tick's own flush.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';

describe('applyPendingCommands outside a tick flushes the events of its commands', () => {
  it('paused: the event is delivered before any tick, and not again by the next tick', () => {
    const sim = makeTestSim();
    const seen: string[] = [];
    sim.events.on('time.speed-changed', (e) => seen.push(`${e.from}->${e.to}`));
    sim.enqueue({ type: 'setSpeed', speed: 4 });
    sim.applyPendingCommands();
    expect(seen).toEqual(['1->4']);
    sim.tick();
    expect(seen).toEqual(['1->4']);
  });

  it('inside a tick the events of the applied commands still come with the tick, in order', () => {
    const sim = makeTestSim();
    const order: string[] = [];
    sim.events.on('time.speed-changed', () => order.push('speed'));
    sim.enqueue({ type: 'setSpeed', speed: 2 });
    const t = sim.state.tick;
    sim.tick();
    expect(sim.state.tick).toBe(t + 1);
    expect(order).toEqual(['speed']);
  });
});
