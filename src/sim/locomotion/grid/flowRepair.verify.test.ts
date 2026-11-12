// Reviewer tests (int-1A-sim gate): incremental flow-field repair must equal a full rebuild in every case,
// including micro-portals whose mouth cell moves when the area around the mouth is re-derived (linkPortals snaps a
// mouth up to MOUTH_SNAP_CELLS = 2 cells away, outside the one-cell "near" ring flowRepair invalidates).
import { describe, expect, it } from 'vitest';
import type { MicroConn, Primitive } from '@/sim/types';
import { createWorldField } from '@/sim/world/field';
import { makeTestWorld } from '@/sim/testing/testWorld';
import { createLocoNavGrid } from './navGridImpl';

const BU = 4;
const CELL = 16 * BU; // NAV_CELL_BU x BU

function cellCentre(i: number, k: number): { x: number; z: number } {
  return { x: (i + 0.5) * CELL, z: (k + 0.5) * CELL };
}

function pillar(id: number, i: number, k: number, halfCells: number): Primitive {
  const c = cellCentre(i, k);
  return {
    id, shape: 'box', pos: { x: c.x, y: 29 * BU, z: c.z }, rot: { x: 0, y: 0, z: 0, w: 1 },
    size: { x: halfCells * CELL, y: 30 * BU, z: halfCells * CELL }, round: 0, material: 'concrete', flags: 0, objectId: -1,
  };
}

describe('flow repair with a portal mouth that moves (reviewer)', () => {
  it('equals a full rebuild after the mouth cell is blocked and the portal relinks two cells away', () => {
    const world = makeTestWorld({ sizeBu: 640 });
    // portal: mouth B at cell (8, 20) next to the seed, mouth A at cell (30, 20) in a pocket of blocked cells
    const A = { i: 30, k: 20 }, B = { i: 8, k: 20 };
    const ca = cellCentre(A.i, A.k), cb = cellCentre(B.i, B.k);
    const micro: MicroConn = {
      id: 900, kind: 'door-gap' as MicroConn['kind'], posA: { x: ca.x - 0.2 * CELL, y: 0, z: ca.z }, posB: { x: cb.x, y: 0, z: cb.z },
      gapMm: 3 * BU, minClearanceBu: 5, lengthBu: 4, useful: true, reason: 'reviewer',
    };
    world.micro.push(micro);
    const field = createWorldField(world, null);
    const g = createLocoNavGrid(world);
    // the 8 neighbours of A are blocked (runtime overlay): the portal leads into a dead end at A
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (di !== 0 || dk !== 0) g.setCostMult(A.i + di, A.k + dk, Infinity);
    }
    g.attachField(field, world.prims);
    const pA = g.portals.find((p) => p.id === 900)!;
    expect(pA.cellA).toBe(A.k * g.w + A.i);
    const seeds = [{ x: cellCentre(5, 20).x, y: 0, z: cellCentre(5, 20).z }];
    g.flowField('home', 's', seeds);

    // a stone fills cell A only: the mouth snaps to the nearest open cell, two cells east of A
    const stone = pillar(901, A.i, A.k, 0.45);
    field.addPrim(stone);
    g.refreshArea(stone.pos.x - stone.size.x, stone.pos.z - stone.size.z, stone.pos.x + stone.size.x, stone.pos.z + stone.size.z,
      [...world.prims, stone]);
    const moved = g.portals.find((p) => p.id === 900)!;
    expect(moved.cellA).not.toBe(A.k * g.w + A.i);
    expect(moved.cellA).toBeGreaterThanOrEqual(0);

    const repaired = g.flowField('home', 's', seeds).slice();
    const ref = g.flowField('home-ref', 'ref', seeds).slice();
    const a2 = moved.cellA;
    // the new mouth is reached through the portal in a full rebuild (seed -> B -> portal), far cheaper than walking
    expect(ref[a2]).toBeLessThan(10 * CELL);
    expect(repaired[a2]).toBe(ref[a2]);
    expect(Array.from(repaired)).toEqual(Array.from(ref));
  });
});

describe('flow repair fuzz (reviewer)', () => {
  it('equals a full rebuild over random stones, cost overlays and portal toggles', async () => {
    const { rngFork, rngInt, rngRange } = await import('@/core/rng');
    const world = makeTestWorld({ sizeBu: 640 });
    const rng = rngFork(3, 'flow-fuzz');
    for (let n = 0; n < 6; n++) {
      const a = cellCentre(rngInt(rng, 4, 35), rngInt(rng, 4, 35)), b = cellCentre(rngInt(rng, 4, 35), rngInt(rng, 4, 35));
      world.micro.push({
        id: 950 + n, kind: 'door-gap' as MicroConn['kind'], posA: { x: a.x, y: 0, z: a.z }, posB: { x: b.x, y: 0, z: b.z },
        gapMm: 3 * BU, minClearanceBu: 5, lengthBu: 6, useful: true, reason: 'fuzz',
      });
    }
    const field = createWorldField(world, null);
    const g = createLocoNavGrid(world);
    g.attachField(field, world.prims);
    const seeds = [{ x: cellCentre(6, 6).x, y: 0, z: cellCentre(6, 6).z }];
    g.flowField('home', 's', seeds);
    const live: Primitive[] = [];
    let mismatches = 0;
    for (let round = 0; round < 25; round++) {
      const op = rngInt(rng, 0, 2);
      if (op === 0) {
        const s = pillar(2000 + round, rngInt(rng, 4, 35), rngInt(rng, 4, 35), rngRange(rng, 0.3, 1.6));
        field.addPrim(s); live.push(s);
        g.refreshArea(s.pos.x - s.size.x, s.pos.z - s.size.z, s.pos.x + s.size.x, s.pos.z + s.size.z, [...world.prims, ...live]);
      } else if (op === 1 && live.length > 0) {
        const s = live.splice(rngInt(rng, 0, live.length - 1), 1)[0];
        field.removePrim(s.id);
        g.refreshArea(s.pos.x - s.size.x, s.pos.z - s.size.z, s.pos.x + s.size.x, s.pos.z + s.size.z, [...world.prims, ...live]);
      } else {
        g.setPortalOpen(950 + rngInt(rng, 0, 5), rngRange(rng, 0, 1) < 0.5);
        g.setCostMult(rngInt(rng, 0, g.w - 1), rngInt(rng, 0, g.h - 1), rngRange(rng, 1, 5));
      }
      const repaired = g.flowField('home', 's', seeds).slice();
      const ref = g.flowField(`ref${round}`, 'ref', seeds).slice();
      let diff = 0;
      for (let c = 0; c < ref.length; c++) if (repaired[c] !== ref[c] && !(Number.isNaN(repaired[c]) && Number.isNaN(ref[c]))) diff++;
      if (diff > 0) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});
