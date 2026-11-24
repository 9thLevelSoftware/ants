import { describe, expect, it } from 'vitest';
import { siteAdvice, weakestRow } from './siteAdvice';

const row = (id: string, value: number, word: string) => ({ id, label: id, value, dots: Math.round(value * 5), word });

describe('siteAdvice (the line under a Poor or Fair site read-out)', () => {
  it('names the weakest factor in words and what to look for (the opening of seed 3: shaded, otherwise fine)', () => {
    const rows = [row('diggability', 0.9, 'Loose'), row('moisture', 1, 'Damp'), row('warmth', 0, 'Shaded'), row('cover', 0.6, 'Leaf-covered'), row('exposure', 1, 'Sheltered')];
    expect(siteAdvice({ rows, word: 'poor' })).toBe('Shaded: look for open, sun-warmed soil. It is the only weak reading.');
  });
  it('does not claim a single weak reading when another reading is weak too', () => {
    const rows = [row('diggability', 0.9, 'Loose'), row('moisture', 0.2, 'Dry'), row('warmth', 0, 'Shaded'), row('cover', 0.6, 'Leaf-covered'), row('exposure', 1, 'Sheltered')];
    expect(siteAdvice({ rows, word: 'poor' })).toBe('Shaded: look for open, sun-warmed soil.');
  });
  it('says nothing for Good or Excellent ground, or before a reading', () => {
    const rows = [row('warmth', 0.1, 'Shaded')];
    expect(siteAdvice({ rows, word: 'good' })).toBeNull();
    expect(siteAdvice({ rows, word: 'excellent' })).toBeNull();
    expect(siteAdvice({ rows, word: null })).toBeNull();
    expect(siteAdvice({ rows: [], word: 'poor' })).toBeNull();
  });
  it('the first of equally weak factors wins, and every factor of the card has a line', () => {
    expect(weakestRow([row('a', 0.2, 'x'), row('b', 0.2, 'y')])?.id).toBe('a');
    for (const id of ['diggability', 'moisture', 'warmth', 'cover', 'floodSafety', 'rivalScent', 'exposure']) {
      expect(siteAdvice({ rows: [row(id, 0, 'Odd')], word: 'poor' })).toMatch(/^Odd: look /);
    }
  });
  it('a word the table knows gets its own advice', () => {
    expect(siteAdvice({ rows: [row('moisture', 0, 'Waterlogged')], word: 'fair' })).toBe('Waterlogged: look for drier, higher ground.');
  });
});
