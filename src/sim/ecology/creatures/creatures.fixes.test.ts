// Regression tests for the fixes made after the independent review (creatures.verify.test.ts holds the reviewer's
// own reproductions): unreported damage, burrowing at dawn, abandoned antlion pits, the danger-grid witness rule and
// avoid-marker rasterisation, patch-prey placement for autonomous ants, the bird rate per setting, a predator killed
// with an ant in its jaws.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sim, System } from '@/sim/types';
import { locomotionSystem } from '@/sim/locomotion';
import { aiSpeed } from '@/sim/locomotion/speed';
import { makeTestSim } from '@/sim/testing';
import { colonySlotBit, despawnCreature } from '@/sim/entities';
import {
  ANTLION_EMPTY_PIT_FILL_GD, BIRD_RATE, DANGER_AVOID_MARKER, HARASS_BITE,
} from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { creatureKilled, creatureSystem, dangerAt, knownHazardsNear, spawnCreatureOfKind } from './index';
import { conditions } from './conditions';
import { spawnPatchPrey } from './spawners';
import { birdHourly } from './bird';
import { ensureHooks } from './hooks';
import { expireHazards } from './neutral';
import { updateDanger } from './danger';
import {
  creatureScene, installFakeCombat, placeWorker, possess, quietHistory, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

declare const process: { env: Record<string, string | undefined> } | undefined;
const STRICT_PERF = (typeof process !== 'undefined' ? process.env : {}).FOUNDRESS_STRICT_PERF === '1';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('unreported damage (combat that never reports) is still noticed', () => {
  it('an hp drop with no report in the attribution window counts as one bite', () => {
    let cid = -1;
    let n = 0;
    const fake: System = { name: 'fake-combat', phase: 'combat', run: (s) => { const c = s.stores.creatures.get(cid); if (c && n++ === 0) c.hp -= 1; } };
    const sim = makeTestSim({ seed: 1, sizeBu: 128, systems: [creatureSystem, locomotionSystem, fake] });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    const c = spawnAt(sim, 'woodlouse', 300, 300, { state: 'wander', bb: { roller: 0 } });
    cid = c.id;
    step(sim, 3);
    expect(c.harass).toBe(HARASS_BITE);
  });
});

describe('burrowing at dawn near the focus (GDD 05 §2.2b)', () => {
  it('a rove beetle next to the player entrance slips away in the morning', () => {
    const sim = creatureScene({ seed: 4, sizeBu: 256, nest: 'small', workers: 0, director: true });
    setClock(sim, 'summer', 3, 23);
    const e = sim.state.nests[0].entrances[0].pos;
    const rb = spawnAt(sim, 'rove-beetle', e.x + 100, e.z, { state: 'forage' });
    step(sim, 20);
    setClock(sim, 'summer', 4, 10);
    step(sim, 60, () => rb.state === 'burrow');
    expect(rb.state).toBe('burrow');
    step(sim, 200, () => !rb.alive);
    expect(rb.alive).toBe(false);
  });

  it('an engaged centipede (an ant locked on it) is not sent underground', () => {
    const sim = creatureScene({ seed: 4, sizeBu: 256, nest: 'small', workers: 0, director: true });
    setClock(sim, 'summer', 4, 10);
    const e = sim.state.nests[0].entrances[0].pos;
    const ce = spawnAt(sim, 'centipede', e.x + 120, e.z, { state: 'prowl' });
    const ant = placeWorker(sim, ce.pos.x + 6, ce.pos.z);
    ant.combat = {
      lock: { targetKind: 'creature', targetId: ce.id } as never, heldBy: [], pinned: false, seizedBy: -1, escape: 0,
      paralysedUntilTick: 0, stuckSinceTick: 0, disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0, recentHitters: [],
      biteCdTick: 0, specialCdTick: 0, dodgeCdTick: 0,
    };
    for (let i = 0; i < 12; i++) { // keep the biter at its side (the centipede may wander)
      ant.pos.x = ce.pos.x + 6; ant.pos.z = ce.pos.z;
      sim.index.refresh();
      step(sim, 10);
    }
    expect(ce.alive).toBe(true);
    expect(ce.state).not.toBe('burrow');
  });
});

describe('a killed antlion leaves an abandoned pit that stops working and fills in', () => {
  it('no slowdown, not a known hazard, removed after the fill time', () => {
    const sim = creatureScene({ seed: 5 });
    setClock(sim, 'summer', 3, 14);
    sendQueenAway(sim);
    ensureHooks(sim);
    const al = spawnCreatureOfKind(sim, 'antlion', { x: 150, y: 0, z: 150 })!;
    const pit = sim.state.ecology.hazards.find((h) => h.id === al.bb.pit)!;
    const ant = placeWorker(sim, 162, 150);
    pit.knownBy |= colonySlotBit(sim, ant.colony);
    ant.fwd = { x: 1, y: 0, z: 0 }; // upslope
    const speed = () => aiSpeed(sim, ant, { speedKind: 'cruise', speedMult: 1, speedFixed: 0 } as never, { creature: 0 } as never);
    const slowed = speed();
    expect(knownHazardsNear(sim, ant.colony, ant.pos, 50)).toHaveLength(1);
    creatureKilled(sim, al.id, []);
    step(sim, 1);
    expect(pit.state).toBe('collapsed');
    expect(speed()).toBeGreaterThan(slowed * 2);
    expect(knownHazardsNear(sim, ant.colony, ant.pos, 50)).toHaveLength(0);
    sim.state.tick += Math.round(ANTLION_EMPTY_PIT_FILL_GD * TICKS_PER_DAY) + 1;
    expireHazards(sim);
    expect(sim.state.ecology.hazards.some((h) => h.id === pit.id)).toBe(false);
  });
});

describe('danger grid: a seized ant that struggles free counts as a survived strike', () => {
  it('adds 1.0 where it was held', () => {
    const sim = creatureScene({ seed: 3 });
    setClock(sim, 'summer', 3, 14);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    ant.maxHp = ant.hp = 200;
    possess(sim, ant);
    const sp = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan' });
    step(sim, 600, () => (ant.combat?.seizedBy ?? -1) >= 0);
    expect(ant.combat!.seizedBy).toBe(sp.id);
    expect(dangerAt(sim, ant.pos)).toBe(0); // not yet: the outcome is open
    sim.state.player.possessedAntId = -1; // AI struggle from here
    ant.combat!.escape = 0.995;
    step(sim, 5, () => ant.combat!.seizedBy < 0);
    expect(ant.combat!.seizedBy).toBe(-1);
    expect(dangerAt(sim, sp.pos)).toBeCloseTo(1, 3);
  });
});

describe('danger grid: avoid markers priced only over their own cells', () => {
  it('sets cost 3 inside a marker, 1 elsewhere, and clears when it is removed', () => {
    const sim = creatureScene({ seed: 2, sizeBu: 256 });
    const col = sim.state.colonies[0];
    const marker = { id: 999300, alive: true, kind: 'avoid', colony: col.id, pos: { x: 500, y: 0, z: 500 }, radius: 100 } as never;
    const ng = sim.navGrid;
    const inBase = ng.costAt(500, 500), outBase = ng.costAt(900, 900);
    sim.state.markers.push(marker);
    updateDanger(sim, 5);
    expect(ng.costAt(500, 500) / inBase).toBeCloseTo(Math.min(3, 1 + 2 * DANGER_AVOID_MARKER), 5);
    expect(ng.costAt(900, 900)).toBe(outBase);
    sim.state.markers.length = 0;
    updateDanger(sim, 5);
    expect(ng.costAt(500, 500)).toBe(inBase);
  });

  // Strict budget (03-architecture §6: 4 ms per frame) under FOUNDRESS_STRICT_PERF=1; the default limit tolerates a
  // loaded machine. Measured min of 5x10 on a Standard map grid (62 500 cells): ~1.0 ms (0 markers), ~1.7 ms (20).
  it('a Standard map grid with 20 markers stays within budget', () => {
    const w = 250 * 16 * 4;
    const markers = [];
    for (let i = 0; i < 20; i++) markers.push({ alive: true, kind: 'avoid', colony: 1, pos: { x: 1000 + i * 700, y: 0, z: 2000 }, radius: 200 });
    const fake = {
      world: { size: w, bu: 4 },
      state: { colonies: [{ id: 1, alive: true, isPlayer: true, danger: new Float32Array(0) }], markers },
      navGrid: { cell: 64, w: 250, h: 250, setCostMult() {} },
    } as unknown as Sim;
    updateDanger(fake, 5);
    let best = Infinity;
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      for (let k = 0; k < 10; k++) updateDanger(fake, 5);
      best = Math.min(best, (performance.now() - t0) / 10);
    }
    expect(best).toBeLessThan(STRICT_PERF ? 4 : 20);
  });
});

