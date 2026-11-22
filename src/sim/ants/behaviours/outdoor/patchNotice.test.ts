// R38 item 3 (colony-life direction 24): prey patches are learnt. Any outside worker that meets patch prey within
// HUNT_NOTICE_BU teaches the colony the patch, whatever her trip (a tender, a laden or homing forager); a forager or
// scout who has walked PATCH_NOTICE_S inside an unknown patch holding >= PATCH_NOTICE_MIN_FILL of its capacity learns
// it without a spawn roll.

import { describe, expect, it } from 'vitest';
import type { PreyPatch } from '@/sim/types';
import { PATCH_NOTICE_MIN_FILL, PATCH_NOTICE_S } from '@/sim/balance/foraging';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { secondsToTicks } from '@/sim/time';
import { forageScenario } from './testkit';
import { patchKnownBy } from './hunt';
import { noticeOutside } from './notice';

function addPatch(sim: ReturnType<typeof forageScenario>['sim'], at: { x: number; z: number }, distBu: number, rBu: number, k: number, count = k) {
  const bu = sim.world.bu, x = at.x + distBu * bu, z = at.z;
  const p: PreyPatch = { id: sim.state.nextId++, center: { x, y: sim.field.height(x, z), z }, radius: rBu * bu, kind: 'springtail', count, k };
  sim.state.ecology.preyPatches.push(p);
  return p;
}

/** One worker of the colony put outside at the patch centre, on `task`; the clock advanced by `ticks` between checks. */
function outsideAt(sim: ReturnType<typeof forageScenario>['sim'], colId: number, p: PreyPatch, task: 'tend' | 'forage' | 'scout' | 'haul') {
  const ant = sim.stores.ants.list.find((a) => a.alive && a.colony === colId)!;
  ant.task = task; ant.nestId = -1;
  ant.pos = { x: p.center.x, y: p.center.y + 0.5, z: p.center.z };
  return ant;
}

function checkFor(sim: ReturnType<typeof forageScenario>['sim'], ant: ReturnType<typeof outsideAt>, seconds: number) {
  const end = sim.state.tick + secondsToTicks(seconds);
  while (sim.state.tick <= end) { noticeOutside(sim, ant); sim.state.tick += 10; }
}

describe('R38 item 3: prey patches are learnt', () => {
  it('a tender who meets patch prey teaches the colony the patch (she does not chase it)', () => {
    const { sim, col, entrance } = forageScenario({ workers: 4 });
    const p = addPatch(sim, entrance.pos, 60, 20, 400, 10); // nearly empty: the walk-in rule does not apply
    const ant = outsideAt(sim, col.id, p, 'tend');
    spawnCreatureOfKind(sim, 'springtail', { x: p.center.x + 2 * sim.world.bu, y: p.center.y, z: p.center.z }, { state: 'graze', bb: { patch: p.id, contact: sim.state.tick } });
    sim.tick(); // the creature index picks the springtail up
    ant.nestId = -1; ant.task = 'tend';
    const prey = sim.stores.creatures.list.find((x) => x.alive && x.kind === 'springtail')!;
    ant.pos = { x: prey.pos.x + 2 * sim.world.bu, y: prey.pos.y, z: prey.pos.z }; // 2 BU from it
    ant.bb['notice.next'] = 0;
    expect(patchKnownBy(sim, p, col.id)).toBe(false);
    noticeOutside(sim, ant);
    expect(patchKnownBy(sim, p, col.id)).toBe(true);
  });

  it(`a forager who walks ${PATCH_NOTICE_S} s inside a patch at >= ${PATCH_NOTICE_MIN_FILL} of its capacity learns it`, () => {
    const { sim, col, entrance } = forageScenario({ workers: 4 });
    const p = addPatch(sim, entrance.pos, 60, 20, 400, 0.5 * 400);
    const ant = outsideAt(sim, col.id, p, 'forage');
    checkFor(sim, ant, PATCH_NOTICE_S - 2);
    expect(patchKnownBy(sim, p, col.id)).toBe(false); // not yet
    checkFor(sim, ant, 4);
    expect(patchKnownBy(sim, p, col.id)).toBe(true);
  });

  it('not when the patch is nearly empty, and not for a hauler walking through', () => {
    const { sim, col, entrance } = forageScenario({ workers: 4 });
    const thin = addPatch(sim, entrance.pos, 60, 20, 400, 0.1 * 400);
    const scout = outsideAt(sim, col.id, thin, 'scout');
    checkFor(sim, scout, 3 * PATCH_NOTICE_S);
    expect(patchKnownBy(sim, thin, col.id)).toBe(false);
    const full = addPatch(sim, entrance.pos, -60, 20, 400);
    const hauler = outsideAt(sim, col.id, full, 'haul');
    checkFor(sim, hauler, 3 * PATCH_NOTICE_S);
    expect(patchKnownBy(sim, full, col.id)).toBe(false);
  });
});
