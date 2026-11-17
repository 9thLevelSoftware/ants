// Hunting patch prey (colony-life round 2; ruling R18 "hunting prey patches is a forage behaviour"; GDD 05 §2.3,
// §1.5): ants outside that meet patch prey bite it, carry the remains home as protein, the colony learns the patch,
// foragers make hunting trips to it, and a known patch counts as protein capacity for the forage demand.

import { describe, expect, it } from 'vitest';
import type { PreyPatch, SimEvent } from '@/sim/types';
import { knownCapacity } from '@/sim/colony/allocation';
import { colonySlotBit } from '@/sim/entities';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { forageScenario, run } from './testkit';
import { despawnCreature } from '@/sim/entities';
import { patchKnownBy } from './hunt';
import { FORAGE } from './flavours';
import { K, PHASE } from './keys';
import { startReturn } from './transitions';

/** A springtail patch of radius rBu, its centre distBu east of the entrance, full (count = K). */
function addPatch(sim: ReturnType<typeof forageScenario>['sim'], at: { x: number; z: number }, distBu: number, rBu: number, k: number) {
  const bu = sim.world.bu, x = at.x + distBu * bu, z = at.z;
  const p: PreyPatch = { id: sim.state.nextId++, center: { x, y: sim.field.height(x, z), z }, radius: rBu * bu, kind: 'springtail', count: k, k };
  sim.state.ecology.preyPatches.push(p);
  return p;
}

describe('hunting patch prey (R18)', () => {
  it('foragers make hunting trips to a known patch and bring the catch home as protein', () => {
    // a colony short of protein that knows no food source, only a full springtail patch 30 BU from the entrance
    const { sim, col, entrance } = forageScenario({ workers: 24, stores: { c: 4, p: 0 }, holdNeeds: { needC: 0, needP: 1, sP: 0.9 } });
    const patch = addPatch(sim, entrance.pos, 30, 20, 400);
    patch.knownBy = colonySlotBit(sim, col.id);
    const prey: SimEvent[] = [];
    let byForager = 0, subdued = 0;
    sim.events.on('delivery', (e) => {
      if (e.colonyId !== col.id || e.kind !== 'prey') return;
      prey.push(e);
      if (sim.stores.ants.get(e.antId)?.task === 'forage') byForager++;
    });
    sim.events.on('prey-subdued', (e) => { if (e.antIds.length > 0) subdued++; });
    run(sim, 6000); // one game day
    const p = prey.reduce((s, e) => s + (e.type === 'delivery' ? e.p : 0), 0);
    const info = JSON.stringify({ deliveries: prey.length, p, byForager, subdued, count: Math.round(patch.count) });
    expect(byForager, info).toBeGreaterThanOrEqual(3);
    expect(p, info).toBeGreaterThan(0.5);
    // a kill brings its remains home (most of them: a hunter recalled or fleeing on the way may drop one)
    expect(prey.length, info).toBeGreaterThanOrEqual(Math.ceil(subdued / 2));
  }, 120_000);

  it('an ant outside that meets patch prey chases and bites it, and the colony learns the patch', () => {
    const { sim, col, entrance } = forageScenario({ workers: 24, stores: { c: 4, p: 0 }, holdNeeds: { needC: 0, needP: 1, sP: 0.9 } });
    const patch = addPatch(sim, entrance.pos, 60, 30, 400);
    let caught = 0, escaped = 0;
    sim.events.on('prey-subdued', (e) => { if (e.antIds.length > 0) caught++; });
    sim.events.on('prey-escaped', () => escaped++);
    let tries = 0;
    for (let t = 0; t < 6000 && caught === 0; t += 50) {
      run(sim, 50);
      const scout = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'scout' && a.nestId < 0 && a.state === 'scout.explore');
      if (!scout || tries >= 12 || sim.stores.creatures.list.some((c) => c.alive && c.kind === 'springtail')) continue;
      // a springtail of the patch 3 BU ahead of it (where patch prey appears, GDD 05 §2.3)
      const bu = sim.world.bu, x = scout.pos.x + scout.fwd.x * 3 * bu, z = scout.pos.z + scout.fwd.z * 3 * bu;
      spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z }, { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick } });
      tries++;
    }
    const info = JSON.stringify({ tries, caught, escaped, known: patchKnownBy(sim, patch, col.id) });
    expect(tries, info).toBeGreaterThan(0);
    expect(patchKnownBy(sim, patch, col.id), info).toBe(true);
    expect(caught, info).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it('a known patch is protein capacity for the forage demand; an unknown one is not', () => {
    const { sim, col, entrance } = forageScenario({ workers: 12, stores: { c: 4, p: 0 } });
    const patch = addPatch(sim, entrance.pos, 30, 20, 200);
    const before = knownCapacity(sim, col);
    patch.knownBy = colonySlotBit(sim, col.id);
    const after = knownCapacity(sim, col);
    expect(after.loadsP - before.loadsP).toBeGreaterThan(1); // >= 1 P a day from a 200-springtail patch
    expect(after.ants).toBeGreaterThan(before.ants);
    expect(after.loadsC).toBe(before.loadsC);
  });

  it('an ant walking home empty after a failed trip takes patch prey it meets; one sent home by the curfew does not (round 3)', () => {
    // round-2 sweep review: for 33 of 72 patch prey on suburban-garden #1 the nearest ant was going home with an empty
    // crop and walked past (huntCheck only let outbound / searching ants break off)
    const { sim, col, entrance } = forageScenario({ workers: 24, stores: { c: 4, p: 0 }, holdNeeds: { needC: 0, needP: 1, sP: 0.9 } });
    const patch = addPatch(sim, entrance.pos, 60, 30, 400);
    // round 5: the colony knows protein (this patch), so its outside share forages; with no protein known it would
    // scout instead (allocation/demand.ts smallColonyFloor) and no forager would be outbound
    patch.knownBy = colonySlotBit(sim, col.id);
    let ant: ReturnType<typeof sim.stores.ants.get>;
    for (let t = 0; t < 6000 && !ant; t += 20) {
      run(sim, 20);
      ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'forage' && a.nestId < 0
        && a.bb[K.phase] === PHASE.outbound && a.carry.kind === 'none' && a.cropC + a.cropP < 0.05);
    }
    expect(ant, 'an outbound forager').toBeTruthy();
    const a = ant!;
    const bu = sim.world.bu;
    const chases = (reason: 'timeout' | 'curfew'): boolean => {
      startReturn(sim, a, FORAGE, false, reason);
      const x = a.pos.x + a.fwd.x * 3 * bu, z = a.pos.z + a.fwd.z * 3 * bu;
      const c = spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z }, { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick, jumpCd: sim.state.tick + 100 } });
      expect(c).toBeTruthy(); // (no touch jump in this test: the rule under test is the ant's)
      // the creature index sees it from the next tick; the ant thinks every THINK_TRAVEL_TICKS (5)
      let hunting = false;
      for (let i = 0; i < 6 && !hunting; i++) { run(sim, 1); hunting = a.bb[K.phase] === PHASE.hunt && a.bb[K.prey] === c!.id; }
      despawnCreature(sim, c!.id, 'test');
      return hunting;
    };
    expect(chases('curfew')).toBe(false);
    expect(chases('timeout')).toBe(true);
  }, 120_000);
});
