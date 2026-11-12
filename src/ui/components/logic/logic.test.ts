import { describe, expect, it } from 'vitest';
import { groupNext, trapIndex } from './groupNav';
import { pushBack, handleBack, hasBackHandler, backDepth, layerAboveScreen, BACK_LEVEL } from './escapeStack';
import { sliderFraction, sliderFromFraction, sliderKey, snapToStep } from './sliderLogic';
import { pickSpatial } from './spatialNav';
import { stageIndex } from './stages';
import { trendOf, trendIcon } from './trend';
import { typeaheadNext } from './typeahead';

describe('slider keys (GDD 08 2.7)', () => {
  const r = { min: 0, max: 100, step: 5 };
  it('arrow = 1 step, PageUp / PageDown = 10 steps, Home / End = ends', () => {
    expect(sliderKey(50, 'ArrowRight', r)).toBe(55);
    expect(sliderKey(50, 'ArrowUp', r)).toBe(55);
    expect(sliderKey(50, 'ArrowLeft', r)).toBe(45);
    expect(sliderKey(50, 'ArrowDown', r)).toBe(45);
    expect(sliderKey(20, 'PageUp', r)).toBe(70);
    expect(sliderKey(20, 'PageDown', r)).toBe(0);
    expect(sliderKey(20, 'Home', r)).toBe(0);
    expect(sliderKey(20, 'End', r)).toBe(100);
    expect(sliderKey(20, 'x', r)).toBeNull();
  });
  it('clamps at the ends and snaps without floating-point dust', () => {
    expect(sliderKey(100, 'ArrowRight', r)).toBe(100);
    expect(sliderKey(0, 'ArrowLeft', r)).toBe(0);
    const f = { min: 0.2, max: 3, step: 0.1 };
    expect(sliderKey(0.9, 'ArrowRight', f)).toBe(1);
    expect(snapToStep(1.04, f)).toBe(1);
    expect(sliderKey(0.2, 'PageDown', f)).toBe(0.2);
  });
  it('maps pointer fractions to values', () => {
    expect(sliderFromFraction(0.5, r)).toBe(50);
    expect(sliderFromFraction(-1, r)).toBe(0);
    expect(sliderFromFraction(2, r)).toBe(100);
    expect(sliderFraction(25, r)).toBe(0.25);
  });
});

describe('roving group navigation (GDD 08 section 8)', () => {
  it('moves with the arrows of its orientation and wraps', () => {
    expect(groupNext(4, 0, 'ArrowRight', { orientation: 'horizontal' })).toBe(1);
    expect(groupNext(4, 3, 'ArrowRight', { orientation: 'horizontal' })).toBe(0);
    expect(groupNext(4, 0, 'ArrowLeft', { orientation: 'horizontal' })).toBe(3);
    expect(groupNext(4, 0, 'ArrowDown', { orientation: 'horizontal' })).toBeNull();
    expect(groupNext(4, 1, 'ArrowDown', { orientation: 'vertical' })).toBe(2);
    expect(groupNext(4, 1, 'ArrowRight', { orientation: 'vertical' })).toBeNull();
    expect(groupNext(4, 1, 'ArrowRight', { orientation: 'both' })).toBe(2);
  });
  it('skips disabled items and honours Home / End', () => {
    const skip = (i: number) => i === 1 || i === 3;
    expect(groupNext(5, 0, 'ArrowRight', { orientation: 'horizontal', skip })).toBe(2);
    expect(groupNext(5, 4, 'ArrowLeft', { orientation: 'horizontal', skip })).toBe(2);
    expect(groupNext(5, 2, 'Home', { orientation: 'horizontal', skip })).toBe(0);
    expect(groupNext(5, 2, 'End', { orientation: 'horizontal', skip })).toBe(4);
    expect(groupNext(5, 2, 'ArrowRight', { orientation: 'horizontal', wrap: false, skip: (i) => i > 2 })).toBe(2);
    expect(groupNext(0, 0, 'ArrowRight', { orientation: 'horizontal' })).toBeNull();
  });
});

describe('focus trap cycling', () => {
  it('Tab wraps forward, Shift+Tab backward, and outside focus enters at the ends', () => {
    expect(trapIndex(3, 0, false)).toBe(1);
    expect(trapIndex(3, 2, false)).toBe(0);
    expect(trapIndex(3, 0, true)).toBe(2);
    expect(trapIndex(3, 1, true)).toBe(0);
    expect(trapIndex(3, -1, false)).toBe(0);
    expect(trapIndex(3, -1, true)).toBe(2);
    expect(trapIndex(0, -1, false)).toBe(-1);
  });
});

describe('back (Esc) stack', () => {
  it('only the top layer handles the press, and removing it hands the key to the next', () => {
    const log: string[] = [];
    expect(hasBackHandler()).toBe(false);
    expect(handleBack()).toBe(false);
    const offBook = pushBack(() => log.push('book'));
    const offModal = pushBack(() => log.push('modal'));
    expect(backDepth()).toBe(2);
    handleBack();
    expect(log).toEqual(['modal']);
    offModal();
    handleBack();
    expect(log).toEqual(['modal', 'book']);
    offBook();
    expect(hasBackHandler()).toBe(false);
  });
});

