import { describe, expect, it } from 'vitest';
import { ACTIONS, AXES, actionDef, axisComponents } from './actions';
import { bindingLabel, bindingsOf, defaultBindings, parseBindings, serializeBindings } from './bindings';
import { contextsOverlap, ContextStack, liveContexts } from './contexts';
import { allConflicts, checkBinding, findConflicts, rebind, resetAll, resetContext, unboundRequired } from './rebind';

describe('action table', () => {
  it('has unique ids and at most 2 KBM defaults per action', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACTIONS) expect(a.kbm.length).toBeLessThanOrEqual(2);
  });

  it('contains every action id of GDD 01 section 5', () => {
    const gdd = [
      'menu', 'pause-toggle', 'speed-1', 'speed-2', 'speed-4', 'speed-8', 'speed-up', 'speed-down', 'hide-hud', 'quick-save', 'quick-load',
      'colony-view', 'scent-view', 'photo-mode', 'overlay-cycle', 'directives', 'nest-overview', 'codex', 'journal', 'why-view', 'roster', 'controls-reminder', 'alert-jump', 'skip-ahead',
      'pointer-lock-toggle', 'possess-next', 'possess-prev', 'possess-last', 'possess-forager', 'possess-digger', 'possess-nurse', 'possess-queen',
      'hurry', 'recentre', 'interact', 'cycle-target', 'dig', 'inspect', 'bite', 'special', 'trail-toggle', 'share-food', 'foot', 'release',
      'obs-up', 'obs-down', 'obs-fast', 'select', 'possess-target', 'follow-toggle', 'deselect',
      'cv-slice-up', 'cv-slice-down', 'cv-cutaway-mode', 'cv-confirm', 'cv-cancel', 'cv-delete',
      'ph-up', 'ph-down', 'ph-focus', 'ph-guides', 'ph-capture', 'tl-skip', 'tl-dropout',
    ];
    for (const id of gdd) expect(actionDef(id), id).toBeDefined();
    for (const ax of ['move', 'orbit', 'zoom', 'obs-move', 'obs-look', 'obs-pan', 'obs-zoom', 'cv-pan', 'cv-rotate', 'cv-zoom', 'ph-move', 'ph-look', 'ph-focal']) {
      expect(AXES.some((a) => a.id === ax), ax).toBe(true);
      expect(axisComponents(ax).length, ax).toBeGreaterThan(0);
    }
  });

  it('default bindings have no conflicts within overlapping contexts', () => {
    expect(allConflicts(defaultBindings())).toEqual([]);
  });

  it('labels bindings readably', () => {
    expect(bindingLabel({ kind: 'key', code: 'KeyW' })).toBe('W');
    expect(bindingLabel({ kind: 'key', code: 'Tab', shift: true })).toBe('Shift+Tab');
    expect(bindingLabel({ kind: 'mouse', button: 2, gesture: 'click' })).toBe('RMB click');
    expect(bindingLabel({ kind: 'pad', button: 12, mod: 4 })).toBe('LB+Dpad up');
  });
});

describe('contexts', () => {
  it('G is live over play views only', () => {
    expect(liveContexts('P')).toEqual(['G', 'P']);
    expect(liveContexts('UI')).toEqual(['UI']);
    expect(contextsOverlap('G', 'C')).toBe(true);
    expect(contextsOverlap('G', 'Ph')).toBe(false);
    expect(contextsOverlap('P', 'C')).toBe(false);
  });

  it('stack push/pop changes the live set', () => {
    const s = new ContextStack();
    expect(s.live()).toEqual([]);
    s.setBase('O');
    s.push('UI');
    expect(s.live()).toEqual(['UI']);
    expect(s.pop('P')).toBeUndefined();
    expect(s.pop('UI')).toBe('UI');
    expect(s.isLive(['G'])).toBe(true);
  });
});

