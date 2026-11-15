// Independent review tests (verify pass) for the creatures task. Tests that FAIL here demonstrate a defect in the
// production code and are left in place for the fixer; the others are regression guards.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ant, Sim, System } from '@/sim/types';
import { locomotionSystem } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { despawnCreature } from '@/sim/entities';
import { aiSpeed } from '@/sim/locomotion/speed';
import { BIRD_MAX_KILLS, BIRD_RATE, HARASS_BITE, HARASS_SPRAY, DETERRENCE_PER_SPRAY, CREATURE_STATS } from '@/sim/balance/creatures';
import { creatureCounts, capOf, noteCreatureHit, creatureSystem, dangerAt, triggerBird } from './index';
import { conditions } from './conditions';
import { spawnPatchPrey } from './spawners';
import { birdHourly } from './bird';
import { ensureHooks } from './hooks';
import { setState } from './common';
import {
  captureEvents, creatureScene, installFakeCombat, placeWorker, possess, quietHistory, sendQueenAway, setClock, spawnAt, step,
} from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

describe('hit bookkeeping vs combat damage (GDD 05 §2.1, §4.4)', () => {
  /** A stand-in combat system that runs AFTER the creature system in the tick (tick order: creatures -> locomotion -> combat). */
  function combatScene(act: (sim: Sim, tickInRun: number) => void): Sim {
    let n = 0;
    const fakeCombat: System = { name: 'verify-combat', phase: 'combat', run: (s) => { act(s, n++); } };
    return makeTestSim({ seed: 1, sizeBu: 128, systems: [creatureSystem, locomotionSystem, fakeCombat] });
  }

  // GDD 05 §4.4: acid (and stings) deal their damage OVER 2 s; combat reports the spray once (noteCreatureHit) and
  // then lowers hp on 20 ticks. hitBookkeeping counts every unreported hp drop as an extra bite.
  it('one reported spray followed by 2 s of acid damage counts as one spray (harass +3, deterrence +0.35 x sens)', () => {
    let cid = -1, aid = -1;
    const sim = combatScene((s, i) => {
      const c = s.stores.creatures.get(cid);
      if (!c) return;
      if (i === 0) noteCreatureHit(s, cid, aid, 'spray');
      if (i < 20) c.hp -= 0.1;
    });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    aid = placeWorker(sim, 100, 100).id;
    const c = spawnAt(sim, 'woodlouse', 300, 300, { state: 'wander', bb: { roller: 0 } });
    cid = c.id;
    step(sim, 25);
    expect(c.harass).toBe(HARASS_SPRAY);
    expect(c.deterrence).toBeLessThanOrEqual(DETERRENCE_PER_SPRAY * CREATURE_STATS.woodlouse.acidSens + 1e-6);
  });

  it('a bite combat reports and then applies in its own phase counts once', () => {
    let cid = -1, aid = -1;
    const sim = combatScene((s, i) => {
      const c = s.stores.creatures.get(cid);
      if (!c || i !== 0) return;
      noteCreatureHit(s, cid, aid, 'bite');
      c.hp -= 1; // applyDamage after the report, same combat tick
    });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    aid = placeWorker(sim, 100, 100).id;
    const c = spawnAt(sim, 'woodlouse', 300, 300, { state: 'wander', bb: { roller: 0 } });
    cid = c.id;
    step(sim, 3);
    expect(c.harass).toBe(HARASS_BITE);
  });

  it('a bite applied and then reported in the combat phase counts once (regression guard)', () => {
    let cid = -1, aid = -1;
    const sim = combatScene((s, i) => {
      const c = s.stores.creatures.get(cid);
      if (!c || i !== 0) return;
      c.hp -= 1;
      noteCreatureHit(s, cid, aid, 'bite');
    });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    aid = placeWorker(sim, 100, 100).id;
    const c = spawnAt(sim, 'woodlouse', 300, 300, { state: 'wander', bb: { roller: 0 } });
    cid = c.id;
    step(sim, 3);
    expect(c.harass).toBe(HARASS_BITE);
  });
});

