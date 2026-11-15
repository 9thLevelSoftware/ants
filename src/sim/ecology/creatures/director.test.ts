// Creature director (GDD 05 §2.7), danger grid (§2.4) and threat director / quiet share (§6, I5, I11).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreatureKind, Sim } from '@/sim/types';
import { killCreature } from '@/sim/entities';
import { CREATURE_AGENT_CAP, DANGER_HALF_LIFE_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { addDanger, canStartMajorThreat, creatureCounts, dangerAt, quietShare, requestMajorThreat, endMajorThreat } from './index';
import { runDirector } from './director';
import { updateDanger } from './danger';
import { quietTick } from './threat';
import { creatureScene, installFakeCombat, placeWorker, quietHistory, sendQueenAway, setClock, spawnAt, step } from './testkit';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat().restore; });
afterEach(() => restore());

function addTerritory(sim: Sim, kind: CreatureKind, x: number, z: number, radius = 100): void {
  sim.state.ecology.director.territories.push({ kind, center: { x, y: 0, z }, radius, occupantId: -1, vacantUntilTick: -1 });
}

/** A 1024 mm square scene with the queen out of the way. */
function scene(hour = 12): Sim {
  const sim = creatureScene({ seed: 7, sizeBu: 256 });
  setClock(sim, 'summer', 3, hour);
  sendQueenAway(sim);
  return sim;
}

function runs(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) { runDirector(sim); sim.tick(); }
}

describe('residents and visitors', () => {
  it('residents fill territories up to cap x Predators setting; a dead one is replaced after its respawn delay', () => {
    for (const [setting, expected] of [['normal', 3], ['few', 1], ['off', 0], ['many', 4]] as const) {
      const sim = scene();
      sim.state.config.rules.predators = setting;
      for (let i = 0; i < 5; i++) addTerritory(sim, 'wolf-spider', 150 + i * 150, 800);
      runs(sim, 3);
      expect(creatureCounts(sim)['wolf-spider'] ?? 0).toBe(expected);
    }
    const sim = scene();
    addTerritory(sim, 'wolf-spider', 300, 800);
    runs(sim, 1);
    const t = sim.state.ecology.director.territories[0];
    const first = t.occupantId;
    expect(first).toBeGreaterThan(0);
    killCreature(sim, first, 'combat');
    sim.tick();
    expect(t.occupantId).toBe(-1);
    expect(t.vacantUntilTick - sim.state.tick).toBeGreaterThan(1.4 * TICKS_PER_DAY);
    runs(sim, 5);
    expect(creatureCounts(sim)['wolf-spider'] ?? 0).toBe(0);
    sim.state.tick = t.vacantUntilTick + 1;
    runs(sim, 1);
    expect(creatureCounts(sim)['wolf-spider']).toBe(1);
  });

  it('visitors (centipedes) come out only at night, at most 2, and burrow at dawn', () => {
    const sim = scene(12);
    for (let i = 0; i < 4; i++) addTerritory(sim, 'centipede', 150 + i * 200, 700);
    runs(sim, 100);
    expect(creatureCounts(sim).centipede ?? 0).toBe(0);
    setClock(sim, 'summer', 3, 23);
    runs(sim, 200);
    expect(creatureCounts(sim).centipede).toBe(2);
    setClock(sim, 'summer', 4, 10);
    runs(sim, 2);
    expect(creatureCounts(sim).centipede ?? 0).toBe(0);
  });

  it('never spawns within 20 BU of an ant or 40 BU of the focus', () => {
    const sim = scene();
    addTerritory(sim, 'jumping-spider', 500, 500);
    placeWorker(sim, 500 + 10 * sim.world.bu, 500);
    sim.tick();
    runs(sim, 5);
    expect(creatureCounts(sim)['jumping-spider'] ?? 0).toBe(0);
  });

  it('the global cap of 260 culls prey and neutral fauna first, never ant predators (I5)', () => {
    const sim = scene();
    for (let i = 0; i < 3; i++) spawnAt(sim, 'wolf-spider', 100 + i * 40, 100, { state: 'rest' });
    for (let i = 0; i < 280; i++) spawnAt(sim, 'springtail', 200 + (i % 20) * 30, 200 + Math.floor(i / 20) * 30, { state: 'graze', bb: { contact: 0 } });
    runDirector(sim);
    sim.tick();
    const counts = creatureCounts(sim);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(CREATURE_AGENT_CAP);
    expect(counts['wolf-spider']).toBe(3);
  });

  it('winter clears everything but the dormant antlions', () => {
    const sim = scene();
    addTerritory(sim, 'antlion', 600, 600, 25);
    runs(sim, 1);
    spawnAt(sim, 'woodlouse', 300, 300);
    spawnAt(sim, 'snail', 320, 300);
    setClock(sim, 'winter', 2, 12);
    runs(sim, 2);
    expect(Object.keys(creatureCounts(sim))).toEqual(['antlion']);
  });
});

