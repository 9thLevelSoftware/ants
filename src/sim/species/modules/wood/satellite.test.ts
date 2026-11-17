// Satellite founding (GDD 07 §6.2.5): the architect rule proposes and founds a satellite only when the colony has
// at least 150 workers and the parent needs room (carved fraction >= 0.35 or late-brood nursery short), only with
// `satelliteAuto` on; a `satellite` marker on wood founds one at once. The new site is a `satellite` nest in the
// best candidate wood (dry band first) with a starter cell, state `founding`, and 5 % of the workers (min 4) migrate.

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { placeMarker, spawnAnt } from '@/sim/entities';
import type { Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { SATELLITE_CELL } from '@/sim/balance/species-carpenter';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { setWood } from './moisture';
import { refreshSites, satelliteSites } from './sites';
import { satellitePass } from './satellites';
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

/** Parent cell in log 1 (damp), a dry candidate log 2 at 150 BU and a damp one (log 3) at 100 BU; `workers` nurses. */
function colonyOf(workers: number): Sim {
  const sim = makeTestSim({ species: CP, sizeBu: 300, systems: [], prims: [log(1, 60, 150), log(2, 210, 150), log(3, 60, 250)] });
  ensureWoodStates(sim);
  setWood(woodOf(sim, 1)!, 22, 2);
  setWood(woodOf(sim, 2)!, 12, 2);
  setWood(woodOf(sim, 3)!, 26, 2);
  const col = sim.state.colonies[0];
  const parent = sim.stores.nests.get(col.nestIds[0])!;
  parent.founding = null;
  const spot = cellSiteIn(sim, primOf(sim, 1)!, woodOf(sim, 1)!, { x: 160 * BU, y: 0, z: 150 * BU }, SATELLITE_CELL)!;
  chewCell(sim, parent, woodOf(sim, 1)!, spot.entry, spot.out, SATELLITE_CELL);
  parent.origin = { ...spot.entry };
  parent.substrate = 'wood-decayed';
  for (let i = 0; i < workers; i++) {
    spawnAnt(sim, { colony: col.id, caste: 'minor', pos: { ...spot.entry }, ageGd: 5, task: 'nurse', nestId: parent.id });
  }
  refreshSites(sim, col);
  return sim;
}

function pass(sim: Sim): void {
  const col = sim.state.colonies[0];
  satellitePass(sim, sim.species, col, woodParamsOf(sim.species)!);
}

describe('satellite founding (GDD 07 §6.2.5)', () => {
  it('149 workers with a carved-out parent: no satellite; 150: one, in the dry log, founding, with migrants', () => {
    const small = colonyOf(149);
    small.state.colonies[0].directives.satelliteAuto = true;
    woodOf(small, 1)!.carvedFrac = 0.36;
    pass(small);
    expect(satelliteSites(small.state.colonies[0])).toHaveLength(0);

    const sim = colonyOf(150);
    const col = sim.state.colonies[0];
    col.directives.satelliteAuto = true;
    woodOf(sim, 1)!.carvedFrac = 0.36;
    pass(sim);
    const sats = satelliteSites(col);
    expect(sats).toHaveLength(1);
    expect(sats[0].state).toBe('founding');
    expect(sats[0].primId).toBe(2); // the dry band (8-18 %) outscores the nearer damp log
    expect(sim.stores.nests.get(sats[0].nestId)!.kind).toBe('satellite');
    // 5 % of 150 rounds to 8 migrants (min 4)
    const migrants = sim.state.ants.filter((a) => a.alive && a.bb[SH.migrate] === 1 && a.bb[SH.nest] === sats[0].nestId);
    expect(migrants).toHaveLength(8);
    // one founding satellite at a time: a second pass founds nothing new
    pass(sim);
    expect(satelliteSites(col)).toHaveLength(1);
  });

  it('a parent with room (carved fraction below 0.35, no late brood waiting) gets no satellite; nor with satelliteAuto off', () => {
    const sim = colonyOf(150);
    const col = sim.state.colonies[0];
    col.directives.satelliteAuto = true;
    woodOf(sim, 1)!.carvedFrac = 0.2;
    pass(sim);
    expect(satelliteSites(col)).toHaveLength(0);
    col.directives.satelliteAuto = false;
    woodOf(sim, 1)!.carvedFrac = 0.4;
    pass(sim);
    expect(satelliteSites(col)).toHaveLength(0);
  });

  it('a satellite marker on wood founds a satellite there whatever the colony size; off wood it is refused', () => {
    const sim = colonyOf(6);
    const col = sim.state.colonies[0];
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(e.detail ?? ''));
    placeMarker(sim, { kind: 'satellite', colony: col.id, pos: { x: 60 * BU, y: 16 * BU, z: 250 * BU }, radius: 2 * BU });
    placeMarker(sim, { kind: 'satellite', colony: col.id, pos: { x: 150 * BU, y: 0, z: 40 * BU }, radius: 2 * BU });
    pass(sim);
    sim.events.flush();
    const sats = satelliteSites(col);
    expect(sats).toHaveLength(1);
    expect(sats[0].primId).toBe(3);
    expect(sim.state.markers.filter((m) => m.alive && m.kind === 'satellite')).toHaveLength(0);
    expect(rejected.some((d) => d.includes('wood'))).toBe(true);
  });
});
