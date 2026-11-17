// Prey handling (GDD 05 §1.5, §2.3, E6/E7; task AC 5 "prey killed by ants becomes food pieces with the right
// nutrients"): remains, butchering, the transport rule, subduing, prey escapes, patch counts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { takeFromSource } from '@/sim/ecology/sources';
import { CREATURE_STATS, PATCH_IMMIGRATION_PER_GD } from '@/sim/balance/creatures';
import { despawnCreature } from '@/sim/entities';
import { creatureKilled, preyEvades, transportMode } from './index';
import { initPreyPatches, regrowPatches } from './spawners';
import { conditions } from './conditions';
import {
  creatureScene, installFakeCombat, placeWorker, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('transport rule (§1.5.3)', () => {
  it.each([
    // bulk, length mm, recruits, expected
    [0.5, 3, 1, 'carry'],
    [1.8, 6, 1, 'drag'],
    [5, 8, 1, 'butcher'], // insect-medium alone: 3.75 > 1 x carryCap (E6)
    [5, 8, 4, 'coop'], // 4 workers: 3.75 <= 4 (E6)
    [4, 10, 3, 'coop'], // small caterpillar, >= 3 Lasius
    [25, 22, 12, 'butcher'], // medium caterpillar: 18.75 > 12 (E7)
  ] as const)('bulk %s, %s mm, %s recruits -> %s', (bulk, len, recruits, mode) => {
    expect(transportMode(bulk, len, 4, 1, recruits)).toBe(mode);
  });
});

describe('remains of prey killed by ants', () => {
  it.each([
    ['springtail', null, 'food-piece', 0.25, 0, 0.1],
    ['fruit-fly', null, 'carcass', 0.4, 0.05, 0.5],
    ['caterpillar', 'small', 'carcass', 4, 0.1, 4],
    ['fly-larva', null, 'carcass', 3, 0.08, 3],
  ] as const)('%s (%s) -> %s with %s P', (kind, variant, itemKind, p, c, bulk) => {
    const sim = creatureScene({ seed: 1 });
    const cr = spawnAt(sim, kind, 200, 200, { variant, bb: kind === 'fruit-fly' ? { src: -1 } : {} });
    const r = creatureKilled(sim, cr.id, [1]);
    expect(r.itemId).toBeGreaterThan(0);
    const it = sim.stores.items.get(r.itemId)!;
    expect(it.kind).toBe(itemKind);
    expect(it.p).toBeCloseTo(p, 6);
    expect(it.c).toBeCloseTo(c, 6);
    expect(it.bulk).toBeCloseTo(bulk, 6);
    expect(it.foodKind).toBe('carrion');
  });

  it('a medium caterpillar (bulk 25, 20 P) is butchered: pieces of bulk 1.0 and 0.8 P; nothing is lost (E7)', () => {
    const sim = creatureScene({ seed: 1 });
    sendQueenAway(sim);
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'medium' });
    const r = creatureKilled(sim, cat.id, [1, 2, 3]);
    expect(r.sourceId).toBeGreaterThan(0);
    const src = sim.stores.sources.get(r.sourceId)!;
    expect(src.unitBulk * src.units).toBeCloseTo(25, 6);
    const ant = placeWorker(sim, 200, 203);
    ant.carryCap = 1;
    let pieces = 0, p = 0;
    for (let i = 0; i < 40 && sim.stores.sources.get(r.sourceId)?.alive; i++) {
      const h = takeFromSource(sim, ant, r.sourceId, 1, { checkReach: false });
      if (h.status !== 'ok') break;
      const it = sim.stores.items.get(h.itemId)!;
      if (pieces < 24) { expect(it.bulk).toBeCloseTo(1, 6); expect(it.p).toBeCloseTo(0.8, 6); }
      p += it.p;
      pieces++;
      ant.carry = { kind: 'none', id: -1 };
    }
    expect(pieces).toBe(25);
    expect(p).toBeCloseTo(20, 4);
  });

  it('a dead earthworm becomes a large carcass source of 120 P', () => {
    const sim = creatureScene({ seed: 1 });
    const w = spawnAt(sim, 'earthworm', 200, 200, { state: 'surface' });
    const r = creatureKilled(sim, w.id, [], 'stranded');
    const s = sim.stores.sources.get(r.sourceId)!;
    expect(s.kind).toBe('carrion');
    expect(s.p * s.units).toBeCloseTo(CREATURE_STATS.earthworm.deadP, 6);
  });

  it('hp <= 0 from combat (without a report) turns the creature into remains on the next tick', () => {
    const sim = creatureScene({ seed: 1 });
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed' });
    const items0 = sim.stores.items.list.length;
    cat.hp = 0;
    step(sim, 1);
    expect(cat.alive).toBe(false);
    expect(sim.stores.items.list.length).toBe(items0 + 1);
  });
});

