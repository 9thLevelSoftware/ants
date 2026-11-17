// The human-event warning card (quiet-time, GDD 05 I11): raised only while the player's ants are in the path of an
// impact due soon, one card per site, never held longer than HUMAN_ALERT_MAX_S, cleared when the ants are out of the
// path or the event ends; the telegraph cues are unchanged. A save in the middle of a card loads and continues equal.

import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { stateHash } from '@/sim/save/hash';
import { HUMAN_ALERT_MAX_S } from '@/sim/balance/human';
import { TICKS_PER_HOUR, TICKS_PER_SECOND } from '@/sim/time';
import type { Sim } from '@/sim/types';
import { humanEventsSystem } from './index';
import { humanPlan } from './plans';
import { humanSites } from './sites';
import { humanSim, patioWorld, placeWorker, scheduleNow } from './testkit';

interface Card { site: number; raised: number; cleared: number }

/** Records every human-event-warning raise and clear with its tick. */
function watch(sim: Sim): Card[] {
  const cards: Card[] = [];
  sim.events.on('alert', (e) => {
    if (e.alert.kind !== 'human-event-warning') return;
    if (e.op === 'raise') cards.push({ site: e.alert.subjectId, raised: sim.state.tick, cleared: -1 });
    else if (e.op === 'clear') { const c = [...cards].reverse().find((x) => x.site === e.alert.subjectId && x.cleared < 0); if (c) c.cleared = sim.state.tick; }
  });
  return cards;
}

function patioPass() {
  const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 6000 }));
  const lane = humanSites(sim.world).list.find((s) => s.kind === 'patio-lane')!;
  const inst = scheduleNow(sim, 'footsteps', 'adult', lane.id, null);
  return { sim, lane, inst, plan: humanPlan(sim, inst)! };
}

const runUntilIdle = (sim: Sim, max = 2500): void => {
  let seen = false;
  for (let i = 0; i < max; i++) {
    sim.tick();
    if (sim.state.env.human.active.length > 0) seen = true;
    else if (seen) break;
  }
};

describe('human-event warning card', () => {
  it('no ants on the surface: no card, the telegraph still plays', () => {
    const { sim } = patioPass();
    const cards = watch(sim);
    let telegraphs = 0;
    sim.events.on('human.telegraph', () => { telegraphs++; });
    runUntilIdle(sim);
    expect(cards).toEqual([]);
    expect(telegraphs).toBeGreaterThan(0);
    expect(sim.state.progression.alerts.filter((a) => a.kind === 'human-event-warning')).toEqual([]);
  });

  it('ants far from the path: no card', () => {
    const { sim, plan } = patioPass();
    const cards = watch(sim);
    const fp = plan.impacts[0].fp;
    for (let i = 0; i < 5; i++) placeWorker(sim, fp.x + 2500 + i * 50, fp.z + 2500);
    runUntilIdle(sim);
    expect(cards).toEqual([]);
  });

  it('ants in the path: one card per site, up before the first impact that reaches them, up for at most the cap', () => {
    const { sim, plan, lane } = patioPass();
    const cards = watch(sim);
    const mid = plan.impacts[Math.floor(plan.impacts.length / 2)];
    const id = placeWorker(sim, mid.fp.x, mid.fp.z);
    expect(id).toBeGreaterThanOrEqual(0);
    const impactTick = sim.state.tick + mid.t;
    runUntilIdle(sim);
    expect(cards.length).toBe(1);
    const c = cards[0];
    expect(c.site).toBe(lane.id);
    expect(c.raised).toBeLessThanOrEqual(impactTick + 2);
    expect(c.raised).toBeGreaterThanOrEqual(impactTick - 3 * TICKS_PER_SECOND - 10);
    expect(c.cleared).toBeGreaterThan(c.raised);
    expect(c.cleared - c.raised).toBeLessThanOrEqual(HUMAN_ALERT_MAX_S * TICKS_PER_SECOND + 1);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'human-event-warning')).toBe(false);
  });

  it('a long event with ants in its path never holds a card longer than the cap, and cards of a site are an hour apart', () => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 3000 }));
    const lawn = humanSites(sim.world).list.find((s) => s.kind === 'lawn-mown')!;
    const inst = scheduleNow(sim, 'mowing', 'reel', lawn.id, null);
    const plan = humanPlan(sim, inst)!;
    // ants parked at several places along the run: each comes into the path at a different time
    for (let k = 1; k <= 6; k++) {
      const fp = plan.impacts[Math.floor((plan.impacts.length * k) / 7)].fp;
      placeWorker(sim, fp.x, fp.z);
    }
    const cards = watch(sim);
    runUntilIdle(sim, 5000);
    expect(plan.endT).toBeGreaterThan(TICKS_PER_HOUR); // the event spans more than an hour: the old card would be one long loud stretch
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.cleared).toBeGreaterThan(c.raised);
      expect(c.cleared - c.raised).toBeLessThanOrEqual(HUMAN_ALERT_MAX_S * TICKS_PER_SECOND + 1);
    }
    for (let i = 1; i < cards.length; i++) expect(cards[i].raised - cards[i - 1].cleared).toBeGreaterThanOrEqual(TICKS_PER_HOUR - 1);
  });

  it('a save in the middle of a card loads and continues identically', () => {
    const { sim, plan } = patioPass();
    const mid = plan.impacts[Math.floor(plan.impacts.length / 2)];
    placeWorker(sim, mid.fp.x, mid.fp.z);
    for (let i = 0; i < 2000 && !sim.state.progression.alerts.some((a) => a.kind === 'human-event-warning'); i++) sim.tick();
    expect(sim.state.progression.alerts.some((a) => a.kind === 'human-event-warning')).toBe(true);
    const b = createSim(restore(snapshot(sim)).state, sim.world, { systems: [humanEventsSystem] });
    for (let i = 0; i < 600; i++) { sim.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(sim.state));
  });
});
