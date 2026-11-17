// threats-live: a predator strike that lands on a player-colony ant raises `predator-near` (GDD 05 App. C:
// predator-strike feeds the alert), with the per-creature cooldown of 0.1 gd; before, a lone forager taken by a
// jumping spider (no possessed ant, fewer than 3 foragers near) raised nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PREDATOR_NEAR_COOLDOWN_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
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
    step(sim, 50);
    const near = sim.state.progression.alerts.filter((a) => a.kind === 'predator-near');
    expect(near.length).toBe(1);
    expect(near[0].subjectId).toBe(spider.id);
    expect(near[0].level).toBe('warning');
    expect(spider.bb.alertTick - sim.state.tick).toBeLessThanOrEqual(Math.round(PREDATOR_NEAR_COOLDOWN_GD * TICKS_PER_DAY));
  });
});
