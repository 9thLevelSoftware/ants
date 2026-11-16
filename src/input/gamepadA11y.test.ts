// Gamepad play and accessibility of the input layer (task input-gamepad-a11y): glyphs and axis hints, pad capture,
// the default pad bindings of the books and panels, dismiss-hint, hold duration scaling, orbit by toggle.
import { describe, expect, it } from 'vitest';
import { ACTIONS, actionDef } from './actions';
import { defaultBindings } from './bindings';
import { HOLD_MS_DEFAULT, PAD } from './defaults';
import { hintText, padBindingGlyph, padStyleOf } from './glyphs';
import { InputState } from './inputState';
import { PadCapture } from './padCapture';
import { readGamepads } from './padSource';
import { allConflicts } from './rebind';
import type { PadSnapshot } from './types';

function pad(buttons: number[] = [], axes: number[] = [0, 0, 0, 0], id = 'pad (standard)'): PadSnapshot {
  const b = new Array<number>(17).fill(0);
  for (const i of buttons) b[i] = 1;
  return { index: 0, id, mapping: 'standard', buttons: b, axes };
}

function make(ctx: 'P' | 'O' | 'C' | 'UI' = 'P') {
  const input = new InputState();
  input.contexts.setBase(ctx);
  let now = 1000;
  input.update(now);
  return {
    input,
    frame: (p: PadSnapshot | null, ms = 16) => { input.setPads(p ? [p] : []); now += ms; input.update(now); },
  };
}

