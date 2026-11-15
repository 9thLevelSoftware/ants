// Territory marks (GDD 05 §3.5): App. E 17 (decay and claim), the core deposit, rain halving, surface deposits
// by ants, and the hourly scan (claimed and contested cells).
import { describe, expect, it } from 'vitest';
import { commandsSystem } from '@/sim/systems';
import { coreEquilibrium, ensureTerritory } from './init';
import { claimAt, depositMarks, hourlyMarks, scanTerritory } from './territory';
import { slotOf } from './state';
import { setupRivalNest } from './setup';
import { rivalSim, rivalsOf } from './testkit';

const DT = 1 / 24;

function bareSim() {
  const sim = rivalSim({ rivals: [{ species: 'tetramorium-immigrans', dx: 90, dz: 0 }], systems: [commandsSystem] });
  ensureTerritory(sim.state);
  for (const r of rivalsOf(sim)) setupRivalNest(sim, r); // normally the rivals tick system's first tick
  return sim;
}

describe('territory marks (App. E 17)', () => {
  it('marks halve in 2 gd without deposits or rain', () => {
    const sim = bareSim();
    const t = sim.state.rivals.territory;
    const c = 5 * t.w + 5;
    t.marks.fill(0);
    t.marks[c * t.slots + 0] = 100;
    for (let h = 0; h < 48; h++) hourlyMarks(sim, DT, () => 0, false);
    expect(t.marks[c * t.slots]).toBeGreaterThan(49.5);
    expect(t.marks[c * t.slots]).toBeLessThan(50.5);
  });

  it('rival 30 / player 25 is contested; rival 40 / player 25 is claimed by the rival', () => {
    const sim = bareSim();
    const t = sim.state.rivals.territory;
    const rival = rivalsOf(sim)[0];
    const rs = slotOf(sim.state, rival.id);
    t.marks.fill(0);
    const p = { x: 5.5 * t.cell, z: 5.5 * t.cell }, c = 5 * t.w + 5;
    t.marks[c * t.slots + rs] = 30; t.marks[c * t.slots] = 25;
    expect(claimAt(sim, p)).toMatchObject({ owner: -1, contested: true });
    t.marks[c * t.slots + rs] = 40;
    expect(claimAt(sim, p)).toMatchObject({ owner: rival.id, contested: false });
    t.marks[c * t.slots + rs] = 19; t.marks[c * t.slots] = 0;
    expect(claimAt(sim, p).owner).toBe(-1); // below CLAIM_MIN 20
  });

  it('a rain event halves the marks once', () => {
    const sim = bareSim();
    const t = sim.state.rivals.territory;
    t.marks.fill(0);
    t.marks[0] = 80;
    hourlyMarks(sim, 0, () => 0, true);
    expect(t.marks[0]).toBeCloseTo(40);
    hourlyMarks(sim, 0, () => 0, true); // still the same rain
    expect(t.marks[0]).toBeCloseTo(40);
    hourlyMarks(sim, 0, () => 0, false);
    hourlyMarks(sim, 0, () => 0, true); // a new rain event
    expect(t.marks[0]).toBeCloseTo(20);
  });

  it('core deposit: cells within R_core of an active rival entrance reach the equilibrium (about 87)', () => {
    const sim = bareSim();
    const rival = rivalsOf(sim)[0];
    const e = sim.stores.nests.get(rival.nestIds[0])!.entrances[0];
    const t = sim.state.rivals.territory;
    t.marks.fill(0);
    for (let h = 0; h < 24 * 20; h++) hourlyMarks(sim, DT, () => 1, false);
    const m = t.marks[(Math.floor(e.pos.z / t.cell) * t.w + Math.floor(e.pos.x / t.cell)) * t.slots + slotOf(sim.state, rival.id)];
    expect(coreEquilibrium()).toBeCloseTo(86.56, 1);
    expect(m).toBeGreaterThan(0.95 * coreEquilibrium());
    expect(m).toBeLessThan(1.01 * coreEquilibrium());
    // inactive (a = 0) or small colonies (N < 20) add nothing
    t.marks.fill(0);
    hourlyMarks(sim, DT, () => 0, false);
    expect(t.marks.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('ants on the surface deposit 1 per second for their colony', () => {
    const sim = rivalSim({ nest: 'small', workers: 0, rivals: [], systems: [commandsSystem] });
    ensureTerritory(sim.state);
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    const t = sim.state.rivals.territory;
    depositMarks(sim);
    const c = Math.floor(q.pos.z / t.cell) * t.w + Math.floor(q.pos.x / t.cell);
    expect(t.marks[c * t.slots + 0]).toBeCloseTo(1);
  });

  it('the scan counts claimed and contested cells and creates the relation of a contested pair', () => {
    const sim = bareSim();
    const rival = rivalsOf(sim)[0];
    const t = sim.state.rivals.territory;
    const rs = slotOf(sim.state, rival.id);
    t.marks.fill(0);
    for (let c = 0; c < 10; c++) t.marks[c * t.slots + rs] = 50;
    for (let c = 10; c < 13; c++) { t.marks[c * t.slots + rs] = 30; t.marks[c * t.slots] = 28; }
    const scan = scanTerritory(sim);
    expect(scan.claimed[rs]).toBe(10);
    const rel = sim.state.rivals.relations.find((r) => (r.a === rival.id || r.b === rival.id) && (r.a === sim.state.colonies[0].id || r.b === sim.state.colonies[0].id));
    expect(rel?.warFront.length).toBe(3);
  });
});
