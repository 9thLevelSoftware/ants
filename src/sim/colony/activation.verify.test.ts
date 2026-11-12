// Reviewer tests (colony-core verify): forager activation decay and curfews (GDD 02 §6.6), diagnostics hysteresis
// and the worked-example laying diagnostic (§14, §15).

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addEntrance, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { curfew, shouldDepart } from './activation';
import { setClimateOverride } from './envAdapter';

function waiting(n: number) {
  const sim = makeColonySim({ noAllocation: true });
  const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  const entrance = addEntrance(sim, { x: 100, y: 0, z: 100 });
  const ants = addWorkers(sim, n, { chamber: ch, task: 'forage', state: 'forage.wait' });
  ants.forEach((a, i) => { a.pos = { x: 100 + i * 0.5, y: 0, z: 100 }; });
  sim.tick();
  return { sim, ants, entrance };
}

describe('forager activation (reviewer, §6.6)', () => {
  it('activation decays with a 40 s half-life', () => {
    const { sim, ants } = waiting(1);
    ants[0].activation = 0.8;
    step(sim, 400);
    expect(ants[0].activation).toBeCloseTo(0.4, 2);
  });

  it('a successful return adds ENC_GAIN x fEnv to at most 3 nearest waiting foragers', () => {
    const { sim, ants, entrance } = waiting(5);
    sim.enqueue({ type: 'cheat.injectReturn', entranceId: entrance, success: true, sourceId: -1 });
    step(sim, 1);
    const gained = ants.filter((a) => a.activation > 0.45);
    expect(gained.length).toBe(3);
    // fEnv = 1 x (0.7 + 0.3 x clamp((80 - 40) / 40)) = 1.0 -> gain 0.5
    for (const a of gained) expect(a.activation).toBeCloseTo(0.5, 2);
  });

  it('an unsuccessful return adds nothing', () => {
    const { sim, ants, entrance } = waiting(3);
    sim.enqueue({ type: 'cheat.injectReturn', entranceId: entrance, success: false, sourceId: -1 });
    step(sim, 1);
    for (const a of ants) expect(a.activation).toBe(0);
  });

  it('curfew when surface activity is below 0.05: no departures even when activated', () => {
    const { sim, ants } = waiting(2);
    setClimateOverride(sim, { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 0.04 });
    ants[0].activation = 2;
    expect(curfew(sim, colonyOf(sim))).toBe(true);
    expect(shouldDepart(sim, ants[0])).toBeNull();
  });
});

describe('diagnostics (reviewer, §14)', () => {
  it('a status change only takes effect after it has held 0.1 gd', () => {
    const sim = makeColonySim({ climate: { chamberTemp: () => 25 }, extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 300);
    establishQueen(sim, ch);
    addWorkers(sim, 30, { chamber: ch, ageGd: 2 });
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 100, p: 60, toxin: 0 });
    step(sim, 600);
    const get = () => sim.state.progression.diagnostics.find((d) => d.id === 'diag-stores')!;
    const before = get().status;
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 0, p: 0 });
    step(sim, 260); // one diagnostics run with the new state, < 0.1 gd
    expect(get().status).toBe(before);
    step(sim, Math.round(0.12 * TICKS_PER_DAY));
    expect(get().status).toBe('bad');
  });
});
