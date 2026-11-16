// econ-growth review (verify): GDD 02 App. E 12 in the regime the game runs in. The committed E12 test
// (appendixE.test.ts) gives its waiting foragers a forage marker and no known source, so NEED_SPONT_MULT
// (balance/colony.ts, econ-growth) never applies there. Here the six waiting foragers belong to a 40-worker colony
// (no small-colony multiplier) that knows a carcass, and needP is 0.5 as in the check: with the need multiplier the
// spontaneous baseline (run A) is about 5x GDD 02 §6.6's ~1.0 departures per 60 s, so the check's "injected returns
// give at least 3x the baseline" cannot hold (only six ants can depart at all).

import { describe, expect, it } from 'vitest';
import type { Behaviour, Sim } from '@/sim/types';
import { recordForagerReturn, requestTask } from '@/sim/colony';
import { placeOnSurface } from '@/sim/locomotion';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { behaviours as outdoor } from './index';
import { announce } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.phase !== 'colony-allocation');
const PASSIVE: Behaviour[] = ['idle', 'rest', 'nurse', 'queen-care', 'store', 'dig', 'haul', 'guard', 'patrol']
  .map((task) => ({ task: task as Behaviour['task'], enter: () => {}, update: () => {}, exit: () => {} }));

function departures(inject: boolean, source = true): number {
  const s: Sim = makeTestSim({
    sizeBu: 700, nest: 'small', workers: 40, seed: 3, systems: NO_ALLOC, behaviours: [...PASSIVE, ...outdoor],
    config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
  });
  const col = s.state.colonies[0];
  const e = s.stores.nests.get(col.nestIds[0])!.entrances[0];
  s.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
  const x = e.pos.x + 150 * s.world.bu, z = e.pos.z;
  if (source) s.enqueue({ type: 'cheat.spawnFood', kind: 'carrion', variant: 'insect-large', pos: { x, y: s.field.height(x, z), z }, units: 1, stage: null });
  s.applyPendingCommands();
  if (source) announce(s, col, s.state.sources[s.state.sources.length - 1]);
  const [returner, ...rest] = s.state.ants.filter((a) => a.caste === 'worker');
  const ants = rest.slice(0, 6);
  for (const a of ants) requestTask(s, a, 'forage', 'job:test');
  for (let t = 0; t < 300; t++) s.tick();
  const room = s.stores.nests.get(col.nestIds[0])!.chambers.find((c) => c.id === ants[0].chamberId)!;
  placeOnSurface(s, returner, room.center, { x: 0, y: -1, z: 0 });
  returner.nestId = ants[0].nestId;
  let n = 0;
  s.events.on('forager-departed' as never, (() => { n++; }) as never);
  for (let t = 0; t < 600; t++) {
    col.needs.needP = 0.5; col.needs.needC = 0;
    if (inject && t % 100 === 0) recordForagerReturn(s, returner, true, -1);
    s.tick();
  }
  return n;
}

describe('econ-growth: a forager with nowhere to go does not depart (verify, regression)', () => {
  it('no known source, no forage marker: neither the spontaneous hazard nor injected returns count a departure', () => {
    expect(departures(false, false)).toBe(0);
    expect(departures(true, false)).toBe(0);
  }, 120000);
});

describe('GDD 02 App. E 12 with a known source of the needed nutrient (econ-growth verify)', () => {
  it('injected successful returns give >= 4 departures and 3x the spontaneous baseline', () => {
    const a = departures(false), b = departures(true);
    console.log(`E12 with a known carcass: departures in 60 s, no returns ${a}, a successful return every 10 s ${b}`);
    expect(b).toBeGreaterThanOrEqual(4);
    expect(b).toBeGreaterThanOrEqual(3 * Math.max(a, 1));
  }, 120000);
});
