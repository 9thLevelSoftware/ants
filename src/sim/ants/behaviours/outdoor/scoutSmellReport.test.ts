// Direction 26a item 1 (colony-life round 12): a scout that smells food and does not investigate reports it too. She
// keeps her own investigate while exploring or investigating; homing (or in any other phase) she remembers the food
// she smells, and an investigation she gives up without reaching the source is remembered as well.

import { describe, expect, it } from 'vitest';
import { createSource } from '@/sim/ecology/sources/spawn';
import { odourRadiusMm } from '@/sim/ecology';
import { K, PHASE } from './keys';
import { forageScenario } from './testkit';
import { noticeOutside } from './notice';
import { updateInvestigate } from './phaseScout';
import { SCOUT } from './flavours';
import { INVESTIGATE_S } from '@/sim/balance/foraging';
import { TICKS_PER_SECOND } from '@/sim/time';

function scoutNearCarcass(phase: number) {
  const { sim, col, entrance } = forageScenario({ workers: 4 });
  const bu = sim.world.bu, x = entrance.pos.x + 60 * bu, z = entrance.pos.z;
  const s = createSource(sim, { variant: 'insect-medium', pos: { x, y: sim.field.height(x, z), z } });
  const ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id)!;
  const nest = Math.max(0, ant.nestId);
  ant.task = 'scout'; ant.nestId = -1; ant.bb[K.phase] = phase;
  ant.pos = { x: x + 0.5 * odourRadiusMm(s, bu), y: s.pos.y, z };
  const home = (): void => { ant.nestId = nest; noticeOutside(sim, ant); };
  return { sim, col, s, ant, home };
}

describe('direction 26a item 1: scouts report the food they smell and do not investigate', () => {
  it('a homing scout inside an unknown carcass odour: known once she is back in the nest', () => {
    const { col, s, ant, home, sim } = scoutNearCarcass(PHASE.return);
    noticeOutside(sim, ant);
    expect(col.knownSourceIds).not.toContain(s.id);
    home();
    expect(col.knownSourceIds).toContain(s.id);
  });

  it('an exploring scout keeps her own investigate (no report from the smell check)', () => {
    const { col, s, ant, home, sim } = scoutNearCarcass(PHASE.explore);
    noticeOutside(sim, ant);
    home();
    expect(col.knownSourceIds).not.toContain(s.id);
  });

  it('an investigation given up without contact is reported at home (through updateInvestigate)', () => {
    const { col, s, ant, home, sim } = scoutNearCarcass(PHASE.investigate);
    noticeOutside(sim, ant);
    expect(ant.bb['notice.report'] ?? -1).toBe(-1); // investigating: her own job
    // her investigation of this carcass began INVESTIGATE_S + 1 s ago and she never touched it: she gives up
    ant.bb[K.src] = s.id;
    ant.bb[K.phase0] = sim.state.tick - (INVESTIGATE_S + 1) * TICKS_PER_SECOND;
    updateInvestigate(sim, ant, SCOUT);
    expect(ant.bb[K.phase]).toBe(PHASE.explore);
    home();
    expect(col.knownSourceIds).toContain(s.id);
  });

  it('the same scout still within INVESTIGATE_S: no report yet (the give-up is what reports)', () => {
    const { col, s, ant, home, sim } = scoutNearCarcass(PHASE.investigate);
    ant.bb[K.src] = s.id;
    ant.bb[K.phase0] = sim.state.tick;
    updateInvestigate(sim, ant, SCOUT);
    expect(ant.bb[K.phase]).toBe(PHASE.investigate);
    home();
    expect(col.knownSourceIds).not.toContain(s.id);
  });
});
