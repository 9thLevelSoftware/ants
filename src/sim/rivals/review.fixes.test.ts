// Regression tests for the review findings fixed in the rivals module: one player raid per rally marker and none
// without a free worker, the diet split of the virtual harvest, the budget remainder within a priority, room under
// the cap for ants it cannot remove, pair-wise escalation counting, the entrance rule (GDD 05 §3.4) and the
// aftermath of the display brood (§3.9). The reviewer's own checks are in rivals.verify.test.ts.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { startFight } from '@/sim/combat';
import { createSource } from '@/sim/ecology/sources/spawn';
import { amountOf } from '@/sim/ecology/sources/def';
import { E_GAIN, ANT_TOTAL_CAP, RIVAL_LEVERS } from '@/sim/balance/rivals';
import './wiring';
import { spawnAgent } from './agents';
import { claimAt } from './claims';
import { pairOnce } from './encounter';
import { allocateBudget, antCounts, capRoom } from './fielding';
import { drawRealNodes, unitsWanted } from './hourly';
import { destroy } from './lifecycle';
import { endRaid, playerRallyRaid } from './raids';
import { findRelation } from './relations';
import { displayBrood, entranceTierOf, growEntrances, homeNest, setupRivalNest } from './setup';
import { colExt, JOB, rmod, slotBit } from './state';
import { watchFights } from './watch';
import { player, rivalSim, rivalsOf } from './testkit';

function rallyAt(sim: Sim, x: number, z: number): number {
  sim.enqueue({ type: 'placeMarker', kind: 'rally', pos: { x, y: 0, z }, radius: 8 * sim.world.bu, params: { mode: 'attack' } });
  sim.applyPendingCommands();
  return sim.state.markers.filter((m) => m.alive && m.kind === 'rally').at(-1)!.id;
}

describe('player rally raids (review finding 1)', () => {
  it('one raid per marker; a new marker sends the next party', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 6, rivals: [{ species: 'lasius-niger', dx: 70, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0], col = player(sim);
    setupRivalNest(sim, r);
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste !== 'queen') a.task = 'forage';
    rmod(sim.state).playerKnowsNest |= slotBit(sim.state, r.id);
    const e = homeNest(sim, r)!.entrances[0];
    const first = rallyAt(sim, e.pos.x - 10 * sim.world.bu, e.pos.z);
    playerRallyRaid(sim);
    const m = rmod(sim.state);
    expect(m.raids.length).toBe(1);
    expect(m.raids[0].partyIds.length).toBeGreaterThan(0);
    expect(m.rallyRaidMarker).toBe(first);
    // the raid is over (the party is home): the same marker does not start another one
    endRaid(sim, m.raids[0]);
    m.raids = [];
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste !== 'queen') a.task = 'forage';
    playerRallyRaid(sim);
    expect(m.raids.length).toBe(0);
    // a new marker: a new party
    sim.enqueue({ type: 'removeMarker', markerId: first });
    rallyAt(sim, e.pos.x - 10 * sim.world.bu, e.pos.z);
    playerRallyRaid(sim);
    expect(m.raids.length).toBe(1);
  }, 60_000);

  it('no worker free to go: no raid record, no event and no escalation; the marker stays usable', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 4, rivals: [{ species: 'lasius-niger', dx: 70, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0], col = player(sim);
    setupRivalNest(sim, r);
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste !== 'queen') a.task = 'nurse'; // no foragers
    rmod(sim.state).playerKnowsNest |= slotBit(sim.state, r.id);
    const e = homeNest(sim, r)!.entrances[0];
    r.rival.n = 400; // not incipient: a war raid (foragers and guards only)
    rallyAt(sim, e.pos.x - 10 * sim.world.bu, e.pos.z);
    for (let i = 0; i < 20; i++) playerRallyRaid(sim);
    expect(rmod(sim.state).raids.length).toBe(0);
    expect(findRelation(sim.state, col.id, r.id)?.e ?? 0).toBe(0);
    expect(rmod(sim.state).rallyRaidMarker).toBeUndefined();
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste !== 'queen') a.task = 'forage';
    playerRallyRaid(sim);
    expect(rmod(sim.state).raids.length).toBe(1);
  }, 60_000);
});

