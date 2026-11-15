// Difficulty levers of GDD 05 §5 as the creatures apply them: telegraphMult on every wind-up, predatorDamageMult
// on strikes, the founding queen as prey (not on gentle, E23 creature part), the predator exclusion around a
// young player nest (until 5 workers), and the Predators setting on caps (catalogue.test.ts).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, DifficultyId, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { CREATURE_LEVERS, STRIKE_DAMAGE, TELEGRAPH_S } from '@/sim/balance/creatures';
import { canPrey } from './predator';
import { windupTicks } from './attack';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

function scene(preset: DifficultyId, o: { nest?: 'small' } = {}): { sim: Sim; ant: Ant } {
  const sim = creatureScene({ seed: 9, ...o });
  sim.state.config.difficulty.preset = preset;
  setClock(sim, 'summer', 3, 14);
  sendQueenAway(sim);
  const ant = placeWorker(sim, 150, 150);
  ant.maxHp = ant.hp = 10;
  possess(sim, ant);
  return { sim, ant };
}

describe('difficulty levers (§5)', () => {
  it.each(['gentle', 'naturalist', 'harsh'] as const)('%s: jumping-spider wind-up lead and strike damage', (preset) => {
    const { sim, ant } = scene(preset);
    const lv = CREATURE_LEVERS[preset];
    const spider = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan' });
    const tele = captureEvents(sim, ['predator-telegraph', 'predator-strike']);
    step(sim, 400, () => tele.some((t) => t.ev.type === 'predator-strike'));
    const t = tele.find((x) => x.ev.type === 'predator-telegraph')!;
    const lead = (t.ev as { strikeAtTick: number }).strikeAtTick - t.tick;
    expect(lead).toBe(windupTicks(sim, spider));
    expect(lead).toBeGreaterThanOrEqual(Math.floor((TELEGRAPH_S['jumping-spider'] ?? 0) * lv.telegraphMult * 10));
    const s = tele.find((x) => x.ev.type === 'predator-strike')!.ev as { hit: boolean; damage: number };
    expect(s.hit).toBe(true);
    expect(s.damage).toBeCloseTo((STRIKE_DAMAGE['jumping-spider'] ?? 0) * lv.predatorDamageMult, 6);
    void ant;
  });

  it('the founding queen is prey on naturalist and harsh, never on gentle', () => {
    for (const preset of ['gentle', 'naturalist', 'harsh'] as const) {
      const { sim } = scene(preset);
      const spider = spawnAt(sim, 'wolf-spider', 120, 150, { state: 'ambush' });
      const q = placeWorker(sim, 140, 150);
      q.flags |= AntFlag.FOUNDING;
      q.massMg = 22;
      expect(canPrey(sim, spider, q)).toBe(preset !== 'gentle');
    }
  });

  it('no predator takes a player worker near its nest until the colony has 5 workers (gentle 120 BU, naturalist 40 BU, harsh none)', () => {
    for (const preset of ['gentle', 'naturalist', 'harsh'] as const) {
      const { sim } = scene(preset, { nest: 'small' });
      const e = sim.state.nests[0].entrances[0].pos;
      const spider = spawnAt(sim, 'wolf-spider', e.x + 200, e.z, { state: 'ambush' });
      // 60 BU (240 mm) and 20 BU (80 mm) from the entrance
      const mid = placeWorker(sim, e.x + 60 * sim.world.bu, e.z);
      const near = placeWorker(sim, e.x + 20 * sim.world.bu, e.z);
      const workers = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker').length;
      expect(workers).toBeLessThan(5);
      expect(canPrey(sim, spider, mid)).toBe(preset !== 'gentle');
      expect(canPrey(sim, spider, near)).toBe(preset === 'harsh');
    }
  });
});
