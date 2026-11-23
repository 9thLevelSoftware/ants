// Look pass 5, item 6: the inspector card's wording found by the pictures of a live colony.
import { describe, expect, it } from 'vitest';
import { rowValue } from './rows';

describe('inspect row wording after look pass 5', () => {
  it('one game day is singular, other numbers keep the plural', () => {
    expect(rowValue({ key: 'eta', word: 'at current conditions', value: 1, unit: 'game days' })).toBe('1 game day at current conditions');
    expect(rowValue({ key: 'eta', word: 'at current conditions', value: 0.96, unit: 'game days' })).toBe('1 game day at current conditions');
    expect(rowValue({ key: 'eta', word: 'at current conditions', value: 0.3, unit: 'game days' })).toBe('0.3 game days at current conditions');
    expect(rowValue({ key: 'eta', word: 'at current conditions', value: 2, unit: 'game days' })).toBe('2 game days at current conditions');
  });
});
