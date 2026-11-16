// GDD 02 Appendix E checks at the level of the outdoor behaviours:
//  12 activation by successful returns (the waiting side: forage.wait departs through colony.shouldDepart),
//  16 route learning after three round trips, the next outbound path near-straight,
//  17 homing from a looping outbound path by breadcrumbs with shortcuts.
// Allocation is left out of these sims so the test ants keep their tasks.

import { describe, expect, it } from 'vitest';
import type { Ant, Behaviour, Sim } from '@/sim/types';
import { recordForagerReturn, requestTask } from '@/sim/colony';
import { navTo, placeOnSurface } from '@/sim/locomotion';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { behaviours as outdoor } from './index';
import { K, PHASE, HOME } from './keys';

const NO_ALLOC = SYSTEMS.filter((s) => s.phase !== 'colony-allocation');
/** Every non-outdoor task stands still and leaves the ant alone (the tests drive those ants themselves). */
const PASSIVE: Behaviour[] = ['idle', 'rest', 'nurse', 'queen-care', 'store', 'dig', 'haul', 'guard', 'patrol']
  .map((task) => ({ task: task as Behaviour['task'], enter: () => {}, update: () => {}, exit: () => {} }));

function sim(seed = 1, workers = 6): Sim {
  return makeTestSim({
    sizeBu: 700, nest: 'small', workers, seed, systems: NO_ALLOC, behaviours: [...PASSIVE, ...outdoor],
    config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
  });
}

function entranceOf(s: Sim) {
  return s.stores.nests.get(s.state.colonies[0].nestIds[0])!.entrances[0];
}

/** Walks an (idle, passive) ant through waypoints with locomotion; returns the path length walked, mm. */
function drive(s: Sim, ant: Ant, pts: { x: number; z: number }[], maxTicks = 20000): number {
  let i = 0, len = 0;
  for (let t = 0; t < maxTicks && i <= pts.length; t++) {
    if (ant.nav.status !== 'moving') {
      if (i === pts.length) break;
      const p = pts[i++];
      navTo(s, ant, { x: p.x, y: s.field.height(p.x, p.z), z: p.z }, 1.5 * s.world.bu);
    }
    s.tick();
    len += Math.hypot(ant.pos.x - ant.prevPos.x, ant.pos.z - ant.prevPos.z);
  }
  return len;
}

describe('GDD 02 App. E 12: activation by successful returns', () => {
  const departures = (inject: boolean): number => {
    const s = sim(3, 7);
    const col = s.state.colonies[0];
    s.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
    // somewhere to go (econ-growth: a forager with no known source and no marker re-evaluates instead of departing);
    // a forage marker leaves the spontaneous rate as GDD 02 §6.6 has it (no known source: no need multiplier)
    const e = entranceOf(s);
    s.enqueue({ type: 'placeMarker', kind: 'forage', pos: { x: e.pos.x + 150 * s.world.bu, y: 0, z: e.pos.z }, radius: 20 * s.world.bu });
    s.applyPendingCommands();
    const [returner, ...ants] = s.state.ants.filter((a) => a.caste === 'worker');
    for (const a of ants) requestTask(s, a, 'forage', 'job:test');
    for (let t = 0; t < 300; t++) s.tick(); // they settle in forage.wait in the entrance chamber
    // the stand-in returner stands among them (cheat.injectReturn contacts ants within 6 BU of the entrance mouth,
    // which the entrance chamber of the small test nest is not: see the report)
    const room = s.stores.nests.get(col.nestIds[0])!.chambers.find((c) => c.id === ants[0].chamberId)!;
    placeOnSurface(s, returner, room.center, { x: 0, y: -1, z: 0 });
    returner.nestId = room ? ants[0].nestId : -1;
    let n = 0;
    s.events.on('forager-departed' as never, (() => { n++; }) as never);
    for (let t = 0; t < 600; t++) {
      // needP 0.5 as in the check; the colony recomputes needs on its slow tick, so it is pinned every tick
      col.needs.needP = 0.5; col.needs.needC = 0;
      if (inject && t % 100 === 0) recordForagerReturn(s, returner, true, -1);
      s.tick();
    }
    return n;
  };

  it('six waiting foragers: injected successful returns every 10 s give >= 4 departures and 3x the baseline', () => {
    const a = departures(false), b = departures(true);
    console.log(`App. E 12: departures in 60 s, no returns ${a}, a successful return every 10 s ${b}`);
    expect(b).toBeGreaterThanOrEqual(4);
    expect(b).toBeGreaterThanOrEqual(3 * Math.max(a, 1));
  }, 120000);
});

