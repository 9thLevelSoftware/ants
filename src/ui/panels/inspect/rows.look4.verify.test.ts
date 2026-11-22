// Review of look-pass-4 item 6 (inspector wording: the number leads when the word only describes it). Rows as the sim
// builds them (src/sim/ants/player/inspect.ts).
import { describe, expect, it } from 'vitest';
import { rowValue } from './rows';

describe('inspect row wording after look pass 4 (review)', () => {
  it('no row reads as a bare describing word with the number in brackets after it', () => {
    const rows = [
      { key: 'progress', word: 'of stage', value: 64.2, unit: '%' },
      { key: 'eta', word: 'at current conditions', value: 0.12, unit: 'game days' },
      { key: 'amount', word: 'left', value: 2, unit: 'loads' },
      { key: 'temperature', word: 'air', value: 19.04, unit: '°C' },
      { key: 'humidity', word: 'air', value: 71, unit: '%' },
      { key: 'depth', word: 'below ground', value: 6, unit: 'BU' },
      { key: 'volume', word: 'open', value: 120, unit: 'BU³' },
      { key: 'traffic', word: 'per game hour', value: 7, unit: '' },
      { key: 'pellets', word: 'in the mound', value: 31, unit: '' },
      { key: 'chambers', word: 'linked', value: 2, unit: '' },
    ];
    for (const r of rows) {
      const s = rowValue(r);
      expect(s, r.key).not.toMatch(new RegExp(`^${r.word} \\(`));
      expect(s.endsWith(r.word), `${r.key}: "${s}"`).toBe(true);
    }
  });

  it('a stalled brood keeps its reason and no number', () => {
    expect(rowValue({ key: 'eta', word: 'stalled (too cold)', value: null, unit: 'game days' })).toBe('stalled (too cold)');
  });

  it('chamber food occupancy is in loads (fractional: upkeep.ts adds item c + p), so a part load is not shown as 0', () => {
    // a store chamber holding 0.4 loads of 12: before look pass 4 the card read "occupancy / capacity (0.4 / 12)"
    expect(rowValue({ key: 'food', word: 'occupancy / capacity', value: 0.4, unit: '/ 12' })).not.toBe('0 / 12');
  });

  it('adult and brood occupancy are whole animals', () => {
    expect(rowValue({ key: 'adults', word: 'occupancy / capacity', value: 3, unit: '/ 12' })).toBe('3 / 12');
    expect(rowValue({ key: 'brood', word: 'occupancy / capacity', value: 0, unit: '/ 40' })).toBe('0 / 40');
  });
});
