import { describe, expect, it } from 'vitest';
import { allowedSpeeds, isFrozen, nextSpeed, refusalFor, speedOnPossess, type SpeedContext } from './speedRules';

const ctx = (o: Partial<SpeedContext> = {}): SpeedContext => ({
  mode: 'playing', view: 'observer', possessed: false, openingPhase: null, timelapse: false, ...o,
});

describe('time-speed rules tied to views (GDD 01 §8, GDD 06 §4.2)', () => {
  it('observer and colony views allow pause and 1-8x', () => {
    expect(allowedSpeeds(ctx())).toEqual([0, 1, 2, 4, 8]);
    expect(allowedSpeeds(ctx({ view: 'colony' }))).toEqual([0, 1, 2, 4, 8]);
  });

  it('possession allows pause, 1x, 2x, 4x and refuses 8x with reason possession', () => {
    const c = ctx({ view: 'possess', possessed: true });
    expect(allowedSpeeds(c)).toEqual([0, 1, 2, 4]);
    expect(refusalFor(8, c)).toBe('possession');
    expect(refusalFor(4, c)).toBeNull();
    expect(refusalFor(0, c)).toBeNull();
  });

  it('opening phases search..lay allow pause, 1x and 2x only', () => {
    for (const p of ['search', 'dig', 'seal', 'lay'] as const) {
      expect(allowedSpeeds(ctx({ openingPhase: p }))).toEqual([0, 1, 2]);
      expect(refusalFor(4, ctx({ openingPhase: p }))).toBe('opening');
    }
    expect(allowedSpeeds(ctx({ openingPhase: 'intro-card' }))).toEqual([0, 1, 2, 4, 8]);
  });

  it('photo mode, the pause menu and non-playing modes freeze time; a time-lapse sets its own rate', () => {
    expect(isFrozen({ mode: 'playing', view: 'photo' })).toBe(true);
    expect(isFrozen({ mode: 'paused', view: 'observer' })).toBe(true);
    expect(isFrozen({ mode: 'loading', view: 'observer' })).toBe(true);
    expect(isFrozen({ mode: 'playing', view: 'possess' })).toBe(false);
    expect(allowedSpeeds(ctx({ view: 'photo' }))).toEqual([]);
    expect(refusalFor(1, ctx({ mode: 'paused' }))).toBe('frozen');
    expect(allowedSpeeds(ctx({ timelapse: true }))).toEqual([]);
  });

  it('possession start: 1x, or clamp to 4x with dropTo1xOnPossess off', () => {
    expect(speedOnPossess(8, true)).toBe(1);
    expect(speedOnPossess(8, false)).toBe(4);
    expect(speedOnPossess(2, false)).toBe(2);
  });

  it('speed up / down steps through pause and the levels', () => {
    expect(nextSpeed(0, 1)).toBe(1);
    expect(nextSpeed(4, 1)).toBe(8);
    expect(nextSpeed(8, 1)).toBe(8);
    expect(nextSpeed(1, -1)).toBe(0);
  });
});
