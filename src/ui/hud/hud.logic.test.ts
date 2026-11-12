import { describe, expect, it } from 'vitest';
import type { UiPromptLine, UiSpeed } from '../api';
import { rowLabel, rowValue } from '../panels/inspect/rows';
import { ACTION_OF, visibleLines } from './promptLines';
import { isSelected, speedRefusal } from './speedModel';

const line = (input: string, slot: UiPromptLine['slot'] = 'extra'): UiPromptLine => ({ slot, input, text: input, ok: true });
const speed = (o: Partial<UiSpeed> = {}): UiSpeed => ({ level: 1, paused: false, requested: 1, effective: 1, lagging: false, belowRealTime: false, allowed: [0, 1, 2, 4], manualClock: false, ...o });

describe('prompt lines', () => {
  it('shows at most three lines and never drops Colony orders', () => {
    const all = [line('interact', 'primary'), line('interact-hold', 'secondary'), line('dig'), line('inspect'), line('directives')];
    const v = visibleLines(all);
    expect(v).toHaveLength(3);
    expect(v.map((l) => l.input)).toEqual(['interact', 'interact-hold', 'directives']);
  });
  it('keeps order when there is no Colony orders line', () => {
    expect(visibleLines([line('interact', 'primary'), line('dig'), line('foot'), line('inspect')]).map((l) => l.input)).toEqual(['interact', 'dig', 'foot']);
  });
  it('every input the simulation can send maps to a rebindable action', () => {
    for (const i of ['interact', 'interact-hold', 'dig', 'share-food', 'foot', 'inspect', 'directives']) expect(ACTION_OF[i]).toBeTruthy();
  });
});

describe('speed control rules (GDD 08 5.1)', () => {
  it('8x is locked while possessing, with the chapter wording', () => {
    expect(speedRefusal(8, speed())).toBe('8x only while observing');
    expect(speedRefusal(8, speed({ allowed: [0, 1, 2, 4, 8] }))).toBeNull();
    expect(speedRefusal(2, speed())).toBeNull();
  });
  it('pause always works; no speed works when time is held (photo mode, pause menu)', () => {
    expect(speedRefusal('pause', speed({ allowed: [] }))).toBeNull();
    expect(speedRefusal(1, speed({ allowed: [] }))).toBe('Not while time is held');
  });
  it('the pause button is selected while paused, the requested speed otherwise', () => {
    expect(isSelected('pause', speed({ paused: true }))).toBe(true);
    expect(isSelected(1, speed({ paused: true }))).toBe(false);
    expect(isSelected(4, speed({ requested: 4 }))).toBe(true);
  });
});

describe('inspect row wording', () => {
  it('labels known keys and falls back to the key itself', () => {
    expect(rowLabel('crop-c')).toBe('Crop C');
    expect(rowLabel('site-diggability')).toBe('Site: diggability');
    expect(rowLabel('odd-key')).toBe('Odd key');
  });
  it('shows the number only where it carries a unit or is a count', () => {
    expect(rowValue({ key: 'moisture', word: 'damp', value: 34.2, unit: '%' })).toBe('damp (34 %)');
    expect(rowValue({ key: 'temperature', word: 'surface', value: 21.46, unit: '°C' })).toBe('surface (21.5 °C)');
    expect(rowValue({ key: 'target', word: 'source', value: 23, unit: '' })).toBe('source');
    expect(rowValue({ key: 'users', word: 'ours using it', value: 3, unit: '' })).toBe('ours using it (3)');
    expect(rowValue({ key: 'crop-c', word: 'carbohydrate', value: 0.66, unit: 'loads' })).toBe('0.7 loads');
    expect(rowValue({ key: 'task', word: 'forage', value: null, unit: '' })).toBe('forage');
  });
});
