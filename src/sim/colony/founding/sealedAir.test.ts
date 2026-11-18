// Colony-life round 8 (the browser's first-play founding failure): a queen sealed in her nest breathes the sealed
// cavity's air wherever in it she stands (GDD 06 §5.5 "sealed in a humid chamber"). On suburban-garden #2 the player's
// own dig left her in the shaft end 2.6 BU under the terrain, outside both chamber lookups (chamberId -1): exposure
// read her as in shade on the surface (0.4 / gd) and she dried out in 1.5 gd of the time-lapse.
import { describe, expect, it } from 'vitest';
import { DESICC_SHADE_PER_GD } from '@/sim/balance/founding';
import { desiccationBase, sealedAirOf } from './exposure';
import { nestOf, phase, queen, searchingSim } from './testkit';
import { readyInRampCell } from './verifyKit';

function sealedInRamp() {
  const sim = searchingSim();
  const r = readyInRampCell(sim);
  expect(phase(sim)).toBe('seal');
  const nest = nestOf(sim);
  sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'sealed' });
  sim.tick();
  const q = queen(sim);
  // where she sat on suburban-garden #2: in the nest's cavity, 2 BU down the shaft, in no chamber
  const p = r.rampAt(2);
  q.pos = { ...p };
  q.medium = 'cavity';
  q.nestId = nest.id;
  q.chamberId = -1;
  return { sim, q, nest };
}

describe('the sealed founding queen breathes her cell air anywhere in the sealed nest', () => {
  it('in the shaft end, in no chamber: the founding cell is her air and she does not dry out', () => {
    const { sim, q, nest } = sealedInRamp();
    const cell = nest.chambers.find((c) => c.type === 'founding');
    expect(cell).toBeTruthy();
    expect(sealedAirOf(sim, q)).toBe(cell!.id);
    expect(desiccationBase(sim, q)).toBeLessThanOrEqual(0); // was DESICC_SHADE_PER_GD or the open rate
    expect(desiccationBase(sim, q)).toBeLessThan(DESICC_SHADE_PER_GD);
  });

  it('not sealed (the plug opened): the shaft rules apply again', () => {
    const { sim, q, nest } = sealedInRamp();
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'ready' });
    sim.tick();
    q.pos = { ...q.pos }; q.medium = 'cavity'; q.nestId = nest.id; q.chamberId = -1;
    expect(sealedAirOf(sim, q)).toBe(-1);
    expect(desiccationBase(sim, q)).toBeGreaterThan(0);
  });
});
