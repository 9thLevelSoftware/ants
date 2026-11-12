// sim-fix-colony item 5: the colony seams other modules call. Count-only delivery, the synthetic returner's wait
// radius, the allocator leaving ants outside on a trip alone, the departure ration's ledger key, and the
// stores-full alert (GDD 02 App. E 18, second half) firing after 0.25 gd at capacity and not otherwise.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { FORAGE_WAIT_RADIUS_BU, RECRUIT_RADIUS_BU } from '@/sim/balance';
import { createSource } from '@/sim/ecology/sources/spawn';
import { accGet, coreOf } from './core';
import { popOf } from './population';
import { addChamber, addEntrance, addWorkers, colonyOf, makeColonySim, step } from './testkit';
import { depositFood, injectReturn, recordDeliveryCount, recordForagerReturn, withdrawFood } from './index';
import { reassignable, surplusCheck } from './allocation/assign';
import { taskCycleDone } from './allocation';

const BU = 4;

describe('recordDeliveryCount: the counting half of a delivery, without a deposit', () => {
  it('tallies intake, the source ledger and the yield, emits delivery, and leaves the pool alone', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 });
    const [ant] = addWorkers(sim, 2, { chamber: ch, task: 'forage' });
    step(sim, 10);
    const col = colonyOf(sim);
    const src = createSource(sim, { variant: 'flower', pos: { x: 300, y: 0, z: 300 } });
    const before = { c: col.stores.c, p: col.stores.p, ledger: col.ledger.inDeliveryC, yieldLoads: accGet(coreOf(col), 'yield.loads') };
    const events: { c: number; sourceId: number }[] = [];
    sim.events.on('delivery', (e) => events.push(e));
    recordDeliveryCount(sim, ant, src.id, 'nectar', 0.6, 0, 0, 30);
    recordDeliveryCount(sim, ant, src.id, 'nectar', 0, 0); // nothing
    sim.events.flush();
    expect(col.stores.c).toBe(before.c);
    expect(col.stores.p).toBe(before.p);
    expect(col.ledger.inDeliveryC).toBe(before.ledger); // the primitive books the food itself
    expect(popOf(col).intakeByKind.nectar.c).toBeCloseTo(0.6, 9);
    expect(popOf(col).intakeBySource[String(src.id)].n).toBe(1);
    expect(popOf(col).unloads).toBe(1);
    expect(accGet(coreOf(col), 'yield.loads') - before.yieldLoads).toBeCloseTo(0.6, 9);
    expect(events).toHaveLength(1);
    expect(events[0].sourceId).toBe(src.id);
  });
});

function waitingForager(sim: Sim, dy: number, entrance: { x: number; y: number; z: number }): Ant {
  const ch = addChamber(sim, 'general', { x: entrance.x, y: entrance.y - dy * BU, z: entrance.z });
  const [a] = addWorkers(sim, 1, { chamber: ch, task: 'forage', state: 'forage.wait' });
  a.pos = { x: entrance.x, y: entrance.y - dy * BU, z: entrance.z };
  return a;
}

describe('cheat.injectReturn reaches the entrance chamber (GDD 02 §6.6 wait radius)', () => {
  it('contacts a forager waiting 9 BU below the mouth, not one 12 BU away; a real returner still uses 6 BU', () => {
    expect(FORAGE_WAIT_RADIUS_BU).toBe(10);
    const sim = makeColonySim();
    const mouth = { x: 200, y: 0, z: 200 };
    const eid = addEntrance(sim, mouth);
    const near = waitingForager(sim, 9, mouth);
    const far = waitingForager(sim, 12, mouth);
    const contacted = injectReturn(sim, eid, true, -1);
    expect(contacted).toContain(near.id);
    expect(contacted).not.toContain(far.id);
    expect(near.activation).toBeGreaterThan(0);
    expect(far.activation).toBe(0);
    // a real returner standing at the mouth contacts within RECRUIT_RADIUS_BU of itself only
    const [returner] = addWorkers(sim, 1, { task: 'forage' });
    returner.pos = { ...mouth };
    expect(recordForagerReturn(sim, returner, false, -1)).not.toContain(near.id);
    expect(RECRUIT_RADIUS_BU).toBeLessThan(9);
  });
});

describe('the allocator leaves ants outside on a trip alone until they are home', () => {
  it('a forager outside is not reassigned by the surplus check or a cycle end; at home it is', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    addWorkers(sim, 5, { chamber: ch, task: 'idle' });
    const foragers = addWorkers(sim, 8, { chamber: null, task: 'forage' }); // nestId -1: outside
    step(sim, 120); // allocation: no forage demand, foragers in surplus
    const col = colonyOf(sim);
    const def = sim.getSpecies(col.species)!;
    for (const a of foragers) {
      expect(reassignable(a)).toBe(false);
      for (let n = 0; n < 20; n++) surplusCheck(sim, col, a, def);
      a.taskTick = -1e6;
      taskCycleDone(sim, a);
      expect(a.task).toBe('forage');
    }
    for (const a of foragers) a.nestId = col.nestIds[0]; // home
    expect(reassignable(foragers[0])).toBe(true);
    let moved = 0;
    for (const a of foragers) { a.taskTick = -1e6; for (let n = 0; n < 20 && a.task === 'forage'; n++) surplusCheck(sim, col, a, def); if (a.task !== 'forage') moved++; }
    expect(moved).toBeGreaterThan(0);
  });

  it('an idle ant outside and an outside nest worker stay reassignable', () => {
    const sim = makeColonySim();
    const [idle, hauler] = addWorkers(sim, 2, { chamber: null, task: 'idle' });
    hauler.task = 'haul';
    expect(reassignable(idle)).toBe(true);
    expect(reassignable(hauler)).toBe(true);
  });
});

