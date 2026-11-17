// Independent review tests of the wood-nesting module (species-carpenter review). Tests that pass are regression
// guards; tests that fail demonstrate a defect named in the review report (left red on purpose for the fixer).

import { describe, expect, it } from 'vitest';
// the sim first: entering through a deep module would evaluate module indexes half loaded (import cycles)
import { makeTestSim } from '@/sim/testing/testWorld';
import { placeMarker, spawnAnt, spawnBrood } from '@/sim/entities';
import { nestSystem } from '@/sim/nest';
import type { Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { SATELLITE_CELL } from '@/sim/balance/species-carpenter';
import { daysPerYear, TICKS_PER_DAY } from '@/sim/time';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { setWood } from './moisture';
import { dryHazardPerGd, mouldHazardPerGd } from './broodMoisture';
import { refreshSites, satelliteSites } from './sites';
import { assignShuttles, foundSatellite, lateBroodScore, satellitePass } from './satellites';
import { chamberTempC, setClimateOverride } from '@/sim/colony/envAdapter';
import { cellSiteIn, chewCell } from './woodCell';
import { ensureWoodStates, primOf, woodOf } from './woodState';
import { isShuttling } from './shuttleKeys';
import { systems } from './index';
import { pileUnits } from './frass';
import { BULKING, V_BITE_NOMINAL } from '@/sim/balance/nest';
import { DIG_HEAD_SCALE } from '@/sim/balance/nestTemplates';
import { MOUND_BATCH_TICKS, PELLET_SETTLE_S } from '@/sim/balance/nest';
import { spawnPellet } from '@/sim/nest/pellets';
import { TICKS_PER_SECOND } from '@/sim/time';
import { BU, CP, LOG_ID, woodSim } from './testkit';

installWoodHooks();
const Z_QUARTER = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };

function log(id: number, x: number, z: number): Primitive {
  return {
    id, shape: 'cylinder', pos: { x: x * BU, y: 8 * BU, z: z * BU }, rot: { ...Z_QUARTER }, size: { x: 10 * BU, y: 30 * BU, z: 0 },
    round: 0, material: 'wood-decayed', flags: PrimFlag.DIGGABLE | PrimFlag.CLIMBABLE, objectId: -1,
  };
}

/** A parent cell chewed into log 1 and the colony's nest set to it; extra logs as given. */
function parentIn(prims: Primitive[], sizeBu = 300): Sim {
  const sim = makeTestSim({ species: CP, sizeBu, systems: [], prims });
  ensureWoodStates(sim);
  for (const p of prims) setWood(woodOf(sim, p.id)!, 22, 2);
  const col = sim.state.colonies[0];
  const parent = sim.stores.nests.get(col.nestIds[0])!;
  parent.founding = null;
  const spot = cellSiteIn(sim, primOf(sim, 1)!, woodOf(sim, 1)!, { x: 160 * BU, y: 0, z: 150 * BU }, SATELLITE_CELL)!;
  chewCell(sim, parent, woodOf(sim, 1)!, spot.entry, spot.out, SATELLITE_CELL);
  parent.origin = { ...spot.entry };
  parent.substrate = 'wood-decayed';
  refreshSites(sim, col);
  return sim;
}

function pass(sim: Sim): void {
  satellitePass(sim, sim.species, sim.state.colonies[0], woodParamsOf(sim.species)!);
}

describe('review: brood moisture numbers (GDD 07 §6.2.4)', () => {
  it('hazard is continuous at the band edges and the mould term starts above 30 %', () => {
    const p = woodParamsOf(woodSim().species)!;
    expect(dryHazardPerGd(p, 15)).toBe(0);
    expect(dryHazardPerGd(p, 14.999)).toBeGreaterThan(0);
    expect(dryHazardPerGd(p, 8)).toBeCloseTo(0.4, 9);
    expect(dryHazardPerGd(p, 0)).toBeCloseTo(0.4, 9);
    expect(mouldHazardPerGd(p, 30)).toBe(0);
    expect(mouldHazardPerGd(p, 60)).toBeCloseTo(0.3, 9);
  });
});

describe('review: cheat.setWood input hygiene', () => {
  // GDD 07 App. B cheat; a malformed debug command (missing mc/decay) must not put NaN into persisted state
  it('a cheat.setWood without numbers leaves moisture and decay finite ', () => {
    const sim = woodSim();
    sim.enqueue({ type: 'cheat.setWood', primId: LOG_ID, mc: Number.NaN, decay: Number.NaN });
    sim.tick();
    const w = woodOf(sim, LOG_ID)!;
    expect(Number.isFinite(w.moisture)).toBe(true);
    for (const s of w.segments ?? []) {
      expect(Number.isFinite(s.mc)).toBe(true);
      expect(Number.isInteger(s.decay)).toBe(true);
    }
  });
});

