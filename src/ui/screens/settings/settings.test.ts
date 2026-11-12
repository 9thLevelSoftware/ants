import { describe, expect, it } from 'vitest';
import { ACTIONS, defaultBindings, findConflicts, rebind, unboundRequired, type Binding } from '@/input';
import { actionDef } from '@/input';
import { groupActions } from './bindingGroups';
import { actionLabel, captureKey, captureMouse, captureWheel, conflictMessage, REFUSAL_TEXT } from './captureBinding';
import { effectiveGraphics } from './graphicsModel';

const key = (code: string, over: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...over });

describe('capturing a binding (GDD 08 7.5)', () => {
  it('a plain key becomes a key binding, Shift+key a shifted one', () => {
    expect(captureKey(key('KeyD'))).toEqual({ kind: 'binding', binding: { kind: 'key', code: 'KeyD' } });
    expect(captureKey(key('KeyD', { shiftKey: true }))).toEqual({ kind: 'binding', binding: { kind: 'key', code: 'KeyD', shift: true } });
  });
  it('Shift alone waits for its key-up so Shift can be bound as a key', () => {
    expect(captureKey(key('ShiftLeft', { shiftKey: true }))).toEqual({ kind: 'pending', code: 'ShiftLeft' });
  });
  it('Esc is ignored (it cancels listening) and Ctrl / Alt / Meta are refused', () => {
    expect(captureKey(key('Escape'))).toEqual({ kind: 'ignore' });
    expect(captureKey(key('ControlLeft', { ctrlKey: true })).kind).toBe('refused');
    expect(captureKey(key('KeyW', { ctrlKey: true })).kind).toBe('refused');
    expect(captureKey(key('AltRight')).kind).toBe('refused');
  });
  it('mouse buttons, drags and wheel notches map to their binding kinds', () => {
    expect(captureMouse('bite', 0)).toEqual({ kind: 'mouse', button: 0 });
    expect(captureMouse('orbit.drag', 2)).toEqual({ kind: 'drag', button: 2 });
    expect(captureWheel(-120, false)).toEqual({ kind: 'wheel', dir: -1 });
    expect(captureWheel(120, true)).toEqual({ kind: 'wheel', dir: 1, shift: true });
  });
});

describe('rebinding conflicts as the screen presents them (Appendix E check 21)', () => {
  const D: Binding = { kind: 'key', code: 'KeyD' };

  it('binding Dig to D conflicts with Move right and the message names it', () => {
    const set = defaultBindings();
    const r = rebind(set, 'dig', 0, D);
    expect(r.status).toBe('conflict');
    if (r.status !== 'conflict') return;
    expect(actionLabel(actionDef('move.right')!)).toBe('Move right');
    expect(conflictMessage(D, r.conflicts)).toBe('D is already Move right (Possession).');
    // nothing changed until the player chooses
    expect(set.kbm['dig'][0]).toEqual({ kind: 'key', code: 'KeyF' });
  });

  it('Swap gives Dig the D key and Move right the F key', () => {
    const r = rebind(defaultBindings(), 'dig', 0, D, 'swap');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.bindings.kbm['dig'][0]).toEqual(D);
    expect(r.bindings.kbm['move.right'][0]).toEqual({ kind: 'key', code: 'KeyF' });
    expect(findConflicts(r.bindings, 'dig', D)).toEqual([]);
  });

  it('Unbind other clears the action that had the key; Cancel changes nothing', () => {
    const u = rebind(defaultBindings(), 'dig', 0, D, 'unbind-other');
    expect(u.status).toBe('applied');
    if (u.status === 'applied') { expect(u.bindings.kbm['dig'][0]).toEqual(D); expect(u.bindings.kbm['move.right'][0]).toBeNull(); }
    expect(rebind(defaultBindings(), 'dig', 0, D, 'cancel').status).toBe('cancelled');
  });

  it('refuses reserved keys and explains it', () => {
    const r = rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'Escape' });
    expect(r).toEqual({ status: 'refused', reason: 'reserved' });
    expect(REFUSAL_TEXT.reserved).toContain('Esc');
    expect(rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'F12' }).status).toBe('refused');
  });

  it('the same key in different layers is allowed (F is Dig in Possession and Follow in Observer)', () => {
    const r = rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'KeyF' });
    expect(r.status).toBe('applied');
  });

  it('refuses to close with a required action unbound', () => {
    const set = defaultBindings();
    expect(unboundRequired(set)).toEqual([]);
    const r = rebind(set, 'interact', 0, null);
    expect(r.status).toBe('applied');
    if (r.status === 'applied') expect(unboundRequired(r.bindings)).toContain('interact');
  });
});

describe('the binding table groups', () => {
  it('puts every action in exactly one group, in the display order', () => {
    const groups = groupActions();
    expect(groups.map((g) => g.id)).toEqual(['G', 'P', 'O', 'C', 'Ph', 'TL', 'UI']);
    const all = groups.flatMap((g) => g.actions.map((a) => a.id));
    expect(all.length).toBe(ACTIONS.length);
    expect(new Set(all).size).toBe(ACTIONS.length);
    expect(groups[0].actions.some((a) => a.id === 'menu')).toBe(true);
  });
});

describe('graphics controls show the values in effect', () => {
  it('uses the preset when there is no override and the override when there is', () => {
    const base = effectiveGraphics('medium', {});
    expect(base.resolutionScale).toBeGreaterThan(0.5);
    expect(base.resolutionScale).toBeLessThanOrEqual(1);
    expect(effectiveGraphics('medium', { resolutionScale: 0.6 }).resolutionScale).toBe(0.6);
    expect(effectiveGraphics('medium', { depthOfField: 'off', shadows: 'off', haze: false }).shadows).toBe('off');
    expect([30, 60]).toContain(base.targetFps);
    expect(effectiveGraphics('auto', {}).density).toBeLessThanOrEqual(1);
  });
});
