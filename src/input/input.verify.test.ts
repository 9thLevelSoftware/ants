// Adversarial review tests for src/input (F3a review). Tests that fail here document real defects.
import { describe, expect, it } from 'vitest';
import { ACTIONS, actionDef } from './actions';
import { defaultBindings, parseBindings, serializeBindings } from './bindings';
import { CLICK_MAX_MS, CLICK_SLOP_PX, PAD } from './defaults';
import { InputState } from './inputState';
import { allConflicts, rebind, resetContext, unboundRequired } from './rebind';
import type { Binding, PadSnapshot } from './types';

function make(ctx: 'P' | 'O' | 'C' | 'UI' = 'P') {
  const input = new InputState();
  input.contexts.setBase(ctx);
  let now = 1000;
  input.update(now);
  return { input, frame: (ms = 16) => { now += ms; input.update(now); }, t: () => now };
}

function pad(buttons: Record<number, number> = {}, axes = [0, 0, 0, 0]): PadSnapshot {
  const b = new Array<number>(17).fill(0);
  for (const [k, v] of Object.entries(buttons)) b[Number(k)] = v;
  return { index: 0, id: 'pad', mapping: 'standard', buttons: b, axes };
}

const kbmCodes = (id: string) => (defaultBindings().kbm[id] ?? []).filter((b): b is Extract<Binding, { kind: 'key' }> => !!b && b.kind === 'key').map((b) => (b.shift ? 'Shift+' : '') + b.code);

describe('default bindings vs GDD 01 section 5.1 (verify)', () => {
  // GDD 01 5.1 lists these global action ids; the task asks for "every action id from GDD 01 section 5".
  it('defines every 5.1 global action id', () => {
    const missing = ['overlay-cycle', 'directives', 'nest-overview', 'codex', 'journal', 'why-view', 'roster'].filter((id) => !actionDef(id));
    expect(missing).toEqual([]);
  });

  it('uses the GDD default keys for photo mode (F2) and pointer-lock toggle (F8)', () => {
    expect(kbmCodes('photo-mode')).toContain('F2');
    expect(kbmCodes('pointer-lock-toggle')).toContain('F8');
  });

  it('default tables have no conflicts and no unbound required action', () => {
    const d = defaultBindings();
    expect(allConflicts(d)).toEqual([]);
    expect(unboundRequired(d)).toEqual([]);
  });

  it('every action has at most 2 KBM bindings and pad bindings only in the pad slot', () => {
    for (const a of ACTIONS) {
      expect(a.kbm.length, a.id).toBeLessThanOrEqual(2);
      for (const b of a.kbm) expect(['key', 'mouse', 'drag', 'wheel'], a.id).toContain(b.kind);
      if (a.pad) expect(['pad', 'padAxis', 'padStick'], a.id).toContain(a.pad.kind);
    }
  });
});

describe('rebinding (verify)', () => {
  // BUG: `menu` is locked (never rebindable), but 'unbind-other' / 'swap' freely rewrite the locked action's slot
  // when another action takes its gamepad input (Start tap).
  it('never changes the locked menu action through conflict resolution', () => {
    const startTap: Binding = { kind: 'pad', button: PAD.START, gesture: 'tap', holdMs: 1000 };
    const r = rebind(defaultBindings(), 'pause-toggle', 'pad', startTap, 'unbind-other');
    if (r.status === 'applied') expect(r.bindings.pad['menu']).toEqual(defaultBindings().pad['menu']);
    else expect(['refused', 'conflict']).toContain(r.status);
  });

  it('round-trips through JSON and survives garbage', () => {
    const d = defaultBindings();
    expect(parseBindings(serializeBindings(d)).bindings).toEqual(d);
    for (const junk of ['', 'null', '[]', '{"kbm":5}', '{"kbm":{"move.up":[{"kind":"key"}]}}', '{"version":1,"pad":{"dig":{"kind":"pad","button":"x"}}}']) {
      const { bindings } = parseBindings(junk);
      expect(unboundRequired(bindings), junk).toEqual([]);
    }
  });

  it('a swap gives the other action this slot\'s previous key and reset restores defaults', () => {
    const d = defaultBindings();
    const r = rebind(d, 'dig', 0, { kind: 'key', code: 'KeyE' }, 'swap');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(r.bindings.kbm['dig'][0]).toEqual({ kind: 'key', code: 'KeyE' });
    expect(r.bindings.kbm['interact'][0]).toEqual({ kind: 'key', code: 'KeyF' });
    expect(d.kbm['dig'][0]).toEqual({ kind: 'key', code: 'KeyF' }); // input not mutated
    expect(resetContext(r.bindings, 'P').kbm['interact']).toEqual(d.kbm['interact']);
  });

  it('same key in P and C is allowed (F = dig and cv-slice-down)', () => {
    expect(rebind(defaultBindings(), 'dig', 1, { kind: 'key', code: 'KeyR' }).status).toBe('conflict'); // R = trail in P
    expect(rebind(defaultBindings(), 'cv-delete', 1, { kind: 'key', code: 'KeyT' }).status).toBe('applied'); // T only in P
  });

  it('refuses reserved keys and Shift as a modifier of Shift', () => {
    expect(rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'Escape' })).toEqual({ status: 'refused', reason: 'reserved' });
    expect(rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'ControlLeft' })).toEqual({ status: 'refused', reason: 'reserved' });
    expect(rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'ShiftLeft', shift: true })).toEqual({ status: 'refused', reason: 'modifier' });
  });
});

