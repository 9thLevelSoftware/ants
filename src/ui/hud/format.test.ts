import { describe, expect, it } from 'vitest';
import { clock, cap, dateLine, degrees, gameDays, loads, pct } from './format';
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
});
