// Nest-site states and brood returns (GDD 07 §6.2.5 isolated / orphan / abandoned, §6.2.6 young brood back to the
// parent), and the late-brood share of diag-cp-satellites (§5.2.10).

import { describe, expect, it } from 'vitest';
// the sim first: entering through a deep module would evaluate module indexes half loaded (import cycles)
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnAnt, spawnBrood } from '@/sim/entities';
import { nestSystem } from '@/sim/nest';
import type { Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { SATELLITE_CELL } from '@/sim/balance/species-carpenter';
import { TICKS_PER_DAY } from '@/sim/time';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { setWood } from './moisture';
import { refreshSites, satelliteSites } from './sites';
import { foundSatellite } from './satellites';
import { siteStates } from './siteStates';
import { assignReturns } from './returns';
import { lateBroodShareInSatellites } from './diagnostics';
import { cellSiteIn, chewCell } from './woodCell';
import { ensureWoodStates, primOf, woodOf } from './woodState';
import { SH } from './shuttleKeys';
import { BU, CP } from './testkit';

installWoodHooks();
const Z_QUARTER = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };

function log(id: number, x: number, z: number): Primitive {
  return {
    id, shape: 'cylinder', pos: { x: x * BU, y: 8 * BU, z: z * BU }, rot: { ...Z_QUARTER }, size: { x: 10 * BU, y: 30 * BU, z: 0 },
    round: 0, material: 'wood-decayed', flags: PrimFlag.DIGGABLE | PrimFlag.CLIMBABLE, objectId: -1,
  };
}

/** Cuts every surface route between the logs: a strip of impassable nav cells across the world (as a flooded strip). */
function cutRoute(sim: Sim): void {
  const g = sim.navGrid;
  const ix = Math.floor((200 * BU) / g.cell);
  for (let iz = 0; iz < g.h; iz++) for (let dx = 0; dx < 2; dx++) g.setCostMult(ix + dx, iz, Infinity);
}

/** Parent cell in log 1, satellite cell in log 2 (200 BU apart), both registered; a resident nurse in the satellite. */
function twoSites(walled: boolean): { sim: Sim; parentId: number; satId: number } {
  const sim = makeTestSim({ species: CP, sizeBu: 300, prims: [log(1, 60, 150), log(2, 260, 150)], systems: [nestSystem] });
  ensureWoodStates(sim);
  setWood(woodOf(sim, 1)!, 22, 2);
  setWood(woodOf(sim, 2)!, 12, 2);
  const col = sim.state.colonies[0];
  const parent = sim.stores.nests.get(col.nestIds[0])!;
  parent.founding = null;
  const spot = cellSiteIn(sim, primOf(sim, 1)!, woodOf(sim, 1)!, { x: 160 * BU, y: 0, z: 150 * BU }, SATELLITE_CELL)!;
  chewCell(sim, parent, woodOf(sim, 1)!, spot.entry, spot.out, SATELLITE_CELL);
  parent.origin = { ...spot.entry };
  parent.substrate = 'wood-decayed';
  parent.detectDue = true;
  const q = sim.stores.ants.get(col.queenId);
  if (q) q.alive = false;
  refreshSites(sim, col);
  const sat = foundSatellite(sim, col, primOf(sim, 2)!, woodOf(sim, 2)!, { x: 160 * BU, y: 0, z: 150 * BU }, woodParamsOf(sim.species)!)!;
  for (let t = 0; t < 120; t++) sim.tick();
  if (walled) cutRoute(sim);
  return { sim, parentId: parent.id, satId: sat.nestId };
}

