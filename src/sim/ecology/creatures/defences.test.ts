// Prey and herd-predator defences and the remaining prey state machines (GDD 05 §1.4, §1.5.2, §1.6, §2.2b):
// caterpillar (silk drop, thrash, regurgitation, hairy repel), ladybird reflex bleeding, fly larvae (wriggle,
// maggots eating the carcass, burrowing), fruit flies (feed -> fly -> feed, leave with their source).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Creature, Sim } from '@/sim/types';
import { createSource } from '@/sim/ecology/sources';
import {
  CATERPILLAR_HAIRY_REPEL_S, CATERPILLAR_REGURGITATE_S, CATERPILLAR_REGURGITATE_STUN_S, FLY_LARVA_LIFE_GD,
  LADYBIRD_BLEED_STUN_S,
} from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { arriveAtHerd, noteCreatureHit, preyEvades, preyNear } from './index';
import { BB_STUNNED, CreatureFlag } from './common';
import { addHerd, creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt, step, type CombatLog } from './testkit';
import { ports } from './ports';

let restore: () => void;
let log: CombatLog;
beforeEach(() => { const f = installFakeCombat(); restore = f.restore; log = f.log; });
afterEach(() => restore());

function scene(hour = 12): Sim {
  const sim = creatureScene({ seed: 6 });
  setClock(sim, 'summer', 3, hour);
  sendQueenAway(sim);
  return sim;
}

/** The ant holds the creature in a grapple lock (what combat's bite-hold leaves behind). */
function lockOn(ant: Ant, c: Creature, slot = 0): void {
  ant.combat = {
    lock: { targetKind: 'creature', targetId: c.id, slot }, heldBy: [], pinned: false, seizedBy: -1, escape: 0,
    paralysedUntilTick: 0, stuckSinceTick: 0, disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0,
    recentHitters: [], biteCdTick: 0, specialCdTick: 0, dodgeCdTick: 0,
  };
}

const stunnedFor = (sim: Sim, a: Ant) => ((a.bb[BB_STUNNED] ?? 0) - sim.state.tick) / 10;

describe('caterpillar (§1.5.2)', () => {
  it('regurgitates every 10 s after the first bite: biters within 1 L are stunned 2 s and let go', () => {
    const sim = scene();
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed', stateS: 600 });
    const ant = placeWorker(sim, 200 + cat.radius + 2, 200);
    lockOn(ant, cat);
    step(sim, 1);
    noteCreatureHit(sim, cat.id, ant.id, 'bite');
    // keeps biting once a second; on the ground (no silk) the regurgitation comes 10 s after the first bite
    let stunTick = -1;
    for (let t = 0; t < 120 && stunTick < 0; t++) {
      if (t % 10 === 0) { noteCreatureHit(sim, cat.id, ant.id, 'bite'); if (!ant.combat!.lock) lockOn(ant, cat); }
      sim.tick();
      if ((ant.bb[BB_STUNNED] ?? 0) > sim.state.tick) stunTick = t;
    }
    expect(stunTick).toBeGreaterThanOrEqual(CATERPILLAR_REGURGITATE_S * 10 - 2);
    expect(stunnedFor(sim, ant)).toBeCloseTo(CATERPILLAR_REGURGITATE_STUN_S, 0);
    expect(ant.combat!.biteCdTick).toBeGreaterThan(sim.state.tick + 15);
    expect(log.released).toContain(ant.id);
  });

  it('on foliage the first bite may drop it on silk: out of reach (bites evade) for 30 s, then it climbs back', () => {
    let dropped = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = creatureScene({ seed });
      setClock(sim, 'summer', 3, 12);
      const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed', stateS: 600 });
      cat.up = { x: 1, y: 0, z: 0 }; // on a stem: the surface faces sideways
      noteCreatureHit(sim, cat.id, -1, 'bite');
      if (cat.state !== 'silk') continue;
      dropped++;
      expect((cat.flags & CreatureFlag.ON_SILK) !== 0).toBe(true);
      expect(preyEvades(sim, cat.id, 1)).toBe(true);
      step(sim, 301);
      expect(cat.state).toBe('feed');
      expect((cat.flags & CreatureFlag.ON_SILK) !== 0).toBe(false);
    }
    // p 0.5 per caterpillar: 12 tries give at least one drop and not all
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(12);
  });

  it('thrashes: a single holder is shaken off with p 0.3 per second, a pinning pair holds on', () => {
    const sim = scene();
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed', stateS: 600 });
    cat.bb.bitten = 1; cat.bb.regurgAt = 1e9;
    const ant = placeWorker(sim, 200 + cat.radius + 2, 200);
    let shaken = 0, seconds = 0;
    for (let s = 0; s < 200; s++) {
      lockOn(ant, cat);
      const before = log.released.length;
      step(sim, 10);
      seconds++;
      if (log.released.length > before) shaken++;
    }
    expect(shaken / seconds).toBeGreaterThan(0.2);
    expect(shaken / seconds).toBeLessThan(0.4);
    const b = placeWorker(sim, 200 - cat.radius - 2, 200);
    lockOn(ant, cat, 0); lockOn(b, cat, 1);
    const before = log.released.length;
    step(sim, 100);
    expect(log.released.length).toBe(before);
  });

  it('a hairy caterpillar is not prey for AI ants and repels each biter for 3 s', () => {
    const sim = scene();
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'hairy', flags: CreatureFlag.HAIRY, state: 'feed', stateS: 600 });
    const ant = placeWorker(sim, 205, 200);
    step(sim, 1);
    expect(preyNear(sim, ant.pos, 100, ant.colony).some((p) => p.creatureId === cat.id)).toBe(false);
    lockOn(ant, cat);
    noteCreatureHit(sim, cat.id, ant.id, 'bite');
    expect(stunnedFor(sim, ant)).toBeCloseTo(CATERPILLAR_HAIRY_REPEL_S, 5);
    expect(log.released).toContain(ant.id);
  });

  it('pupates (leaves) 3 gd after it appeared', () => {
    const sim = scene();
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed', lifeEndTick: 50 });
    step(sim, 60);
    expect(cat.alive).toBe(false);
  });
});

