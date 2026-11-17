// threats-live: a predator strike that lands on a player-colony ant raises `predator-near` (GDD 05 App. C:
// predator-strike feeds the alert), with the per-creature cooldown of 0.1 gd; before, a lone forager taken by a
// jumping spider (no possessed ant, fewer than 3 foragers near) raised nothing.
// threats-calibrate fix round: the strike-raised card clears PREDATOR_STRUCK_CLEAR_S after the strike, so a single
// strike never makes an I11 hour loud (it was held 30 s = 1.2 game-clock hours: creature soak quiet share 0).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PREDATOR_NEAR_COOLDOWN_GD, PREDATOR_STRUCK_CLEAR_S, QUIET_ALERT_SHARE } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '@/sim/time';
import { quietTracker } from './threat';
import { captureEvents, creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat({ realAlerts: true }).restore; });
afterEach(() => restore());

describe('predator-near from a landed strike', () => {
  it('a lone AI forager hit by a jumping spider raises the warning once per cooldown', () => {
    const sim = creatureScene({ seed: 8, director: true });
    setClock(sim, 'summer', 3, 13);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    ant.maxHp = ant.hp = 10;
    const spider = spawnAt(sim, 'jumping-spider', 135, 150, { state: 'scan' });
    const hits = captureEvents(sim, ['predator-strike']);
    step(sim, 600, () => hits.some((h) => (h.ev as { hit: boolean }).hit));
    expect(hits.some((h) => (h.ev as { hit: boolean }).hit)).toBe(true);
    step(sim, 10); // inside PREDATOR_STRUCK_CLEAR_S (the next test covers the clearing)
    const near = sim.state.progression.alerts.filter((a) => a.kind === 'predator-near');
    expect(near.length).toBe(1);
    expect(near[0].subjectId).toBe(spider.id);
    expect(near[0].level).toBe('warning');
    expect(spider.bb.alertTick - sim.state.tick).toBeLessThanOrEqual(Math.round(PREDATOR_NEAR_COOLDOWN_GD * TICKS_PER_DAY));
  });

  it('the strike-raised card clears PREDATOR_STRUCK_CLEAR_S after the strike and leaves the hour quiet', () => {
    const sim = creatureScene({ seed: 8, director: true });
    setClock(sim, 'summer', 3, 13);
    sim.state.progression.stage.id = 'growing';
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    ant.maxHp = ant.hp = 10;
    const spider = spawnAt(sim, 'jumping-spider', 135, 150, { state: 'scan' });
    const hits = captureEvents(sim, ['predator-strike']);
    step(sim, 600, () => hits.some((h) => (h.ev as { hit: boolean }).hit));
    const struckAt = hits.find((h) => (h.ev as { hit: boolean }).hit)!.tick;
    const raised = () => sim.state.progression.alerts.some((a) => a.kind === 'predator-near' && a.subjectId === spider.id);
    expect(raised()).toBe(true);
    const lifetime = Math.round(PREDATOR_STRUCK_CLEAR_S * TICKS_PER_SECOND);
    step(sim, struckAt + lifetime - 1 - sim.state.tick);
    expect(raised()).toBe(true);
    step(sim, 2);
    expect(raised()).toBe(false);
    expect(spider.bb.alertOn).toBe(0);
    // the cooldown still holds: no second card for the same spider within 0.1 gd
    expect(spider.bb.alertTick).toBeGreaterThan(sim.state.tick);
    // I11: one strike is shorter than QUIET_ALERT_SHARE of an hour, so the hours around it stay quiet
    expect(lifetime).toBeLessThan(QUIET_ALERT_SHARE * TICKS_PER_HOUR);
    step(sim, 3 * TICKS_PER_HOUR);
    const q = quietTracker(sim);
    const last = [1, 2, 3].map((k) => q.hours[(q.head - k + q.hours.length) % q.hours.length]);
    expect(last).toEqual([1, 1, 1]);
  });
});
