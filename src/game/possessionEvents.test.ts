import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { EVENT_LOG_SIZE, PossessionEvents } from './possessionEvents';

describe('PossessionEvents log', () => {
  it('since(seq) finds the newest events even after the capped log is full', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1 });
    const ev = new PossessionEvents();
    ev.attach(sim);
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: EVENT_LOG_SIZE + 50, caste: 'worker', ageGd: 5, task: null, pos: sim.world.queenStart.pos });
    sim.applyPendingCommands();
    sim.events.flush();
    expect(ev.log.length).toBe(EVENT_LOG_SIZE);
    const seq = ev.seq;
    expect(ev.since(seq)).toEqual([]);
    sim.enqueue({ type: 'no-such-command' } as never);
    sim.applyPendingCommands();
    sim.events.flush();
    const fresh = ev.since(seq);
    expect(fresh.map((e) => e.type)).toContain('command-rejected');
    expect(fresh.every((e) => e.seq > seq)).toBe(true);
  });
});
