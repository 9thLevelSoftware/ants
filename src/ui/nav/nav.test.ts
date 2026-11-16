// Pure parts of the navigation layer: the pad reader, shortcut matching, layer choice, device tracking, audit rules.
import { describe, expect, it } from 'vitest';
import { PAD } from '@/input/defaults';
import type { PadSnapshot } from '@/input/types';
import { reachOrderIssues } from './audit';
import { DeviceTracker } from './device';
import { BUILTIN_LAYERS, pickLayerIndex, registerNavLayer, allLayers } from './layers';
import { NAV_REPEAT_EVERY_MS, NAV_REPEAT_FIRST_MS, PadReader } from './padReader';
import { ShortcutMatcher, shortcutsOf } from './shortcuts';

const snap = (buttons: number[] = [], axes = [0, 0, 0, 0]): PadSnapshot => {
  const b = new Array<number>(17).fill(0);
  for (const i of buttons) b[i] = 1;
  return { index: 0, id: 'pad', mapping: 'standard', buttons: b, axes };
};

describe('PadReader', () => {
  it('reports edges once, hold time and release time', () => {
    const r = new PadReader();
    expect(r.update(snap(), 0).edge(PAD.A)).toBe(false);
    const f1 = r.update(snap([PAD.A]), 100);
    expect(f1.edge(PAD.A)).toBe(true);
    const f2 = r.update(snap([PAD.A]), 400);
    expect(f2.edge(PAD.A)).toBe(false);
    expect(f2.heldMs(PAD.A)).toBe(300);
    const f3 = r.update(snap(), 500);
    expect(f3.release(PAD.A)).toBe(true);
    expect(f3.releasedAfterMs(PAD.A)).toBe(400);
  });

  it('a held direction moves once, waits, then repeats', () => {
    const r = new PadReader();
    r.update(snap(), 0);
    expect(r.update(snap([PAD.DDOWN]), 10).move).toBe('down');
    expect(r.update(snap([PAD.DDOWN]), 10 + NAV_REPEAT_FIRST_MS - 5).move).toBeNull();
    expect(r.update(snap([PAD.DDOWN]), 10 + NAV_REPEAT_FIRST_MS + 1).move).toBe('down');
    expect(r.update(snap([PAD.DDOWN]), 10 + NAV_REPEAT_FIRST_MS + 1 + NAV_REPEAT_EVERY_MS + 1).move).toBe('down');
  });

  it('the left stick moves focus only past the strong threshold, along the dominant axis', () => {
    const r = new PadReader();
    r.update(snap(), 0);
    expect(r.update(snap([], [0.4, 0, 0, 0]), 10).move).toBeNull();
    expect(r.update(snap([], [0.2, 0.9, 0, 0]), 20).move).toBe('down');
    expect(r.update(snap([], [-0.9, 0.2, 0, 0]), 30).move).toBe('left');
  });

  it('no pad: nothing connected', () => {
    expect(new PadReader().update(null, 0).connected).toBe(false);
  });
});

describe('ShortcutMatcher', () => {
  const list = shortcutsOf({
    directives: { kind: 'pad', button: PAD.DUP, mod: PAD.RB },
    'scent-view': { kind: 'pad', button: PAD.DUP },
    'controls-reminder': { kind: 'pad', button: PAD.START, gesture: 'hold', holdMs: 1000 },
  }, ['directives', 'scent-view', 'controls-reminder']);

  it('a modifier combination fires, and the plain binding on the same button yields to it', () => {
    const m = new ShortcutMatcher(), r = new PadReader();
    r.update(snap(), 0);
    r.update(snap([PAD.RB]), 10);
    expect(m.fired(list, r.update(snap([PAD.RB, PAD.DUP]), 20))).toEqual(['directives']);
  });

  it('the plain binding fires when the modifier is not held', () => {
    const m = new ShortcutMatcher(), r = new PadReader();
    r.update(snap(), 0);
    expect(m.fired(list, r.update(snap([PAD.DUP]), 10))).toEqual(['scent-view']);
  });

  it('a hold fires once after its duration, scaled by the hold setting', () => {
    const m = new ShortcutMatcher(), r = new PadReader();
    r.update(snap(), 0);
    expect(m.fired(list, r.update(snap([PAD.START]), 10))).toEqual([]);
    expect(m.fired(list, r.update(snap([PAD.START]), 900))).toEqual([]);
    expect(m.fired(list, r.update(snap([PAD.START]), 1100))).toEqual(['controls-reminder']);
    expect(m.fired(list, r.update(snap([PAD.START]), 1500))).toEqual([]);
    const slow = new ShortcutMatcher(), r2 = new PadReader();
    r2.update(snap(), 0);
    slow.fired(list, r2.update(snap([PAD.START]), 10));
    expect(slow.fired(list, r2.update(snap([PAD.START]), 1100), 2)).toEqual([]);
    expect(slow.fired(list, r2.update(snap([PAD.START]), 2100), 2)).toEqual(['controls-reminder']);
  });
});

