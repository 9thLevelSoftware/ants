// Independent review of colony-life round 3, fix H2b ("ants walking home empty after a failed trip hunt the prey they
// meet", hunt.ts HUNT_ON_RETURN). The round's test (hunt.test.ts case 4) turns a fresh outbound forager home with the
// reason `timeout`; its trip clock is a few seconds old. In a game an ant goes home for `timeout` only when its trip
// clock has passed TRIP_TURN_S (engine.ts tripClock). This test gives the ant such a clock and watches the chase.
//
// What it shows: the hunt phase counts as "away from home" for the trip clock, so on the next think the clock sends
// the ant home again (`timeout`, which drops the bite under way); the next think huntCheck starts the chase again. The
// ant flips hunt <-> return every think (0.5 s) instead of chasing; the chase's own 20 s limit (phase time) never
// runs out. The control: the same ant with a young trip clock, sent home for `trail-lost`, chases without flipping.

import { describe, expect, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { despawnCreature } from '@/sim/entities';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { TRIP_TURN_S } from '@/sim/balance/foraging';
import { TICKS_PER_SECOND } from '@/sim/time';
import { forageScenario, run } from './testkit';
import { FORAGE } from './flavours';
import { K, PHASE } from './keys';
import { startReturn } from './transitions';

function addPatch(sim: ReturnType<typeof forageScenario>['sim'], at: { x: number; z: number }, distBu: number, rBu: number, k: number) {
  const bu = sim.world.bu, x = at.x + distBu * bu, z = at.z;
  const p: PreyPatch = { id: sim.state.nextId++, center: { x, y: sim.field.height(x, z), z }, radius: rBu * bu, kind: 'springtail', count: k, k };
  sim.state.ecology.preyPatches.push(p);
  return p;
}

interface Watch { flips: number; huntTicks: number; longestHunt: number; bites: number }  // bites = hits landed by the ant

/** An outbound forager is turned home for `reason` with a trip clock `ageS` old; a springtail 3 BU ahead; 30 s watched. */
function watch(reason: 'timeout' | 'trail-lost', ageS: number): Watch {
  const { sim, col, entrance } = forageScenario({ workers: 24, stores: { c: 4, p: 0 }, holdNeeds: { needC: 0, needP: 1, sP: 0.9 } });
  const patch = addPatch(sim, entrance.pos, 60, 30, 400);
  // the trip clock is a tick stamp (negative = not started): the game must be older than the clock set below
  run(sim, Math.round((ageS + 30) * TICKS_PER_SECOND));
  let ant: ReturnType<typeof sim.stores.ants.get>;
  for (let t = 0; t < 6000 && !ant; t += 20) {
    run(sim, 20);
    ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'forage' && a.nestId < 0
      && a.bb[K.phase] === PHASE.outbound && a.carry.kind === 'none' && a.cropC + a.cropP < 0.05);
  }
  expect(ant, 'an outbound forager').toBeTruthy();
  const a = ant!;
  a.bb[K.out0] = sim.state.tick - Math.round(ageS * TICKS_PER_SECOND);
  startReturn(sim, a, FORAGE, false, reason);
  const bu = sim.world.bu;
  const x = a.pos.x + a.fwd.x * 3 * bu, z = a.pos.z + a.fwd.z * 3 * bu;
  // no touch jump during the watch (jumpCd far ahead): the rule under test is the ant's
  const c = spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z },
    { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick, jumpCd: sim.state.tick + 100000 } })!;
  expect(c).toBeTruthy();
  let bites = 0;
  sim.events.on('combat-hit', (e) => { if (e.attackerId === a.id) bites++; });
  const w: Watch = { flips: 0, huntTicks: 0, longestHunt: 0, bites: 0 };
  let prev = a.bb[K.phase], run0 = 0;
  for (let i = 0; i < 30 * TICKS_PER_SECOND && a.alive && c.alive; i++) {
    run(sim, 1);
    const ph = a.bb[K.phase];
    if (ph === PHASE.hunt) { w.huntTicks++; run0++; w.longestHunt = Math.max(w.longestHunt, run0); } else run0 = 0;
    if (prev === PHASE.hunt && ph === PHASE.return) w.flips++;
    prev = ph;
  }
  if (c.alive) despawnCreature(sim, c.id, 'test');
  w.bites = bites;
  return w;
}

describe('H2b review: a chase from the way home after a timeout (colony-life round 3)', () => {
  it('control: sent home for trail-lost with a young trip clock, the ant chases without being sent home again', () => {
    const w = watch('trail-lost', 60);
    expect(w.huntTicks, JSON.stringify(w)).toBeGreaterThan(0);
    expect(w.flips, JSON.stringify(w)).toBeLessThanOrEqual(1);
  }, 120_000);

  it('sent home for timeout (trip clock past TRIP_TURN_S), the ant chases without the trip clock breaking the chase off every think', () => {
    const w = watch('timeout', TRIP_TURN_S + 10);
    expect(w.huntTicks, JSON.stringify(w)).toBeGreaterThan(0); // H2b lets it start the chase
    // a chase is one phase until a catch, an escape or the 20 s limit: at most one hunt -> return change
    expect(w.flips, JSON.stringify(w)).toBeLessThanOrEqual(1);
  }, 120_000);
});
