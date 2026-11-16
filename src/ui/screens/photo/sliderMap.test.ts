import { describe, expect, it } from 'vitest';
import { formatEV, formatFNumber, formatFocus, logToPos, posToLog, SLIDER_STEPS } from './sliderMap';

describe('photo slider mappings', () => {
  it('log slider ends map to the range ends and round-trip', () => {
    expect(logToPos(0.5, 0.5, 200)).toBe(0);
    expect(logToPos(200, 0.5, 200)).toBe(SLIDER_STEPS);
    expect(posToLog(0, 0.5, 200)).toBeCloseTo(0.5, 9);
    expect(posToLog(SLIDER_STEPS, 0.5, 200)).toBeCloseTo(200, 6);
    for (const v of [0.7, 3, 17, 120]) expect(posToLog(logToPos(v, 0.5, 200), 0.5, 200)).toBeCloseTo(v, 0);
  });
  it('out of range and NaN stay on the slider', () => {
    expect(logToPos(1e9, 1.4, 22)).toBe(SLIDER_STEPS);
    expect(logToPos(NaN, 1.4, 22)).toBe(0);
    expect(posToLog(-50, 1.4, 22)).toBeCloseTo(1.4, 9);
    expect(posToLog(1e6, 1.4, 22)).toBeCloseTo(22, 6);
  });
  it('words', () => {
    expect(formatFNumber(2.8)).toBe('f/2.8');
    expect(formatFNumber(22)).toBe('f/22');
    expect(formatFocus(0.5)).toBe('0.5 BU');
    expect(formatFocus(120)).toBe('120 BU');
    expect(formatEV(1.5)).toBe('+1.5 EV');
    expect(formatEV(-0.25)).toBe('−0.25 EV');
    expect(formatEV(0)).toBe('0 EV');
  });
});
