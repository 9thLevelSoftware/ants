// Independent review of the photo panel's slider mappings (task photo): round trips, range ends and junk input.
import { describe, expect, it } from 'vitest';
import { formatEV, formatFNumber, formatFocus, logToPos, posToLog, SLIDER_STEPS } from './sliderMap';

describe('log slider mapping', () => {
  it('round-trips every slider position within one step for the aperture and focus ranges', () => {
    for (const [lo, hi] of [[1.4, 22], [0.5, 200]] as const) {
      for (let pos = 0; pos <= SLIDER_STEPS; pos += 5) expect(Math.abs(logToPos(posToLog(pos, lo, hi), lo, hi) - pos)).toBeLessThanOrEqual(1);
      expect(posToLog(0, lo, hi)).toBeCloseTo(lo, 9);
      expect(posToLog(SLIDER_STEPS, lo, hi)).toBeCloseTo(hi, 9);
    }
  });

  it('out-of-range, NaN and degenerate ranges never give NaN', () => {
    expect(logToPos(NaN, 1.4, 22)).toBe(0);
    expect(logToPos(1e9, 1.4, 22)).toBe(SLIDER_STEPS);
    expect(logToPos(5, 0, 22)).toBe(0);
    expect(logToPos(5, 22, 22)).toBe(0);
    expect(posToLog(NaN, 1.4, 22)).toBeCloseTo(1.4, 9);
    expect(posToLog(-50, 1.4, 22)).toBeCloseTo(1.4, 9);
    expect(posToLog(1e6, 1.4, 22)).toBeCloseTo(22, 9);
  });
});

describe('read-outs', () => {
  it('format the lens values the way the panel shows them', () => {
    expect(formatFNumber(1.4)).toBe('f/1.4');
    expect(formatFNumber(22)).toBe('f/22');
    expect(formatFocus(0.5)).toBe('0.5 BU');
    expect(formatFocus(200)).toBe('200 BU');
    expect(formatEV(0)).toBe('0 EV');
    expect(formatEV(1.25)).toBe('+1.25 EV');
    expect(formatEV(-3)).toBe('−3 EV');
  });
});
