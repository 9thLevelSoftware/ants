// Alarm and recruitment (GDD 05 §4.5; acceptance criterion 4): release-alarm in a fight recruits nestmates within
// 10 L, not beyond, within the recruitment scan; alarmLevel halves every 10 s; bites raise a 6 L / +0.5 burst with
// a 1.0 ph deposit; the recruit cap holds.
import { describe, expect, it } from 'vitest';
import { begin } from '@/sim/ants/actions';
import { ant, arena, faceToFace, MANUAL_TASK, record, setFlags, step, stepUntil } from './testkit';
import { beginGrapple, recruitCap, resolveBite } from './index';

describe('alarm recruitment (criterion 4)', () => {
  it('release-alarm in a fight: nestmates within 10 L join within 1 s, those beyond do not', () => {
    const a = arena({ seed: 3, flags: { noRetreat: true } });
    const [p, q] = faceToFace(a);
    setFlags(a.sim, { noRng: true });
    beginGrapple(a.sim, p.id, 'ant', q.id);
    beginGrapple(a.sim, q.id, 'ant', p.id);
    setFlags(a.sim, { noRng: false });
    const L = 1; // worker length, BU
    const near = ant(a.sim, a.home, 40, 40 + 9 * L);
    const far = ant(a.sim, a.home, 40, 40 - 11 * L);
    near.task = MANUAL_TASK; far.task = MANUAL_TASK;
    a.sim.index.refresh();
    const raised = record(a.sim, ['alarm-raised']);
    expect(begin(a.sim, p, 'release-alarm', null)).toBe(true);
    const t = stepUntil(a.sim, () => near.task === 'fight', 20);
    expect(t).toBeLessThanOrEqual(15); // 0.5 s primitive + one scan interval
    expect(near.task).toBe('fight');
    expect(far.task).toBe(MANUAL_TASK);
    expect(far.alarmLevel).toBe(0);
    a.sim.events.flush();
    expect(raised.some((e) => e.source === 'release-alarm' && e.colonyId === a.home)).toBe(true);
    // the recruit runs to the fight and joins it
    stepUntil(a.sim, () => !!near.combat?.lock || (near.bb['cb.ti'] === q.id && Math.hypot(near.pos.x - q.pos.x, near.pos.z - q.pos.z) < 8), 200);
    expect(near.bb['cb.ti']).toBe(q.id);
  });

  it('alarmLevel decays with a 10 s half-life', () => {
    const a = arena({ manual: true });
    const w = ant(a.sim, a.home, 20, 20);
    w.alarmLevel = 1;
    step(a.sim, 100);
    expect(w.alarmLevel).toBeCloseTo(0.5, 3);
    step(a.sim, 100);
    expect(w.alarmLevel).toBeCloseTo(0.25, 3);
  });

  it('a bite raises the bitten burst: +0.5 to nestmates within 6 L and 1.0 ph of alarm at the victim', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const [p, q] = faceToFace(a);
    const mate = ant(a.sim, a.rival, 40, 45);
    const away = ant(a.sim, a.rival, 40, 47.5);
    a.sim.index.refresh();
    const deposits: number[] = [];
    const real = a.sim.phero.deposit.bind(a.sim.phero);
    a.sim.phero.deposit = (c, ch, pos, amt) => { if (ch === 'alarm' && c === a.rival) deposits.push(amt); real(c, ch, pos, amt); };
    expect(resolveBite(a.sim, p, 'ant', q.id, false)).toBe(1);
    expect(deposits).toEqual([1]);
    expect(q.alarmLevel).toBeCloseTo(0.5, 9);
    expect(mate.alarmLevel).toBeCloseTo(0.5, 9);
    expect(away.alarmLevel).toBe(0);
  });

  it('recruit cap: max(10, 25 % of workers)', () => {
    const a = arena({ seed: 5, flags: { noRetreat: true } });
    const col = a.sim.stores.colonies.get(a.home)!;
    const [p, q] = faceToFace(a);
    const mates = Array.from({ length: 20 }, (_, i) => ant(a.sim, a.home, 34 + (i % 5) * 1.5, 34 + Math.floor(i / 5) * 1.5));
    for (const m of mates) m.task = MANUAL_TASK;
    a.sim.index.refresh();
    expect(recruitCap(col, false)).toBe(10);
    setFlags(a.sim, { noRng: true });
    beginGrapple(a.sim, q.id, 'ant', p.id);
    setFlags(a.sim, { noRng: false });
    begin(a.sim, p, 'release-alarm', null);
    step(a.sim, 15);
    const fighting = [p, ...mates].filter((m) => m.task === 'fight').length;
    expect(fighting).toBeLessThanOrEqual(10);
    expect(mates.filter((m) => m.task === 'fight').length).toBeGreaterThanOrEqual(8);
  });
});