describe('GDD 02 App. E 17: homing by breadcrumbs from a looping path', () => {
  it('enters the nest with an inbound path <= 1.4 x the straight line, without the planner', () => {
    const s = sim(1, 1);
    const ant = s.state.ants.find((a) => a.caste === 'worker')!;
    const e = entranceOf(s);
    const bu = s.world.bu;
    // out east with a big loop on the way, ending 300 BU from the entrance (crumbs are recorded by locomotion)
    const P = (dx: number, dz: number) => ({ x: e.pos.x + dx * bu, z: e.pos.z + dz * bu });
    const out = [P(20, 0), P(100, 0), P(140, 40), P(100, 80), P(60, 40), P(100, 0), P(200, 0), P(300, 0)];
    drive(s, ant, out);
    expect(ant.nestId).toBe(-1);
    const straight = Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z);
    ant.cropC = ant.cropCap; // laden: the behaviour heads home at once
    requestTask(s, ant, 'forage', 'job:test');
    let len = 0, plannerFar = false;
    for (let t = 0; t < 6000 && ant.nestId < 0; t++) {
      s.tick();
      len += Math.hypot(ant.pos.x - ant.prevPos.x, ant.pos.z - ant.prevPos.z);
      const far = Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z) > 8 * bu;
      if (far && ant.bb[K.phase] === PHASE.return && ant.bb[K.home] === HOME.planner) plannerFar = true;
    }
    console.log(`App. E 17: straight ${(straight / bu).toFixed(0)} BU, inbound ${(len / bu).toFixed(0)} BU (${(len / straight).toFixed(2)}x), planner used away from the entrance: ${plannerFar}`);
    expect(ant.nestId).toBeGreaterThanOrEqual(0);
    expect(len).toBeLessThanOrEqual(1.4 * straight);
    expect(plannerFar).toBe(false);
  }, 120000);
});

describe('GDD 02 App. E 16: route learning', () => {
  it('route-learned at the end of the third repeat trip; the next outbound path <= 1.25 x straight', () => {
    const s = sim(2, 1);
    const col = s.state.colonies[0];
    s.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
    const e = entranceOf(s);
    const bu = s.world.bu;
    const P = (dx: number, dz: number) => ({ x: e.pos.x + dx * bu, z: e.pos.z + dz * bu });
    const src = P(250, 0);
    s.enqueue({ type: 'cheat.spawnFood', kind: 'crumb', variant: 'crumb-protein', pos: { x: src.x, y: 0, z: src.z }, units: 15, stage: null });
    s.applyPendingCommands();
    const source = s.state.sources[s.state.sources.length - 1];
    // trail laying disabled colony-wide (as in the check): trail deposits are dropped
    const dep = s.phero.deposit.bind(s.phero);
    s.phero.deposit = (c, ch, p, a) => { if (ch !== 'trail') dep(c, ch, p, a); };
    const ant = s.state.ants.find((a) => a.caste === 'worker')!;
    // the discovery trip: a long detour (>= 1.5 x the straight line), then the ant works the source as a forager
    drive(s, ant, [P(20, 0), P(80, 120), P(200, 140), P(250, 20)]);
    ant.mem.knownSourceId = source.id;
    requestTask(s, ant, 'forage', 'job:test');
    const learned: number[] = [];
    const trips: number[] = [];
    const emit = s.emit.bind(s);
    s.emit = (ev) => { if (ev.type === 'route-learned') learned.push(s.state.tick); if (ev.type === 'delivery') trips.push(s.state.tick); emit(ev); };
    let outLen = 0, measuring = false, measured = -1;
    for (let t = 0; t < 40000 && measured < 0; t++) {
      if (ant.state === 'forage.wait') ant.activation = 1; // depart at once (activation is the colony's, App. E 12)
      s.tick();
      const step = Math.hypot(ant.pos.x - ant.prevPos.x, ant.pos.z - ant.prevPos.z);
      if (trips.length >= 4 && ant.nestId < 0 && ant.bb[K.phase] === PHASE.outbound) { measuring = true; outLen += step; }
      if (measuring && (ant.bb[K.phase] === PHASE.collect || ant.bb[K.phase] === PHASE.search)) measured = outLen;
    }
    const straight = Math.hypot(src.x - e.pos.x, src.z - e.pos.z);
    console.log(`App. E 16: deliveries at ticks ${trips.slice(0, 5).join(', ')}; route-learned at ${learned.join(', ')};`,
      `next outbound ${(measured / bu).toFixed(0)} BU vs straight ${(straight / bu).toFixed(0)} BU`);
    expect(learned.length).toBe(1);
    expect(learned[0]).toBe(trips[3]); // discovery trip + three repeats: learned on the fourth delivery
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThanOrEqual(1.25 * straight);
  }, 300000);
});
