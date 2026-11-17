import { describe, expect, it } from 'vitest';
import { defaultBindings } from './bindings';
import { CLICK_MAX_MS, CLICK_SLOP_PX, PAD } from './defaults';
import { InputState } from './inputState';
import { rebind, setHoldToggle } from './rebind';
import type { PadSnapshot } from './types';

function make(ctx: 'P' | 'O' | 'C' | 'UI' = 'P'): { input: InputState; frame: (ms?: number) => void; t: () => number } {
  const input = new InputState();
  input.contexts.setBase(ctx);
  let now = 1000;
  input.update(now);
  return { input, frame: (ms = 16) => { now += ms; input.update(now); }, t: () => now };
}

function pad(over: Partial<{ buttons: Record<number, number>; axes: number[] }> = {}): PadSnapshot {
  const buttons = new Array<number>(17).fill(0);
  for (const [k, v] of Object.entries(over.buttons ?? {})) buttons[Number(k)] = v;
  return { index: 0, id: 'test pad', mapping: 'standard', buttons, axes: over.axes ?? [0, 0, 0, 0] };
}

describe('InputState: keys and edges', () => {
  it('reports pressed / held / released edges once', () => {
    const { input, frame } = make();
    input.keyDown('KeyF');
    frame();
    expect(input.pressed('dig')).toBe(true);
    expect(input.held('dig')).toBe(true);
    frame();
    expect(input.pressed('dig')).toBe(false);
    expect(input.held('dig')).toBe(true);
    input.keyUp('KeyF');
    frame();
    expect(input.released('dig')).toBe(true);
    expect(input.held('dig')).toBe(false);
  });

  it('a press and release inside one frame still counts', () => {
    const { input, frame } = make();
    input.keyDown('KeyE');
    input.keyUp('KeyE');
    frame();
    expect(input.pressed('interact')).toBe(true);
    expect(input.released('interact')).toBe(true);
    expect(input.tap('interact')).toBe(true);
  });

  it('ignores auto-repeat and Ctrl/Alt/Meta chords', () => {
    const { input, frame } = make();
    input.keyDown('KeyR');
    frame();
    expect(input.pressed('trail-toggle')).toBe(true);
    input.keyDown('KeyR', { repeat: true });
    frame();
    expect(input.pressed('trail-toggle')).toBe(false);
    expect(input.keyDown('KeyW', { ctrl: true })).toBe(false); // Ctrl+W belongs to the browser
    frame();
    expect(input.axis2('move').y).toBe(0);
  });

  it('respects contexts: the same key means different actions per view', () => {
    const { input, frame } = make('P');
    input.keyDown('KeyF');
    frame();
    expect(input.held('dig')).toBe(true);
    expect(input.held('follow-toggle')).toBe(false);
    input.contexts.setBase('O');
    frame();
    expect(input.released('dig')).toBe(true); // context switch releases cleanly
    expect(input.held('follow-toggle')).toBe(true);
    input.contexts.push('UI');
    frame();
    expect(input.held('follow-toggle')).toBe(false);
    expect(input.held('roster')).toBe(false);
  });

  it('Shift variants: Tab is next, Shift+Tab is previous, Shift alone is hurry', () => {
    const { input, frame } = make('P');
    input.keyDown('ShiftLeft', { shift: true });
    input.keyDown('Tab', { shift: true });
    frame();
    expect(input.pressed('possess-prev')).toBe(true);
    expect(input.pressed('possess-next')).toBe(false);
    expect(input.held('hurry')).toBe(true);
    input.keyDown('KeyW', { shift: true });
    frame();
    expect(input.axis2('move').y).toBe(1); // shifted W still moves
    input.keyUp('ShiftLeft');
    input.keyUp('Tab');
    input.keyDown('Tab');
    frame();
    expect(input.pressed('possess-next')).toBe(true);
  });

  it('keyDown reports whether the key is bound live (for preventDefault)', () => {
    const { input } = make('P');
    expect(input.keyDown('F5')).toBe(true);
    expect(input.keyDown('KeyU', { ctrl: true })).toBe(false); // never steal browser shortcuts
    expect(input.keyDown('IntlBackslash')).toBe(false);
  });
});

