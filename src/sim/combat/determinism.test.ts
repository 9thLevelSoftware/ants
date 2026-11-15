// Acceptance criterion 7: a melee is deterministic for a seed, and all combat state stays plain data. Also
// creatures in fights: bites on a creature report to the creature module, a killed creature becomes food, predator
// damage to ants goes through armour and the possessed ant's difficulty multiplier.
import { describe, expect, it } from 'vitest';
import { findNonPlain } from '@/sim/testing';
import { spawnCreatureOfKind } from '@/sim/ecology';
import { ant, arena, record, stateHash, step } from './testkit';
import { applyDamage, beginGrapple, engage, resolveBite, sprayHit } from './index';

function melee(seed: number): string {
  const a = arena({ seed });
  const mine = [0, 1, 2, 3, 4].map((i) => ant(a.sim, a.home, 38, 36 + i * 2, 'worker', { x: 1, y: 0, z: 0 }));
  const theirs = [0, 1, 2, 3, 4].map((i) => ant(a.sim, a.rival, 42, 36 + i * 2, 'worker', { x: -1, y: 0, z: 0 }));
  a.sim.index.refresh();
  for (let i = 0; i < 5; i++) { engage(a.sim, mine[i].id, 'ant', theirs[i].id); engage(a.sim, theirs[i].id, 'ant', mine[i].id); }
  step(a.sim, 300);
  expect(findNonPlain(a.sim.state)).toEqual([]);
  return stateHash(a.sim);
}

describe('determinism and plain data (criterion 7)', () => {
  it('the same melee twice gives the same state; another seed differs', () => {
    const h1 = melee(11);
    expect(melee(11)).toBe(h1);
    expect(melee(12)).not.toBe(h1);
  });
});

describe('creatures in fights', () => {
  it('bites on a creature are reported, a killed creature becomes food for the killers', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const w = ant(a.sim, a.home, 40, 40);
    const c = spawnCreatureOfKind(a.sim, 'fly-larva', { x: w.pos.x + 0.9 * a.sim.world.bu * 2, y: 0, z: w.pos.z })!;
    expect(c).toBeTruthy();
    a.sim.index.refresh();
    const before = c.deterrence;
    expect(resolveBite(a.sim, w, 'creature', c.id, false)).toBeCloseTo(1, 9);
    expect(c.deterrence).toBeGreaterThan(before);
    expect(beginGrapple(a.sim, w.id, 'creature', c.id)).toBe(true);
    c.hp = 0.5;
    const died = record(a.sim, ['creature-died']);
    step(a.sim, 12);
    a.sim.events.flush();
    expect(c.alive).toBe(false);
    expect(died.length).toBe(1);
    expect(w.combat?.lock ?? null).toBeNull();
  });

  it('acid on a creature: deterrence up by 0.35 x acid sensitivity, damage over 2 s', () => {
    const a = arena({ manual: true, flags: { noRng: true } });
    const w = ant(a.sim, a.home, 40, 40);
    const c = spawnCreatureOfKind(a.sim, 'centipede', { x: w.pos.x + 4, y: 0, z: w.pos.z })!;
    a.sim.index.refresh();
    const hp0 = c.hp, d0 = c.deterrence;
    expect(sprayHit(a.sim, w, 'creature', c.id)).toBeCloseTo(2.5 * 0.8, 9);
    expect(c.deterrence - d0).toBeCloseTo(0.35 * 0.8, 6);
    step(a.sim, 25);
    expect(hp0 - c.hp).toBeCloseTo(2.0 * (1 - 0.2), 6); // centipede armour 0.2
  });

  it('predator damage to ants: armour applies, the possessed ant takes damageTakenMult, death cause kept', () => {
    const a = arena({ manual: true });
    const q = ant(a.sim, a.home, 30, 30, 'queen');
    expect(applyDamage(a.sim, 'ant', q.id, 10, 'predation')).toBeCloseTo(7, 9); // armour 0.3
    const w = ant(a.sim, a.home, 34, 30);
    a.sim.state.config.difficulty.params.damageTakenMult = 0.75;
    a.sim.enqueue({ type: 'possess', antId: w.id });
    step(a.sim, 1);
    expect(applyDamage(a.sim, 'ant', w.id, 4, 'predation')).toBeCloseTo(3, 9);
    const deaths = record(a.sim, ['ant-died']);
    applyDamage(a.sim, 'ant', w.id, 50, 'predation');
    a.sim.events.flush();
    expect(deaths[0]).toMatchObject({ antId: w.id, cause: 'predation' });
  });
});