describe('review: satellite marker refuses unsuitable wood (GDD 07 App. B, §6.2.2 "Class 4 not nestable")', () => {
  it('a satellite marker on crumbling (decay 4) wood is refused (FAILS: a satellite is founded)', () => {
    const sim = parentIn([log(1, 60, 150), log(3, 60, 250)]);
    const col = sim.state.colonies[0];
    setWood(woodOf(sim, 3)!, 26, 4);
    placeMarker(sim, { kind: 'satellite', colony: col.id, pos: { x: 60 * BU, y: 16 * BU, z: 250 * BU }, radius: 2 * BU });
    pass(sim);
    expect(satelliteSites(col)).toHaveLength(0);
  });

  it('satellite markers respect the cap of 4 outdoor satellites (FAILS: every marker founds one)', () => {
    const prims = [log(1, 60, 40)];
    for (let i = 0; i < 5; i++) prims.push(log(2 + i, 40 + (i % 2) * 230, 100 + Math.floor(i / 2) * 60));
    const sim = parentIn(prims, 320);
    const col = sim.state.colonies[0];
    for (let i = 0; i < 5; i++) {
      const p = primOf(sim, 2 + i)!;
      placeMarker(sim, { kind: 'satellite', colony: col.id, pos: { x: p.pos.x, y: 16 * BU, z: p.pos.z }, radius: 2 * BU });
    }
    pass(sim);
    expect(satelliteSites(col).length).toBeLessThanOrEqual(woodParamsOf(sim.species)!.satellitesMaxOutdoor);
  });
});

/** E13-like set-up: parent cell in log 1 (moisture parentMc), satellite cell in log 2 (12 %) 200 BU away, both detected. */
function shuttleSim(parentMc: number): { sim: Sim; parentId: number; satId: number } {
  const sim = makeTestSim({ species: CP, sizeBu: 300, prims: [log(1, 60, 150), log(2, 260, 150)], systems: [nestSystem] });
  ensureWoodStates(sim);
  setWood(woodOf(sim, 1)!, parentMc, 2);
  setWood(woodOf(sim, 2)!, 12, 2);
  const col = sim.state.colonies[0];
  const parent = sim.stores.nests.get(col.nestIds[0])!;
  parent.founding = null;
  const spot = cellSiteIn(sim, primOf(sim, 1)!, woodOf(sim, 1)!, { x: 160 * BU, y: 0, z: 150 * BU }, SATELLITE_CELL)!;
  chewCell(sim, parent, woodOf(sim, 1)!, spot.entry, spot.out, SATELLITE_CELL);
  parent.origin = { ...spot.entry };
  parent.detectDue = true;
  const q = sim.stores.ants.get(col.queenId);
  if (q) q.alive = false;
  refreshSites(sim, col);
  const sat = foundSatellite(sim, col, primOf(sim, 2)!, woodOf(sim, 2)!, { x: 160 * BU, y: 0, z: 150 * BU }, woodParamsOf(sim.species)!)!;
  for (let t = 0; t < 120; t++) sim.tick();
  for (const s of col.wood!.sites) if (s.role === 'satellite') s.state = 'active';
  const pc = parent.chambers[0];
  expect(pc).toBeDefined();
  expect(sim.stores.nests.get(sat.nestId)!.chambers.length).toBeGreaterThan(0);
  const floor = { x: pc.center.x, y: pc.center.y - 1 * BU, z: pc.center.z };
  for (let i = 0; i < 10; i++) {
    const b = spawnBrood(sim, { colony: col.id, stage: 'pupa', destined: 'minor', pos: floor, nestId: parent.id, chamberId: pc.id });
    b.destinedLengthBu = 0.78;
  }
  for (let i = 0; i < 6; i++) spawnAnt(sim, { colony: col.id, caste: 'minor', pos: floor, ageGd: 5, task: 'nurse', nestId: parent.id, chamberId: pc.id });
  return { sim, parentId: parent.id, satId: sat.nestId };
}

