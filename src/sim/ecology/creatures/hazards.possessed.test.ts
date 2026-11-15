// Possessed-ant scenarios for the remaining predators and hazards (task AC 4; GDD 05 §2.4 table, §2.6, E14, E15):
// centipede (dodge during the wind-up), jumping spider (spray), antlion (stay off the slope, struggle out when
// grabbed), bird (dodge a peck after its head-cock, hide under cover). Scripted intent: the test moves the ant the
// way the dodge primitive would and reports struggle inputs as the player-control layer does.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Creature, Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { BIRD_HEAD_COCK_S, TELEGRAPH_S } from '@/sim/balance/creatures';
import { addStruggleInput } from './attack';
import { noteCreatureHit, spawnCreatureOfKind, triggerBird } from './index';
import { isExposedAnt } from './bird';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, quietHistory, sendQueenAway, setClock, spawnAt,
  step,
} from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

const X = 150, Z = 150;

function scene(hour: number, prims: Primitive[] = []): { sim: Sim; ant: Ant } {
  const sim = creatureScene({ seed: 8, prims });
  setClock(sim, 'summer', 3, hour);
  sendQueenAway(sim);
  const ant = placeWorker(sim, X, Z);
  ant.maxHp = ant.hp = 10;
  possess(sim, ant);
  return { sim, ant };
}

function dodge(sim: Sim, ant: Ant, side = 1): void {
  const L = ant.lengthBu * sim.world.bu;
  placeOnSurface(sim, ant, { x: ant.pos.x, y: 0, z: ant.pos.z + side * 3 * L });
}

function telegraphOf(sim: Sim, c: Creature, maxTicks: number): { tick: number; strikeAt: number } {
  const tele = captureEvents(sim, ['predator-telegraph']);
  step(sim, maxTicks, () => tele.length > 0);
  const t = tele.find((x) => (x.ev as { creatureId: number }).creatureId === c.id);
  if (!t) throw new Error(`no telegraph from ${c.kind} (state ${c.state})`);
  return { tick: t.tick, strikeAt: (t.ev as { strikeAtTick: number }).strikeAtTick };
}

describe('centipede', () => {
  it('a dodge during its 0.5 s wind-up makes the lunge miss', () => {
    const { sim, ant } = scene(23);
    const c = spawnAt(sim, 'centipede', X - 14, Z, { state: 'prowl' });
    const strikes = captureEvents(sim, ['predator-strike']);
    const t = telegraphOf(sim, c, 300);
    expect(t.strikeAt - t.tick).toBeGreaterThanOrEqual(Math.round((TELEGRAPH_S.centipede ?? 0) * 10));
    dodge(sim, ant);
    step(sim, 20, () => strikes.length > 0);
    expect((strikes[0].ev as { hit: boolean }).hit).toBe(false);
    expect(ant.hp).toBe(ant.maxHp);
  });
});

describe('jumping spider', () => {
  it('two sprays while it stalks drive it off (deterrence 0.7 >= 0.6)', () => {
    const { sim, ant } = scene(14);
    const spider = spawnAt(sim, 'jumping-spider', X - 30, Z, { state: 'scan' });
    step(sim, 200, () => spider.state === 'stalk');
    expect(spider.state).toBe('stalk');
    noteCreatureHit(sim, spider.id, ant.id, 'spray');
    noteCreatureHit(sim, spider.id, ant.id, 'spray');
    step(sim, 1);
    expect(spider.state).toBe('flee');
  });
});

describe('antlion (possessed)', () => {
  function pit() {
    const { sim, ant } = scene(14);
    const al = spawnCreatureOfKind(sim, 'antlion', { x: X + 40, y: 0, z: Z })!;
    return { sim, ant, al };
  }

  it('an ant that keeps off the slope is never flicked', () => {
    const { sim, ant, al } = pit();
    placeOnSurface(sim, ant, { x: al.pos.x + al.homeRadius + 3, y: 0, z: al.pos.z });
    const ev = captureEvents(sim, ['antlion-flick', 'antlion-grab']);
    step(sim, 200);
    expect(ev.length).toBe(0);
  });

  it('grabbed, 4 struggle inputs per second free it after about 3.7 s with health ~0.44; without them it dies in 6.7 s', () => {
    for (const struggle of [true, false]) {
      const { sim, ant, al } = pit();
      placeOnSurface(sim, ant, { x: al.pos.x + 1, y: 0, z: al.pos.z });
      const ev = captureEvents(sim, ['antlion-grab', 'ant-freed']);
      step(sim, 5, () => ev.length > 0);
      const grab = ev.find((e) => e.ev.type === 'antlion-grab');
      expect(grab).toBeDefined();
      for (let k = 1; k <= 100 && ant.alive && !ev.some((e) => e.ev.type === 'ant-freed'); k++) {
        const at = grab!.tick + Math.round(2.5 * k);
        while (sim.state.tick <= at && ant.alive) sim.tick();
        if (struggle) addStruggleInput(sim, ant.id);
      }
      step(sim, 2);
      const freed = ev.find((e) => e.ev.type === 'ant-freed');
      if (struggle) {
        expect(freed).toBeDefined();
        const s = (freed!.tick - grab!.tick) / 10;
        expect(s).toBeGreaterThan(3.4);
        expect(s).toBeLessThan(4.0);
        expect(ant.hp / ant.maxHp).toBeGreaterThan(0.38);
        expect(ant.hp / ant.maxHp).toBeLessThan(0.5);
      } else {
        expect(ant.alive).toBe(false);
      }
    }
  });
});

describe('bird (possessed)', () => {
  const slab: Primitive = {
    id: 1, shape: 'box', pos: { x: X + 55, y: 9, z: Z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 15, y: 1, z: 15 }, round: 0,
    material: 'stone', flags: PrimFlag.SHELTER, objectId: -1,
  };

  it('the peck aims where the ant was at the head-cock: a dodge then makes it miss; under cover it is never chosen', () => {
    const { sim, ant } = scene(12, [slab]);
    quietHistory(sim, 20);
    const ev = captureEvents(sim, ['bird-peck', 'bird-landed']);
    expect(triggerBird(sim, 'thrush', { x: X, y: 0, z: Z }, false)).toBe(true);
    step(sim, 40, () => ev.some((e) => e.ev.type === 'bird-landed'));
    const bird = sim.state.ecology.birdEvent!;
    // the only exposed ant: chosen at the head-cock 0.5 s before each peck
    step(sim, 30, () => bird.peckTargetId === ant.id);
    expect(bird.peckTargetId).toBe(ant.id);
    const peckAt = bird.nextPeckTick!;
    expect(peckAt - sim.state.tick).toBe(Math.round(BIRD_HEAD_COCK_S * 10) - 1);
    dodge(sim, ant);
    step(sim, peckAt - sim.state.tick + 1);
    expect(ev.filter((e) => e.ev.type === 'bird-peck').length).toBe(1);
    expect(ant.alive).toBe(true);
    // now hide under the slab: never targeted again
    placeOnSurface(sim, ant, { x: X + 55, y: 0, z: Z });
    expect(isExposedAnt(sim, ant)).toBe(false);
    const before = ev.filter((e) => e.ev.type === 'bird-peck').length;
    step(sim, 200);
    expect(ev.filter((e) => e.ev.type === 'bird-peck').length).toBe(before);
    expect(ant.alive).toBe(true);
  });
});