describe('layer choice', () => {
  it('the highest rank wins; a focus-claim layer only counts with focus inside it', () => {
    expect(pickLayerIndex([{ rank: 50, claim: 'always', focusInside: false }, { rank: 30, claim: 'focus', focusInside: true }])).toBe(0);
    expect(pickLayerIndex([{ rank: 50, claim: 'always', focusInside: false }, { rank: 100, claim: 'always', focusInside: false }])).toBe(1);
    expect(pickLayerIndex([{ rank: 30, claim: 'focus', focusInside: false }])).toBe(-1);
    expect(pickLayerIndex([])).toBe(-1);
  });

  it('every built-in layer has a unique id and a selector; registering replaces by id', () => {
    const ids = BUILTIN_LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of BUILTIN_LAYERS) expect(l.selector, l.id).toBeTruthy();
    const off = registerNavLayer({ id: 'dialog', selector: '.x', rank: 1, claim: 'always', kind: 'dialog' });
    expect(allLayers().filter((l) => l.id === 'dialog')).toHaveLength(1);
    expect(allLayers().find((l) => l.id === 'dialog')?.selector).toBe('.x');
    off();
    expect(allLayers().find((l) => l.id === 'dialog')?.selector).toBe('.ui-modal');
  });
});

describe('DeviceTracker', () => {
  it('switches on input from the other device, with 0.5 s hysteresis', () => {
    const t = new DeviceTracker();
    expect(t.note('pad', 1000)).toBe(true);
    expect(t.current).toBe('pad');
    expect(t.note('kbm', 1200)).toBe(false); // a stray event right after the switch
    expect(t.note('kbm', 1600)).toBe(true);
    expect(t.current).toBe('kbm');
    expect(t.note('kbm', 1700)).toBe(false);
  });
});

describe('focus audit: reading order', () => {
  const r = (x: number, y: number, w = 100, h = 30) => ({ x, y, w, h });
  it('rows left to right, top to bottom is fine; a new column may start higher', () => {
    expect(reachOrderIssues([r(0, 0), r(120, 0), r(0, 40), r(120, 40)], ['a', 'b', 'c', 'd'])).toEqual([]);
    expect(reachOrderIssues([r(0, 0), r(0, 40), r(0, 80), r(300, 0), r(300, 40)], ['a', 'b', 'c', 'd', 'e'])).toEqual([]);
  });
  it('jumping back up inside a column is reported', () => {
    const issues = reachOrderIssues([r(0, 100), r(0, 0)], ['second', 'first']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"first" comes after "second" but is above it');
  });
});

describe('key hints follow the last-used device', () => {
  it('prints the keyboard binding, then the pad glyph, then PlayStation shapes, then the keyboard again', async () => {
    const { hintLabel } = await import('../components/KeyHint');
    const { defaultBindings } = await import('@/input');
    const { setInputDevice } = await import('./device');
    const set = defaultBindings();
    setInputDevice('kbm', 'xbox');
    expect(hintLabel(set, 'interact')).toBe('E');
    expect(hintLabel(set, 'move')).toBe('W A S D');
    setInputDevice('pad', 'xbox');
    expect(hintLabel(set, 'interact')).toBe('A');
    expect(hintLabel(set, 'move')).toBe('Left stick');
    expect(hintLabel(set, 'directives')).toBe('RB + D-pad ↑');
    setInputDevice('pad', 'playstation');
    expect(hintLabel(set, 'interact')).toBe('✕');
    expect(hintLabel(set, 'directives')).toBe('R1 + D-pad ↑');
    // an action with no pad binding falls back to its key rather than "unbound"
    expect(hintLabel(set, 'quick-save')).toBe('F5');
    setInputDevice('kbm');
    expect(hintLabel(set, 'interact')).toBe('E');
  });
});
