// Independent review of colony-life round 9 (R33, tendDraft.ts): the draft is derived each tick from the board's
// open tend jobs and the ants' states, so a game saved and loaded while piles are overdue must go on exactly as the
// uninterrupted game (saves in mid-window and at a window's first tick).
import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { NURSERY_BOARD_PERIOD_S } from '@/sim/balance/nestwork';
import { daysToTicks, secondsToTicks } from '@/sim/time';
import { makeNestColony } from './testkit';
import { DRAFT_BROOD } from './tendDraft';

const PERIOD = secondsToTicks(NURSERY_BOARD_PERIOD_S);

function overdueColony(seed: number) {
  const k = makeNestColony({
    workers: 10, stores: { c: 80, p: 40 }, seed,
    brood: [{ stage: 'egg', n: 8, chamber: 'nursery' }, { stage: 'pupa', n: 6, chamber: 'nursery' }],
  });
  const sim = k.sim;
  for (let i = 0; i < 30; i++) sim.tick();
  // every egg and pupa overdue (past the tend due age, short of R33's 1.0 gd), so the draft has work
  for (const b of sim.stores.brood.list) if (b.alive && b.stage !== 'larva') b.lastTendedTick = sim.state.tick - daysToTicks(0.6);
  return k;
}

describe('R33 draft review: save -> load while piles are overdue', () => {
  for (const offset of [0, 7]) {
    it(`save at window tick ${offset}: the loaded game runs as the uninterrupted one`, () => {
      const { sim } = overdueColony(4 + offset);
      while (sim.state.tick % PERIOD !== offset) sim.tick();
      const drafted = () => sim.stores.ants.list.filter((a) => a.alive && typeof a.bb[DRAFT_BROOD] === 'number' && (a.bb[DRAFT_BROOD] as number) >= 0).length;
      const loaded = createSim(restore(snapshot(sim)).state, sim.world);
      expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
      let seen = 0, draftTicks = 0;
      for (let t = 0; t < 4 * PERIOD; t++) { sim.tick(); loaded.tick(); const n = drafted(); if (n > 0) draftTicks++; seen = Math.max(seen, n); }
      expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
      // the draft did work in this window (a drafted worker holds the pile id until her next nurse select)
      expect(draftTicks).toBeGreaterThan(0);
    }, 120_000);
  }
});