describe('virtual harvest split by diet (review finding 3)', () => {
  it('units are taken only for a nutrient the node really supplies', () => {
    expect(unitsWanted(1, 0, 0, 2)).toBe(0); // sugar for protein: nothing
    expect(unitsWanted(0.02, 0.5, 1, 0)).toBe(0); // a carcass for carbohydrate: nothing
    expect(unitsWanted(0.02, 0.5, 1, 1)).toBeCloseTo(2); // ... for protein: 1 / 0.5
    expect(unitsWanted(1, 0, 0.5, 0)).toBeCloseTo(0.5);
    expect(unitsWanted(0.5, 0.5, 1, 0.25)).toBeCloseTo(2); // mixed: the larger need
    expect(unitsWanted(0, 0, 1, 1)).toBe(0);
  });

  it('subterranean species (root aphids) draw nothing from the surface; others do', () => {
    const sim = rivalSim({ sizeBu: 384, rivals: [{ species: 'lasius-flavus', dx: 90, dz: 0 }, { species: 'lasius-niger', dx: -90, dz: 0 }], systems: [commandsSystem] });
    const [flavus, niger] = rivalsOf(sim);
    for (const c of [flavus, niger]) setupRivalNest(sim, c);
    const pile = (c: typeof flavus) => {
      const o = homeNest(sim, c)!.origin;
      const pos = { x: o.x + 12 * sim.world.bu, y: 0, z: o.z };
      pos.y = sim.field.height(pos.x, pos.z);
      return createSource(sim, { variant: 'sugar-granules', pos, units: 100 });
    };
    const a = pile(flavus), b = pile(niger);
    sim.index.refresh();
    expect(claimAt(sim, a.pos).owner).toBe(flavus.id);
    expect(claimAt(sim, b.pos).owner).toBe(niger.id);
    drawRealNodes(sim, flavus, 2, 0);
    drawRealNodes(sim, niger, 2, 0);
    expect(amountOf(a)).toBe(100);
    expect(amountOf(b)).toBeCloseTo(100 - 2 / b.c); // 2 C loads
  }, 60_000);
});

describe('budget remainder stays within its priority (review finding 6)', () => {
  it('three colonies want one defender each, budget 2: two defenders, nothing for the lower priorities', () => {
    const t = [0, 1, 2].map(() => new Array<number>(13).fill(0));
    for (const row of t) { row[JOB.defend] = 1; row[JOB.forage] = 10; }
    const a = allocateBudget(t, 2);
    expect(a.reduce((s, r) => s + r[JOB.defend], 0)).toBe(2);
    expect(a.reduce((s, r) => s + r[JOB.forage], 0)).toBe(0);
    // with room left after the defenders the foragers share the rest (largest fraction first)
    const b = allocateBudget(t, 13);
    expect(b.reduce((s, r) => s + r[JOB.defend], 0)).toBe(3);
    expect(b.reduce((s, r) => s + r[JOB.forage], 0)).toBe(10);
  });
});