describe('mouse click vs drag (verify)', () => {
  it('an RMB drag past the slop orbits and never fires special', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 100, 100, t());
    input.mouseMove(100 + CLICK_SLOP_PX, 100, CLICK_SLOP_PX, 0);
    frame();
    const look = input.look('orbit');
    input.mouseUp(2, 100 + CLICK_SLOP_PX, 100, t());
    frame();
    expect(look.x).not.toBe(0);
    expect(input.pressed('special')).toBe(false);
  });

  it('an RMB press held longer than CLICK_MAX_MS is not a click', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 100, 100, t());
    frame(CLICK_MAX_MS + 1);
    input.mouseUp(2, 100, 100, t());
    frame();
    expect(input.pressed('special')).toBe(false);
  });

  it('a quick RMB press inside the slop is a click (special) and does not orbit', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 100, 100, t());
    input.mouseMove(103, 102, 3, 2);
    frame(50);
    expect(input.look('orbit').x).toBe(0);
    input.mouseUp(2, 103, 102, t());
    frame();
    expect(input.pressed('special')).toBe(true);
  });

  it('wheel deltaMode lines/pages convert to pixels (x16 / x400) for zoom', () => {
    const { input, frame } = make('P');
    input.wheel(100, 0, false);
    frame();
    const px = input.zoom('zoom');
    input.wheel(100 / 16, 1, false);
    frame();
    expect(input.zoom('zoom')).toBeCloseTo(px, 9);
    input.wheel(100 / 400, 2, false);
    frame();
    expect(input.zoom('zoom')).toBeCloseTo(px, 9);
    expect(px).toBeGreaterThan(0); // scroll down = farther
  });
});

describe('focus loss, suspension and devices (verify)', () => {
  it('focus loss releases keys, mouse drags and pad buttons and does not re-fire held pad buttons afterwards', () => {
    const { input, frame } = make('P');
    input.keyDown('KeyW');
    input.setPads([pad({ [PAD.X]: 1 })]);
    frame();
    expect(input.held('dig')).toBe(true);
    expect(input.axis2('move').y).toBe(1);
    input.focusLost();
    frame();
    expect(input.released('dig')).toBe(true);
    expect(input.axis2('move').y).toBe(0);
    input.setPads([pad({ [PAD.X]: 1 })]); // still physically held when focus returns
    frame();
    expect(input.pressed('dig')).toBe(false);
    expect(input.drainEvents().some((e) => e.type === 'focus-lost')).toBe(true);
  });

  it('a focused text field suspends every binding and returns nothing as bound', () => {
    const { input, frame } = make('P');
    input.setSuspended(true);
    expect(input.keyDown('KeyF')).toBe(false);
    frame();
    expect(input.pressed('dig')).toBe(false);
    input.setSuspended(false);
    input.keyUp('KeyF');
    frame();
    expect(input.held('dig')).toBe(false);
  });

  it('keyboard and gamepad move at the same time add up (clamped to length 1)', () => {
    const { input, frame } = make('P');
    input.keyDown('KeyD');
    input.setPads([pad({}, [0, -1, 0, 0])]);
    frame();
    const m = input.axis2('move');
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1, 9);
    expect(m.x).toBeGreaterThan(0);
    expect(m.y).toBeGreaterThan(0);
  });

  it('Shift+Tab is possess-prev only, Tab is possess-next only', () => {
    const { input, frame } = make('P');
    input.keyDown('ShiftLeft', { shift: true });
    input.keyDown('Tab', { shift: true });
    frame();
    expect(input.pressed('possess-prev')).toBe(true);
    expect(input.pressed('possess-next')).toBe(false);
  });

  // GDD 01 5.1: LB tap = possess-prev; LB + RS vertical = zoom. Using LB as the zoom modifier must not also cycle
  // the ant on release (the tap fires only when the button did not serve as a modifier).
  it('LB used as the zoom modifier does not fire the LB tap (possess-prev)', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ [PAD.LB]: 1 })]);
    frame(16);
    input.setPads([pad({ [PAD.LB]: 1 }, [0, 0, 0, -1])]);
    frame(100);
    expect(input.zoom('zoom')).toBeLessThan(0);
    input.setPads([pad({}, [0, 0, 0, 0])]);
    frame(16);
    expect(input.pressed('possess-prev')).toBe(false);
  });
});
