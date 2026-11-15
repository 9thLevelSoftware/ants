// App. E 12 and 13 with the real combat module and the real `dodge` primitive (the creature module's own tests use a
// reference combat fake and a scripted dodge): the jumping spider misses a possessed worker that dodges sideways
// during the wind-up and otherwise deals 9 and seizes; a rove beetle's hold is struggled free after ~3.7 s at
// health ~0.15, and two nestmates biting it make it release the worker.
import { describe, expect, it } from 'vitest';
import type { Ant, Creature, Sim } from '@/sim/types';
import { idleIntent } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing/testWorld';
import { actionSystem, behaviourSystem, lifecycleSystem, playerControlSystem } from '@/sim/ants';
import { locomotionSystem } from '@/sim/locomotion';
import { creatureSystem } from '@/sim/ecology/creatures';
import { addStruggleInput } from '@/sim/ecology/creatures/attack';
import { captureEvents, placeWorker, possess, sendQueenAway, setClock, spawnAt, step } from '@/sim/ecology/creatures/testkit';
import { COMBAT_TEST_BEHAVIOURS, setFlags } from './testkit';
import { combatSystem, resolveBite } from './index';

const X = 150, Z = 150;

function scene(hour: number): { sim: Sim; ant: Ant } {
  const sim = makeTestSim({
    seed: 3, sizeBu: 128, behaviours: [...COMBAT_TEST_BEHAVIOURS],
    systems: [commandsSystem, behaviourSystem, playerControlSystem, actionSystem, creatureSystem, locomotionSystem, combatSystem, lifecycleSystem],
  });
  setFlags(sim, { noScan: true });
  setClock(sim, 'summer', 3, hour);
  sendQueenAway(sim);
  const ant = placeWorker(sim, X, Z);
  ant.maxHp = ant.hp = 10;
  ant.tb = 25;
  possess(sim, ant);
  return { sim, ant };
}

function telegraph(sim: Sim, c: Creature, max: number): { tick: number; strikeAt: number } {
  const tele = captureEvents(sim, ['predator-telegraph']);
  step(sim, max, () => tele.some((t) => (t.ev as { creatureId: number }).creatureId === c.id));
  const t = tele.find((x) => (x.ev as { creatureId: number }).creatureId === c.id);
  if (!t) throw new Error(`no telegraph from ${c.kind}`);
  return { tick: t.tick, strikeAt: (t.ev as { strikeAtTick: number }).strikeAtTick };
}

describe('jumping spider and the dodge primitive (App. E 12)', () => {
  it('a sideways dodge during the wind-up makes the leap miss', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const strikes = captureEvents(sim, ['predator-strike']);
    const t = telegraph(sim, spider, 400);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(6);
    sim.setPlayerIntent({ ...idleIntent(), dir: { x: 0, y: 0, z: 1 } });
    sim.enqueue({ type: 'action', actionId: 'dodge', phase: 'start' });
    step(sim, 1);
    sim.setPlayerIntent(idleIntent());
    step(sim, 20, () => strikes.length > 0);
    expect(strikes.length).toBe(1);
    expect((strikes[0].ev as { hit: boolean }).hit).toBe(false);
    expect(ant.hp).toBe(10);
  });

  it('without a dodge: 9 damage through combat, seized, dead within 2.2 s', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const t = telegraph(sim, spider, 400);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(ant.combat?.seizedBy).toBe(spider.id);
    expect(10 - ant.hp).toBeCloseTo(9, 5);
    step(sim, 30, () => !ant.alive);
    expect(ant.alive).toBe(false);
    expect(sim.state.tick - t.strikeAt).toBeLessThanOrEqual(22);
  });
});

describe('rove beetle (App. E 13)', () => {
  function seized(): { sim: Sim; ant: Ant; beetle: Creature; seizeTick: number } {
    const { sim, ant } = scene(22);
    const beetle = spawnAt(sim, 'rove-beetle', X - 8, Z, { state: 'forage' });
    const t = telegraph(sim, beetle, 300);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(ant.combat?.seizedBy).toBe(beetle.id);
    return { sim, ant, beetle, seizeTick: t.strikeAt };
  }

  it('4 struggle inputs per second free the worker after 3.7 s with health 0.15', () => {
    const { sim, ant, seizeTick } = seized();
    const freed = captureEvents(sim, ['ant-freed']);
    for (let k = 1; k <= 60 && freed.length === 0; k++) {
      const at = seizeTick + Math.round(2.5 * k);
      while (sim.state.tick < at) sim.tick();
      addStruggleInput(sim, ant.id);
    }
    step(sim, 3);
    expect(freed.length).toBe(1);
    const s = (freed[0].tick - seizeTick) / 10;
    expect(s).toBeGreaterThan(3.5);
    expect(s).toBeLessThan(3.9);
    expect(ant.hp / ant.maxHp).toBeGreaterThan(0.12);
    expect(ant.hp / ant.maxHp).toBeLessThan(0.18);
  });

  it('two nestmates biting it make it release the worker', () => {
    const { sim, ant, beetle } = seized();
    const a = placeWorker(sim, beetle.pos.x + 3, beetle.pos.z + 3);
    const b = placeWorker(sim, beetle.pos.x + 3, beetle.pos.z - 3);
    setFlags(sim, { noRng: true });
    sim.index.refresh();
    resolveBite(sim, a, 'creature', beetle.id, false);
    resolveBite(sim, b, 'creature', beetle.id, false);
    step(sim, 3);
    expect(ant.combat?.seizedBy ?? -1).toBe(-1);
  });
});
