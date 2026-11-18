// GDD 05 §2.2 creature table, patch prey: "springtail: one bite kills" (mite: as springtail). colony-life round 8:
// a game-sized Lasius worker bites for less than a springtail's 1 HP, so before this rule the springtail survived the
// first bite, the hunter counted as fighting (combat/damage.ts marks an attacker whose target survives), laid fight
// alarm pheromone on itself and fled from it before it could bite again.
import { describe, expect, it } from 'vitest';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { CB } from './state';
import { ant, arena } from './testkit';
import { combatStats, resolveBite } from './index';

function hunterAndPrey(kind: 'springtail' | 'mite' | 'fly-larva', lengthBu: number) {
  const a = arena({ manual: true, flags: { noRng: true } });
  const w = ant(a.sim, a.home, 40, 40, 'worker', undefined, lengthBu);
  const c = spawnCreatureOfKind(a.sim, kind, { x: w.pos.x + 0.9 * a.sim.world.bu, y: 0, z: w.pos.z })!;
  // the prey has spent its escape roll on this contact (preyFauna.ts rolledThisContact): the bite lands
  c.bb.stayUntil = a.sim.state.tick + 1000;
  a.sim.index.refresh();
  return { a, w, c };
}

describe('patch prey dies of one landed bite (GDD 05 §2.2)', () => {
  it('a small worker (bite < 1) kills a springtail with one bite and is not marked as fighting', () => {
    const { a, w, c } = hunterAndPrey('springtail', 0.85);
    expect(combatStats(a.sim, w).bite).toBeLessThan(c.maxHp); // the case the rule is for
    expect(resolveBite(a.sim, w, 'creature', c.id, false)).toBeGreaterThan(0);
    expect(c.alive).toBe(false);
    expect(w.bb[CB.lastDmg]).toBeUndefined(); // no fight: no fight alarm, no flight from it
  });

  it('a mite too (its armour does not save it once the bite lands)', () => {
    const { w, c, a } = hunterAndPrey('mite', 0.85);
    // a mite evades half the bites (MITE_EVADE): the first bite that lands kills it
    let dealt = 0;
    for (let i = 0; i < 40 && dealt === 0; i++) dealt = resolveBite(a.sim, w, 'creature', c.id, false);
    expect(dealt).toBeGreaterThan(0);
    expect(c.alive).toBe(false);
  });

  it('other creatures keep their HP: a fly larva survives one small bite and the biter is in a fight', () => {
    const { w, c, a } = hunterAndPrey('fly-larva', 0.85);
    const hp0 = c.hp;
    const dealt = resolveBite(a.sim, w, 'creature', c.id, false);
    expect(dealt).toBeCloseTo(combatStats(a.sim, w).bite * (1 - 0), 6);
    expect(c.alive).toBe(true);
    expect(c.hp).toBeCloseTo(hp0 - dealt, 9);
    expect(w.bb[CB.lastDmg]).toBe(a.sim.state.tick);
  });
});
