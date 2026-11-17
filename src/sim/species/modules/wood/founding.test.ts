// Founding in a wood cavity (GDD 07 §5.2.3, GDD 03 §13.1 "CP 3 into wood"): the founding site rules, the automatic
// cell chewed into a log, its readiness measured into the wood, and the wood read-out. Frass tallies (App. E 12).

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { foundingReadiness } from '@/sim/nest';
import { assessSite } from '@/sim/colony/founding/siteAssess';
import { bestWoodSite, carveWoodTemplate, isFoundingWood, moistureWord } from '@/sim/colony/founding/species/camponotus';
import type { Mound, Sim } from '@/sim/types';
import { BULKING, V_BITE_NOMINAL } from '@/sim/balance/nest';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { setWood } from './moisture';
import { ensureWoodStates, woodOf } from './woodState';
import { frassTally, pileUnits } from './frass';
import { parentMoistureStatus } from './diagnostics';
import { CP, LOG_CENTRE, LOG_ID, testLog } from './testkit';

installWoodHooks();

function foundingSim(): Sim {
  return makeTestSim({ species: CP, prims: [testLog()], systems: [] });
}

describe('founding wood (GDD 07 §5.2.3)', () => {
  it('a 20 BU decayed log is a founding site; too dry or crumbling wood is not', () => {
    const sim = foundingSim();
    const w = woodOf(sim, LOG_ID)!;
    expect(isFoundingWood(sim, w)).toBe(true);
    setWood(w, 7, 2);
    expect(isFoundingWood(sim, w)).toBe(false);
    setWood(w, 25, 4);
    expect(isFoundingWood(sim, w)).toBe(false);
    expect([moistureWord(10), moistureWord(20), moistureWord(35)]).toEqual(['dry', 'damp', 'wet']);
  });

  it('the automatic founding chews a cell into the log that is ready by the wood depth rule, with one chewed entrance', () => {
    const sim = foundingSim();
    const col = sim.state.colonies[0];
    const q = sim.stores.ants.get(col.queenId)!;
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    const site = bestWoodSite(sim, q.pos);
    expect(site?.prim.id).toBe(LOG_ID);
    expect(carveWoodTemplate(sim, q, nest)).toBe(true);
    expect(nest.entrances.length).toBe(1);
    expect(nest.entrances[0].kind).toBe('dug');
    expect(nest.substrate).toBe('wood-decayed');
    const r = foundingReadiness(sim, nest)!;
    expect(r.ready).toBe(true);
    expect(r.dMaxBu).toBeGreaterThanOrEqual(3);
    expect(r.openings).toBe(1);
    // the cell lies inside the log
    const seed = nest.founding!.cavitySeed;
    expect(Math.hypot(seed.y - LOG_CENTRE.y, seed.z - LOG_CENTRE.z)).toBeLessThan(10 * 9);
  });

  it('antennating the log reads the wood (diggable, damp), the ground beside it is not diggable for this species', () => {
    const sim = foundingSim();
    ensureWoodStates(sim);
    const onLog = assessSite(sim, { x: LOG_CENTRE.x, y: LOG_CENTRE.y + 10 * 9, z: LOG_CENTRE.z });
    expect(onLog.factors[0]).toBeGreaterThan(0.5);
    expect(onLog.factors[1]).toBe(1);
    expect(onLog.word === 'fair' || onLog.word === 'good' || onLog.word === 'excellent').toBe(true);
    const soil = assessSite(sim, { x: 20 * 9, y: 0, z: 100 * 9 });
    expect(soil.factors[0]).toBe(0);
  });
});

describe('frass piles and diagnostics (GDD 07 §6.2.3, App. E 12)', () => {
  it('10 frass items make 1 pile unit; outdoors frassVisibility rises by 0.2', () => {
    const sim = foundingSim();
    const p = woodParamsOf(sim.species)!;
    const vol = 10 * V_BITE_NOMINAL * BULKING;
    expect(pileUnits({ absorbed: 10 }, p)).toBeCloseTo(1, 9);
    const col = sim.state.colonies[0];
    const nestId = col.nestIds[0];
    const m = { id: 9999, nestId, entranceId: -1, centerX: 30 * 9, centerZ: 30 * 9, cell: 4.5, n: 4, base: new Float32Array(16), h: new Float32Array(16), material: 'frass', volume: vol, absorbed: 10, lastBatchTick: 0 } as Mound;
    sim.state.worldDelta.mounds.push(m);
    const t = frassTally(sim, col, p);
    expect(t.outdoor).toBeCloseTo(1, 9);
    expect(t.visibility).toBeCloseTo(0.2, 9);
  });

  it('parent moisture status: ok 15-30, warn 11-15 and 30-35, bad below 11 and above 35', () => {
    const p = woodParamsOf(foundingSim().species)!;
    expect([10, 12, 20, 32, 36].map((mc) => parentMoistureStatus(p, mc))).toEqual(['bad', 'warn', 'ok', 'warn', 'bad']);
  });
});