describe('glyphs', () => {
  it('prints Xbox letters, or PlayStation shapes when the pad id carries Sony\'s vendor id', () => {
    expect(padStyleOf('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe('xbox');
    expect(padStyleOf('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(padBindingGlyph({ kind: 'pad', button: PAD.A }, 'xbox')).toBe('A');
    expect(padBindingGlyph({ kind: 'pad', button: PAD.A }, 'playstation')).toBe('✕');
    expect(padBindingGlyph({ kind: 'pad', button: PAD.VIEW, mod: PAD.RB }, 'xbox')).toBe('RB + View');
    expect(padBindingGlyph({ kind: 'pad', button: PAD.VIEW, gesture: 'hold' }, 'xbox')).toBe('Hold View');
  });

  it('axis hints follow the bindings: move, orbit and zoom on both devices', () => {
    const set = defaultBindings();
    expect(hintText(set, 'move', 'kbm')).toBe('W A S D');
    expect(hintText(set, 'move', 'pad')).toBe('Left stick');
    expect(hintText(set, 'orbit', 'pad')).toBe('Right stick');
    expect(hintText(set, 'zoom', 'pad')).toBe('LB + RS ↕');
    expect(hintText(set, 'cv-zoom', 'pad')).toBe('RT / LT');
    // a rebound movement key changes the hint
    set.kbm['move.up'] = [{ kind: 'key', code: 'KeyI' }, null];
    set.kbm['move.left'] = [{ kind: 'key', code: 'KeyJ' }, null];
    set.kbm['move.down'] = [{ kind: 'key', code: 'KeyK' }, null];
    set.kbm['move.right'] = [{ kind: 'key', code: 'KeyL' }, null];
    expect(hintText(set, 'move', 'kbm')).toBe('I J K L');
  });

  it('button hints: the current binding of the device, null when unbound there', () => {
    const set = defaultBindings();
    expect(hintText(set, 'interact', 'kbm')).toBe('E');
    expect(hintText(set, 'interact', 'pad')).toBe('A');
    expect(hintText(set, 'quick-save', 'pad')).toBeNull();
  });
});

describe('default pad bindings', () => {
  it('the books, panels and hints have a pad binding behind RB, with no conflicts', () => {
    const d = defaultBindings();
    for (const id of ['directives', 'roster', 'why-view', 'nest-overview', 'journal', 'codex', 'overlay-cycle', 'dismiss-hint', 'alert-focus', 'scent-view']) {
      expect(d.pad[id], id).not.toBeNull();
    }
    expect(d.pad['dismiss-hint']).toEqual({ kind: 'pad', button: PAD.VIEW, mod: PAD.RB });
    expect(allConflicts(d)).toEqual([]);
  });

  it('every action that is live in play has a pad binding, except the few the menus carry', () => {
    const menuOnly = new Set(['speed-1', 'speed-2', 'speed-4', 'speed-8', 'quick-save', 'quick-load', 'pointer-lock-toggle', 'possess-last', 'obs-pan.drag', 'ph-focus-dist.in', 'ph-focus-dist.out']);
    const missing = ACTIONS.filter((a) => a.contexts.some((c) => c !== 'UI') && !a.pad && !a.id.endsWith('.drag') && !menuOnly.has(a.id)
      && !/\.(up|down|left|right)$/.test(a.id) && !a.id.endsWith('.in') && !a.id.endsWith('.out') && a.id !== 'ph-exit');
    expect(missing.map((a) => a.id), 'actions with no pad binding').toEqual([]);
  });

  it('the pad can reach every movement axis through its stick', () => {
    for (const id of ['move.stick', 'orbit.stick', 'obs-move.stick', 'obs-look.stick', 'cv-pan.stick', 'cv-rotate.stick', 'ph-move.stick', 'ph-look.stick']) {
      expect(actionDef(id)?.pad, id).toMatchObject({ kind: 'padStick' });
    }
  });
});

describe('dismiss-hint', () => {
  it('RB + View fires it and nothing else (View alone stays "release")', () => {
    const { input, frame } = make('P');
    frame(null);
    frame(pad([PAD.RB]));
    frame(pad([PAD.RB, PAD.VIEW]));
    expect(input.pressed('dismiss-hint')).toBe(true);
    frame(pad([PAD.RB]));
    frame(pad());
    expect(input.pressed('release')).toBe(false);
    expect(input.pressed('possess-next')).toBe(false); // RB was a modifier, not a tap
    // View alone is still "release to observer"
    frame(pad([PAD.VIEW]));
    frame(pad());
    expect(input.pressed('release')).toBe(true);
  });

  it('Shift+H dismisses the hint and does not hide the HUD', () => {
    const { input, frame } = make('P');
    frame(null);
    input.keyDown('ShiftLeft', { shift: true });
    input.keyDown('KeyH', { shift: true });
    frame(null);
    expect(input.pressed('dismiss-hint')).toBe(true);
    expect(input.pressed('hide-hud')).toBe(false);
    input.keyUp('KeyH'); input.keyUp('ShiftLeft');
    frame(null);
    input.keyDown('KeyH');
    frame(null);
    expect(input.pressed('hide-hud')).toBe(true);
    expect(input.pressed('dismiss-hint')).toBe(false);
  });
});

describe('the panel shortcuts behind RB do not disturb the pad actions they share a button with', () => {
  it('RB + D-pad up is Colony orders, D-pad up alone is still the trail', () => {
    const { input, frame } = make('P');
    frame(null);
    frame(pad([PAD.RB]));
    frame(pad([PAD.RB, PAD.DUP]));
    expect(input.pressed('directives')).toBe(true);
    expect(input.pressed('trail-toggle')).toBe(false);
    frame(pad());
    frame(pad([PAD.DUP]));
    expect(input.pressed('trail-toggle')).toBe(true);
    expect(input.pressed('directives')).toBe(false);
  });

  it('RB alone still takes the next ant', () => {
    const { input, frame } = make('P');
    frame(null);
    frame(pad([PAD.RB]));
    expect(input.pressed('possess-next')).toBe(true);
  });
});

describe('hold duration setting', () => {
  it('scales every hold threshold: 1200 ms doubles the interact hold of 400 ms', () => {
    for (const [holdMs, fastEnough] of [[HOLD_MS_DEFAULT, true], [1200, false]] as const) {
      const { input, frame } = make('P');
      input.settings.holdMs = holdMs;
      frame(null);
      frame(pad([PAD.A]));
      frame(pad([PAD.A]), 500); // held 500 ms
      expect(input.holdStart('interact') || input.active('interact'), `holdMs ${holdMs}`).toBe(fastEnough);
    }
  });

  it('the colony-view hold of View (500 ms) stretches with it', () => {
    const { input, frame } = make('P');
    input.settings.holdMs = 1200;
    frame(null);
    frame(pad([PAD.VIEW]));
    frame(pad([PAD.VIEW]), 600);
    expect(input.pressed('colony-view')).toBe(false);
    frame(pad([PAD.VIEW]), 700);
    expect(input.pressed('colony-view')).toBe(true);
  });
});

describe('orbit by toggle', () => {
  it('one press starts the orbit, mouse movement turns the camera without the button, the next press stops it', () => {
    const { input } = make('P');
    input.settings.orbitToggle = true;
    let now = 2000;
    const tick = () => { now += 16; input.update(now); };
    tick();
    input.mouseDown(2, 100, 100, now); input.mouseUp(2, 100, 100, now + 10); // a click starts the orbit
    tick();
    input.mouseMove(130, 100, 30, 0); tick();
    expect(input.look('orbit').x).toBeGreaterThan(0);
    input.mouseMove(160, 100, 30, 0); tick();
    expect(input.look('orbit').x).toBeGreaterThan(0);
    input.mouseDown(2, 160, 100, now); input.mouseUp(2, 160, 100, now + 10); // the next press stops it
    tick();
    input.mouseMove(190, 100, 30, 0); tick();
    expect(input.look('orbit').x).toBe(0);
  });

  it('is off by default: movement without a button does nothing', () => {
    const { input } = make('P');
    let now = 2000;
    input.update(now);
    input.mouseDown(2, 100, 100, now); input.mouseUp(2, 100, 100, now + 10);
    now += 16; input.update(now);
    input.mouseMove(130, 100, 30, 0);
    now += 16; input.update(now);
    expect(input.look('orbit').x).toBe(0);
  });
});

describe('pad capture for the rebinding row', () => {
  const feedAll = (c: PadCapture, frames: PadSnapshot[]) => { let out = null; for (const f of frames) out = c.feed(f) ?? out; return out; };

  it('ignores the button that opened the row until it is released, then takes the next one', () => {
    const c = new PadCapture('button');
    expect(feedAll(c, [pad([PAD.A]), pad([PAD.A]), pad([])])).toBeNull();
    expect(feedAll(c, [pad([PAD.X])])).toEqual({ kind: 'pad', button: PAD.X });
  });

  it('LB held then a button is a combination; a modifier released alone is itself', () => {
    const a = new PadCapture('button');
    expect(feedAll(a, [pad([]), pad([PAD.LB]), pad([PAD.LB, PAD.DUP])])).toEqual({ kind: 'pad', button: PAD.DUP, mod: PAD.LB });
    const b = new PadCapture('button');
    expect(feedAll(b, [pad([]), pad([PAD.RB]), pad([PAD.RB]), pad([])])).toEqual({ kind: 'pad', button: PAD.RB });
  });

  it('stick and half-axis actions take a stick push', () => {
    const s = new PadCapture('stick');
    expect(feedAll(s, [pad([]), pad([], [0, 0, 0.9, 0])])).toEqual({ kind: 'padStick', stick: 'right' });
    const z = new PadCapture('axis');
    expect(feedAll(z, [pad([]), pad([PAD.LB]), pad([PAD.LB], [0, 0, 0, -0.9])])).toEqual({ kind: 'padAxis', axis: 3, dir: -1, mod: PAD.LB });
  });
});

describe('padSource', () => {
  it('reads through navigator.getGamepads of the window it is given, and survives a missing or throwing API', () => {
    const fake = (fn: () => unknown) => ({ navigator: { getGamepads: fn } }) as unknown as Window;
    const g = { index: 0, id: 'x', mapping: 'standard', connected: true, axes: [0, 0.5], buttons: [{ pressed: true, value: 0 }, { pressed: false, value: 0.25 }] };
    const pads = readGamepads(fake(() => [g, null]));
    expect(pads[0]).toMatchObject({ index: 0, buttons: [1, 0.25], axes: [0, 0.5] });
    expect(pads[1]).toBeNull();
    expect(readGamepads(fake(() => { throw new Error('refused'); }))).toEqual([]);
    expect(readGamepads({ navigator: {} } as unknown as Window)).toEqual([]);
  });
});
