// Possessed-ant scenarios per predator (task AC 4; GDD 05 E12, E13, §2.4 table): the telegraph precedes the strike
// by at least the stated lead, and the chapter's counterplay works with a scripted player.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Creature, Sim } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { TELEGRAPH_S, WOLF_FREEZE_CUE_S } from '@/sim/balance/creatures';
import { addStruggleInput } from './attack';
import { noteCreatureHit } from './index';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt, step,
  type CombatLog,
} from './testkit';

let restore: () => void;
let log: CombatLog;
beforeEach(() => { const f = installFakeCombat(); restore = f.restore; log = f.log; });
afterEach(() => restore());

const X = 150, Z = 150;

function scene(hour: number): { sim: Sim; ant: Ant } {
  const sim = creatureScene({ seed: 3 });
  setClock(sim, 'summer', 3, hour);
  sendQueenAway(sim);
  const ant = placeWorker(sim, X, Z);
  ant.maxHp = ant.hp = 10; // the standard Lasius worker of GDD 05 §4.1 (drawn sizes vary it a little)
  possess(sim, ant);
  return { sim, ant };
}

/** Scripted dodge: the player's `dodge` moves the ant 3 L sideways (the primitive is the actions task's). */
function dodge(sim: Sim, ant: Ant, side = 1): void {
  const L = ant.lengthBu * sim.world.bu;
  placeOnSurface(sim, ant, { x: ant.pos.x, y: 0, z: ant.pos.z + side * 3 * L });
}

function firstTelegraph(sim: Sim, c: Creature, maxTicks: number): { tick: number; strikeAt: number } {
  const tele = captureEvents(sim, ['predator-telegraph']);
  step(sim, maxTicks, () => tele.some((t) => (t.ev as { creatureId: number }).creatureId === c.id));
  const t = tele.find((x) => (x.ev as { creatureId: number }).creatureId === c.id);
  if (!t) throw new Error(`no telegraph from ${c.kind} (state ${c.state})`);
  return { tick: t.tick, strikeAt: (t.ev as { strikeAtTick: number }).strikeAtTick };
}

describe('jumping spider (E12)', () => {
  it('telegraphs >= 0.6 s before the leap; a sideways dodge during the wind-up makes it miss', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const strikes = captureEvents(sim, ['predator-strike']);
    const t = firstTelegraph(sim, spider, 400);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(Math.round((TELEGRAPH_S['jumping-spider'] ?? 0) * 10));
    dodge(sim, ant);
    step(sim, 20, () => strikes.length > 0);
    expect(strikes.length).toBe(1);
    expect((strikes[0].ev as { hit: boolean }).hit).toBe(false);
    expect(strikes[0].tick).toBe(t.strikeAt);
    expect(ant.hp).toBe(ant.maxHp);
  });

  it('without a dodge: 9 damage, seized, dead within 2.2 s unless freed', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const seized = captureEvents(sim, ['ant-seized']);
    const t = firstTelegraph(sim, spider, 400);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(seized.length).toBe(1);
    expect(ant.maxHp - ant.hp).toBeCloseTo(9, 5);
    const strikeTick = t.strikeAt;
    step(sim, 30, () => !ant.alive);
    expect(ant.alive).toBe(false);
    expect(sim.state.tick - strikeTick).toBeLessThanOrEqual(22);
    expect(log.damage.every((d) => d.cause === 'predation')).toBe(true);
    expect(spider.state).toBe('feed');
  });

  it('does not stalk an ant with a nestmate within 3 L', () => {
    const { sim, ant } = scene(14);
    placeWorker(sim, X, Z + 2 * ant.lengthBu * sim.world.bu);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const tele = captureEvents(sim, ['predator-telegraph']);
    step(sim, 300);
    expect(tele.length).toBe(0);
    expect(spider.state).not.toBe('stalk');
  });

  it('flees when two ants hold it, dropping its victim', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    const t = firstTelegraph(sim, spider, 400);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(ant.combat?.seizedBy).toBe(spider.id);
    for (let i = 0; i < 2; i++) {
      const h = placeWorker(sim, spider.pos.x + 3, spider.pos.z + (i ? 2 : -2));
      h.combat = { ...ant.combat!, lock: { targetKind: 'creature', targetId: spider.id, slot: i }, seizedBy: -1, heldBy: [] };
    }
    step(sim, 2);
    expect(spider.state).toBe('flee');
    expect(ant.combat?.seizedBy).toBe(-1);
  });
});

