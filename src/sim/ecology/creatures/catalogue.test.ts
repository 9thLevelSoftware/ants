// Table-driven checks of the creature catalogue against GDD 05 §2.2 (stats, senses, caps, telegraphs) and each
// kind's state machine: allowed states, senses (a victim just inside / just outside the range), limits.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreatureKind } from '@/sim/types';
import {
  CREATURE_STATS, FLEE_RULE, PREDATOR_SETTING_MULT, STRIKE_DAMAGE, STRIKE_HIT_RADIUS_MM, TELEGRAPH_S, VENOM_PER_S,
} from '@/sim/balance/creatures';
import { capOf } from './index';
import { creatureScene, installFakeCombat, placeWorker, possess, sendQueenAway, setClock, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

// kind, size mm, mass mg, walk, burst, maxHp, armour, pull, acid sens, cap   (GDD 05 §2.2a/b)
const TABLE: [CreatureKind, number, number, number, number, number, number, number, number, number][] = [
  ['ladybird', 6.5, 35, 10, 300, 40, 0.6, 6, 0.5, 8],
  ['ladybird-larva', 8, 15, 5, 5, 25, 0.2, 3, 1.0, 10],
  ['lacewing-larva', 7, 5, 6, 6, 20, 0.3, 2, 1.0, 8],
  ['springtail', 1.5, 0.1, 5, 60, 1, 0, 0.2, 1.0, 40],
  ['mite', 0.5, 0.05, 1, 1, 1, 0.5, 0.1, 1.0, 10],
  ['fly-larva', 8, 15, 1, 1, 20, 0, 3, 1.0, 60],
  ['caterpillar', 10, 8, 3, 3, 15, 0, 4, 1.0, 12],
  ['fruit-fly', 2.5, 1, 10, 400, 2, 0, 0.5, 1.0, 20],
  ['woodlouse', 10, 30, 10, 10, 50, 0.5, 10, 0.3, 30],
  ['earthworm', 100, 1000, 2, 2, 300, 0, 100, 1.0, 8],
  ['snail', 20, 1000, 1.5, 1.5, 200, 0.8, 60, 0.2, 10],
  ['millipede', 30, 100, 8, 8, 80, 0.5, 20, 0.3, 12],
  ['jumping-spider', 6, 15, 8, 160, 35, 0, 12, 1.0, 4],
  ['wolf-spider', 10, 60, 20, 250, 70, 0, 25, 1.0, 3],
  ['ant-spider', 3, 3, 15, 80, 15, 0, 4, 1.0, 3],
  ['antlion', 10, 30, 0, 0, 60, 0.4, 20, 0.5, 12],
  ['centipede', 20, 40, 30, 120, 90, 0.2, 20, 0.8, 2],
  ['rove-beetle', 5, 3, 60, 60, 18, 0.3, 5, 0.5, 6],
];

describe('catalogue (§2.2)', () => {
  it.each(TABLE)('%s', (kind, size, mass, walk, burst, hp, armour, pull, acid, cap) => {
    const s = CREATURE_STATS[kind];
    expect([s.sizeMm, s.massMg, s.walkMmS, s.burstMmS, s.maxHp, s.armour, s.pull, s.acidSens, s.cap]).toEqual([size, mass, walk, burst, hp, armour, pull, acid, cap]);
  });

  it('senses (absolute, Lasius BU of 4 mm)', () => {
    expect(CREATURE_STATS['jumping-spider'].senseMm).toBe(120);
    expect(CREATURE_STATS['wolf-spider'].senseMm).toBe(32);
    expect(CREATURE_STATS['ant-spider'].senseMm).toBe(80);
    expect(CREATURE_STATS.centipede.senseMm).toBe(24);
    expect(CREATURE_STATS['rove-beetle'].senseMm).toBe(12);
    expect(CREATURE_STATS.ladybird.senseMm).toBe(800);
  });

  it('attack framework values (§2.2b, §2.4)', () => {
    expect(TELEGRAPH_S).toMatchObject({ 'jumping-spider': 0.6, 'wolf-spider': 0.5, 'ant-spider': 0.3, centipede: 0.5, 'rove-beetle': 0.4 });
    expect(STRIKE_HIT_RADIUS_MM).toMatchObject({ 'jumping-spider': 4, 'wolf-spider': 5, centipede: 4, 'rove-beetle': 3 });
    expect(STRIKE_DAMAGE).toMatchObject({ 'jumping-spider': 9, 'wolf-spider': 12, 'ant-spider': 1, centipede: 10, 'rove-beetle': 3 });
    expect(VENOM_PER_S).toMatchObject({ 'jumping-spider': 0.5, 'wolf-spider': 0.8, centipede: 1.0, 'rove-beetle': 1.5, antlion: 1.5 });
    expect(FLEE_RULE['jumping-spider']).toEqual({ holders: 2, deterrence: 0.6, health: 0.5 });
    expect(FLEE_RULE['wolf-spider']).toEqual({ holders: 3, deterrence: 0.6, health: 0.4 });
    expect(FLEE_RULE.centipede).toEqual({ holders: 5, deterrence: 0.5, health: 0.5 });
  });

  it('caps scale with the Predators setting for ant predators only (§2.7, §5, I5)', () => {
    for (const setting of ['off', 'few', 'normal', 'many'] as const) {
      const sim = creatureScene({ seed: 1, config: {} });
      sim.state.config.rules.predators = setting;
      const m = PREDATOR_SETTING_MULT[setting];
      expect(capOf(sim, 'wolf-spider')).toBe(Math.floor(3 * m));
      expect(capOf(sim, 'jumping-spider')).toBe(Math.floor(4 * m));
      expect(capOf(sim, 'woodlouse')).toBe(30);
      expect(capOf(sim, 'springtail')).toBe(40);
    }
  });
});

// ---- senses: a victim just inside the range is noticed, one just outside is not ----

const SENSE_CASES: [CreatureKind, string, number, string, string][] = [
  // kind, start state, hour, state on detection
  ['jumping-spider', 'scan', 14, 'stalk', 'day hunter'],
  ['wolf-spider', 'ambush', 23, 'orient', 'night ambusher'],
  ['ant-spider', 'patrol', 23, 'approach', 'dusk/night'],
];

describe('senses', () => {
  it.each(SENSE_CASES)('%s notices a lone worker inside its range and not outside it', (kind, start, hour, detectState) => {
    for (const inside of [true, false]) {
      const sim = creatureScene({ seed: 2 });
      setClock(sim, 'summer', 3, hour);
      sendQueenAway(sim);
      const range = CREATURE_STATS[kind].senseMm;
      const d = inside ? range - 3 : range + 6;
      const ant = placeWorker(sim, 250, 250);
      possess(sim, ant); // stands still
      const c = spawnAt(sim, kind, 250 - d, 250, { state: start, stateS: 100 });
      const visited = new Set<string>();
      for (let t = 0; t < 25; t++) { sim.tick(); visited.add(c.state); }
      expect(visited.has(detectState)).toBe(inside);
    }
  });
});

// ---- every kind: runs its state machine for a while without NaN, staying on the surface, in its own states ----

const STATES: Partial<Record<CreatureKind, string[]>> = {
  'jumping-spider': ['rest', 'scan', 'stalk', 'windup', 'hold', 'feed', 'recover', 'flee'],
  'wolf-spider': ['rest', 'wander', 'ambush', 'orient', 'freeze', 'windup', 'hold', 'feed', 'recover', 'flee'],
  'ant-spider': ['rest', 'patrol', 'approach', 'windup', 'wait', 'collect', 'carry', 'feed', 'recover', 'flee'],
  antlion: ['wait', 'drag', 'feed', 'rebuild', 'collapsed'],
  centipede: ['prowl', 'windup', 'hold', 'feed', 'recover', 'flee', 'invade'],
  'rove-beetle': ['forage', 'windup', 'hold', 'feed', 'recover', 'flee'],
  ladybird: ['fly-in', 'feed', 'fly-off'],
  springtail: ['graze'],
  mite: ['graze'],
  'fly-larva': ['feed', 'burrow'],
  caterpillar: ['feed', 'crawl', 'silk'],
  woodlouse: ['shelter', 'wander', 'graze', 'roll'],
  earthworm: ['surface', 'return', 'dying'],
  snail: ['graze', 'wander', 'retract', 'cover'],
  millipede: ['wander', 'graze', 'coil', 'cover'],
};

describe('state machines stay in their states and on the surface', () => {
  it.each(Object.keys(STATES) as CreatureKind[])('%s', (kind) => {
    const sim = creatureScene({ seed: 3, terrain: 'noise' });
    setClock(sim, 'summer', 3, 20);
    for (let i = 0; i < 4; i++) placeWorker(sim, 230 + i * 12, 260);
    const c = spawnAt(sim, kind, 250, 250, { state: STATES[kind]![0], bb: kind === 'fly-larva' ? { src: -1 } : {} });
    const seen = new Set<string>();
    for (let t = 0; t < 600 && c.alive; t++) {
      sim.tick();
      if (!c.alive) break;
      seen.add(c.state);
      expect(Number.isFinite(c.pos.x + c.pos.y + c.pos.z)).toBe(true);
      expect(sim.field.sample(c.pos)).toBeGreaterThan(-0.5);
    }
    for (const s of seen) expect(STATES[kind]).toContain(s);
  });
});