describe('room under the cap (review finding 7)', () => {
  it('capRoom counts every ant the cap cannot remove (player ants, queens), not the fielded agents', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 5, rivals: [{ species: 'lasius-niger', dx: 90, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    setupRivalNest(sim, r);
    const room0 = capRoom(sim);
    expect(room0).toBe(ANT_TOTAL_CAP - antCounts(sim).total);
    for (let i = 0; i < 10; i++) spawnAgent(sim, r, JOB.forage, false);
    expect(capRoom(sim)).toBe(room0); // agents can be absorbed to make room
  }, 60_000);
});

describe('escalation counted once per pair, from whichever side notices (review finding 8)', () => {
  it('pair marks are shared by two agents; a player partner is counted from the agent side', () => {
    const sim = rivalSim({ sizeBu: 512, nest: 'small', workers: 1, rivals: [{ species: 'lasius-niger', dx: 120, dz: 0 }, { species: 'tetramorium-immigrans', dx: -120, dz: 0 }], systems: [commandsSystem] });
    const [r1, r2] = rivalsOf(sim);
    setupRivalNest(sim, r1); setupRivalNest(sim, r2);
    const a = spawnAgent(sim, r1, JOB.forage, false)!, b = spawnAgent(sim, r2, JOB.forage, false)!;
    expect(a.id).toBeLessThan(b.id);
    expect(pairOnce(sim, b, a, false, 600)).toBe(true); // the higher id noticed first: counted
    expect(pairOnce(sim, a, b, false, 600)).toBe(false); // the lower id sees the same pair: not again
    expect(pairOnce(sim, a, b, true, 600)).toBe(true); // fights are counted apart from recognition
    const p = sim.state.ants.find((x) => x.alive && x.colony === player(sim).id && x.caste !== 'queen')!;
    expect(pairOnce(sim, a, p, false, 600)).toBe(true);
    expect(Object.keys(p.bb).some((k) => k.startsWith('rve.'))).toBe(false);
  }, 60_000);

  it('a higher-id agent attacking a lower-id agent that is not fighting counts +2', () => {
    const sim = rivalSim({ sizeBu: 512, rivals: [{ species: 'lasius-niger', dx: 120, dz: 0 }, { species: 'tetramorium-immigrans', dx: -120, dz: 0 }], systems: [commandsSystem] });
    const [r1, r2] = rivalsOf(sim);
    setupRivalNest(sim, r1); setupRivalNest(sim, r2);
    const a = spawnAgent(sim, r1, JOB.ret, false)!, b = spawnAgent(sim, r2, JOB.forage, false)!;
    b.pos = { ...a.pos };
    expect(startFight(sim, b, { kind: 'ant', id: a.id }, a.pos, 'threat')).toBe(true);
    expect(a.task).not.toBe('fight');
    const e0 = findRelation(sim.state, r1.id, r2.id)?.e ?? 0;
    watchFights(sim);
    expect((findRelation(sim.state, r1.id, r2.id)?.e ?? 0) - e0).toBeCloseTo(E_GAIN.fight / RIVAL_LEVERS.naturalist.warThresholdMult);
  }, 60_000);
});

describe('entrances 1 + [N >= 300] + [N >= 800] (GDD 05 §3.4, review finding 4)', () => {
  it('set from N0 at setup, one more when N first crosses 800', () => {
    expect([0, 299, 300, 799, 800, 5000].map(entranceTierOf)).toEqual([1, 1, 2, 2, 3, 3]);
    const sim = rivalSim({ sizeBu: 512, rivals: [{ species: 'lasius-niger', dx: 120, dz: 0 }, { species: 'formica-rufa', dx: -120, dz: 0 }], systems: [commandsSystem] });
    const [ln, fr] = rivalsOf(sim);
    setupRivalNest(sim, ln); setupRivalNest(sim, fr);
    const nest = homeNest(sim, ln)!;
    expect(nest.entrances.length).toBe(2); // N0 300
    expect(homeNest(sim, fr)!.entrances.length).toBe(1); // N0 250
    ln.rival.n = 850;
    growEntrances(sim, ln);
    expect(nest.entrances.length).toBe(3);
    expect(colExt(sim.state, ln.id).entranceTier).toBe(3);
    growEntrances(sim, ln); // each tier once
    expect(nest.entrances.length).toBe(3);
    for (let i = 0; i < nest.entrances.length; i++) {
      for (let j = i + 1; j < nest.entrances.length; j++) {
        const d = Math.hypot(nest.entrances[i].pos.x - nest.entrances[j].pos.x, nest.entrances[i].pos.z - nest.entrances[j].pos.z);
        expect(d).toBeGreaterThan(4 * sim.world.bu);
      }
    }
  }, 60_000);
});

describe('aftermath of the display brood (GDD 05 §3.9, review finding 4)', () => {
  it('a destroyed colony of another species leaves food pieces; one of the player species leaves adoptable brood', () => {
    const sim = rivalSim({ sizeBu: 512, rivals: [{ species: 'tetramorium-immigrans', dx: 120, dz: 0 }, { species: 'lasius-niger', dx: -120, dz: 0 }], systems: [commandsSystem] });
    const [tet, ln] = rivalsOf(sim);
    setupRivalNest(sim, tet); setupRivalNest(sim, ln);
    const tNest = homeNest(sim, tet)!, lNest = homeNest(sim, ln)!;
    const tBrood = displayBrood(sim, tet, tNest).length, lBrood = displayBrood(sim, ln, lNest).length;
    expect(tBrood).toBeGreaterThan(0);
    expect(lBrood).toBeGreaterThan(0);
    const items0 = sim.state.items.filter((i) => i.alive && i.kind === 'food-piece' && i.nestId === tNest.id).length;
    destroy(sim, tet);
    destroy(sim, ln);
    expect(sim.state.brood.filter((b) => b.alive && b.colony === tet.id).length).toBe(0);
    const food = sim.state.items.filter((i) => i.alive && i.kind === 'food-piece' && i.nestId === tNest.id);
    expect(food.length - items0).toBe(tBrood);
    expect(food.every((i) => i.p > 0 && i.foodKind === 'prey')).toBe(true);
    expect(sim.state.brood.filter((b) => b.alive && b.colony === ln.id).length).toBe(lBrood); // conspecific: adoptable
  }, 60_000);
});
