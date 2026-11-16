// Independent review of the bird strike clamp (task stage2-look-fix, defect 4), against the REAL world field
// (sim.field.hardXYZ / sim.field.height as the game passes them through WorldLookup), not a synthetic cylinder.
//
// Findings (these tests fail on the reviewed code and stay for the fixer):
// 1. sim.field.hardXYZ saturates at the prim-hash margin (4 BU = 16 mm for Lasius niger, the default species) away
//    from primitives. The top column sphere of birdAim.columnSpheres has radius headRadiusMm x 1.25 = 16.25 mm, which
//    can never be "clear" when the field never reports more than 16 mm: clearAim() returns null EVERYWHERE, so in a
//    Lasius game the beak only hovers 56 mm above the ground and never strikes, even on open soil.
// 2. The column is tested from the TERRAIN height under the aim (field.height ignores primitives), not from the sim's
//    aim height: an aim on top of a slab, stone or log is judged to be inside the prop.
import { describe, expect, it } from 'vitest';
import { humanSim, patioWorld } from '@/sim/environment/human/testkit';
import { BIRD_PECK_EVERY_S } from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import { clearAim, columnSpheres, strikeClear } from './birdAim';
import { BirdRenderer } from './props/birdRenderer';
import type { BirdView } from './simAdapter';
import { BIRD_LOOK } from './tuning';
import type { Sim } from '@/sim/types';

const BEAK = 22; // thrush

/** Beak tip height 95 % of the way through a peck, as BirdRenderer draws it on the real field. */
function tipAtPeck(sim: Sim, aim: { x: number; y: number; z: number }): number {
  const r = new BirdRenderer();
  const every = BIRD_PECK_EVERY_S * TICKS_PER_SECOND;
  const ev: BirdView = { variant: 'thrush', pos: { ...aim }, phase: 'landed', startTick: 0, landTick: 30, endTick: 5000, nextPeckTick: 30 + every, peckAim: { ...aim } };
  const t = 30 + 0.95 * BIRD_LOOK.strikeS * TICKS_PER_SECOND;
  r.update(ev, t, (x, z) => sim.field.height(x, z), (x, y, z) => sim.field.hardXYZ(x, y, z));
  const head = r.group.getObjectByName('bird-head')!;
  expect(head.visible).toBe(true);
  const y = head.position.y - BEAK;
  r.dispose();
  return y;
}

describe('bird strike on open ground (Lasius niger, BU 4 mm, no primitive anywhere)', () => {
  const sim = humanSim(patioWorld({ sizeMm: 1300 }));
  const hard = (x: number, y: number, z: number) => sim.field.hardXYZ(x, y, z);
  const height = (x: number, z: number) => sim.field.height(x, z);
  const AIM = { x: 650, y: 0, z: 650 };

  it('the free distance saturates at the hash margin, below the largest column sphere', () => {
    expect(hard(AIM.x, 50, AIM.z)).toBeCloseTo(sim.world.bu * 4, 6);
    const largest = Math.max(...columnSpheres(BEAK).map(([, r]) => r));
    // documents the cause: a sphere wider than the saturated distance can never test clear
    expect(largest).toBeGreaterThan(hard(AIM.x, 50, AIM.z));
  });

  it('an aim on bare open ground is kept (FAILS: clearAim returns null)', () => {
    expect(clearAim(AIM, 0, BEAK, height, hard)).toEqual({ x: AIM.x, z: AIM.z });
  });

  it('BirdRenderer: the beak reaches the ground at the bottom of a peck (FAILS: it hovers at 56 mm)', () => {
    expect(tipAtPeck(sim, AIM)).toBeLessThan(0.2 * BIRD_LOOK.restHeightMm);
  });
});

describe('bird strike on top of a wide slab (40 mm concrete, nothing above it)', () => {
  const TOP = 40;
  const sim = humanSim(patioWorld({ sizeMm: 1300, slabMm: 600, jointMm: 12, slabTopMm: TOP }));
  const hard = (x: number, y: number, z: number) => sim.field.hardXYZ(x, y, z);
  const height = (x: number, z: number) => sim.field.height(x, z);
  const C = { x: 312, y: TOP, z: 312 };

  it('the world is what the test assumes: terrain at 0 under the slab, open air above its top', () => {
    expect(height(C.x, C.z)).toBeCloseTo(0, 3);
    expect(hard(C.x, TOP / 2, C.z)).toBeLessThan(0);
    expect(hard(C.x, TOP + 20, C.z)).toBeGreaterThan(15);
  });

  it('the strike column is tested from the aim height, not from the terrain inside the slab (FAILS)', () => {
    // from the terrain (y = 0) the tip sphere is inside the slab; a correct clamp starts at the sim's aim (slab top)
    expect(strikeClear(C.x, C.z, height(C.x, C.z), BEAK, hard)).toBe(false);
    expect(clearAim(C, 0, BEAK, height, hard)).not.toBeNull();
  });

  it('BirdRenderer: at the bottom of a peck the tip reaches the slab top (FAILS: hovers at terrain + 56 mm)', () => {
    expect(tipAtPeck(sim, C)).toBeLessThan(TOP + 0.2 * BIRD_LOOK.restHeightMm);
  });
});