describe('satellite isolation (GDD 07 §6.2.5)', () => {
  it('a satellite with a walkable route to the parent becomes active and is not isolated', () => {
    const { sim } = twoSites(false);
    const col = sim.state.colonies[0];
    siteStates(sim, col, woodParamsOf(sim.species)!);
    const s = satelliteSites(col)[0];
    expect(s.state).toBe('active');
    expect(s.isolatedSinceTick).toBe(-1);
  });

  it('an impassable strip cuts the route: isolated after 1 GD, flagged orphan after 7 GD, both open entrances', () => {
    const { sim } = twoSites(true);
    const col = sim.state.colonies[0];
    const p = woodParamsOf(sim.species)!;
    siteStates(sim, col, p);
    const s = satelliteSites(col)[0];
    expect(s.state).toBe('active'); // its first chamber is registered; cut for less than a day
    expect(s.isolatedSinceTick).toBeGreaterThanOrEqual(0);
    sim.state.tick += Math.ceil(p.satelliteIsolatedGd * TICKS_PER_DAY); // a game day later, still cut
    siteStates(sim, col, p);
    expect(s.state).toBe('isolated');
    expect(s.orphan ?? false).toBe(false);
    sim.state.tick += Math.ceil((p.satelliteOrphanGd - p.satelliteIsolatedGd) * TICKS_PER_DAY);
    siteStates(sim, col, p);
    expect(s.orphan).toBe(true);
    expect(s.state).toBe('isolated'); // an orphan satellite keeps living
  });
});

describe('crumbling satellites and brood returns (GDD 07 §6.2.5 abandoned, §6.2.6)', () => {
  function withBrood(): { sim: Sim; parentId: number; satId: number } {
    const r = twoSites(false);
    const col = r.sim.state.colonies[0];
    siteStates(r.sim, col, woodParamsOf(r.sim.species)!);
    const sc = r.sim.stores.nests.get(r.satId)!.chambers[0];
    const floor = { x: sc.center.x, y: sc.center.y - 1 * BU, z: sc.center.z };
    spawnBrood(r.sim, { colony: col.id, stage: 'egg', destined: 'minor', pos: floor, nestId: r.satId, chamberId: sc.id });
    spawnBrood(r.sim, { colony: col.id, stage: 'pupa', destined: 'minor', pos: floor, nestId: r.satId, chamberId: sc.id });
    for (let i = 0; i < 2; i++) spawnAnt(r.sim, { colony: col.id, caste: 'minor', pos: floor, ageGd: 5, task: 'nurse', nestId: r.satId, chamberId: sc.id });
    return r;
  }

  it('an egg in a satellite is carried back to the parent; the pupa stays', () => {
    const { sim, parentId, satId } = withBrood();
    const col = sim.state.colonies[0];
    expect(assignReturns(sim, sim.species, col, woodParamsOf(sim.species)!)).toBe(1);
    const job = sim.state.ants.find((a) => a.alive && (a.bb[SH.brood] ?? -1) >= 0)!;
    expect(sim.stores.brood.get(job.bb[SH.brood])!.stage).toBe('egg');
    expect(job.bb[SH.nest]).toBe(parentId);
    expect(job.bb[SH.from]).toBe(satId);
  });

  it('a satellite in crumbling wood (decay 4) is abandoned and all its brood goes back to the parent', () => {
    const { sim, parentId } = withBrood();
    const col = sim.state.colonies[0];
    const p = woodParamsOf(sim.species)!;
    setWood(woodOf(sim, 2)!, 12, 4);
    refreshSites(sim, col);
    siteStates(sim, col, p);
    expect(col.wood!.sites.find((s) => s.role === 'satellite')!.state).toBe('abandoned');
    expect(satelliteSites(col)).toHaveLength(0);
    expect(assignReturns(sim, sim.species, col, p)).toBe(2);
    for (const a of sim.state.ants.filter((x) => x.alive && (x.bb[SH.brood] ?? -1) >= 0)) expect(a.bb[SH.nest]).toBe(parentId);
  });

  it('diag-cp-satellites value: the late-brood share in satellites', () => {
    const { sim, parentId } = withBrood();
    const col = sim.state.colonies[0];
    const pc = sim.stores.nests.get(parentId)!.chambers[0];
    spawnBrood(sim, { colony: col.id, stage: 'pupa', destined: 'minor', pos: { ...pc.center }, nestId: parentId, chamberId: pc.id });
    expect(lateBroodShareInSatellites(sim, col, woodParamsOf(sim.species)!)).toBeCloseTo(0.5, 9);
  });
});
