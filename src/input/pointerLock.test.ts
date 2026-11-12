import { describe, expect, it } from 'vitest';
import { POINTER_LOCK_RETRY_MS } from './defaults';
import { InputState } from './inputState';
import { PointerLockPolicy } from './pointerLock';

describe('PointerLockPolicy', () => {
  it('only requests from a canvas click when the preference is locked', () => {
    const p = new PointerLockPolicy();
    expect(p.onCanvasClick(0)).toBe(false);
    p.setPreference('locked');
    expect(p.onCanvasClick(0)).toBe(true);
    expect(p.onCanvasClick(1)).toBe(false); // request pending
  });

  it('refusal keeps drag, waits before retrying, flags the first refusal once', () => {
    const p = new PointerLockPolicy();
    p.setPreference('locked');
    p.onCanvasClick(0);
    p.onError(0);
    expect(p.effectiveMode()).toBe('drag');
    expect(p.preference).toBe('locked'); // stored preference unchanged
    expect(p.onCanvasClick(1000)).toBe(false);
    expect(p.onCanvasClick(POINTER_LOCK_RETRY_MS + 1)).toBe(true);
    p.onError(POINTER_LOCK_RETRY_MS + 2);
    expect(p.notices).toEqual([{ kind: 'refused', first: true }, { kind: 'refused', first: false }]);
  });

  it('unexpected loss swallows the first Esc only', () => {
    const p = new PointerLockPolicy();
    p.setPreference('locked');
    p.onCanvasClick(0);
    p.onLockChange(true, 10);
    expect(p.effectiveMode()).toBe('locked');
    p.onLockChange(false, 1000); // browser Esc
    expect(p.notices.at(-1)).toEqual({ kind: 'lost' });
    expect(p.effectiveMode()).toBe('drag');
    expect(p.consumeEsc(1010)).toBe(true);
    expect(p.consumeEsc(1100)).toBe(false); // second Esc opens the menu
    expect(p.onCanvasClick(1200)).toBe(true); // next canvas click re-locks
  });

  it('an intended release is not a loss', () => {
    const p = new PointerLockPolicy();
    p.setPreference('locked');
    p.onCanvasClick(0);
    p.onLockChange(true, 0);
    p.setPreference('drag');
    expect(p.takeReleaseRequest()).toBe(true);
    p.onLockChange(false, 5);
    expect(p.notices.at(-1)).toEqual({ kind: 'unlocked' });
    expect(p.consumeEsc(6)).toBe(false);
  });

  it('InputState surfaces refusals as events and keeps drag orbit working', () => {
    const input = new InputState();
    input.contexts.setBase('P');
    input.pointer.setPreference('locked');
    input.pointer.onCanvasClick(0);
    input.pointer.onError(0);
    input.update(16);
    expect(input.drainEvents()).toContainEqual({ type: 'pointer-lock', state: 'refused' });
    input.mouseDown(2, 0, 0, 20);
    input.mouseMove(40, 0, 40, 0);
    input.update(32);
    expect(input.look('orbit').x).toBeCloseTo(10, 6);
  });

  it('locked mode: mouse motion orbits and RMB is an immediate special', () => {
    const input = new InputState();
    input.contexts.setBase('P');
    input.pointer.setPreference('locked');
    input.pointer.onCanvasClick(0);
    input.pointer.onLockChange(true, 0);
    input.update(16);
    input.mouseMove(0, 0, 100, -20);
    input.mouseDown(2, 0, 0, 20);
    input.update(32);
    const l = input.look('orbit');
    expect(l.x).toBeCloseTo(15, 6); // 0.15 deg/px
    expect(l.y).toBeCloseTo(3, 6);
    expect(input.pressed('special')).toBe(true);
  });
});
