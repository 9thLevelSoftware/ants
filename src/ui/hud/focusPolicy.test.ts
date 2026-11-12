// The HUD's focus rules (GDD 08 section 8) on fake elements: the unit environment has no DOM.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBindings } from '@/input';
import { PAD } from '@/input/defaults';
import { setCurrentBindings } from '../components';
import { isChip, isEntered, onChipMouseDown, onLeaveKey } from './focusPolicy';
import { boundPadFires, stepHudPad } from './hudPad';
import { openDrawer } from './state';

/** An element whose `closest` answers "yes" for the selectors it was built with (a crude CSS stand-in). */
const el = (...matches: string[]) => ({ closest: (sel: string) => (matches.some((m) => sel.split(',').map((s) => s.trim()).includes(m)) ? {} : null) });

describe('chips and panels', () => {
  it('a HUD button is a chip; a drawer or alert-menu control is not', () => {
    expect(isChip(el('button'))).toBe(true);
    expect(isChip(el('button', '.fd-drawer'))).toBe(false);
    expect(isChip(el('button', '.fd-alert-menu'))).toBe(false);
    expect(isChip(el('div'))).toBe(false); // plain text is not a focus target
    expect(isChip(null)).toBe(false);
  });
  it('the feed, the pulse and drawers are the regions the keyboard enters', () => {
    expect(isEntered(el('.fd-alerts'))).toBe(true);
    expect(isEntered(el('.fd-pulse'))).toBe(true);
    expect(isEntered(el('.fd-drawer'))).toBe(true);
    expect(isEntered(el('.fd-time'))).toBe(false);
  });
  it('a mouse press on a chip is cancelled (no focus), a press inside a drawer is not', () => {
    const chip = { target: el('button'), preventDefault: vi.fn() } as unknown as MouseEvent;
    onChipMouseDown(chip);
    expect(chip.preventDefault).toHaveBeenCalled();
    const inDrawer = { target: el('button', '.fd-drawer'), preventDefault: vi.fn() } as unknown as MouseEvent;
    onChipMouseDown(inDrawer);
    expect(inDrawer.preventDefault).not.toHaveBeenCalled();
  });
});

describe('leaving the feed', () => {
  afterEach(() => vi.unstubAllGlobals());
  const key = (k: string) => ({ key: k, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as KeyboardEvent;
  it('Esc and Tab inside the feed blur it and stop the key reaching the game', () => {
    const blur = vi.fn();
    vi.stubGlobal('document', { activeElement: { ...el('.fd-alerts', 'button'), blur } });
    for (const k of ['Escape', 'Tab']) { const e = key(k); onLeaveKey(e); expect(e.stopPropagation).toHaveBeenCalled(); }
    expect(blur).toHaveBeenCalledTimes(2);
  });
  it('other keys, and keys inside a drawer, are left alone', () => {
    const blur = vi.fn();
    vi.stubGlobal('document', { activeElement: { ...el('.fd-alerts', 'button'), blur } });
    onLeaveKey(key('ArrowDown'));
    vi.stubGlobal('document', { activeElement: { ...el('.fd-drawer', 'button'), blur } });
    onLeaveKey(key('Escape'));
    expect(blur).not.toHaveBeenCalled();
  });
});

const pad = (down: number[], edge: number[]) => ({ down: (i: number) => down.includes(i), edge: (i: number) => edge.includes(i) });

describe('gamepad reach of the HUD', () => {
  afterEach(() => { openDrawer.value = null; setCurrentBindings(defaultBindings()); vi.unstubAllGlobals(); });

  it('LB + View enters the feed; View alone does not', () => {
    const focus = vi.fn();
    vi.stubGlobal('document', { querySelector: (sel: string) => (sel.includes('alert-button') ? { focus } : null) });
    stepHudPad(pad([PAD.VIEW], [PAD.VIEW]), true, null);
    expect(focus).not.toHaveBeenCalled();
    stepHudPad(pad([PAD.LB, PAD.VIEW], [PAD.VIEW]), true, null);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('with no card on screen LB + View lands on the colony pulse', () => {
    const focus = vi.fn();
    vi.stubGlobal('document', { querySelector: (sel: string) => (sel.includes('data-hud="pulse"') && !sel.includes('alert-button') ? { focus } : null) });
    stepHudPad(pad([PAD.LB, PAD.VIEW], [PAD.VIEW]), true, null);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('nothing happens outside play', () => {
    const focus = vi.fn();
    vi.stubGlobal('document', { querySelector: () => ({ focus }) });
    stepHudPad(pad([PAD.LB, PAD.VIEW], [PAD.VIEW]), false, null);
    expect(focus).not.toHaveBeenCalled();
  });

  it('a pad button the player bound to Colony orders toggles the drawer, honouring its modifier', () => {
    const set = defaultBindings();
    set.pad.directives = { kind: 'pad', button: PAD.Y, mod: PAD.RB };
    setCurrentBindings(set);
    stepHudPad(pad([PAD.Y], [PAD.Y]), true, null);
    expect(openDrawer.value).toBeNull();
    stepHudPad(pad([PAD.RB, PAD.Y], [PAD.Y]), true, null);
    expect(openDrawer.value).toBe('directives');
  });

  it('boundPadFires ignores tap and hold gestures and unbound actions', () => {
    expect(boundPadFires({ kind: 'pad', button: 3, gesture: 'hold', holdMs: 500 }, pad([3], [3]))).toBe(false);
    expect(boundPadFires(null, pad([3], [3]))).toBe(false);
    expect(boundPadFires({ kind: 'pad', button: 3 }, pad([3], [3]))).toBe(true);
  });

  it('inside the feed X opens the card menu (Shift+Enter) and B hands the focus back to the game', () => {
    const events: KeyboardEvent[] = [];
    const blur = vi.fn();
    const active = { ...el('.fd-alerts', 'button'), dispatchEvent: (e: KeyboardEvent) => { events.push(e); return true; }, blur } as unknown as HTMLElement;
    vi.stubGlobal('KeyboardEvent', class { key: string; shiftKey: boolean; constructor(_t: string, i: { key: string; shiftKey: boolean }) { this.key = i.key; this.shiftKey = i.shiftKey; } });
    stepHudPad(pad([], [PAD.X]), true, active);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'Enter', shiftKey: true });
    stepHudPad(pad([], [PAD.B]), true, active);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('X and B outside the feed do nothing', () => {
    const blur = vi.fn();
    const active = { ...el('button'), blur, dispatchEvent: vi.fn() } as unknown as HTMLElement;
    stepHudPad(pad([], [PAD.X, PAD.B]), true, active);
    expect(blur).not.toHaveBeenCalled();
  });
});
