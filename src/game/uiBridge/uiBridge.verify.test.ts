// Reviewer tests for the ui-hud snapshot bridge: refresh cost in a realistic setting (sim advancing between refreshes,
// queen possessed, roster and inspect card open), the roster after deaths, and plain-data snapshots.
// A FAILING test here documents a defect. Perf: generous limits by default; FOUNDRESS_STRICT_PERF=1 applies the
// 0.5 ms budget of the task spec (run it on an idle machine).
import { beforeEach, describe, expect, it } from 'vitest';
import { findNonPlain, makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { defaultQuery } from '@/ui/panels/roster/rosterModel';
import { SnapshotBuilder, type SnapshotSource } from '../uiBridge';
import { hudRequests } from './requests';

// no @types/node in this project: read the environment and stderr through globalThis
const NODE = (globalThis as { process?: { env?: Record<string, string | undefined>; stderr?: { write(s: string): void } } }).process;
const STRICT = NODE?.env?.FOUNDRESS_STRICT_PERF === '1';

function src(sim: Sim, o: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    sim, mode: 'playing', view: 'possess', loading: null, speed: null, manualClock: false, toasts: [], hudHidden: false,
    error: null, underground: false, epitaph: null, ...o,
  };
}

function bigSim(extra: number): Sim {
  const sim = makeTestSim({ nest: 'small', workers: 10 });
  if (sim.state.player.opening) sim.state.player.opening.done = true;
  sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: extra, caste: 'worker', ageGd: 5, task: null, pos: { ...sim.world.queenStart.pos } });
  sim.enqueue({ type: 'possess', role: 'queen' });
  sim.applyPendingCommands();
  return sim;
}

beforeEach(() => { hudRequests.roster = null; hudRequests.inspect = null; hudRequests.hooks = null; });

describe('refresh cost, realistic', () => {
  it('1,500 ants, sim advancing between refreshes, queen possessed, roster and inspect open', () => {
    const sim = bigSim(1490);
    expect(sim.state.ants.filter((a) => a.alive).length).toBeGreaterThanOrEqual(1500);
    const worker = sim.state.ants.find((a) => a.caste === 'worker')!;
    hudRequests.inspect = { kind: 'ant', id: worker.id };
    const b = new SnapshotBuilder();
    let rev = 0;
    let nowMs = 0;
    b.build(src(sim), rev++, nowMs);
    const measure = (rosterOpen: boolean): number => {
      hudRequests.roster = rosterOpen ? { ...defaultQuery() } : null;
      let best = Infinity;
      for (let r = 0; r < 5; r++) {
        let total = 0;
        for (let i = 0; i < 8; i++) {
          sim.tick(); // a real tick between refreshes: slices really change (not timed)
          nowMs += 250; // UI_REFRESH_HZ 4
          const t0 = performance.now();
          b.build(src(sim), rev++, nowMs);
          total += performance.now() - t0;
        }
        best = Math.min(best, total / 8);
      }
      return best;
    };
    const closed = measure(false);
    const open = measure(true);
    NODE?.stderr?.write(`[verify] bridge refresh, 1500 ants, sim stepping: roster closed ${closed.toFixed(3)} ms, open ${open.toFixed(3)} ms\n`);
    const limit = STRICT ? 0.5 : 10;
    expect(closed).toBeLessThan(limit);
    expect(open).toBeLessThan(limit);
  }, 120_000);
});

describe('roster after deaths', () => {
  it('the count and the window only hold living ants (no stale dead rows, no short window)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 12 });
    const b = new SnapshotBuilder();
    hudRequests.roster = { ...defaultQuery(), limit: 8 };
    const r1 = b.build(src(sim, { view: 'observer' }), 0, 0).roster!;
    expect(r1.rows).toHaveLength(8);
    // three ants of the visible window die
    for (const row of r1.rows.slice(1, 4)) sim.enqueue({ type: 'cheat.kill', id: row.id, cause: 'injury' });
    sim.applyPendingCommands();
    sim.tick();
    const living = sim.state.ants.filter((a) => a.alive && a.colony === sim.state.colonies[0].id).length;
    const r2 = b.build(src(sim, { view: 'observer' }), 1, 600).roster!;
    expect(r2.all).toBe(living);
    expect(r2.total).toBe(living);
    expect(r2.rows).toHaveLength(8);
  });
});

describe('snapshot is plain data', () => {
  it('every slice survives a JSON round trip and holds no class instances, NaN or Infinity', () => {
    const sim = bigSim(20);
    hudRequests.roster = { ...defaultQuery() };
    hudRequests.inspect = { kind: 'ant', id: sim.state.colonies[0].queenId };
    for (let i = 0; i < 30; i++) sim.tick();
    const s = new SnapshotBuilder().build(src(sim), 0, 0);
    expect(findNonPlain(s)).toEqual([]);
    const json = JSON.stringify(s);
    expect(JSON.parse(json)).toEqual(s);
  });
});
