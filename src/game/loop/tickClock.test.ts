import { describe, expect, it } from 'vitest';
import { TickClock } from './tickClock';

describe('TickClock (fixed 0.1 s tick accumulator)', () => {
  it('owes speed x dt / 0.1 ticks and keeps the fraction as alpha', () => {
    const c = new TickClock();
    c.accumulate(0.05, 1);
    expect(c.run(() => {}, null).ran).toBe(0);
    expect(c.alpha).toBeCloseTo(0.5, 9);
    c.accumulate(0.06, 1);
    expect(c.run(() => {}, null).ran).toBe(1);
    expect(c.alpha).toBeCloseTo(0.1, 9);
  });

  it('runs 8 ticks per 0.1 s at 8x and clamps a long frame to 0.1 s', () => {
    const c = new TickClock();
    let n = 0;
    c.accumulate(0.1, 8);
    expect(c.run(() => n++, () => 0).ran).toBe(8);
    c.reset();
    c.accumulate(5, 1); // a 5 s hitch counts as 0.1 s
    expect(c.run(() => n++, () => 0).ran).toBe(1);
  });

  it('caps ticks per frame, stops at the millisecond budget and drops a backlog beyond 20 ticks', () => {
    const c = new TickClock({ maxTicksPerFrame: 4 });
    c.accumulate(0.1, 8);
    expect(c.run(() => {}, () => 0).ran).toBe(4);
    expect(c.acc).toBeCloseTo(4, 9);

    let t = 0;
    const slow = new TickClock();
    slow.accumulate(0.1, 8);
    const r = slow.run(() => { t += 6; }, () => t); // each tick costs 6 ms: the 10 ms budget allows 2
    expect(r.ran).toBe(2);
    expect(r.budgetHit).toBe(true);

    const behind = new TickClock({ maxTicksPerFrame: 1 });
    for (let i = 0; i < 4; i++) behind.accumulate(0.1, 8);
    const d = behind.run(() => {}, () => 0);
    expect(d.ran).toBe(1);
    expect(d.dropped).toBe(31);
    expect(behind.behind).toBe(true);
    expect(behind.acc).toBeLessThan(1);
  });

  it('without a clock caps at 4 ticks per frame (GDD 06 §4.4 fallback)', () => {
    const c = new TickClock();
    c.accumulate(0.1, 8);
    expect(c.run(() => {}, null).ran).toBe(4);
  });

  it('ignores zero speed, negative and NaN dt', () => {
    const c = new TickClock();
    c.accumulate(0.1, 0);
    c.accumulate(-1, 1);
    c.accumulate(Number.NaN, 1);
    expect(c.acc).toBe(0);
  });
});