describe('wolf spider', () => {
  it('vibration cue >= 1.0 s before the wind-up, wind-up >= 0.5 s; hurrying away during the freeze makes it miss', () => {
    const { sim, ant } = scene(22);
    const spider = spawnAt(sim, 'wolf-spider', X - 20, Z, { state: 'ambush', stateS: 100 });
    const cues = captureEvents(sim, ['cue']);
    const t = firstTelegraph(sim, spider, 200);
    const vib = cues.find((c) => (c.ev as { cue: string }).cue === 'creature-step');
    expect(vib).toBeDefined();
    expect(t.strikeAt - vib!.tick).toBeGreaterThanOrEqual(Math.round((WOLF_FREEZE_CUE_S + (TELEGRAPH_S['wolf-spider'] ?? 0)) * 10));
    // hurry away during the freeze
    step(sim, 5);
    dodge(sim, ant, -1);
    const strikes = captureEvents(sim, ['predator-strike']);
    step(sim, 40, () => strikes.length > 0);
    expect(strikes.every((s) => !(s.ev as { hit: boolean }).hit)).toBe(true);
    expect(ant.hp).toBe(ant.maxHp);
  });
});

describe('ant-spider', () => {
  it('approaches, telegraphs >= 0.3 s, bites (1, non-lethal); venom paralyses at health 0.3; a nestmate drives it off and the ant recovers', () => {
    const { sim, ant } = scene(21);
    const spider = spawnAt(sim, 'ant-spider', X - 20, Z, { state: 'patrol' });
    const para = captureEvents(sim, ['ant-paralysed']);
    const t = firstTelegraph(sim, spider, 600);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(3);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(ant.alive).toBe(true);
    expect(ant.maxHp - ant.hp).toBeCloseTo(1, 5);
    // venom 6 over 15 s: health 0.9 -> 0.3 at its end -> paralysed for 60 s
    step(sim, 170, () => para.length > 0);
    expect(para.length).toBe(1);
    expect(ant.hp / ant.maxHp).toBeCloseTo(0.3, 3);
    // a nestmate comes by: the spider is seen and retreats; the paralysed ant recovers after 60 s
    placeWorker(sim, spider.pos.x + 2, spider.pos.z);
    step(sim, 3);
    expect(spider.state).toBe('flee');
    step(sim, 600);
    expect(ant.alive).toBe(true);
    expect(ant.combat!.paralysedUntilTick).toBeLessThanOrEqual(sim.state.tick);
  });

  it('retreats when another ant comes within 1 L (mimicry seen through)', () => {
    const { sim, ant } = scene(21);
    const spider = spawnAt(sim, 'ant-spider', X - 20, Z, { state: 'patrol' });
    step(sim, 300, () => spider.state === 'approach');
    expect(spider.state).toBe('approach');
    placeWorker(sim, spider.pos.x + 2, spider.pos.z);
    step(sim, 2);
    expect(spider.state).toBe('flee');
    void ant;
  });
});

describe('centipede', () => {
  it('telegraphs >= 0.5 s; two sprays drive it off (deterrence 0.56 >= 0.5)', () => {
    const { sim, ant } = scene(23);
    const c = spawnAt(sim, 'centipede', X - 14, Z, { state: 'prowl' });
    const t = firstTelegraph(sim, c, 300);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(5);
    noteCreatureHit(sim, c.id, ant.id, 'spray');
    noteCreatureHit(sim, c.id, ant.id, 'spray');
    step(sim, 1);
    expect(c.state).toBe('flee');
  });
});

describe('rove beetle (E13)', () => {
  function seizedByBeetle(): { sim: Sim; ant: Ant; beetle: Creature; seizeTick: number } {
    const { sim, ant } = scene(22);
    const beetle = spawnAt(sim, 'rove-beetle', X - 8, Z, { state: 'forage' });
    const t = firstTelegraph(sim, beetle, 300);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(4);
    step(sim, t.strikeAt - sim.state.tick + 1);
    expect(ant.combat?.seizedBy).toBe(beetle.id);
    return { sim, ant, beetle, seizeTick: t.strikeAt };
  }

  it('4 struggle inputs per second free the worker after 3.7 s with health 0.15', () => {
    const { sim, ant, seizeTick } = seizedByBeetle();
    const freed = captureEvents(sim, ['ant-freed']);
    // 4 inputs per second, evenly spaced, the first one 0.25 s after being seized
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

  it('two nestmates biting it: secretion, the worker is released, the beetle flees', () => {
    const { sim, ant, beetle } = seizedByBeetle();
    const a = placeWorker(sim, beetle.pos.x + 3, beetle.pos.z + 3);
    const b = placeWorker(sim, beetle.pos.x + 3, beetle.pos.z - 3);
    step(sim, 3);
    noteCreatureHit(sim, beetle.id, a.id, 'bite');
    expect(ant.combat?.seizedBy).toBe(beetle.id);
    noteCreatureHit(sim, beetle.id, b.id, 'bite');
    expect(ant.combat?.seizedBy).toBe(-1);
    expect(beetle.state).toBe('flee');
  });
});
