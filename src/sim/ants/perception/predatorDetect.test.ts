// threats-live cross edit: an ant perceives a predator as its threat at GDD 05 §2.4's detection range (4 L x the
// predator's stealth in its state), not at any predator within SMELL_CREATURE_BU, and never a hidden / dormant
// creature or a buried antlion. Before the edit an ant fled from a resting jumping spider 20 mm away (and from
// burrowed or dormant predators), so on real worlds ants ran from every predator before it could strike.

import { describe, expect, it } from 'vitest';
import type { Ant, CreatureKind, Sim } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { CreatureFlag, spawnCreatureOfKind } from '@/sim/ecology/creatures';
import { perceiveNow, THREAT, threatCode } from './index';

function scene(): { sim: Sim; ant: Ant } {
  const sim = makeTestSim({ sizeBu: 200, nest: 'small', workers: 1, systems: [] });
  const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
  placeOnSurface(sim, ant, { x: 100 * sim.world.bu, y: 0, z: 100 * sim.world.bu });
  ant.nestId = -1;
  ant.chamberId = -1;
  return { sim, ant };
}

function threatFrom(kind: CreatureKind, dxMm: number, state: string, flags = 0): number {
  const { sim, ant } = scene();
  const c = spawnCreatureOfKind(sim, kind, { x: ant.pos.x + dxMm, y: 0, z: ant.pos.z }, { state })!;
  c.flags |= flags;
  sim.index.refresh();
  perceiveNow(sim, ant);
  return threatCode(ant);
}

describe('predator detection range (GDD 05 §2.4)', () => {
  it('a jumping spider: seen at 4 L (16 mm for a 4 mm worker) when resting, at half that while stalking', () => {
    expect(threatFrom('jumping-spider', 14, 'rest')).toBe(THREAT.creature);
    expect(threatFrom('jumping-spider', 20, 'rest')).toBe(THREAT.none); // was a threat (6 BU = 24 mm)
    expect(threatFrom('jumping-spider', 10, 'stalk')).toBe(THREAT.none);
    expect(threatFrom('jumping-spider', 7, 'stalk')).toBe(THREAT.creature);
  });

  it('a wolf spider in ambush only within 4 L x 0.4; an ant-spider only within 1 L', () => {
    expect(threatFrom('wolf-spider', 10, 'ambush')).toBe(THREAT.none);
    expect(threatFrom('wolf-spider', 10, 'wander')).toBe(THREAT.creature);
    expect(threatFrom('ant-spider', 6, 'patrol')).toBe(THREAT.none);
    expect(threatFrom('ant-spider', 3, 'patrol')).toBe(THREAT.creature);
  });

  it('never a hidden or dormant creature, never a buried antlion', () => {
    expect(threatFrom('centipede', 6, 'prowl', CreatureFlag.HIDDEN)).toBe(THREAT.none);
    expect(threatFrom('wolf-spider', 6, 'wander', CreatureFlag.DORMANT)).toBe(THREAT.none);
    expect(threatFrom('antlion', 4, 'wait')).toBe(THREAT.none);
  });
});
