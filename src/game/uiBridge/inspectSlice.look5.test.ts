// Look pass 5, item 6: the inspect card never shows a raw float in a unit ("Adults 0 / 14.774999999999999").
import { describe, expect, it } from 'vitest';
import { tidyUnit } from './inspectSlice';

describe('tidyUnit', () => {
  it('rounds the numbers in a unit string to one decimal', () => {
    expect(tidyUnit('/ 14.774999999999999')).toBe('/ 14.8');
    expect(tidyUnit('/ 7.425')).toBe('/ 7.4');
    expect(tidyUnit('/ 73.875')).toBe('/ 73.9');
  });
  it('leaves whole numbers, one-decimal numbers and plain units alone', () => {
    expect(tidyUnit('/ 49.5')).toBe('/ 49.5');
    expect(tidyUnit('/ 12')).toBe('/ 12');
    expect(tidyUnit('BU³')).toBe('BU³');
    expect(tidyUnit('game days')).toBe('game days');
    expect(tidyUnit('')).toBe('');
    expect(tidyUnit(undefined)).toBeUndefined();
  });
  it('drops a trailing zero after rounding', () => {
    expect(tidyUnit('/ 6.998')).toBe('/ 7');
  });
});
