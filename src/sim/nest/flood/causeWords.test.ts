// Gate S17 (gate-close-app report): the flood card's cause lines are the diagnostic factors' detail strings, and they
// read "rim factor 1.00" / "catchment x1.2": model numbers. They are plain words now.
import { describe, expect, it } from 'vitest';
import { catchmentWords, rimWords } from './diagnostics';

describe('flood cause lines in plain words', () => {
  it('rim and catchment words carry no model numbers', () => {
    expect(rimWords(1)).toBe('no crater rim around the entrance');
    expect(rimWords(0.6)).toBe('a low crater rim around the entrance');
    expect(rimWords(0.1)).toBe('a crater rim keeps most rain out');
    expect(catchmentWords(1.2, false)).toBe('the ground slopes down to the entrance');
    expect(catchmentWords(3, true)).toBe('the entrance lies in a hollow that rain runs into, under cover');
    expect(catchmentWords(1, false)).toBe('flat ground around the entrance');
    expect(catchmentWords(0.5, false)).toBe('the entrance sits above the ground around it');
    for (const w of [rimWords(1), rimWords(0.3), catchmentWords(1.7, false)]) expect(w).not.toMatch(/\d|factor|catchment/);
  });
});