describe('ladybird reflex bleeding (§1.4)', () => {
  it('about a quarter of the bites stun the biter 2 s and break its lock', () => {
    const sim = scene();
    const herd = addHerd(sim, 200, 200, 2000);
    const lb = arriveAtHerd(sim, herd, 'ladybird')!;
    step(sim, 30);
    const ant = placeWorker(sim, 205, 200);
    let stuns = 0;
    for (let i = 0; i < 400; i++) {
      lb.harass = 0; // keep it at the herd
      lockOn(ant, lb);
      ant.bb[BB_STUNNED] = 0;
      noteCreatureHit(sim, lb.id, ant.id, 'bite');
      if ((ant.bb[BB_STUNNED] ?? 0) > sim.state.tick) {
        stuns++;
        expect(stunnedFor(sim, ant)).toBeCloseTo(LADYBIRD_BLEED_STUN_S, 5);
        expect(ant.combat!.lock).toBe(null);
      }
    }
    expect(stuns / 400).toBeGreaterThan(0.18);
    expect(stuns / 400).toBeLessThan(0.32);
  });
});

describe('fly larvae (§1.6, §2.2b)', () => {
  function carcassScene() {
    const sim = scene();
    const src = createSource(sim, { variant: 'insect-large', pos: { x: 200, y: 0, z: 200 }, stage: 'ripe' });
    const maggots: Creature[] = [];
    for (let i = 0; i < 5; i++) maggots.push(spawnAt(sim, 'fly-larva', 198 + i, 200, { state: 'feed', bb: { src: src.id, born: sim.state.tick } }));
    return { sim, src, maggots };
  }

  it('5 maggots eat 10 % of the carcass P per gd', () => {
    const { sim, src } = carcassScene();
    const p0 = src.p;
    step(sim, Math.round(TICKS_PER_DAY / 10));
    // 0.1 gd: 1 % of P
    expect(1 - src.p / p0).toBeCloseTo(0.01, 3);
  });

  it('wriggles a holder off with p 0.1 per second', () => {
    const { sim, maggots } = carcassScene();
    const m = maggots[0];
    const ant = placeWorker(sim, m.pos.x, m.pos.z + 3);
    let shaken = 0;
    for (let s = 0; s < 300; s++) {
      lockOn(ant, m);
      const before = log.released.length;
      step(sim, 10);
      if (log.released.length > before) shaken++;
    }
    expect(shaken / 300).toBeGreaterThan(0.05);
    expect(shaken / 300).toBeLessThan(0.16);
  });

  it('burrows (pupates) when the carcass is gone, and after 1.5 gd at the latest', () => {
    const { sim, src, maggots } = carcassScene();
    src.units = 0;
    step(sim, 60);
    expect(maggots.every((m) => !m.alive)).toBe(true);
    const s2 = scene();
    const src2 = createSource(s2, { variant: 'insect-large', pos: { x: 200, y: 0, z: 200 }, stage: 'ripe' });
    const old = spawnAt(s2, 'fly-larva', 200, 200, { state: 'feed', bb: { src: src2.id, born: s2.state.tick - Math.round(FLY_LARVA_LIFE_GD * TICKS_PER_DAY) } });
    step(s2, 60);
    expect(old.alive).toBe(false);
  });
});

describe('fruit flies (§2.2b)', () => {
  it('feed -> fly (hidden, not catchable) -> land and feed again; caught only while feeding; gone with the source or the light', () => {
    const sim = scene(13);
    ports.airTemp = () => 22;
    const src = createSource(sim, { variant: 'berry', pos: { x: 200, y: 0, z: 200 } });
    const f = spawnAt(sim, 'fruit-fly', 202, 200, { state: 'feed', stateS: 2, bb: { src: src.id } });
    const seen = new Set<string>();
    for (let t = 0; t < 400 && f.alive; t++) {
      sim.tick();
      seen.add(f.state);
      if (f.state === 'fly') {
        expect((f.flags & CreatureFlag.HIDDEN) !== 0).toBe(true);
        expect(preyNear(sim, f.pos, 50, 1).some((p) => p.creatureId === f.id)).toBe(false);
      }
    }
    expect([...seen].sort()).toEqual(['feed', 'fly']);
    src.alive = false;
    sim.stores.sources.markDead(src.id);
    step(sim, 2);
    expect(f.alive).toBe(false);
  });
});