describe('the departure ration has its own ledger key (GDD 02 §5.2 out.ration)', () => {
  it('withdrawFood(..., "ration") books out.ration, not transit', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 });
    const [ant] = addWorkers(sim, 4, { chamber: ch });
    step(sim, 10);
    const col = colonyOf(sim);
    depositFood(sim, col.id, 5, 0);
    const t0 = col.ledger.transitC, r0 = col.ledger.outRationC;
    const got = withdrawFood(sim, col.id, 0.1, 0, 'ration', ant);
    expect(got.c).toBeCloseTo(0.1, 9);
    expect(col.ledger.outRationC - r0).toBeCloseTo(0.1, 9);
    expect(col.ledger.transitC).toBe(t0);
  });
});

describe('stores-full alert (GDD 02 App. E 18, §14: pool at capacity for 0.25 gd)', () => {
  function fullRun(keepFull: boolean): { firedAt: number; sim: Sim } {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'food', { x: 100, y: -40, z: 100 }, 20);
    addWorkers(sim, 10, { chamber: ch, task: 'rest', state: 'rest' });
    step(sim, 10);
    let firedAt = -1;
    sim.events.on('stores-full', () => { if (firedAt < 0) firedAt = sim.state.tick; });
    const col = colonyOf(sim);
    for (let t = 0; t < 0.4 * TICKS_PER_DAY; t++) {
      if (keepFull) depositFood(sim, col.id, 1, 0);
      else if (col.stores.c > 2) withdrawFood(sim, col.id, col.stores.c - 2, 0, 'workers');
      sim.tick();
    }
    sim.events.flush();
    return { firedAt, sim };
  }

  it('fires once the pool has been at capacity for 0.25 gd', () => {
    const { firedAt } = fullRun(true);
    expect(firedAt).toBeGreaterThan(0);
    expect(Math.abs((firedAt - 10) / TICKS_PER_DAY - 0.25)).toBeLessThan(0.01);
  });

  it('does not fire while the pool has room', () => {
    expect(fullRun(false).firedAt).toBe(-1);
  });
});

describe('midden-blocked (GDD 02 §10.8, §14 diag-hygiene)', () => {
  it('is raised while no nest of the colony has an open entrance, cleared when one opens; reports hold it', async () => {
    const { isMiddenBlocked, reportMiddenBlocked } = await import('./index');
    const { MIDDEN_REPORT_HOLD_S, PHYSIO_EVERY } = await import('@/sim/balance');
    const sim = makeColonySim();
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    addWorkers(sim, 5, { chamber: ch });
    const col = colonyOf(sim);
    const seen: boolean[] = [];
    sim.events.on('midden-blocked', (e) => seen.push(e.blocked));
    step(sim, 2 * PHYSIO_EVERY); // a colony cycle: no entrance at all
    sim.events.flush();
    expect(isMiddenBlocked(col)).toBe(true);
    addEntrance(sim, { x: 200, y: 0, z: 200 });
    step(sim, 2 * PHYSIO_EVERY);
    sim.events.flush();
    expect(isMiddenBlocked(col)).toBe(false);
    // a hauler that had to use the internal dump reports it: held for MIDDEN_REPORT_HOLD_S
    expect(reportMiddenBlocked(sim, col.id)).toBe(true);
    expect(isMiddenBlocked(col)).toBe(true);
    step(sim, MIDDEN_REPORT_HOLD_S * 10 + 2 * PHYSIO_EVERY);
    sim.events.flush();
    expect(isMiddenBlocked(col)).toBe(false);
    expect(seen).toEqual([true, false, true, false]);
  });

  it('is not raised for a colony without workers (a sealed founding queen)', async () => {
    const { isMiddenBlocked } = await import('./index');
    const sim = makeColonySim();
    step(sim, 200);
    expect(isMiddenBlocked(colonyOf(sim))).toBe(false);
  });
});

describe('diag-nest-space (GDD 03 App. D) from the architect need cache', () => {
  it('reads the cache: ok when under the triggers, warn above one, bad at 1.3', async () => {
    const { nestSpaceDiag } = await import('./nestSpaceDiag');
    const sim = makeColonySim();
    addWorkers(sim, 3, { chamber: addChamber(sim, 'general', { x: 100, y: -40, z: 100 }) });
    const col = colonyOf(sim);
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    nest.architect.lastEvalTick = sim.state.tick;
    nest.architect.needCache.crowding = 0.5;
    nest.architect.needCache['brood-space'] = 0.2;
    expect(nestSpaceDiag(sim, col)!.status).toBe('ok');
    sim.state.progression.diagnostics = [];
    nest.architect.needCache['brood-space'] = 0.9;
    const warn = nestSpaceDiag(sim, col)!;
    expect(warn.status).toBe('warn');
    expect(warn.factors.map((f) => f.cause)).toEqual(['no-diggers', 'brood-space']); // nobody digs: the stronger cause
    expect(warn.remedies).toContain('remedy.dig.nursery');
    sim.state.progression.diagnostics = [];
    nest.architect.needCache.crowding = 1.4;
    expect(nestSpaceDiag(sim, col)!.status).toBe('bad');
  });
});