describe('review: shuttle jobs (GDD 07 §6.2.6)', () => {
  it('a satellite with room for 2 receives at most 2 shuttle jobs (FAILS: one job per waiting pupa)', () => {
    // parent at 35 % (mould x 0.8) so the satellite wins on moisture alone, whatever the chamber temperatures
    const { sim, satId } = shuttleSim(35);
    const satNest = sim.stores.nests.get(satId)!;
    for (const c of satNest.chambers) c.capacity.brood = 0;
    satNest.chambers[0].capacity.brood = 2;
    const given = assignShuttles(sim, sim.species, sim.state.colonies[0], woodParamsOf(sim.species)!);
    expect(given).toBeGreaterThan(0); // sanity: the rule fires
    expect(sim.state.ants.filter((a) => a.alive && isShuttling(a)).length).toBeLessThanOrEqual(2);
  });

  it('App. E 13 set-up: the shuttle score reads the colony climate seam, so a 22 vs 26 °C set-up takes effect (FAILS: raw cavity model)', () => {
    const { sim, parentId, satId } = shuttleSim(22);
    const parent = sim.stores.nests.get(parentId)!, satNest = sim.stores.nests.get(satId)!;
    const sat = new Set(satNest.chambers.map((c) => c.id));
    // the colony module's test seam (src/sim/colony/envAdapter.ts): what brood development uses for chamber temperature
    setClimateOverride(sim, { chamberTemp: (id) => (sat.has(id) ? 26 : 22) });
    expect(chamberTempC(sim, parent.chambers[0].id)).toBe(22);
    // 26 °C at 12 % (score 1.15) beats 22 °C at 22 % (0.857) by far more than the 0.1 margin: pupae must be sent.
    // At the raw cavity temperature of both cells (about 20 °C) the margin is only met by the dry bonus.
    const given = assignShuttles(sim, sim.species, sim.state.colonies[0], woodParamsOf(sim.species)!);
    expect(given).toBeGreaterThan(0);
    const pScore = lateBroodScore(sim.species, woodParamsOf(sim.species)!, 22, 22);
    expect(lateBroodScore(sim.species, woodParamsOf(sim.species)!, 26, 12) - pScore).toBeGreaterThan(0.25);
  });
});

describe('review: module-level caches do not leak between sims', () => {
  // index.ts keeps `announced` (castes already announced) in a module Map keyed by colony id. A second game in the same
  // page (New Game, daughter colony) reuses colony ids, so its first media/major never fires `caste-unlocked`.
  function unlockedEvents(): string[] {
    const sim = makeTestSim({ species: CP, systems: [] });
    const col = sim.state.colonies[0];
    for (let i = 0; i < 100; i++) spawnAnt(sim, { colony: col.id, caste: 'minor', pos: { x: 100 + i, y: 0, z: 100 }, ageGd: 5 });
    if (col.core) col.core.workers = 100;
    col.foundedTick = sim.state.tick - Math.round(3.5 * daysPerYear(sim.state.config) * TICKS_PER_DAY);
    col.stores.p = 1000;
    for (let i = 0; i < 50; i++) spawnBrood(sim, { colony: col.id, stage: 'larva', destined: 'worker', pos: { x: 50, y: 0, z: 50 } });
    const got: string[] = [];
    sim.events.on('caste-unlocked', (e) => got.push(e.caste));
    systems.find((s) => s.name === 'wood-castes')!.run(sim);
    sim.events.flush();
    return got;
  }

  it('the first media and major of a colony are announced in every new sim (FAILS on the second sim)', () => {
    const first = unlockedEvents();
    expect(first.sort()).toEqual(['major', 'media']);
    const second = unlockedEvents();
    expect(second.sort()).toEqual(['major', 'media']);
  });
});

describe('review: frass pile units count items, not nominal bite volumes (GDD 07 §6.2.3, App. E 12)', () => {
  // a bite removes V_BITE_NOMINAL x headScale^3 (src/sim/nest/bite.ts); the pile receives volume x BULKING per item.
  // A minor's frass item is 0.85^3 = 0.61 of a nominal one, so counting volume made 10 minor items only 0.61 units
  // (the e2e run r4 pile of 0.65 BU^3 was exactly one minor item).
  // Fix round: the original form of this test passed a volume to pileUnits; a volume cannot tell 10 minor items from
  // 6 nominal ones, so pileUnits now counts the items a pile absorbed and the test goes through the real settle path.
  it('10 frass items chewed by minors settle into a pile of 1 pile unit', () => {
    const sim = woodSim({ systems: [nestSystem] });
    const p = woodParamsOf(sim.species)!;
    const col = sim.state.colonies[0];
    const hs = DIG_HEAD_SCALE.minor ?? 1;
    const old = sim.state.tick - PELLET_SETTLE_S * TICKS_PER_SECOND - 1;
    for (let i = 0; i < 10; i++) {
      const x = 30 * BU + i * 0.3 * BU, z = 80 * BU;
      const it = spawnPellet(sim, { x, y: sim.field.height(x, z), z }, V_BITE_NOMINAL * hs ** 3, 'wood-decayed', col.nestIds[0], col.id, -1);
      it.droppedTick = old;
    }
    for (let t = 0; t <= MOUND_BATCH_TICKS; t++) sim.tick();
    const piles = sim.state.worldDelta.mounds.filter((m) => m.material === 'frass');
    expect(piles.length).toBeGreaterThan(0);
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'frass').length).toBe(0);
    expect(piles.reduce((u, m) => u + pileUnits(m, p), 0)).toBeCloseTo(1, 9);
    expect(BULKING).toBeGreaterThan(0); // the pile's size still follows the deposited volume (nest module)
  });
});
