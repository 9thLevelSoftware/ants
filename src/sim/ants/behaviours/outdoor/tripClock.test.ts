// The trip clock (engine.ts) bounds a whole trip, whatever chain of per-state timeouts, alternative sources and
// flees it went through (acceptance 4); and a trip that ended before the ant ever left the nest is not counted as
// a forager return (no trip statistics, no recruitment contact).

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { REASON_CODES } from '@/sim/types';
import { TRIP_LOST_S, TRIP_TURN_S } from '@/sim/balance/foraging';
import { requestTask } from '@/sim/colony';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { secondsToTicks } from '@/sim/time';
import { K, PHASE } from './keys';
import { announce } from './testkit';

function forager(): { sim: Sim; ant: Ant } {
  const sim = makeTestSim({
    sizeBu: 400, nest: 'small', workers: 2, seed: 5, systems: SYSTEMS.filter((s) => s.phase !== 'colony-allocation'),
    config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
  });
  const col = sim.state.colonies[0];
  const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: e.pos.x + 150 * sim.world.bu, y: 0, z: e.pos.z }, units: 50, stage: null });
  sim.applyPendingCommands();
  announce(sim, col, sim.state.sources[sim.state.sources.length - 1]);
  const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
  requestTask(sim, ant, 'forage', 'job:test');
  return { sim, ant };
}

/** Runs until the ant is outside on its way out, at least 30 BU from the entrance. */
function untilOutbound(sim: Sim, ant: Ant): void {
  const col = sim.state.colonies[0];
  const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
  for (let t = 0; t < 4000; t++) {
    if (ant.state === 'forage.wait') ant.activation = 1;
    sim.tick();
    if (ant.nestId < 0 && ant.bb[K.phase] === PHASE.outbound && Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z) > 30 * sim.world.bu) return;
  }
  throw new Error('the forager never got out');
}

/** Runs the next think of the ant (the runner's cadence: at most THINK_TRAVEL_TICKS / THINK_WAIT_TICKS away). */
function thinkNow(sim: Sim, ant: Ant): void {
  ant.thinkTick = sim.state.tick;
  sim.tick();
}

describe('trip clock', () => {
  it('turns an outward-bound ant home after TRIP_TURN_S outside, and loses it after TRIP_LOST_S', () => {
    const { sim, ant } = forager();
    untilOutbound(sim, ant);
    expect(ant.bb[K.out0]).toBeGreaterThanOrEqual(0);
    // the clock says it has been outside just past the turn bound (a long chain of detours): the game time jumps on
    const out0 = ant.bb[K.out0];
    sim.state.tick = out0 + secondsToTicks(TRIP_TURN_S) + 10;
    thinkNow(sim, ant);
    expect(ant.state).toBe('forage.return');
    expect(ant.mem.decisions[0].code).toBe(REASON_CODES.indexOf('timeout')); // the trip clock, not a curfew recall
    // still outside past the hard bound: lost
    sim.state.tick = out0 + secondsToTicks(TRIP_LOST_S) + 10;
    const died: string[] = [];
    sim.events.on('ant-died', (e) => { if (e.type === 'ant-died' && e.antId === ant.id) died.push(e.cause); });
    thinkNow(sim, ant);
    sim.tick();
    expect(ant.alive).toBe(false);
    expect(died).toEqual(['lost']);
  }, 120000);

  it('the clock stops at home: an ant back inside starts its next trip with a fresh clock', () => {
    const { sim, ant } = forager();
    untilOutbound(sim, ant);
    let sawInsideReset = false;
    for (let t = 0; t < 8000 && !sawInsideReset; t++) {
      if (ant.state === 'forage.wait') ant.activation = 1;
      sim.tick();
      if (ant.nestId >= 0 && ant.bb[K.phase] !== PHASE.outbound && ant.bb[K.out0] === -1) sawInsideReset = true;
    }
    expect(sawInsideReset).toBe(true);
  }, 120000);
});

describe('a trip that never left the nest', () => {
  it('is not booked as a forager return (no trips counted, no recruitment) and the ant waits again', () => {
    const { sim, ant } = forager();
    const col = sim.state.colonies[0];
    // until it starts a trip (outbound, still inside: taking the ration or walking to the exit)
    for (let t = 0; t < 4000 && !(ant.bb[K.phase] === PHASE.outbound && ant.nestId >= 0); t++) {
      if (ant.state === 'forage.wait') ant.activation = 1;
      sim.tick();
    }
    expect(ant.bb[K.phase]).toBe(PHASE.outbound);
    expect(ant.nestId).toBeGreaterThanOrEqual(0);
    const trips = col.counters.trips, antTrips = ant.mem.trips;
    // the outbound timeout fires before it got out (a blocked exit)
    ant.bb[K.phase0] = sim.state.tick - secondsToTicks(10000);
    ant.bb[K.ration] = 2;
    thinkNow(sim, ant);
    expect(ant.state).toBe('forage.wait');
    expect(col.counters.trips).toBe(trips);
    expect(ant.mem.trips).toBe(antTrips);
  }, 120000);
});
