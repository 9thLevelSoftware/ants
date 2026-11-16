// Reviewer tests (task overwinter-repro): the flight-day rule as the player meets it (release prompt and command),
// policies, demotion at pupation, eviction of leftover alates. Failing tests demonstrate a defect (see the report).
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { daysToTicks, TICKS_PER_HOUR } from '@/sim/time';
import { ALATE_EXPIRE_P_RECOVERY, ALATE_P_SHARE } from '@/sim/balance/lifecycle';
import { addBrood, addChamber } from '../testkit';
import { colonyOf, makeLifeSim, send, step } from '../succession/testLife';
import { alateCost } from './gate';
import { checkDemotion } from './rearing';

/** Waiting alates next to the queen. */
function addWaiting(sim: Sim, gynes: number, males: number): void {
  const col = colonyOf(sim);
  const q = sim.stores.ants.get(col.queenId)!;
  for (let i = 0; i < gynes + males; i++) {
    const a = spawnAnt(sim, { colony: col.id, caste: i < gynes ? 'gyne' : 'male', pos: { ...q.pos }, nestId: q.nestId, chamberId: q.chamberId });
    a.alate!.state = 'waiting';
  }
}

/** Calendar tick of default-year day `doy` (1-based) at `hour`. */
const at = (doy: number, hour: number): number => daysToTicks(doy - 1) + Math.round(hour * TICKS_PER_HOUR);

describe('flight launches only on a valid day (reviewer)', () => {
  // DEFECT: `flightRelease` launches whenever alates wait, whatever the day, hour and weather (no check of the open
  // `ask` offer or of the day's conditions), so a stale prompt or a scripted command flies the alates in the rain.
  it('flightRelease in the rain inside the flight window is refused', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    addWaiting(sim, 4, 6);
    send(sim, { type: 'cheat.setTime', tick: at(10, 15) });
    send(sim, { type: 'cheat.setWeather', state: 'rain', intensityClass: null });
    send(sim, { type: 'flightRelease' });
    expect(colonyOf(sim).lifecycle!.flights).toHaveLength(0);
  });

  it('flightRelease outside the flight window (doy 15) is refused', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    addWaiting(sim, 4, 6);
    send(sim, { type: 'cheat.setTime', tick: at(15, 15) });
    send(sim, { type: 'cheat.setWeather', state: 'clear', intensityClass: null });
    send(sim, { type: 'flightRelease' });
    expect(colonyOf(sim).lifecycle!.flights).toHaveLength(0);
  });

  it('policy hold: a full window of launch hours in clear weather neither launches nor asks', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    colonyOf(sim).directives.alatePolicy = 'hold';
    addWaiting(sim, 2, 3);
    send(sim, { type: 'cheat.setTime', tick: at(10, 13) });
    send(sim, { type: 'cheat.setWeather', state: 'clear', intensityClass: null });
    step(sim, Math.round(6 * TICKS_PER_HOUR));
    const book = colonyOf(sim).lifecycle!.repro;
    expect(colonyOf(sim).lifecycle!.flights).toHaveLength(0);
    expect(book.askTick).toBe(-1);
  });

  it('policy auto-release in the rain: rolled once, p 0, no launch', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    colonyOf(sim).directives.alatePolicy = 'auto-release';
    addWaiting(sim, 2, 3);
    send(sim, { type: 'cheat.setTime', tick: at(10, 13) });
    send(sim, { type: 'cheat.setWeather', state: 'rain', intensityClass: null });
    step(sim, Math.round(6 * TICKS_PER_HOUR));
    const book = colonyOf(sim).lifecycle!.repro;
    expect(book.rollDay).toBeGreaterThanOrEqual(0);
    expect(book.lastP).toBe(0);
    expect(colonyOf(sim).lifecycle!.flights).toHaveLength(0);
  });
});

describe('demotion at the pupal checkpoint (reviewer, GDD 06 §11.3)', () => {
  it('a gyne larva fed below 0.6 of its need pupates as a worker and the cost is booked; at 0.6 or more it stays', () => {
    const sim = makeLifeSim({ workers: 10, chamberC: 25, larvae: 0 });
    const col = colonyOf(sim);
    const q = sim.stores.ants.get(col.queenId)!;
    const ch = addChamber(sim, 'nursery', { x: q.pos.x - 30, y: q.pos.y - 40, z: q.pos.z });
    addBrood(sim, 'pupa', 2, ch, 0, 'gyne');
    const [low, ok] = sim.state.brood.filter((b) => b.alive && b.destined === 'gyne');
    const need = alateCost(LASIUS_NIGER, 'gyne');
    low.fedC = 0.25 * need * 0.25; low.fedP = 0.25 * need * 0.75; // 25 %
    ok.fedC = 0.7 * need * 0.25; ok.fedP = 0.7 * need * 0.75; // 70 %
    checkDemotion(sim, low);
    checkDemotion(sim, ok);
    expect(low.destined).toBe('worker');
    expect(ok.destined).toBe('gyne');
    expect(col.lifecycle!.repro.demoted).toBe(1);
    expect(col.lifecycle!.repro.shortfallLoads).toBeCloseTo(0.25 * need, 6);
  });
});

describe('leftover alates (reviewer, GDD 06 §11.3)', () => {
  it('unreleased alates are evicted ALATE_EXPIRE_GD after the window closes; 40 % of their protein is recovered', () => {
    const sim = makeLifeSim({ workers: 10, chamberC: 25 });
    colonyOf(sim).directives.alatePolicy = 'hold';
    addWaiting(sim, 2, 3);
    // the window (doy 9-13) closes at the end of doy 13: eviction 3 GD later, at doy 17 00:00
    send(sim, { type: 'cheat.setTime', tick: at(16, 20) });
    step(sim, 20);
    expect(sim.state.ants.filter((a) => a.alive && a.alate)).toHaveLength(5); // doy 16: not yet
    const p0 = colonyOf(sim).stores.p;
    send(sim, { type: 'cheat.setTime', tick: at(17, 1) });
    step(sim, 20);
    expect(sim.state.ants.filter((a) => a.alive && a.alate)).toHaveLength(0);
    const want = ALATE_EXPIRE_P_RECOVERY * ALATE_P_SHARE * (2 * alateCost(LASIUS_NIGER, 'gyne') + 3 * alateCost(LASIUS_NIGER, 'male'));
    // the colony also eats protein over these ticks: the recovered amount shows as at least most of `want`
    expect(colonyOf(sim).stores.p - p0).toBeGreaterThan(want * 0.8);
  });
});
