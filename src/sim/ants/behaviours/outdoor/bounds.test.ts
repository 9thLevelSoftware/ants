// Acceptance 4: every forager or scout that leaves returns or dies of a recorded cause within a bound, and no
// outdoor-task ant stays in a state longer than that state's timeout (5 game hours, several seeds).

import { describe, expect, it } from 'vitest';
import {
  COLLECT_MAX_S, DELIVER_MAX_S, FLEE_CLEAR_S, FLEE_RUN_S, INVESTIGATE_S, OUTBOUND_MAX_S, QUEUE_S, REST_MAX_S,
  RETURN_LOST_S, SCOUT_MAX_S, SEARCH_S, WAIT_REEVAL_S,
} from '@/sim/balance/foraging';
import { announce, countEvents, forageScenario, run, StateTracker } from './testkit';

/** Think and action slack on top of a state's own timeout, s. */
const SLACK_S = 15;
const TIMEOUT_S: Record<string, number> = {
  'forage.wait': WAIT_REEVAL_S, 'tend.wait': WAIT_REEVAL_S, rest: REST_MAX_S,
  'forage.outbound': OUTBOUND_MAX_S, 'forage.search': SEARCH_S, 'forage.queue': QUEUE_S, 'forage.collect': COLLECT_MAX_S,
  'forage.return': RETURN_LOST_S, 'forage.deliver': DELIVER_MAX_S,
  'scout.depart': SCOUT_MAX_S / 5, 'scout.explore': SCOUT_MAX_S, 'scout.investigate': INVESTIGATE_S, 'scout.assess': 1,
  'scout.collect': COLLECT_MAX_S, 'scout.return': RETURN_LOST_S, 'scout.report': DELIVER_MAX_S,
  'flee.run': FLEE_RUN_S, 'flee.freeze': FLEE_CLEAR_S,
};
/** A trip outside is bounded by outbound + search + queue + collect + return. */
const TRIP_MAX_S = OUTBOUND_MAX_S + SEARCH_S + QUEUE_S + COLLECT_MAX_S + RETURN_LOST_S + 4 * SLACK_S;
/** 5 game hours are only 1,250 ticks; the run covers 50 game hours (about two game days) to be stricter. */
const HOURS = 50;
const TICKS = HOURS * 250;

describe('acceptance 4: bounded trips and states', () => {
  it.each([1, 2, 3])('seed %i: 50 game hours', (seed) => {
    const { sim, col, sources } = forageScenario({
      seed,
      sources: [
        { kind: 'sugar', variant: 'sugary-spill', distBu: 100, bearingDeg: 20, units: 300 },
        { kind: 'carrion', variant: 'insect-medium', distBu: 150, bearingDeg: 200, units: 1 },
        { kind: 'sugar', variant: 'sugar-granules', distBu: 120, bearingDeg: 110, units: 120 },
      ],
    });
    for (const s of sources) announce(sim, col, s);
    const ev = countEvents(sim, ['ant-died']);
    const track = new StateTracker(sim);
    run(sim, TICKS, 10, () => track.sample());
    track.sample();
    const deaths = ev.kept.filter((e) => e.type === 'ant-died');
    console.log(`seed ${seed}: trips ${track.trips.length}, longest ${Math.max(0, ...track.trips.map((t) => (t.inTick - t.outTick) / 10)).toFixed(0)} s,`,
      'max state s', JSON.stringify(track.maxStateS), 'events', JSON.stringify(ev.n));
    for (const [state, s] of Object.entries(track.maxStateS)) {
      const limit = TIMEOUT_S[state];
      expect(limit, `state ${state} has a timeout`).toBeDefined();
      expect(s, `longest ${state}`).toBeLessThanOrEqual(limit + SLACK_S);
    }
    for (const t of track.trips) expect((t.inTick - t.outTick) / 10).toBeLessThanOrEqual(TRIP_MAX_S);
    for (const o of track.outside()) {
      const a = sim.stores.ants.get(o.antId);
      if (!a || (a.task !== 'forage' && a.task !== 'scout' && a.task !== 'tend')) continue;
      expect((sim.state.tick - o.outTick) / 10, `ant ${o.antId} outside`).toBeLessThanOrEqual(TRIP_MAX_S);
    }
    for (const d of deaths) expect(d.type === 'ant-died' && typeof d.cause === 'string').toBe(true);
    expect(track.trips.length).toBeGreaterThan(10);
  }, 300000);
});
