// The `winter-coming` notice (colony-life direction 14, seam found by the interface engineer): with stores for more
// days than the winter the text read "stores cover 28 of 7 days". The sim passes the days of cover clamped to the
// winter's length, a flag for "more than the winter", and the unclamped number (template: src/content/text/alerts.ts).
import { describe, expect, it } from 'vitest';
import { calendarTickAt, seasonLength } from '@/sim/time';
import { colonyOf, makeLifeSim, send, step } from '../succession/testLife';
import { storeDays, winterNoticeTokens } from './system';

describe('winter-coming notice tokens', () => {
  it('clamps the days of cover to the winter and flags the surplus', () => {
    expect(winterNoticeTokens(28, 7)).toEqual({ x: 7, winterDays: 7, more: 1, coverDays: 28 });
    expect(winterNoticeTokens(7, 7)).toEqual({ x: 7, winterDays: 7, more: 0, coverDays: 7 });
    expect(winterNoticeTokens(3, 7)).toEqual({ x: 3, winterDays: 7, more: 0, coverDays: 3 });
  });

  it('a colony with stores for many winters raises "7 of 7" and the flag, not "x of 7" with x > 7', () => {
    const sim = makeLifeSim({ c: 400 });
    const L = seasonLength(sim.state);
    // autumn, the day before the winter, just before the notice hour
    send(sim, { type: 'cheat.setTime', tick: calendarTickAt('autumn', L - 1, 11.9, sim.state.config) });
    expect(storeDays(sim, colonyOf(sim))).toBeGreaterThan(L);
    step(sim, 600);
    const a = sim.state.progression.alerts.find((x) => x.kind === 'winter-coming');
    expect(a, 'winter-coming raised').toBeDefined();
    expect(a!.tokens).toMatchObject({ x: L, winterDays: L, more: 1 });
    expect(Number(a!.tokens!.coverDays)).toBeGreaterThan(L);
  });
});
