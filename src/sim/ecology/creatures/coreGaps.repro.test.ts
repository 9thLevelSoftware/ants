// threats-calibrate step 4: reproductions of the three gaps outside the creature module that threats-live listed.
// They are NOT fixed here (they belong to the colony engineer: ants, locomotion). Two are written as `it.fails`:
// each states what the GDD asks for and currently fails; when the gap is closed the test starts failing as an
// `it.fails`, which is the signal to turn it into a plain `it`. The third (worker maxHp) is a reading, not a defect:
// the test pins where the value comes from.
//
// (a) GDD 05 §2.4: "AI carry paralysed nestmates (haul) with p 0.5". No ant behaviour does it: `Ant.carry.kind` has
//     no 'ant' member and nothing reads `combat.paralysedUntilTick` to start a haul (grep: only fight / patrol skip
//     such ants), so the ant-spider collects almost every bitten ant.
// (b) The hand-over workers are nanitics (first brood, species `firstBroodClass.nanitic`): length x NANITIC_SCALE 0.85
//     -> mass 0.614 mg -> maxHp 10 x 0.614^(2/3) = 7.2, i.e. GDD 05 §4.1's own "LN nanitic" row (0.6 mg, 7 hp). The
//     jumping-spider leap (9) then kills outright; E12's "9 damage, seized" is written for a regular worker (10 hp).
// (c) GDD 05 §2.4 / E14: known pits are avoided in local steering (radius + 1 L); `knownHazardsNear` is exported by this
//     module but no locomotion or behaviour code calls it, so a nestmate that knows a pit walks straight through it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { colonySlotBit, spawnAnt } from '@/sim/entities';
import { navTo } from '@/sim/locomotion';
import { NANITIC_SCALE } from '@/sim/balance/colony';
import { STRIKE_DAMAGE } from '@/sim/balance/creatures';
import { getSpecies } from '@/sim/species';
import { spawnCreatureOfKind } from './index';
import { ensureCombat } from './attack';
import { creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, step } from './testkit';

const hdist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('(a) paralysed nestmates are carried home with p 0.5 (GDD 05 §2.4)', () => {
  /** A worker paralysed by ant-spider venom (health 0.25) with three idle nestmates 3 BU away; every system runs. */
  function paralysedScene(seed: number): { sim: Sim; victim: Ant } {
    const sim = makeTestSim({ seed, sizeBu: 128, nest: 'small', workers: 0 });
    if (sim.state.player.opening) { sim.state.player.opening.done = true; sim.state.player.opening.phase = 'done'; }
    setClock(sim, 'summer', 3, 21);
    const e = sim.state.nests[0].entrances[0].pos, bu = sim.world.bu;
    const victim = placeWorker(sim, e.x + 30 * bu, e.z);
    victim.hp = 0.25 * victim.maxHp;
    ensureCombat(victim).paralysedUntilTick = sim.state.tick + 600; // PARALYSE_S 60 s
    for (const dz of [-3, 0, 3]) { const n = placeWorker(sim, e.x + 27 * bu, e.z + dz * bu); n.task = 'idle'; }
    return { sim, victim };
  }

  it.fails('in at least one of 6 colonies a nestmate moves the paralysed ant (expected about 3 of 6)', () => {
    let rescued = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { sim, victim } = paralysedScene(seed);
      const at = { ...victim.pos };
      step(sim, 550); // while still paralysed
      if (victim.alive && (victim.nestId >= 0 || hdist(victim.pos, at) > sim.world.bu)) rescued++;
    }
    expect(rescued).toBeGreaterThan(0);
  }, 60_000);
});

describe('(b) the hand-over workers\' maxHp 7.2 is the nanitic row of GDD 05 §4.1', () => {
  it('a nanitic Lasius worker has maxHp ~7.2 (GDD 05 §4.1: 7) and a jumping-spider leap (9) exceeds it; a regular worker of mean size has 10', () => {
    const sim = makeTestSim({ seed: 1, sizeBu: 64, workers: 0, systems: [] });
    const col = sim.state.colonies[0];
    const mean = getSpecies('lasius-niger')!.castes.find((c) => c.caste === 'worker')!.lengthBu.mean;
    const p = { x: 100, y: 0, z: 100 };
    const nanitic = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: p, lengthBu: NANITIC_SCALE * mean });
    const regular = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: p, lengthBu: mean });
    expect(nanitic.massMg).toBeCloseTo(0.614, 2);
    expect(nanitic.maxHp).toBeCloseTo(7.2, 1);
    expect(Math.abs(nanitic.maxHp - 7)).toBeLessThan(0.3);
    expect(regular.maxHp).toBeCloseTo(10, 1);
    expect(STRIKE_DAMAGE['jumping-spider']!).toBeGreaterThan(nanitic.maxHp); // killed outright, no seized phase
    expect(STRIKE_DAMAGE['jumping-spider']!).toBeLessThan(regular.maxHp); // seized (E12)
  });
});

describe('(c) known antlion pits are avoided by steering (GDD 05 §2.4, E14)', () => {
  let undo: () => void;
  beforeEach(() => { undo = installFakeCombat().restore; });
  afterEach(() => undo());

  it.fails('a worker whose colony knows a pit keeps radius + 1 L from it on a walk past it', () => {
    const sim = creatureScene({ seed: 5 });
    setClock(sim, 'summer', 3, 14);
    sendQueenAway(sim);
    const X = 250, Z = 250;
    const al = spawnCreatureOfKind(sim, 'antlion', { x: X, y: 0, z: Z })!;
    const pit = sim.state.ecology.hazards.find((h) => h.id === al.bb.pit)!;
    const ant = placeWorker(sim, X - 60, Z);
    pit.knownBy |= colonySlotBit(sim, ant.colony);
    const L = ant.lengthBu * sim.world.bu;
    navTo(sim, ant, { x: X + 60, y: 0, z: Z });
    let closest = Infinity;
    for (let i = 0; i < 400 && ant.alive && ant.nav.status !== 'arrived'; i++) {
      step(sim, 1);
      closest = Math.min(closest, hdist(ant.pos, pit.pos));
    }
    expect(closest).toBeGreaterThanOrEqual(pit.radius + L);
  });
});
