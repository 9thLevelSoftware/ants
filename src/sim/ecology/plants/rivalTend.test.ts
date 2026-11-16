// Rivals' virtual tending as the herd's tendedness floor (viab-economy R1; GDD 05 §3.5): a herd in a cell an abstract
// rival colony claims is tended at least at the rival's virtualTend; elsewhere (or for the player) nothing changes.

import { describe, expect, it } from 'vitest';
import type { Colony, RivalAbstract } from '@/sim/types';
import { herdSourceOf } from '@/sim/ecology';
import { cellAt } from '@/sim/rivals/claims';
import { addHerd, fixWeather, plantSim } from './testkit';
import { stepTending } from './tending';
import { rivalTendFloor } from './rivalTend';

/** One plant sim whose territory grid gives the cell under the herd to a rival with virtualTend `vt`. */
function claimedHerd(vt: number) {
  const restore = fixWeather(20);
  const { sim, plants } = plantSim({ sizeBu: 200 });
  const h = addHerd(sim, plants[0], 60);
  const src = herdSourceOf(sim, h)!;
  const t = sim.state.rivals.territory;
  if (t.marks.length === 0) {
    t.slots = Math.max(2, t.slots);
    t.marks = new Float32Array(t.w * t.h * t.slots);
  }
  const rivalCol: Colony = { ...sim.state.colonies[0], id: sim.state.nextId++, isPlayer: false, rival: { virtualTend: vt } as RivalAbstract };
  sim.stores.colonies.add(rivalCol);
  while (t.slotColony.length < t.slots) t.slotColony.push(-1);
  t.slotColony[1] = rivalCol.id;
  const c = cellAt(t, src.pos.x, src.pos.z);
  t.marks[c * t.slots + 1] = 100;
  return { sim, h, src, rivalCol, restore };
}

describe('rival virtual tending (R1 seam)', () => {
  it('a rival-claimed cell gives its herds the rival virtualTend as a floor', () => {
    const { sim, h, src, restore } = claimedHerd(0.6);
    try {
      expect(rivalTendFloor(sim, src)).toBeCloseTo(0.6, 6);
      // the tending step alone (the full tick would field the stand-in rival colony)
      for (let i = 0; i < 600; i++) stepTending(sim, h, 1, 1, 1);
      expect(h.tend).toBeGreaterThan(0.5);
    } finally { restore(); }
  });

  it('no floor in unclaimed cells, for the player, or without an abstract rival', () => {
    const { sim, src, rivalCol, restore } = claimedHerd(0.6);
    try {
      rivalCol.rival = null;
      expect(rivalTendFloor(sim, src)).toBe(0);
      rivalCol.rival = { virtualTend: 0.6 } as RivalAbstract;
      rivalCol.isPlayer = true;
      expect(rivalTendFloor(sim, src)).toBe(0);
      rivalCol.isPlayer = false;
      sim.state.rivals.territory.marks.fill(0);
      expect(rivalTendFloor(sim, src)).toBe(0);
    } finally { restore(); }
  });
});
