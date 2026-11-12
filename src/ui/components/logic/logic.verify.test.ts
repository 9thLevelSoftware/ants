// Reviewer tests (ui-shell verify): edge cases of the pure component logic.
import { afterEach, describe, expect, it } from 'vitest';
import { BACK_LEVEL, backDepth, handleBack, pushBack } from './escapeStack';
import { groupNext, trapIndex } from './groupNav';
import { sliderFromFraction, sliderKey, snapToStep } from './sliderLogic';
import { pickSpatial } from './spatialNav';
import { stageIndex } from './stages';
import { trendOf } from './trend';
import { typeaheadNext, TYPEAHEAD_RESET_MS } from './typeahead';

describe('Esc stack ordering', () => {
  const offs: (() => void)[] = [];
  afterEach(() => { while (offs.length) offs.pop()!(); });

  it('a dialog stays above a screen that registers after it; a capture sits above both', () => {
    const hits: string[] = [];
    offs.push(pushBack(() => hits.push('dialog'), BACK_LEVEL.dialog));
    offs.push(pushBack(() => hits.push('screen'), BACK_LEVEL.screen));
    offs.push(pushBack(() => hits.push('capture'), BACK_LEVEL.capture));
    handleBack();
    expect(hits).toEqual(['capture']);
    offs.pop()!();
    handleBack();
    expect(hits).toEqual(['capture', 'dialog']);
  });

  it('removing a layer twice is harmless and does not remove another layer', () => {
    const before = backDepth();
    const off1 = pushBack(() => {});
    const off2 = pushBack(() => {});
    off1();
    off1();
    expect(backDepth()).toBe(before + 1);
    off2();
    expect(backDepth()).toBe(before);
  });

  it('handleBack with nothing registered returns false', () => {
    expect(backDepth()).toBe(0);
    expect(handleBack()).toBe(false);
  });
});

describe('roving group navigation', () => {
  it('all items disabled: arrows stay, Home/End find nothing', () => {
    const skip = () => true;
    expect(groupNext(4, 1, 'ArrowDown', { orientation: 'vertical', skip })).toBe(1);
    expect(groupNext(4, 1, 'Home', { orientation: 'vertical', skip })).toBeNull();
    expect(groupNext(4, 1, 'End', { orientation: 'vertical', skip })).toBeNull();
  });
  it('skips disabled items and wraps; without wrap it stays at the edge', () => {
    const skip = (i: number) => i === 1;
    expect(groupNext(3, 0, 'ArrowRight', { orientation: 'horizontal', skip })).toBe(2);
    expect(groupNext(3, 2, 'ArrowRight', { orientation: 'horizontal', skip })).toBe(0);
    expect(groupNext(3, 2, 'ArrowDown', { orientation: 'vertical', wrap: false })).toBe(2);
    expect(groupNext(3, 0, 'ArrowDown', { orientation: 'horizontal' })).toBeNull();
    expect(groupNext(0, 0, 'ArrowDown', { orientation: 'vertical' })).toBeNull();
  });
  it('trap cycles both ways and enters from outside at the right end', () => {
    expect(trapIndex(3, 2, false)).toBe(0);
    expect(trapIndex(3, 0, true)).toBe(2);
    expect(trapIndex(3, -1, true)).toBe(2);
    expect(trapIndex(0, -1, false)).toBe(-1);
  });
});