describe('patch prey for an autonomous forager (GDD 05 §2.3)', () => {
  it('appears 2-4 L ahead of it', () => {
    const sim = creatureScene({ seed: 5 });
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 250, 250);
    ant.task = 'forage';
    ant.speed = 20;
    ant.fwd = { x: 1, y: 0, z: 0 };
    sim.index.refresh();
    sim.state.ecology.preyPatches.push({ id: 999100, center: { x: 250, y: 0, z: 250 }, radius: 200, kind: 'springtail', count: 1000, k: 1000 });
    const L = ant.lengthBu * sim.world.bu;
    let n = 0, behind = 0, outOfRange = 0;
    for (let i = 0; i < 200; i++) {
      sim.state.tick++;
      spawnPatchPrey(sim, conditions(sim), 5);
      for (const c of sim.stores.creatures.list.filter((x) => x.alive && (x.kind === 'springtail' || x.kind === 'mite'))) {
        const dx = c.pos.x - ant.pos.x, dz = c.pos.z - ant.pos.z, d = Math.hypot(dx, dz);
        n++;
        if (dx <= 0) behind++;
        if (d < 1.9 * L || d > 4.6 * L) outOfRange++;
        despawnCreature(sim, c.id, 'test');
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(behind).toBe(0);
    expect(outOfRange).toBe(0);
  });
});

describe('bird event rate per Predators setting (GDD 05 §2.6), ungated', () => {
  function ratePerDay(setting: 'few' | 'many', days: number): number {
    const sim = creatureScene({ seed: 6, sizeBu: 256 });
    sim.state.config.rules.predators = setting;
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    for (let i = 0; i < 40; i++) placeWorker(sim, 500 + (i % 8) * 6, 500 + Math.floor(i / 8) * 6);
    quietHistory(sim, 72);
    sim.index.refresh();
    const td = sim.state.rivals.threatDirector;
    let events = 0;
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) {
        sim.state.tick++;
        setClock(sim, 'summer', 3, h);
        sim.state.ecology.birdEvent = null;
        sim.state.ecology.lastBirdTick = {};
        td.activeKind = null; td.lastEndTick = -1;
        if (birdHourly(sim, conditions(sim))) events++;
      }
    }
    return events / days;
  }
  it('Few is about 0.4 and Many about 1.6 events per game day', () => {
    expect(ratePerDay('few', 250)).toBeGreaterThan(0.7 * BIRD_RATE.few);
    expect(ratePerDay('few', 250)).toBeLessThan(1.3 * BIRD_RATE.few);
    const many = ratePerDay('many', 150);
    expect(many).toBeGreaterThan(0.8 * BIRD_RATE.many);
    expect(many).toBeLessThan(1.2 * BIRD_RATE.many);
  });
});

describe('a predator killed while holding an ant', () => {
  it('lets the ant go', () => {
    const sim = creatureScene({ seed: 3 });
    setClock(sim, 'summer', 3, 14);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    ant.maxHp = ant.hp = 200;
    possess(sim, ant);
    const sp = spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan' });
    step(sim, 600, () => (ant.combat?.seizedBy ?? -1) >= 0);
    expect(ant.combat!.seizedBy).toBe(sp.id);
    creatureKilled(sim, sp.id, [ant.id]);
    expect(ant.combat!.seizedBy).toBe(-1);
    step(sim, 2);
    expect(ant.alive).toBe(true);
  });
});
