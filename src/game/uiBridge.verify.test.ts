// Reviewer tests (F3b): the UI snapshot and the debug summary must be plain, compact, JSON-safe data in every state
// (architecture §5: "summary() compact JSON safe to return through Playwright"), and camera-relative mapping must
// never hand the sim a non-finite direction.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { buildSummary } from './debug/summary';
import { cameraRelativeDir } from './intent/cameraRelative';
import { GameSession } from './session';
import { buildSnapshot, type SnapshotSource } from './uiBridge';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function src(o: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    sim: null, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: false, toasts: [], hudHidden: false,
    error: null, underground: false, epitaph: null, ...o,
  };
}

function session(workers: number) {
  const sim = makeTestSim({ nest: 'small', workers });
  if (workers > 0) {
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: sim.state.colonies[0].id, n: 400, caste: 'worker', ageGd: 5, task: null, pos: { ...sim.world.queenStart.pos } });
  }
  sim.enqueue({ type: 'possess', role: 'queen' });
  sim.applyPendingCommands();
  sim.events.flush();
  return new GameSession(sim, cam);
}

describe('UI snapshot (reviewer)', () => {
  it('is JSON round-trip equal in every mode, including loading errors and the epitaph', () => {
    const s = session(2);
    const cases: Partial<SnapshotSource>[] = [
      { mode: 'title' },
      { mode: 'loading', loading: { phase: 'x', progress: 0.5, attempt: 2, maxAttempts: 8, error: 'boom' } },
      { mode: 'playing', sim: s.sim, view: 'possess' },
      { mode: 'paused', sim: s.sim, view: 'colony' },
      { mode: 'playing', sim: s.sim, view: 'photo' },
      { mode: 'epitaph', sim: s.sim, epitaph: { ageDays: 3, peakWorkers: 12, cause: 'starvation' } },
    ];
    for (const c of cases) {
      const snap = buildSnapshot(src(c), 0);
      expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    }
  });

  it('allowed speeds follow GDD 01 §8: frozen in photo mode and the pause menu, no 8x while possessing', () => {
    const s = session(0);
    expect(buildSnapshot(src({ sim: s.sim, view: 'photo' }), 0).speed?.allowed).toEqual([]);
    expect(buildSnapshot(src({ sim: s.sim, mode: 'paused', view: 'possess' }), 0).speed?.allowed).toEqual([]);
    expect(buildSnapshot(src({ sim: s.sim, view: 'possess' }), 0).speed?.allowed).toEqual([0, 1, 2, 4]);
  });
});

describe('debug summary (reviewer)', () => {
  it('stays compact and JSON-safe with 400 ants', () => {
    const s = session(2);
    const sum = buildSummary({
      mode: 'playing', session: s, manualClock: true, autoPaused: false,
      camera: { state: 'open', observerMode: null, pos: { x: 1, y: 2, z: 3 }, underground: false }, renderers: {},
    });
    const json = JSON.stringify(sum);
    expect(JSON.parse(json)).toEqual(sum);
    expect(json.length).toBeLessThan(8000);
    expect((sum as { possessed: { caste: string } }).possessed.caste).toBe('queen');
  });
});

describe('camera-relative mapping (reviewer)', () => {
  it('a non-finite stick value never becomes a non-finite world direction', () => {
    const out = { x: 0, y: 0, z: 0 };
    const mag = cameraRelativeDir(out, Number.NaN, 1, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(Number.isFinite(mag)).toBe(true);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
  });

  it('a camera looking exactly along the ant up still gives a tangent direction of the input magnitude', () => {
    const out = { x: 0, y: 0, z: 0 };
    // ant on a wall (up +X), camera looking straight at the wall: forward = camera up projected (+Y)
    const mag = cameraRelativeDir(out, 0, 0.6, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(mag).toBeCloseTo(0.6, 9);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(0.6, 9);
  });
});