describe('InputState: tap / hold and hold-to-toggle', () => {
  it('splits tap and hold at the action threshold', () => {
    const { input, frame } = make();
    input.keyDown('Space');
    frame(100);
    input.keyUp('Space');
    frame(16);
    expect(input.tap('foot')).toBe(true);
    input.keyDown('Space');
    frame(16);
    frame(300); // > HOLD_THRESHOLD_MS
    expect(input.holdStart('foot')).toBe(true);
    expect(input.active('foot')).toBe(true);
    input.keyUp('Space');
    frame();
    expect(input.released('foot')).toBe(true);
    expect(input.tap('foot')).toBe(false);
  });

  it('toggle mode latches hold actions', () => {
    const { input, frame } = make();
    input.setBindings(setHoldToggle(defaultBindings(), 'hurry', 'toggle'));
    input.keyDown('ShiftLeft', { shift: true });
    frame();
    input.keyUp('ShiftLeft');
    frame();
    expect(input.active('hurry')).toBe(true);
    input.keyDown('ShiftLeft', { shift: true });
    frame();
    expect(input.active('hurry')).toBe(false);
  });

  it('pressedRepeat repeats while held', () => {
    const { input, frame } = make('C');
    input.keyDown('KeyR');
    frame();
    expect(input.pressedRepeat('cv-slice-up', 8)).toBe(true);
    let n = 0;
    for (let i = 0; i < 60; i++) { frame(16); if (input.pressedRepeat('cv-slice-up', 8)) n++; }
    expect(n).toBeGreaterThanOrEqual(6); // ~0.96 s at 8/s
    expect(n).toBeLessThanOrEqual(8);
  });
});

describe('InputState: mouse click vs drag', () => {
  it('an RMB press released quickly without moving is a click (special), no orbit', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 100, 100, t());
    input.mouseMove(102, 101, 2, 1);
    input.mouseUp(2, 102, 101, t() + 100);
    frame();
    expect(input.pressed('special')).toBe(true);
    expect(input.look('orbit')).toEqual({ x: 0, y: 0 });
  });

  it('moving past the slop makes it a drag that orbits and fires no click', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 100, 100, t());
    input.mouseMove(100 + CLICK_SLOP_PX + 4, 100, CLICK_SLOP_PX + 4, 0);
    frame();
    const look = input.look('orbit');
    expect(look.x).toBeCloseTo((CLICK_SLOP_PX + 4) * 0.25, 6); // orbitSensDrag 0.25 deg/px
    input.mouseUp(2, 110, 100, t() + 50);
    frame();
    expect(input.pressed('special')).toBe(false);
  });

  it('a slow release is not a click', () => {
    const { input, frame, t } = make('P');
    input.mouseDown(2, 50, 50, t());
    input.mouseUp(2, 50, 50, t() + CLICK_MAX_MS + 50);
    frame();
    expect(input.pressed('special')).toBe(false);
  });

  it('LMB hold and double-click possess in observer; single click selects', () => {
    const { input, frame, t } = make('O');
    input.mouseDown(0, 10, 10, t());
    input.mouseUp(0, 10, 10, t() + 50);
    frame();
    expect(input.pressed('select')).toBe(true);
    expect(input.pressed('possess-target')).toBe(false);
    input.mouseDown(0, 10, 10, t());
    input.mouseUp(0, 10, 10, t() + 60);
    frame();
    expect(input.pressed('possess-target')).toBe(true); // double click
    input.mouseDown(0, 10, 10, t());
    frame(200);
    expect(input.pressed('possess-target')).toBe(false);
    frame(250);
    expect(input.pressed('possess-target')).toBe(true); // hold 400 ms
  });

  it('wheel zooms in log steps; deltaMode lines are converted', () => {
    const { input, frame } = make('P');
    input.wheel(-100, 0, false);
    frame();
    expect(input.zoom('zoom')).toBeCloseTo(-Math.log(1.12), 6);
    input.wheel(3, 1, false); // 3 lines = 48 px = 0.48 notch
    frame();
    expect(input.zoom('zoom')).toBeCloseTo(0.48 * Math.log(1.12), 6);
  });

  it('Shift+wheel slices in colony view instead of zooming', () => {
    const { input, frame } = make('C');
    input.keyDown('ShiftLeft', { shift: true });
    input.wheel(100, 0, true);
    frame();
    expect(input.pressed('cv-slice-down')).toBe(true);
    expect(input.zoom('cv-zoom')).toBe(0);
  });
});

describe('InputState: focus loss and text fields', () => {
  it('focus loss releases every held input and emits an event', () => {
    const { input, frame, t } = make('P');
    input.keyDown('KeyW');
    input.keyDown('KeyF');
    input.mouseDown(2, 0, 0, t());
    frame();
    expect(input.held('dig')).toBe(true);
    input.focusLost();
    frame();
    expect(input.released('dig')).toBe(true);
    expect(input.held('dig')).toBe(false);
    expect(input.axis2('move')).toEqual({ x: 0, y: 0 });
    expect(input.drainEvents().some((e) => e.type === 'focus-lost')).toBe(true);
    // the key-up arriving after focus returns must not produce a phantom edge
    input.keyUp('KeyW');
    frame();
    expect(input.released('dig')).toBe(false);
  });

  it('a focused text field suspends all bindings', () => {
    const { input, frame } = make('P');
    input.setSuspended(true);
    expect(input.keyDown('KeyF')).toBe(false);
    frame();
    expect(input.held('dig')).toBe(false);
    input.setSuspended(false);
    input.keyDown('KeyF');
    frame();
    expect(input.held('dig')).toBe(true);
  });
});

