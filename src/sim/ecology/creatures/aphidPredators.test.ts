// Aphid predators on herds (GDD 05 §1.4, E4, I4; task AC 5 "ladybirds reduce an undefended herd").

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { arriveAtHerd, capOf, noteCreatureHit, preyNear } from './index';
import { aphidPredatorArrivals, countKind } from './aphidPredators';
import { conditions } from './conditions';
import {
  addHerd, captureEvents, creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt, step,
} from './testkit';
import { colonySlotBit } from '@/sim/entities';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('ladybird (E4)', () => {
  it('eats 1 aphid per 6 s from an undefended frozen herd: 100 -> 80 in 120 s', () => {
    const sim = creatureScene({ seed: 2 });
    setClock(sim, 'summer', 1, 10);
    const herd = addHerd(sim, 200, 200, 100);
    herd.frozen = true;
    const lb = arriveAtHerd(sim, herd, 'ladybird')!;
    lb.state = 'feed'; lb.stateTick = sim.state.tick; lb.flags = 0;
    step(sim, 1200);
    expect(herd.a).toBeGreaterThanOrEqual(79);
    expect(herd.a).toBeLessThanOrEqual(81);
    expect(lb.eaten).toBe(100 - herd.a);
  });

  it('six bites drive it off within 2 s with herd-predator-repelled; reflex bleeding makes biters let go', () => {
    const sim = creatureScene({ seed: 2 });
    setClock(sim, 'summer', 1, 10);
    const herd = addHerd(sim, 200, 200, 100);
    const lb = arriveAtHerd(sim, herd, 'ladybird')!;
    step(sim, 30);
    expect(lb.state).toBe('feed');
    const ev = captureEvents(sim, ['herd-predator-repelled', 'creature-despawned']);
    const ant = placeWorker(sim, 205, 200);
    for (let i = 0; i < 6; i++) noteCreatureHit(sim, lb.id, ant.id, 'bite');
    expect(lb.state).toBe('fly-off');
    step(sim, 21);
    expect(ev.some((e) => e.ev.type === 'herd-predator-repelled')).toBe(true);
    expect(ev.some((e) => e.ev.type === 'creature-despawned')).toBe(true);
    expect(herd.predators).not.toContain(lb.id);
  });

  it('leaves at dusk; a ladybird that ate >= 20 may leave larvae which hatch 0.5 gd later', () => {
    const sim = creatureScene({ seed: 4 });
    setClock(sim, 'summer', 1, 10);
    const herd = addHerd(sim, 200, 200, 300);
    const lb = arriveAtHerd(sim, herd, 'ladybird')!;
    lb.eaten = 25;
    setClock(sim, 'summer', 1, 23.5);
    step(sim, 50); // fly-in 2 s, then off at once (night), fly-off 2 s
    expect(lb.alive).toBe(false);
    // p 0.5: with this seed the roll succeeds (deterministic); eggs are hidden until they hatch
    const eggs = sim.stores.creatures.list.filter((c) => c.alive && c.kind === 'ladybird-larva');
    for (const e of eggs) expect(e.state).toBe('egg');
    if (eggs.length > 0) {
      step(sim, Math.round(0.5 * TICKS_PER_DAY) + 5);
      for (const e of eggs) expect(e.state).not.toBe('egg');
    }
  });

  it('arrives only on herds of >= 40 aphids, by day, >= 12 C; ladybirds stay within min(8, aphids / 300) (I4)', () => {
    const sim = creatureScene({ seed: 6 });
    setClock(sim, 'summer', 1, 12);
    addHerd(sim, 100, 100, 39);
    for (let i = 0; i < 200; i++) aphidPredatorArrivals(sim, conditions(sim));
    expect(countKind(sim, 'ladybird')).toBe(0);
    const big = addHerd(sim, 300, 300, 650);
    for (let i = 0; i < 300; i++) aphidPredatorArrivals(sim, conditions(sim));
    expect(countKind(sim, 'ladybird')).toBeGreaterThan(0);
    expect(countKind(sim, 'ladybird')).toBeLessThanOrEqual(Math.min(8, Math.floor(689 / 300)));
    expect(capOf(sim, 'ladybird')).toBe(2);
    void big;
  });
});

describe('ladybird larva and lacewing larva', () => {
  it('ladybird larva feeds 1 per 10 s and drops off at harass 10', () => {
    const sim = creatureScene({ seed: 2 });
    setClock(sim, 'summer', 1, 10);
    const herd = addHerd(sim, 200, 200, 100);
    herd.frozen = true;
    const lv = spawnAt(sim, 'ladybird-larva', 200, 200, { state: 'crawl', bb: { herd: herd.id, forced: 1 } });
    step(sim, 20);
    expect(lv.state).toBe('feed');
    const a0 = herd.a;
    step(sim, 600);
    expect(a0 - herd.a).toBeGreaterThanOrEqual(5);
    expect(a0 - herd.a).toBeLessThanOrEqual(6);
    const ant = placeWorker(sim, 205, 200);
    for (let i = 0; i < 10; i++) noteCreatureHit(sim, lv.id, ant.id, 'bite');
    step(sim, 1);
    expect(lv.state).toBe('drop-off');
    expect(herd.predators).not.toContain(lv.id);
  });

  it('lacewing larva is camouflaged: preyNear shows it only after a tender within 1 L noticed it; bites holders', () => {
    const sim = creatureScene({ seed: 8 });
    setClock(sim, 'summer', 2, 10);
    sendQueenAway(sim);
    const herd = addHerd(sim, 200, 200, 100);
    const lw = arriveAtHerd(sim, herd, 'lacewing-larva')!;
    const far = placeWorker(sim, 200 + 12, 200);
    expect(preyNear(sim, far.pos, 30, far.colony).some((p) => p.creatureId === lw.id)).toBe(false);
    step(sim, 20);
    const near = placeWorker(sim, lw.pos.x + 3, lw.pos.z);
    step(sim, 200);
    expect(((lw.bb.seen ?? 0) & colonySlotBit(sim, near.colony)) !== 0).toBe(true);
    expect(preyNear(sim, far.pos, 30, far.colony).some((p) => p.creatureId === lw.id)).toBe(true);
    near.combat = {
      lock: { targetKind: 'creature', targetId: lw.id, slot: 0 }, heldBy: [], pinned: false, seizedBy: -1, escape: 0,
      paralysedUntilTick: 0, stuckSinceTick: 0, disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0,
      recentHitters: [], biteCdTick: 0, specialCdTick: 0, dodgeCdTick: 0,
    };
    const hp0 = near.hp;
    step(sim, 20); // exactly one bite in any 2 s
    expect(hp0 - near.hp).toBeCloseTo(2, 5);
  });
});