describe('centipede near the player nest (GDD 05 §2.2b "burrows (despawns) at dawn unless engaged")', () => {
  it('a prowling centipede within 60 BU of the player entrance is gone (or at least not hunting) by mid-morning', () => {
    const sim = creatureScene({ seed: 4, sizeBu: 256, nest: 'small', workers: 0, director: true });
    setClock(sim, 'summer', 3, 23);
    const e = sim.state.nests[0].entrances[0].pos;
    const near = spawnAt(sim, 'centipede', e.x + 120, e.z, { state: 'prowl' });
    const far = spawnAt(sim, 'centipede', e.x - 350, e.z, { state: 'prowl' });
    step(sim, 20);
    setClock(sim, 'summer', 4, 10);
    step(sim, 300);
    expect(far.alive).toBe(false); // control: away from the focus it burrows
    expect(near.alive && near.state === 'prowl').toBe(false);
  });
});

describe('centipede near the player nest: daylight hunting', () => {
  it('a centipede left over near the entrance does not strike ants in mid-morning (it is a night-only hunter)', () => {
    const sim = creatureScene({ seed: 4, sizeBu: 256, nest: 'small', workers: 0, director: true });
    setClock(sim, 'summer', 3, 23);
    const e = sim.state.nests[0].entrances[0].pos;
    const near = spawnAt(sim, 'centipede', e.x + 120, e.z, { state: 'prowl' });
    step(sim, 20);
    setClock(sim, 'summer', 4, 10);
    step(sim, 100);
    const tele = captureEvents(sim, ['predator-telegraph']);
    const prey = placeWorker(sim, near.pos.x + 10, near.pos.z);
    sim.state.player.possessedAntId = -1;
    step(sim, 200, () => tele.length > 0);
    expect(prey.alive).toBe(true);
    expect(tele.length).toBe(0);
  });
});

describe('hazard speed factors only apply on the hazard surface (hooks.ts)', () => {
  function speedOf(sim: Sim, ant: Ant): number {
    const s = { speedKind: 'cruise', speedMult: 1, speedFixed: 0 } as never;
    return aiSpeed(sim, ant, s, { creature: 0 } as never);
  }

  it('an ant inside the nest under a slime trail or an antlion pit is not slowed', () => {
    const sim = makeTestSim({ seed: 2, nest: 'small', workers: 4, systems: [] });
    ensureHooks(sim);
    const ant = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker' && a.nestId >= 0)!;
    expect(ant).toBeDefined();
    ant.fwd = { x: 1, y: 0, z: 0 };
    const free = speedOf(sim, ant);
    const surfY = sim.field.height(ant.pos.x, ant.pos.z);
    sim.state.ecology.hazards.push({ id: 999001, kind: 'slime-trail', pos: { x: ant.pos.x, y: surfY, z: ant.pos.z }, radius: 4, depth: 0, state: 'fresh', knownBy: 0 });
    expect(speedOf(sim, ant) / free).toBeCloseTo(1, 5);
    sim.state.ecology.hazards.length = 0;
    sim.state.ecology.hazards.push({ id: 999002, kind: 'antlion-pit', pos: { x: ant.pos.x - 10, y: surfY, z: ant.pos.z }, radius: 30, depth: 20, state: 'wait', knownBy: 0 });
    expect(speedOf(sim, ant) / free).toBeCloseTo(1, 5);
  });
});

describe('patch prey pop-in rule (GDD 05 §2.3: out of the possessed ant\'s front cone, never inside 1.5 L)', () => {
  it('springtails spawned for the possessed ant appear outside its front cone', () => {
    const sim = creatureScene({ seed: 5 });
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 250, 250);
    possess(sim, ant);
    ant.task = 'idle';
    ant.speed = 20;
    sim.index.refresh();
    sim.state.ecology.preyPatches.push({ id: 999100, center: { x: 250, y: 0, z: 250 }, radius: 200, kind: 'springtail', count: 1000, k: 1000 });
    const L = ant.lengthBu * sim.world.bu;
    let inCone = 0, tooClose = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      sim.state.tick++;
      spawnPatchPrey(sim, conditions(sim), 5);
      const made = sim.stores.creatures.list.filter((c) => c.alive && (c.kind === 'springtail' || c.kind === 'mite'));
      for (const c of made) {
        const dx = c.pos.x - ant.pos.x, dz = c.pos.z - ant.pos.z, d = Math.hypot(dx, dz);
        n++;
        if (d < 1.5 * L) tooClose++;
        if ((dx * ant.fwd.x + dz * ant.fwd.z) / d > Math.cos(Math.PI / 4)) inCone++;
        despawnCreature(sim, c.id, 'test'); // keep below the live cap
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(tooClose).toBe(0);
    expect(inCone).toBe(0);
  });
});