describe('InputState: gamepad', () => {
  it('stick dead zone, simultaneous keyboard and pad, modifier combos', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ axes: [0.1, -0.1, 0, 0] })]); // inside the 0.15 dead zone
    frame();
    expect(input.axis2('move')).toEqual({ x: 0, y: 0 });
    input.setPads([pad({ axes: [0, -1, 0, 0] })]);
    input.keyDown('KeyD');
    frame();
    const m = input.axis2('move');
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1, 6); // clamped to unit length
    expect(m.x).toBeGreaterThan(0.5);
    expect(m.y).toBeGreaterThan(0.5);
    // LB + Dpad up = pause, not trail toggle
    input.setPads([pad({ buttons: { [PAD.LB]: 1 } })]);
    frame();
    input.setPads([pad({ buttons: { [PAD.LB]: 1, [PAD.DUP]: 1 } })]);
    frame();
    expect(input.pressed('pause-toggle')).toBe(true);
    expect(input.pressed('trail-toggle')).toBe(false);
    // LB was used as a modifier: releasing it is not a possess-prev tap
    input.setPads([pad()]);
    frame();
    expect(input.pressed('possess-prev')).toBe(false);
    // a quick LB tap alone is possess-prev
    input.setPads([pad({ buttons: { [PAD.LB]: 1 } })]);
    frame(50);
    input.setPads([pad()]);
    frame(50);
    expect(input.pressed('possess-prev')).toBe(true);
  });

  it('a View press of one frame is a tap (release) even when the frame lasts longer than the hold threshold (loaded machine)', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ buttons: { [PAD.VIEW]: 1 } })]);
    frame(16);
    input.setPads([pad()]);
    frame(3000); // the next frame came 3 s later
    expect(input.pressed('release')).toBe(true);
    expect(input.pressed('colony-view')).toBe(false); // and it is not the 500 ms hold of the colony view
    // a press seen in three frames and held for over 500 ms is still a hold, not a tap
    input.setPads([pad({ buttons: { [PAD.VIEW]: 1 } })]);
    frame(16);
    frame(300);
    frame(300);
    input.setPads([pad()]);
    frame(16);
    expect(input.pressed('release')).toBe(false);
  });

  it('LB tap still fires with right-stick drift inside the dead zone; LB + stick in one frame is a modifier use', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ buttons: { [PAD.LB]: 1 }, axes: [0, 0, 0, 0.1] })]); // drift below STICK_DEADZONE
    frame(50);
    input.setPads([pad()]);
    frame(50);
    expect(input.pressed('possess-prev')).toBe(true);
    input.setPads([pad({ buttons: { [PAD.LB]: 1 }, axes: [0, 0, 0, -0.9] })]); // press and zoom in the same frame
    frame(50);
    input.setPads([pad()]);
    frame(50);
    expect(input.pressed('possess-prev')).toBe(false);
  });

  it('hot-plug: connect, player pad, disconnect events and active device', () => {
    const { input, frame } = make('P');
    input.drainEvents();
    input.setPads([pad()]);
    frame();
    expect(input.drainEvents().some((e) => e.type === 'pad-connected')).toBe(true);
    input.setPads([pad({ buttons: { [PAD.A]: 1 } })]);
    frame(600);
    expect(input.activeDevice).toBe('pad');
    input.setPads([null]);
    frame();
    const ev = input.drainEvents();
    expect(ev).toContainEqual({ type: 'pad-disconnected', index: 0, wasActiveDevice: true });
  });

  it('device switching has hysteresis', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ buttons: { [PAD.A]: 1 } })]);
    frame();
    expect(input.activeDevice).toBe('pad');
    input.setPads([pad()]);
    input.keyDown('KeyW');
    frame(100);
    expect(input.activeDevice).toBe('pad'); // within 0.5 s of the last switch
    input.keyUp('KeyW');
    input.keyDown('KeyW');
    frame(500);
    expect(input.activeDevice).toBe('kbm');
  });

  it('after focus loss a still-held pad button does not re-press until released', () => {
    const { input, frame } = make('P');
    input.setPads([pad({ buttons: { [PAD.X]: 1 } })]);
    frame();
    expect(input.held('dig')).toBe(true);
    input.focusLost();
    input.setPads([pad({ buttons: { [PAD.X]: 1 } })]);
    frame();
    expect(input.held('dig')).toBe(false);
    input.setPads([pad()]);
    frame();
    input.setPads([pad({ buttons: { [PAD.X]: 1 } })]);
    frame();
    expect(input.held('dig')).toBe(true);
  });
});

describe('InputState: rebinding takes effect', () => {
  it('uses the new key after rebind', () => {
    const { input, frame } = make('P');
    const r = rebind(defaultBindings(), 'dig', 0, { kind: 'key', code: 'IntlBackslash' });
    if (r.status !== 'applied') throw new Error('rebind failed');
    input.setBindings(r.bindings);
    input.keyDown('KeyF');
    frame();
    expect(input.held('dig')).toBe(false);
    input.keyDown('IntlBackslash');
    frame();
    expect(input.held('dig')).toBe(true);
  });
});
