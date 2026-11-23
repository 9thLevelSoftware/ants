// Ruling R42 (colony-life direction 28, round 13): the cold does not catch workers outside. With the entrance air at
// the 0.4 point of the thermal speed curve nobody departs and the allocator asks for no forage, tend or scout; a
// forager out on a trip whose own speed multiplier falls under OUTDOOR_TURN_BACK_SPEED turns home.

import { describe, expect, it } from 'vitest';
import { OUTDOOR_DEPART_MIN_SPEED, OUTDOOR_TURN_BACK_SPEED, SPEED_CURVE_C, SPEED_CURVE_MULT } from '@/sim/balance';
import { taskIndex } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony';
import { computeDemand } from '@/sim/colony/allocation/demand';
import { censusOf } from '@/sim/colony/census';
import { entranceAirSpeed, tooColdToDepart } from '@/sim/colony/coldGate';
import { speedMult } from '@/sim/environment/thermalResponse';
import { TICKS_PER_DAY } from '@/sim/time';
import { K, PHASE } from './keys';
import { announce, forageScenario, run } from './testkit';

/** Air temperature (C) at which the speed curve gives multiplier m, on its rising limb. */
function tempAt(m: number): number {
  for (let i = 1; i < SPEED_CURVE_C.length; i++) {
    const a = SPEED_CURVE_MULT[i - 1], b = SPEED_CURVE_MULT[i];
    if (m >= a && m <= b) return SPEED_CURVE_C[i - 1] + ((m - a) / (b - a)) * (SPEED_CURVE_C[i] - SPEED_CURVE_C[i - 1]);
  }
  throw new Error('off the curve');
}

describe('R42: no departures in the cold, and the cold turns workers back', () => {
  it('the thresholds on the curve (Lasius, no thermal shift): about 14.2 C to depart, 11.7 C to turn back', () => {
    expect(tempAt(OUTDOOR_DEPART_MIN_SPEED)).toBeCloseTo(14.17, 1);
    expect(tempAt(OUTDOOR_TURN_BACK_SPEED)).toBeCloseTo(11.67, 1);
  });

  it('entrance air at the 0.4 point: no departures for 0.2 gd, forage / tend / scout demand 0, nobody outside', () => {
    const { sim, col, sources } = forageScenario({
      workers: 20, seed: 4, holdStores: { c: 1, p: 0.3 },
      sources: [{ kind: 'sugar', variant: 'sugar-granules', distBu: 30, bearingDeg: 0, units: 400 }],
    });
    for (const s of sources) announce(sim, col, s);
    const air = tempAt(0.4);
    setClimateOverride(sim, { pointTemp: () => air, surfaceActivity: () => 1 });
    expect(entranceAirSpeed(sim, col)).toBeCloseTo(0.4, 3);
    expect(speedMult(sim, air, col.species)).toBeLessThan(OUTDOOR_DEPART_MIN_SPEED);
    expect(tooColdToDepart(sim, col)).toBe(true);
    let departed = 0, outside = 0;
    sim.events.on('forager-departed', (e) => { if (sim.stores.ants.get(e.antId)?.colony === col.id) departed++; });
    run(sim, Math.round(0.2 * TICKS_PER_DAY), 100, () => {
      for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'worker' && a.nestId < 0) outside++;
    });
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    expect(d[taskIndex('forage')]).toBe(0);
    expect(d[taskIndex('tend')]).toBe(0);
    expect(d[taskIndex('scout')]).toBe(0);
    expect(departed).toBe(0);
    expect(outside).toBe(0);
  }, 120_000);

  it('a forager 100 BU out turns home when her own multiplier falls under OUTDOOR_TURN_BACK_SPEED', () => {
    const { sim, col, entrance, sources } = forageScenario({
      workers: 10, seed: 6, holdStores: { c: 1, p: 0.3 },
      sources: [{ kind: 'sugar', variant: 'sugar-granules', distBu: 160, bearingDeg: 0, units: 400 }],
    });
    for (const s of sources) announce(sim, col, s);
    const bu = sim.world.bu;
    // a forager on her way out, 100 BU from the entrance
    const a = sim.stores.ants.list.find((x) => x.alive && x.colony === col.id && x.caste === 'worker' && x.task === 'forage')
      ?? sim.stores.ants.list.find((x) => x.alive && x.colony === col.id && x.caste === 'worker')!;
    let tries = 0;
    while (a.nestId >= 0 || (a.bb[K.phase] ?? -1) !== PHASE.outbound) {
      run(sim, 50);
      if (++tries > 200) break;
      if (a.task !== 'forage') { a.task = 'forage'; }
    }
    // warm air, then her body cools under the turn-back point (cold ground on her way)
    setClimateOverride(sim, { pointTemp: () => 20, surfaceActivity: () => 1 });
    sim.enqueue({ type: 'cheat.teleport', antId: a.id, pos: { x: entrance.pos.x + 100 * bu, y: 0, z: entrance.pos.z } });
    run(sim, 2);
    if ((a.bb[K.phase] ?? -1) !== PHASE.outbound) a.bb[K.phase] = PHASE.outbound;
    a.tb = tempAt(OUTDOOR_TURN_BACK_SPEED) - 1.5;
    a.thinkTick = sim.state.tick;
    run(sim, 3);
    expect(a.nestId).toBeLessThan(0);
    expect(a.bb[K.phase]).toBe(PHASE.return);
  }, 120_000);
});
