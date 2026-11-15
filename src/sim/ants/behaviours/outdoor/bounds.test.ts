// Acceptance 4: every forager or scout that leaves returns or dies of a recorded cause within a bound, and no
// outdoor-task ant stays in a state longer than that state's timeout (5 game hours asked; several seeds). The bound
// of a whole trip is the trip clock's TRIP_LOST_S, so the run is longer than that bound (otherwise the trip checks
// could not fail), and in these ordinary scenarios no ant should need the hard bound at all (no `lost` deaths).

import { describe, expect, it } from 'vitest';
import {
  COLLECT_MAX_S, DELIVER_MAX_S, FLEE_CLEAR_S, FLEE_RUN_S, INVESTIGATE_S, OUTBOUND_MAX_S, QUEUE_S, REST_MAX_S,
  RETURN_LOST_S, SCOUT_DEPART_MAX_S, SCOUT_MAX_S, SEARCH_S, TRIP_LOST_S, TRIP_TURN_S, WAIT_REEVAL_S,
} from '@/sim/balance/foraging';
import { announce, countEvents, forageScenario, run, StateTracker } from './testkit';

/** Think and action slack on top of a state's own timeout, s. */
const SLACK_S = 15;
const TIMEOUT_S: Record<string, number> = {
  'forage.wait': WAIT_REEVAL_S, 'tend.wait': WAIT_REEVAL_S, rest: REST_MAX_S,
  'forage.outbound': OUTBOUND_MAX_S, 'forage.search': SEARCH_S, 'forage.queue': QUEUE_S, 'forage.collect': COLLECT_MAX_S,
  'forage.return': RETURN_LOST_S, 'forage.deliver': DELIVER_MAX_S,
  'scout.depart': SCOUT_DEPART_MAX_S, 'scout.explore': SCOUT_MAX_S, 'scout.investigate': INVESTIGATE_S, 'scout.assess': 1,
  'scout.collect': COLLECT_MAX_S, 'scout.return': RETURN_LOST_S, 'scout.report': DELIVER_MAX_S,
  'flee.run': FLEE_RUN_S, 'flee.freeze': FLEE_CLEAR_S,
};
/** A trip outside is bounded by the trip clock (engine.ts) plus think and sampling slack. */
const TRIP_MAX_S = TRIP_LOST_S + SLACK_S;
/** 5 game hours are only 1,250 ticks; the run covers 100 game hours (four game days), longer than TRIP_MAX_S. */
const HOURS = 100;
const TICKS = HOURS * 250;
const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;
/** Default mode: one seed (about 40 s under load); FOUNDRESS_LONG=1: three. */
const SEEDS = LONG ? [1, 2, 3] : [1];

describe('acceptance 4: bounded trips and states', () => {
  it.each(SEEDS)(`seed %i: ${HOURS} game hours`, (seed) => {
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
    expect(TICKS / 10).toBeGreaterThan(TRIP_MAX_S);
    for (const d of deaths) expect(d.type === 'ant-died' && typeof d.cause === 'string').toBe(true);
    const lost = deaths.filter((d) => d.type === 'ant-died' && d.cause === 'lost').length;
    expect(lost, 'ants lost by the trip clock').toBe(0);
    // turned home by the trip clock: rare, and only after TRIP_TURN_S outside
    const longest = Math.max(0, ...track.trips.filter((t) => !t.died).map((t) => (t.inTick - t.outTick) / 10));
    console.log(`seed ${seed}: longest completed trip ${longest.toFixed(0)} s (turn at ${TRIP_TURN_S} s, lost at ${TRIP_LOST_S} s)`);
    expect(track.trips.length).toBeGreaterThan(10);
  }, 300000);
});
