import { describe, expect, it } from 'vitest';
import { SpeedMeter, stepDownSpeed } from './speedMeter';

/** Feeds `seconds` of 60 Hz frames running `tps` ticks per real second at `speed`; returns the first step-down. */
function run(m: SpeedMeter, seconds: number, tps: number, speed: 1 | 2 | 4 | 8): { at: number; to: number } | null {
  const dt = 1 / 60;
  let owed = 0;
  for (let t = 0; t < seconds; t += dt) {
    owed += tps * dt;
    const ticks = Math.floor(owed);
    owed -= ticks;
    const r = m.frame(dt, ticks, speed);
    if (r !== null) return { at: t, to: r };
  }
  return null;
}

describe('SpeedMeter (honest speed reporting, GDD 06 §4.4)', () => {
  it('reports the achieved speed', () => {
    const m = new SpeedMeter();
    expect(run(m, 12, 40, 4)).toBeNull();
    expect(m.effective).toBeCloseTo(4, 1);
    const r = m.report(4);
    expect(r.lagging).toBe(false);
  });

  it('steps 8x down to 4x after 3 s below 85 % (once the 10 s grace of the raise is over)', () => {
    const m = new SpeedMeter();
    const r = run(m, 20, 50, 8); // 5x achieved at 8x requested
    expect(r).not.toBeNull();
    expect(r!.to).toBe(4);
    expect(r!.at).toBeGreaterThan(9.9); // grace after the player chose 8x
    expect(m.report(8).lagging).toBe(true);
  });

  it('never steps below 1x; at 1x it reports running below real time', () => {
    const m = new SpeedMeter();
    expect(run(m, 20, 7, 1)).toBeNull();
    expect(m.report(1).belowRealTime).toBe(true);
  });

  it('stepDownSpeed goes one notch', () => {
    expect([8, 4, 2, 1].map((s) => stepDownSpeed(s as 1 | 2 | 4 | 8))).toEqual([4, 2, 1, 1]);
  });
});