describe('bird event rate (GDD 05 §2.6: BIRD_RATE per gd)', () => {
  it('without gating by gaps or the threat director, Normal starts about 1.0 events per game day', () => {
    const sim = creatureScene({ seed: 6, sizeBu: 256 });
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    for (let i = 0; i < 40; i++) placeWorker(sim, 500 + (i % 8) * 6, 500 + Math.floor(i / 8) * 6);
    quietHistory(sim, 72);
    sim.index.refresh();
    const td = sim.state.rivals.threatDirector;
    const days = 300;
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
    expect(events / days).toBeGreaterThan(0.8 * BIRD_RATE.normal);
  });
});

describe('antlion pits respect cap x Predators setting (I5)', () => {
  it('with Predators Few (x0.4) at most floor(12 x 0.4) antlions are placed', () => {
    const sim = creatureScene({ seed: 8, sizeBu: 256, director: true });
    sim.state.config.rules.predators = 'few';
    setClock(sim, 'summer', 3, 12);
    sendQueenAway(sim);
    for (let i = 0; i < 6; i++) {
      sim.state.ecology.director.territories.push({ kind: 'antlion', center: { x: 100 + i * 150, y: 0, z: 300 }, radius: 25, occupantId: -1, vacantUntilTick: -1 });
    }
    step(sim, 60);
    expect(creatureCounts(sim).antlion ?? 0).toBeLessThanOrEqual(capOf(sim, 'antlion'));
  });
});

describe('ant-spider mimicry (GDD 05 §2.4: any detection within 1 L makes it retreat)', () => {
  it('a spider carrying a paralysed ant away lets go when a nestmate comes within 1 L', () => {
    const sim = creatureScene({ seed: 9, sizeBu: 256 });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    const victim = placeWorker(sim, 400, 400);
    victim.combat = {
      lock: null, heldBy: [], pinned: false, seizedBy: -1, escape: 0, paralysedUntilTick: sim.state.tick + 600, stuckSinceTick: 0,
      disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0, recentHitters: [], biteCdTick: 0, specialCdTick: 0, dodgeCdTick: 0,
    };
    const sp = spawnAt(sim, 'ant-spider', 402, 400, { state: 'collect', homeCenter: { x: 900, y: 0, z: 900 } });
    sp.bb.prey = victim.id;
    setState(sim, sp, 'collect');
    step(sim, 30, () => sp.state === 'carry');
    expect(sp.state).toBe('carry');
    const L = victim.lengthBu * sim.world.bu;
    placeWorker(sim, sp.pos.x + 0.5 * L, sp.pos.z + 0.5 * L);
    step(sim, 5);
    expect(sp.state).toBe('flee');
    expect(victim.combat.seizedBy).toBe(-1);
  });
});

describe('danger grid witness rule (GDD 05 §2.4: a WITNESSED kill or a survived strike adds 1.0)', () => {
  it('a lone worker seized and killed with no nestmate within 6 L leaves no danger', () => {
    const sim = creatureScene({ seed: 3 });
    setClock(sim, 'summer', 3, 14);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 150, 150);
    ant.maxHp = ant.hp = 10;
    possess(sim, ant); // no AI dodge roll
    const at = { ...ant.pos };
    spawnAt(sim, 'jumping-spider', 120, 150, { state: 'scan' });
    step(sim, 600, () => !ant.alive);
    expect(ant.alive).toBe(false);
    expect(dangerAt(sim, at)).toBe(0);
  });
});

describe('bird kills scale with the Predators setting (GDD 05 §2.6: BIRD_MAX_KILLS 12 x setting) - regression guard', () => {
  it('Few stops after round(12 x 0.4) = 5 kills', () => {
    const sim = creatureScene({ seed: 4 });
    sim.state.config.rules.predators = 'few';
    setClock(sim, 'summer', 2, 12);
    sendQueenAway(sim);
    quietHistory(sim, 20);
    for (let i = 0; i < 20; i++) placeWorker(sim, 210 + (i % 5) * 10, 230 + Math.floor(i / 5) * 10);
    step(sim, 1);
    const left = captureEvents(sim, ['bird-left']);
    expect(triggerBird(sim, 'thrush', { x: 250, y: 0, z: 250 }, false)).toBe(true);
    step(sim, 700, () => left.length > 0);
    expect(left.length).toBe(1);
    const kills = (left[0].ev as { kills: number }).kills;
    expect(kills).toBeGreaterThan(0);
    expect(kills).toBeLessThanOrEqual(Math.round(BIRD_MAX_KILLS * 0.4));
  });
});

