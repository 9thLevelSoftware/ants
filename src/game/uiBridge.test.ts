import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { buildSnapshot, type SnapshotSource } from './uiBridge';

function src(o: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    sim: null, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: false, toasts: [], hudHidden: false,
    error: null, underground: false, epitaph: null, ...o,
  };
}

describe('UI snapshot building', () => {
  it('outside a game: screen only, no game data', () => {
    const s = buildSnapshot(src({ mode: 'title' }), 0);
    expect(s.screen).toBe('title');
    expect(s.rev).toBe(1);
    expect(s.time).toBeNull();
    expect(s.colony).toBeNull();
  });

  it('in a game: date, speed with the allowed levels, colony counts, possessed ant', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const s = buildSnapshot(src({ sim, view: 'possess', toasts: [{ id: 1, text: 'hi' }] }), 7);
    expect(s.rev).toBe(8);
    expect(s.time?.label).toMatch(/^[A-Z][a-z]+ · Day \d+ · \d\d:\d\d$/);
    expect(s.speed?.level).toBe(1);
    expect(s.speed?.allowed).toEqual([0, 1, 2, 4]); // possessing: no 8x
    expect(s.colony?.workers).toBe(4);
    expect(s.colony?.queenAlive).toBe(true);
    expect(s.possessed?.caste).toBe('queen');
    expect(s.toasts).toEqual([{ id: 1, text: 'hi' }]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s); // plain data
  });

  it('paused speed reports level 0 and keeps the requested speed', () => {
    const sim = makeTestSim();
    sim.enqueue({ type: 'setSpeed', speed: 4 });
    sim.enqueue({ type: 'setSpeed', speed: 0 });
    sim.applyPendingCommands();
    const s = buildSnapshot(src({ sim }), 0);
    expect(s.speed).toMatchObject({ level: 0, paused: true, requested: 4 });
  });
});
