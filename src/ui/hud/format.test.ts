import { describe, expect, it } from 'vitest';
import { casteCount, clock, cap, dateLine, degrees, effectiveRate, gameDays, loads, pct } from './format';
import { matchesAction } from './hotkeys';
import { defaultBindings } from '@/input';
import { setCurrentBindings } from '../components';

describe('HUD formats (GDD 08 2.2)', () => {
  it('loads: one decimal below 10, integers above', () => {
    expect(loads(7.44)).toBe('7.4');
    expect(loads(0.04)).toBe('0.0');
    expect(loads(126.3)).toBe('126');
    expect(loads(9.96)).toBe('10');
  });
  it('temperatures, clock, date, percent, days', () => {
    expect(degrees(21.4)).toBe('21 °C');
    expect(clock(7, 5)).toBe('07:05');
    expect(dateLine('spring', 3, 1)).toBe('Spring · Day 3 · Year 1');
    expect(pct(0.826)).toBe('83 %');
    expect(pct(2)).toBe('100 %');
    expect(gameDays(0.46)).toBe('0.5 game days');
    expect(cap('rain')).toBe('Rain');
  });
});

describe('hotkeys read the current bindings', () => {
  const ev = (code: string, shift = false) => ({ code, shiftKey: shift }) as KeyboardEvent;
  it('matches the default I and L, and follows a rebind', () => {
    const b = defaultBindings();
    setCurrentBindings(b);
    expect(matchesAction(ev('KeyI'), 'directives')).toBe(true);
    expect(matchesAction(ev('KeyL'), 'roster')).toBe(true);
    expect(matchesAction(ev('KeyJ'), 'roster')).toBe(false);
    setCurrentBindings({ ...b, kbm: { ...b.kbm, roster: [{ kind: 'key', code: 'KeyJ' }, null] } });
    expect(matchesAction(ev('KeyJ'), 'roster')).toBe(true);
    expect(matchesAction(ev('KeyL'), 'roster')).toBe(false);
    setCurrentBindings(b);
  });
  it('effective speed: one decimal, no trailing zero (GDD 01 section 8)', () => {
    expect(effectiveRate(5.62)).toBe('5.6x');
    expect(effectiveRate(8)).toBe('8x');
    expect(effectiveRate(0.5)).toBe('0.5x');
  });
  it('caste counts are pluralised', () => {
    expect(casteCount(40, 'worker')).toBe('40 workers');
    expect(casteCount(1, 'worker')).toBe('1 worker');
    expect(casteCount(3, 'gyne')).toBe('3 gynes');
    expect(casteCount(2, 'male')).toBe('2 males');
    expect(casteCount(2, 'larva-thing')).toBe('2 larva-things');
  });
});