describe('slider maths', () => {
  const r = { min: 0.05, max: 0.35, step: 0.01 };
  it('steps cleanly without floating-point dust and clamps PageUp / PageDown', () => {
    expect(sliderKey(0.15, 'ArrowRight', r)).toBe(0.16);
    expect(sliderKey(0.3, 'PageUp', r)).toBe(0.35);
    expect(sliderKey(0.1, 'PageDown', r)).toBe(0.05);
    expect(snapToStep(0.1 + 0.2, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(sliderKey(0.15, 'Tab', r)).toBeNull();
  });
  it('an off-grid value snaps onto the grid anchored at min', () => {
    expect(sliderKey(53, 'ArrowRight', { min: 50, max: 100, step: 5 })).toBe(60); // 58 rounds to 60
    expect(sliderFromFraction(-1, { min: 50, max: 100, step: 5 })).toBe(50);
    expect(sliderFromFraction(2, { min: 50, max: 100, step: 5 })).toBe(100);
  });
});

describe('type-ahead', () => {
  const labels = ['Always', 'While learning', 'Never', 'Normal'];
  it('a repeated letter cycles through matches; a pause resets the buffer', () => {
    let st = { buffer: '', at: 0 };
    let r = typeaheadNext(labels, 0, 'n', 1000, st); st = r.state;
    expect(r.index).toBe(2);
    r = typeaheadNext(labels, 2, 'n', 1100, st); st = r.state;
    expect(r.index).toBe(3);
    r = typeaheadNext(labels, 3, 'n', 1200, st); st = r.state;
    expect(r.index).toBe(2);
    r = typeaheadNext(labels, 2, 'a', 1200 + TYPEAHEAD_RESET_MS + 1, st);
    expect(r.index).toBe(0);
  });
  it('a multi-letter prefix matches from the current item', () => {
    let st = { buffer: '', at: 0 };
    let r = typeaheadNext(labels, 0, 'n', 0, st); st = r.state;
    r = typeaheadNext(labels, r.index, 'o', 50, st);
    expect(labels[r.index]).toBe('Normal');
  });
  it('ignores Space and non-character keys', () => {
    expect(typeaheadNext(labels, 0, ' ', 0, { buffer: '', at: 0 }).index).toBe(-1);
    expect(typeaheadNext(labels, 0, 'ArrowDown', 0, { buffer: '', at: 0 }).index).toBe(-1);
  });
});

describe('trend arrows (GDD 08 3.4: flat < 2 %, 2-10 %, strong > 10 %)', () => {
  it('classifies the boundaries', () => {
    expect(trendOf(100, 101.9)).toBe('flat');
    expect(trendOf(100, 98)).toBe('up');
    expect(trendOf(100, 90)).toBe('up');
    expect(trendOf(100, 89.9)).toBe('up-strong');
    expect(trendOf(100, 115)).toBe('down-strong');
    expect(trendOf(0, 0)).toBe('flat');
    expect(trendOf(0, 5)).toBe('down-strong');
  });
});

describe('loading stages (GDD 08 3.6 weights)', () => {
  const w = [5, 15, 15, 15, 5, 5, 10, 5, 15, 10];
  it('maps progress to the right stage, clamps and survives NaN', () => {
    expect(stageIndex(0, w)).toBe(0);
    expect(stageIndex(0.049, w)).toBe(0);
    expect(stageIndex(0.05, w)).toBe(1);
    expect(stageIndex(0.95, w)).toBe(9);
    expect(stageIndex(1, w)).toBe(9);
    expect(stageIndex(-3, w)).toBe(0);
    expect(stageIndex(7, w)).toBe(9);
    expect(Number.isInteger(stageIndex(NaN, w))).toBe(true);
  });
});

describe('spatial navigation', () => {
  it('picks the aligned neighbour over a nearer diagonal one and nothing past the edge', () => {
    const from = { x: 0, y: 0, w: 100, h: 40 };
    const cands = [{ x: 0, y: 60, w: 100, h: 40 }, { x: 150, y: 50, w: 100, h: 40 }, { x: 0, y: -60, w: 100, h: 40 }];
    expect(pickSpatial(from, cands, 'down')).toBe(0);
    expect(pickSpatial(from, cands, 'right')).toBe(1);
    expect(pickSpatial(from, cands, 'up')).toBe(2);
    expect(pickSpatial(from, [], 'left')).toBe(-1);
  });
});