describe('spatial navigation (gamepad)', () => {
  const grid = [
    { x: 0, y: 0, w: 100, h: 40 }, { x: 120, y: 0, w: 100, h: 40 },
    { x: 0, y: 60, w: 100, h: 40 }, { x: 120, y: 60, w: 100, h: 40 },
  ];
  it('picks the nearest candidate in the pressed direction', () => {
    expect(pickSpatial(grid[0], grid, 'right')).toBe(1);
    expect(pickSpatial(grid[0], grid, 'down')).toBe(2);
    expect(pickSpatial(grid[3], grid, 'left')).toBe(2);
    expect(pickSpatial(grid[3], grid, 'up')).toBe(1);
  });
  it('returns -1 at an edge', () => {
    expect(pickSpatial(grid[0], grid, 'left')).toBe(-1);
    expect(pickSpatial(grid[0], grid, 'up')).toBe(-1);
  });
  it('prefers alignment over a slightly closer, misaligned item', () => {
    const items = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 110, y: 90, w: 100, h: 40 }, { x: 150, y: 0, w: 100, h: 40 }];
    expect(pickSpatial(items[0], items, 'right')).toBe(2);
  });
});

describe('select type-ahead', () => {
  const labels = ['Auto', 'Low', 'Medium', 'High', 'Ultra'];
  it('jumps to the next label starting with the typed letters and resets after a pause', () => {
    let st = { buffer: '', at: 0 };
    let r = typeaheadNext(labels, 0, 'h', 1000, st);
    expect(r.index).toBe(3);
    st = r.state;
    r = typeaheadNext(labels, 3, 'u', 1100, st); // "hu" matches nothing
    expect(r.index).toBe(-1);
    r = typeaheadNext(labels, 3, 'u', 5000, { buffer: '', at: 0 }); // fresh buffer after the pause
    expect(r.index).toBe(4);
  });
  it('repeating a letter cycles', () => {
    const l = ['Medium', 'Mild', 'Max'];
    let r = typeaheadNext(l, 0, 'm', 0, { buffer: '', at: -9999 });
    expect(r.index).toBe(1);
    r = typeaheadNext(l, 1, 'm', 100, r.state);
    expect(r.index).toBe(2);
  });
  it('ignores non-character keys', () => {
    expect(typeaheadNext(labels, 0, 'ArrowDown', 0, { buffer: '', at: 0 }).index).toBe(-1);
    expect(typeaheadNext(labels, 0, ' ', 0, { buffer: '', at: 0 }).index).toBe(-1);
  });
});

describe('trend arrows (GDD 08 3.4)', () => {
  it('flat below 2 %, normal 2-10 %, strong above 10 %', () => {
    expect(trendOf(100, 99)).toBe('flat');
    expect(trendOf(100, 100)).toBe('flat');
    expect(trendOf(100, 95)).toBe('up');
    expect(trendOf(100, 105)).toBe('down');
    expect(trendOf(100, 80)).toBe('up-strong');
    expect(trendOf(100, 130)).toBe('down-strong');
    expect(trendOf(0, 0)).toBe('flat');
    expect(trendIcon('flat')).toBe('trend-flat');
    expect(trendIcon('up-strong')).toBe('trend-up-strong');
  });
});

describe('staged progress', () => {
  const w = [5, 15, 15, 15, 5, 5, 10, 5, 15, 10];
  it('weights sum to 100 and map progress to a stage', () => {
    expect(w.reduce((a, b) => a + b, 0)).toBe(100);
    expect(stageIndex(0, w)).toBe(0);
    expect(stageIndex(0.049, w)).toBe(0);
    expect(stageIndex(0.05, w)).toBe(1);
    expect(stageIndex(0.19, w)).toBe(1);
    expect(stageIndex(0.27, w)).toBe(2);
    expect(stageIndex(0.89, w)).toBe(8);
    expect(stageIndex(0.9, w)).toBe(9);
    expect(stageIndex(1, w)).toBe(9);
  });
});

describe('back stack levels', () => {
  it('a dialog stays above its screen even when the screen registers again afterwards', () => {
    const log: string[] = [];
    const offScreen = pushBack(() => log.push('screen'), 0);
    const offDialog = pushBack(() => log.push('dialog'), 10);
    const offScreenAgain = pushBack(() => log.push('screen again'), 0); // a re-render re-registers the screen
    handleBack();
    expect(log).toEqual(['dialog']);
    offDialog();
    handleBack();
    expect(log).toEqual(['dialog', 'screen again']);
    offScreen();
    offScreenAgain();
    expect(hasBackHandler()).toBe(false);
  });
  it('a popover is above a dialog and a key capture above both', () => {
    const log: string[] = [];
    const offs = [pushBack(() => log.push('capture'), 30), pushBack(() => log.push('dialog'), 10), pushBack(() => log.push('popover'), 20)];
    handleBack();
    offs[0]();
    handleBack();
    offs[2]();
    handleBack();
    expect(log).toEqual(['capture', 'popover', 'dialog']);
    offs[1]();
  });
});

describe('layers above a book screen own the keys (Q / E tab hotkeys step aside)', () => {
  it('a dialog, popover or capture counts, a screen alone does not', () => {
    expect(layerAboveScreen()).toBe(false);
    const screen = pushBack(() => {}, BACK_LEVEL.screen);
    expect(layerAboveScreen()).toBe(false);
    const dialog = pushBack(() => {}, BACK_LEVEL.dialog);
    expect(layerAboveScreen()).toBe(true);
    const popover = pushBack(() => {}, BACK_LEVEL.popover);
    dialog();
    expect(layerAboveScreen()).toBe(true); // the popover is still open
    popover();
    expect(layerAboveScreen()).toBe(false);
    screen();
    expect(backDepth()).toBe(0);
  });
});