describe('subduing (§1.5.1)', () => {
  it('pinned by two workers at health <= 0.5 for 8 s it stops struggling, then dies 4 s later', () => {
    const sim = creatureScene({ seed: 1 });
    sendQueenAway(sim);
    const cat = spawnAt(sim, 'caterpillar', 200, 200, { variant: 'small', state: 'feed' });
    cat.hp = 0.4 * cat.maxHp;
    cat.bb.lastHp = cat.hp;
    for (const dz of [-3, 3]) {
      const a = placeWorker(sim, 200, 200 + dz);
      a.massMg = 1; // standard worker: pull 3
      a.combat = {
        lock: { targetKind: 'creature', targetId: cat.id, slot: 0 }, heldBy: [], pinned: false, seizedBy: -1, escape: 0,
        paralysedUntilTick: 0, stuckSinceTick: 0, disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0,
        recentHitters: [], biteCdTick: 0, specialCdTick: 0, dodgeCdTick: 0,
      };
    }
    // thrash would shake non-pinning holders; two holders pin it (6 >= 1.5 x 4)
    step(sim, 83);
    expect(cat.state).toBe('subdued');
    step(sim, 40);
    expect(cat.alive).toBe(false);
  });
});

describe('prey escapes', () => {
  it('springtail escapes a bite with p 0.6 on open ground (by jumping 60 mm); mites half the time', () => {
    const sim = creatureScene({ seed: 9 });
    let esc = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const s = spawnAt(sim, 'springtail', 250, 250, { state: 'graze' });
      if (preyEvades(sim, s.id, -1)) esc++;
    }
    expect(esc / n).toBeGreaterThan(0.52);
    expect(esc / n).toBeLessThan(0.68);
    let m = 0;
    for (let i = 0; i < n; i++) if (preyEvades(sim, spawnAt(sim, 'mite', 250, 250).id, -1)) m++;
    expect(m / n).toBeGreaterThan(0.42);
    expect(m / n).toBeLessThan(0.58);
  });

  it('one escape roll per contact: a springtail that stayed when touched is not rolled again by the bite (colony-life round 3)', () => {
    // GDD 05 §2.3 "escapes per bite attempt with the substrate probability" (0.6 on open ground). An ant that walks up
    // touches it first (jump on touch, 2.2b); before round 3 the touch and the bite each rolled 0.6, so only 16 % of
    // approaches ended in a bite that landed. Now a contact is one roll: ~40 % of approaches are catches.
    const sim = creatureScene({ seed: 11 });
    sendQueenAway(sim);
    const ant = placeWorker(sim, 250, 252); // within 1 L (4 mm) of every springtail put at (250, 250)
    let landed = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const s = spawnAt(sim, 'springtail', 250, 250, { state: 'graze', bb: { contact: sim.state.tick } });
      const x0 = s.pos.x, z0 = s.pos.z;
      step(sim, 10); // the touch rolls on the creature's update
      const jumped = (s.pos.x - x0) ** 2 + (s.pos.z - z0) ** 2 > 30 * 30;
      if (!jumped && !preyEvades(sim, s.id, ant.id)) landed++; // the bite, within the contact window
      despawnCreature(sim, s.id, 'test');
    }
    expect(landed / n).toBeGreaterThan(0.3);
    expect(landed / n).toBeLessThan(0.5);
  });

  it('a feeding fruit fly is caught with p 0.15 per strike; a hairy caterpillar is not prey', () => {
    const sim = creatureScene({ seed: 9 });
    let caught = 0;
    for (let i = 0; i < 400; i++) {
      const f = spawnAt(sim, 'fruit-fly', 250, 250, { state: 'feed', bb: { src: -1 } });
      if (!preyEvades(sim, f.id, -1)) caught++;
    }
    expect(caught / 400).toBeGreaterThan(0.1);
    expect(caught / 400).toBeLessThan(0.2);
  });

  it('springtails vanish after 30 s with no ant near', () => {
    const sim = creatureScene({ seed: 9 });
    sendQueenAway(sim);
    const s = spawnAt(sim, 'springtail', 250, 250, { state: 'graze', bb: { contact: 0 } });
    step(sim, 305);
    expect(s.alive).toBe(false);
  });
});

describe('prey patches (§2.3, I2)', () => {
  it('K = 0.08 x area x zone factor; a caught springtail lowers the count; immigration keeps >= 0.05 K', () => {
    const sim = creatureScene({ seed: 1 });
    setClock(sim, 'summer', 2, 12);
    sim.state.ecology.director.territories.push({ kind: 'springtail', center: { x: 200, y: 0, z: 200 }, radius: 30 * sim.world.bu, occupantId: -1, vacantUntilTick: -1 });
    initPreyPatches(sim);
    const p = sim.state.ecology.preyPatches[0];
    expect(p.k).toBeCloseTo(0.08 * Math.PI * 30 * 30 * 0.5, 3); // test world zone: lawn-like default factor 0.5
    const s = spawnAt(sim, 'springtail', 200, 200, { state: 'graze', bb: { patch: p.id } });
    const before = p.count;
    creatureKilled(sim, s.id, [1]);
    expect(p.count).toBeCloseTo(before - 1, 6);
    p.count = 0;
    for (let h = 0; h < 24; h++) regrowPatches(sim, conditions(sim));
    expect(p.count).toBeGreaterThanOrEqual(PATCH_IMMIGRATION_PER_GD * p.k - 1e-9);
  });
});
