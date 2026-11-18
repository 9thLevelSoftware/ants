import { describe, expect, it } from 'vitest';
import type { UiFocusAim } from '../api';
import { FOCUS_LINE_REAL_S, FocusLineClock } from './focusLine';

const aim = (id: string, newColony = false): UiFocusAim => ({ id, species: 'lasius-niger', openedTick: 0, newColony });

describe('Focus line visibility', () => {
  it('Never hides it, Always shows it whenever there is an aim', () => {
    const c = new FocusLineClock();
    c.note(aim('aim-a'), 0);
    expect(c.visible('never', aim('aim-a', true), 0)).toBe(false);
    expect(c.visible('always', aim('aim-a'), 1e9)).toBe(true);
    expect(c.visible('always', null, 0)).toBe(false);
  });
  it('Auto: shown through the first game days of a new colony', () => {
    const c = new FocusLineClock();
    c.note(aim('aim-a', true), 0);
    expect(c.visible('auto', aim('aim-a', true), 5e6)).toBe(true);
    expect(c.visible('auto', aim('aim-a', false), 5e6)).toBe(false);
  });
  it('Auto: a NEW aim shows for 30 real seconds, the aim that was open at the start does not', () => {
    const c = new FocusLineClock();
    c.note(aim('aim-a'), 0);
    expect(c.visible('auto', aim('aim-a'), 1000)).toBe(false);
    c.note(aim('aim-b'), 10_000);
    expect(c.visible('auto', aim('aim-b'), 10_000)).toBe(true);
    expect(c.visible('auto', aim('aim-b'), 10_000 + FOCUS_LINE_REAL_S * 1000 - 1)).toBe(true);
    expect(c.visible('auto', aim('aim-b'), 10_000 + FOCUS_LINE_REAL_S * 1000)).toBe(false);
    expect(c.msLeft(10_000 + 5000)).toBe(FOCUS_LINE_REAL_S * 1000 - 5000);
  });
  it('Auto: no aim, nothing; a repeated note of the same aim does not restart the window', () => {
    const c = new FocusLineClock();
    c.note(null, 0);
    c.note(aim('aim-b'), 1000);
    c.note(aim('aim-b'), 20_000);
    expect(c.msLeft(20_000)).toBe(11_000);
    expect(c.visible('auto', null, 2000)).toBe(false);
  });
});