describe('serialisation', () => {
  it('round-trips through JSON', () => {
    const b = defaultBindings();
    const { bindings, warnings } = parseBindings(serializeBindings(b));
    expect(warnings).toEqual([]);
    expect(bindings).toEqual(b);
  });

  it('survives garbage and keeps locked actions', () => {
    expect(parseBindings('{not json').bindings).toEqual(defaultBindings());
    const tampered = defaultBindings();
    tampered.kbm.menu = [{ kind: 'key', code: 'KeyQ' }, null];
    (tampered.kbm as Record<string, unknown>)['no-such-action'] = [];
    (tampered.kbm.dig as unknown[])[0] = { kind: 'banana' };
    const { bindings, warnings } = parseBindings(JSON.stringify(tampered));
    expect(bindings.kbm.menu[0]).toEqual({ kind: 'key', code: 'Escape' });
    expect(bindings.kbm.dig[0]).toEqual({ kind: 'key', code: 'KeyF' });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('bindingsOf includes fixed gestures', () => {
    const all = bindingsOf(defaultBindings(), 'possess-target');
    expect(all.some((b) => b.kind === 'mouse' && b.gesture === 'dbl')).toBe(true);
  });
});

describe('rebinding', () => {
  it('detects a conflict only in overlapping contexts', () => {
    const b = defaultBindings();
    // F is dig (P), follow-toggle (O) and cv-slice-down (C): rebinding interact (P) to F conflicts with dig only
    const c = findConflicts(b, 'interact', { kind: 'key', code: 'KeyF' });
    expect(c).toEqual([{ actionId: 'dig', slot: 0 }]);
    // a global action conflicts with play-view actions
    const g = findConflicts(b, 'roster', { kind: 'key', code: 'KeyF' });
    expect(g.map((x) => x.actionId).sort()).toEqual(['cv-slice-down', 'dig', 'follow-toggle']);
  });

  it('never applies a conflicting binding silently', () => {
    const b = defaultBindings();
    const r = rebind(b, 'interact', 0, { kind: 'key', code: 'KeyF' });
    expect(r.status).toBe('conflict');
    expect(rebind(b, 'interact', 0, { kind: 'key', code: 'KeyF' }, 'cancel').status).toBe('cancelled');
  });

  it('swap gives the other action the old key', () => {
    const b = defaultBindings();
    const r = rebind(b, 'interact', 0, { kind: 'key', code: 'KeyF' }, 'swap');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.bindings.kbm.interact[0]).toEqual({ kind: 'key', code: 'KeyF' });
    expect(r.bindings.kbm.dig[0]).toEqual({ kind: 'key', code: 'KeyE' });
    expect(b.kbm.interact[0]).toEqual({ kind: 'key', code: 'KeyE' }); // input untouched
    expect(allConflicts(r.bindings)).toEqual([]);
  });

  it('unbind-other clears the other slot, and required actions are reported', () => {
    const r = rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'KeyE' }, 'unbind-other');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.bindings.kbm.interact[0]).toBeNull();
    expect(unboundRequired(r.bindings)).toContain('interact');
  });

  it('refuses reserved keys, Ctrl/Alt and the locked menu action', () => {
    expect(checkBinding('dig', 0, { kind: 'key', code: 'Escape' })).toEqual({ ok: false, reason: 'reserved' });
    expect(checkBinding('dig', 0, { kind: 'key', code: 'F12' })).toEqual({ ok: false, reason: 'reserved' });
    expect(checkBinding('dig', 0, { kind: 'key', code: 'ControlLeft' })).toEqual({ ok: false, reason: 'reserved' });
    expect(rebind(defaultBindings(), 'menu', 0, { kind: 'key', code: 'KeyQ' })).toEqual({ status: 'refused', reason: 'locked' });
    expect(checkBinding('dig', 'pad', { kind: 'key', code: 'KeyQ' })).toEqual({ ok: false, reason: 'wrong-kind' });
    expect(checkBinding('orbit.drag', 0, { kind: 'key', code: 'KeyQ' })).toEqual({ ok: false, reason: 'wrong-kind' });
  });

  it('reports required actions without a pad binding, and refuses to take inputs from the locked menu', () => {
    const cleared = rebind(defaultBindings(), 'release', 'pad', null);
    if (cleared.status !== 'applied') throw new Error('expected applied');
    expect(unboundRequired(cleared.bindings)).toEqual(['release']);
    const noStick = rebind(defaultBindings(), 'move.stick', 'pad', null);
    if (noStick.status !== 'applied') throw new Error('expected applied');
    expect(unboundRequired(noStick.bindings)).toEqual(['move.stick']);
    for (const res of [undefined, 'swap', 'unbind-other'] as const) {
      expect(rebind(defaultBindings(), 'dig', 'pad', { kind: 'pad', button: 9, gesture: 'tap' }, res)).toEqual({ status: 'refused', reason: 'reserved' });
    }
  });

  it('a stored set that gives the menu input to another action loses that slot on load', () => {
    const d = defaultBindings();
    d.pad['pause-toggle'] = { kind: 'pad', button: 9, gesture: 'tap', holdMs: 1000 };
    const { bindings, warnings } = parseBindings(serializeBindings(d));
    expect(bindings.pad['pause-toggle']).toBeNull();
    expect(bindings.pad.menu).toEqual(defaultBindings().pad.menu);
    expect(warnings.some((w) => w.includes('reserved'))).toBe(true);
  });

  it('allows the same key in mutually exclusive contexts', () => {
    expect(rebind(defaultBindings(), 'cv-delete', 0, { kind: 'key', code: 'KeyB' }).status).toBe('applied'); // B is P-only
  });

  it('resets per context and all', () => {
    const r = rebind(defaultBindings(), 'cv-delete', 0, { kind: 'key', code: 'KeyB' });
    if (r.status !== 'applied') throw new Error('expected applied');
    const p = rebind(r.bindings, 'cycle-target', 0, { kind: 'key', code: 'KeyN' });
    if (p.status !== 'applied') throw new Error('expected applied');
    const back = resetContext(p.bindings, 'C');
    expect(back.kbm['cv-delete'][0]).toEqual({ kind: 'key', code: 'Delete' });
    expect(back.kbm['cycle-target'][0]).toEqual({ kind: 'key', code: 'KeyN' }); // P untouched
    expect(resetAll()).toEqual(defaultBindings());
  });
});
