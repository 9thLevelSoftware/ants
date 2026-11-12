import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { GameSession, EPITAPH_DELAY_S, POSSESS_DEATH_HOLD_S } from './session';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function newSession(workers = 5) {
  const sim = makeTestSim({ nest: 'small', workers });
  return new GameSession(sim, cam);
}

describe('GameSession: possession plumbing and the view machine (GDD 01 §1.3, §2, §3)', () => {
  it('starts in the observer and enters possession when the sim reports possession-started', () => {
    const s = newSession();
    expect(s.view).toBe('observer');
    s.driver.enqueue(s.possessCommand('queen', true));
    s.driver.applyCommandsNow();
    s.update(0);
    expect(s.view).toBe('possess');
    expect(s.possessedId).toBe(s.sim.state.colonies[0].queenId);
  });

  it('release returns to the observer following the released ant', () => {
    const s = newSession();
    s.driver.enqueue(s.possessCommand('queen', true));
    s.driver.applyCommandsNow();
    s.update(0);
    const id = s.possessedId;
    s.driver.enqueue({ type: 'release', reason: 'player' });
    s.driver.applyCommandsNow();
    s.update(0);
    expect(s.view).toBe('observer');
    expect(s.followId).toBe(id);
    expect(s.possessedId).toBe(-1);
  });

  it('death of the possessed ant: hold, then observer (GDD 01 §3.7)', () => {
    const s = newSession(3);
    const worker = s.sim.state.ants.find((a) => a.caste === 'worker')!;
    s.driver.enqueue(s.possessCommand(worker.id, true));
    s.driver.applyCommandsNow();
    s.update(0);
    s.driver.enqueue({ type: 'cheat.kill', id: worker.id, cause: 'test' });
    s.driver.step(1);
    s.update(0.1);
    expect(s.view).toBe('possess'); // still holding on the body
    s.update(POSSESS_DEATH_HOLD_S);
    expect(s.view).toBe('observer');
  });

  it('subjects are tick-interpolated and report underground / airborne', () => {
    const s = newSession();
    const a = s.sim.state.ants.find((x) => x.caste === 'worker')!;
    a.prevPos = { x: a.pos.x - 1, y: a.pos.y, z: a.pos.z };
    const subj = s.subjectOf(a, 0.5);
    expect(subj.pos.x).toBeCloseTo(a.pos.x - 0.5, 6);
    expect(subj.underground).toBe(true); // workers of the small test nest stand in its chambers
    expect(subj.airborne).toBe(false);
  });

  it('parses debug targets', () => {
    expect(GameSession.parseTarget(12)).toBe(12);
    expect(GameSession.parseTarget('12')).toBe(12);
    expect(GameSession.parseTarget('forager')).toBe('forager');
    expect(GameSession.parseTarget('king')).toBeNull();
  });

  it('extinction leads to the epitaph after the delay', () => {
    const s = newSession(0);
    s.driver.enqueue({ type: 'cheat.killAll', colonyId: s.sim.state.colonies[0].id });
    s.driver.step(1);
    expect(s.sim.state.ants.some((a) => a.alive)).toBe(false);
    expect(s.update(1).epitaph).toBe(false);
    expect(s.update(EPITAPH_DELAY_S).epitaph).toBe(true);
  });
});
