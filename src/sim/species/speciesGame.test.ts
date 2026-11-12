// With each species selected, a new game starts and runs without invariant violations (task acceptance 4). The unit
// test runs a short stretch on the small test world; the full two-game-day soak per species is the headless tool
// (node tools/sim/run-ts.mjs tools/sim/soak.ts --species <id> --days 2).
import { describe, expect, it } from 'vitest';
import { SPECIES_IDS } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { requireSpecies } from './index';

/** Game days stepped per species (the soak tool does 2). */
const DAYS = 1;

describe('a new game of each species starts and steps cleanly', () => {
  for (const id of SPECIES_IDS) {
    it(id, () => {
      const sim = makeTestSim({ species: id, seed: 3 });
      const def = requireSpecies(id);
      const col = sim.state.colonies[0];
      expect(col.species).toBe(id);
      expect(sim.state.env.climateId).toBe(def.climate);
      const queen = sim.state.ants.find((a) => a.caste === 'queen' && a.alive)!;
      expect(queen, 'founding queen').toBeDefined();
      expect(queen.hp).toBe(queen.maxHp);
      // One adult of every non-queen caste of the species, so each caste's stats, actions and tasks are exercised.
      for (const cd of def.castes) {
        if (cd.caste !== 'queen') sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 2, caste: cd.caste, ageGd: 5, task: null, pos: null });
      }
      sim.tick();
      const invariants = collectInvariants();
      const violations: InvariantViolation[] = [];
      checkInvariants(sim, invariants, violations);
      const ticks = Math.round(DAYS * TICKS_PER_DAY);
      for (let i = 0; i < ticks; i++) {
        sim.tick();
        if (sim.state.tick % 250 === 0) checkInvariants(sim, invariants, violations);
      }
      checkInvariants(sim, invariants, violations);
      expect(violations).toEqual([]);
      for (const cd of def.castes) {
        if (cd.caste !== 'queen') expect(sim.state.ants.some((a) => a.alive && a.caste === cd.caste), `${cd.caste} alive`).toBe(true);
      }
      expect(sim.state.ants.every((a) => !a.alive || (Number.isFinite(a.pos.x) && Number.isFinite(a.hp)))).toBe(true);
    });
  }
});
