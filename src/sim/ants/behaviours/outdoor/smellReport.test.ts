// R38 item 5 (colony-life direction 24): a homing or laden worker that smells food still reports it. Round 11's kd #2
// trace: a 4 P carcass 60 BU from the door had foragers and tenders inside its odour for 142 s and stayed unknown.

import { describe, expect, it } from 'vitest';
import { createSource } from '@/sim/ecology/sources/spawn';
import { isDiscoveredBy, odourRadiusMm } from '@/sim/ecology';
import { forageScenario } from './testkit';
import { noticeOutside } from './notice';

describe('R38 item 5: food smelled on the way is reported at home', () => {
  it('a forager homing with a full crop past an unknown carcass: known once she is back in the nest, not before', () => {
    const { sim, col, entrance } = forageScenario({ workers: 4 });
    const bu = sim.world.bu, x = entrance.pos.x + 60 * bu, z = entrance.pos.z;
    const s = createSource(sim, { variant: 'insect-medium', pos: { x, y: sim.field.height(x, z), z } });
    const ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id)!;
    const nest = ant.nestId;
    ant.task = 'forage'; ant.nestId = -1; ant.cropC = ant.cropCap; // homing laden
    ant.pos = { x: x + 0.5 * odourRadiusMm(s, bu), y: s.pos.y, z };
    noticeOutside(sim, ant);
    expect(col.knownSourceIds).not.toContain(s.id);
    ant.nestId = Math.max(0, nest);
    noticeOutside(sim, ant);
    expect(col.knownSourceIds).toContain(s.id);
    expect(isDiscoveredBy(sim, s, col.id)).toBe(true);
  });

  it('outside the odour radius nothing is reported', () => {
    const { sim, col, entrance } = forageScenario({ workers: 4 });
    const bu = sim.world.bu, x = entrance.pos.x + 60 * bu, z = entrance.pos.z;
    const s = createSource(sim, { variant: 'insect-medium', pos: { x, y: sim.field.height(x, z), z } });
    const ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id)!;
    const nest = ant.nestId;
    ant.task = 'tend'; ant.nestId = -1;
    ant.pos = { x: x + 2 * odourRadiusMm(s, bu), y: s.pos.y, z };
    noticeOutside(sim, ant);
    ant.nestId = Math.max(0, nest);
    noticeOutside(sim, ant);
    expect(col.knownSourceIds).not.toContain(s.id);
  });
});