describe('danger grid (§2.4)', () => {
  it('adds 1.0 per event, halves every 0.5 gd, and prices nav cells x min(3, 1 + 2 danger)', () => {
    const sim = scene();
    const p = { x: 400, y: 0, z: 400 };
    addDanger(sim, p);
    updateDanger(sim, 0);
    expect(dangerAt(sim, p)).toBeCloseTo(1, 6);
    expect(sim.navGrid.costAt(p.x, p.z)).toBeCloseTo(3, 6);
    updateDanger(sim, DANGER_HALF_LIFE_GD * 600);
    expect(dangerAt(sim, p)).toBeCloseTo(0.5, 4);
    expect(sim.navGrid.costAt(p.x, p.z)).toBeCloseTo(2, 2);
    updateDanger(sim, 20 * 600);
    expect(sim.navGrid.costAt(p.x, p.z)).toBeCloseTo(1, 6);
  });

  it('a witnessed predator kill marks the cell where it happened', () => {
    const sim = scene(14);
    const victim = placeWorker(sim, 400, 400);
    victim.maxHp = victim.hp = 10;
    const witness = placeWorker(sim, 400, 400 + 18);
    void witness;
    const spider = spawnAt(sim, 'wolf-spider', 400 - 20, 400, { state: 'ambush', stateS: 100 });
    step(sim, 60, () => !victim.alive);
    expect(victim.alive).toBe(false);
    expect(dangerAt(sim, { x: 400, y: 0, z: 400 })).toBeGreaterThan(0.9);
    void spider;
  });
});

describe('threat director and quiet share (§6, I11)', () => {
  it('one major threat at a time, THREAT_MIN_QUIET_GD after the last, refused while the share is low', () => {
    const sim = scene(8);
    quietHistory(sim, 4); // past founding, a few quiet hours on record
    expect(requestMajorThreat(sim, 'bird')).toBe(true);
    expect(canStartMajorThreat(sim)).toBe(false);
    // the active threat makes its daytime hours loud
    for (let h = 0; h < 4; h++) for (let t = 0; t < TICKS_PER_HOUR; t++) { quietTick(sim); sim.state.tick++; }
    endMajorThreat(sim, 'bird');
    expect(canStartMajorThreat(sim)).toBe(false); // 0.5 gd naturalist quiet time
    sim.state.tick += 0.5 * TICKS_PER_DAY;
    for (let t = 0; t < TICKS_PER_HOUR; t++) { quietTick(sim); sim.state.tick++; }
    const share = quietShare(sim)!;
    expect(share).toBeLessThan(0.65);
    expect(canStartMajorThreat(sim)).toBe(false); // share below 0.60 + 0.05
    // quiet hours raise the share until a new threat (counted as 2 more loud hours) keeps it >= 0.65
    let h = 0;
    for (; h < 48 && !canStartMajorThreat(sim); h++) for (let t = 0; t < TICKS_PER_HOUR; t++) { quietTick(sim); sim.state.tick++; }
    expect(h).toBeLessThan(48);
    expect(quietShare(sim)!).toBeGreaterThanOrEqual(0.65);
  });
});
