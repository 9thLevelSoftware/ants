// Flow-field repair (Stage 1A gate, truncated loco finding "any nav-grid change rebuilds every flow field
// synchronously"): after cost overlays, re-derived areas and portal changes, the repaired field must equal a full
// rebuild bit for bit (determinism across save / load), and a local change must not cost a full rebuild.
import { describe, expect, it } from 'vitest';
import { rngFork, rngInt, rngRange } from '@/core/rng';
import type { MicroConn, Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createWorldField } from '@/sim/world/field';
import { makeTestWorld } from '@/sim/testing/testWorld';
import { createLocoNavGrid } from './navGridImpl';

const BU = 4;

function tallBox(id: number, x: number, z: number, hx: number, hz: number): Primitive {
  return {
    id, shape: 'box', pos: { x: x * BU, y: 29 * BU, z: z * BU }, rot: { x: 0, y: 0, z: 0, w: 1 },
    size: { x: hx * BU, y: 30 * BU, z: hz * BU }, round: 0, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1,
  };
}

function setup() {
  const world = makeTestWorld({ sizeBu: 640, prims: [tallBox(1, 320, 300, 2, 120), tallBox(2, 200, 450, 60, 2)] });
  const field = createWorldField(world, null);
  const g = createLocoNavGrid(world);
  g.attachField(field, world.prims);
  const seeds = [{ x: 500 * BU, y: 0, z: 320 * BU }];
  return { world, field, g, seeds };
}

/** A fresh grid with the same final state, built from scratch (what a load would compute). */
function fullRebuild(g: ReturnType<typeof setup>['g'], key: string, seeds: { x: number; y: number; z: number }[]): Float32Array {
  // a new signature forces the full Dijkstra on the same cells
  return g.flowField(`${key}-ref`, 'ref', seeds).slice();
}

describe('nav grid flow-field repair', () => {
  it('equals a full rebuild after random cost overlays (increases and decreases)', () => {
    const { g, seeds } = setup();
    const rng = rngFork(7, 'flow-repair');
    g.flowField('home', 's', seeds);
    for (let round = 0; round < 12; round++) {
      for (let k = 0; k < 6; k++) {
        const ix = rngInt(rng, 0, g.w - 1), iz = rngInt(rng, 0, g.h - 1);
        const r = rngInt(rng, 0, 2);
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) g.setCostMult(ix + dx, iz + dz, rngChoice(rng));
      }
      const repaired = g.flowField('home', 's', seeds).slice();
      const ref = fullRebuild(g, `r${round}`, seeds);
      expect(Array.from(repaired)).toEqual(Array.from(ref));
    }
    const st = g.stats();
    expect(st.flowRepairs).toBe(12);
  });

  it('equals a full rebuild after a dynamic primitive blocks and unblocks an area', () => {
    const { field, g, seeds, world } = setup();
    const before = g.flowField('home', 's', seeds).slice();
    const wall = tallBox(50, 420, 320, 2, 60);
    field.addPrim(wall);
    g.refreshArea(400 * BU, 250 * BU, 440 * BU, 390 * BU, [...world.prims, wall]);
    const blocked = g.flowField('home', 's', seeds).slice();
    expect(Array.from(blocked)).toEqual(Array.from(fullRebuild(g, 'a', seeds)));
    expect(Array.from(blocked)).not.toEqual(Array.from(before));
    field.removePrim(wall.id);
    g.refreshArea(400 * BU, 250 * BU, 440 * BU, 390 * BU, world.prims);
    const open = g.flowField('home', 's', seeds).slice();
    expect(Array.from(open)).toEqual(Array.from(fullRebuild(g, 'b', seeds)));
    expect(Array.from(open)).toEqual(Array.from(before));
  });

  it('a local change resets only part of the field (no full rebuild)', () => {
    const { g, seeds } = setup();
    g.flowField('home', 's', seeds);
    const builds = g.stats().flowBuilds;
    g.setCostMult(5, 5, 3); // far corner, away from the seed
    g.flowField('home', 's', seeds);
    const st = g.stats();
    expect(st.flowBuilds).toBe(builds);
    expect(st.flowRepairCells).toBeLessThan(0.1 * g.w * g.h);
  });
});

describe('nav grid portal mouths follow blocking overlays (gate review)', () => {
  const CELL = 16 * BU;
  const centre = (i: number, k: number) => ({ x: (i + 0.5) * CELL, y: 0, z: (k + 0.5) * CELL });
  // a door-gap portal from cell (8, 20) next to the seed to cell (30, 20); the overlays wall A in, then block A
  const A = { i: 30, k: 20 };
  const ring: [number, number][] = [];
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) if (di !== 0 || dk !== 0) ring.push([A.i + di, A.k + dk]);

  function portalWorld() {
    const world = makeTestWorld({ sizeBu: 640 });
    const a = centre(A.i, A.k), b = centre(8, 20);
    const micro: MicroConn = {
      id: 900, kind: 'door-gap' as MicroConn['kind'], posA: { x: a.x - 0.2 * CELL, y: 0, z: a.z }, posB: b,
      gapMm: 3 * BU, minClearanceBu: 5, lengthBu: 4, useful: true, reason: 'test',
    };
    world.micro.push(micro);
    return world;
  }

  it('re-links at once when an overlay blocks a mouth cell; links and field equal a grid built with the overlays', () => {
    const seeds = [centre(5, 20)];
    const world = portalWorld();
    const g = createLocoNavGrid(world);
    g.attachField(createWorldField(world, null), world.prims);
    for (const [i, k] of ring) g.setCostMult(i, k, Infinity);
    g.flowField('home', 's', seeds);
    const a0 = g.portals[0].cellA;
    expect(a0).toBe(A.k * g.w + A.i);
    g.setCostMult(A.i, A.k, Infinity); // the mouth cell itself: the mouth snaps two cells away
    expect(g.portals[0].cellA).not.toBe(a0);
    expect(g.portals[0].cellA).toBeGreaterThanOrEqual(0);
    const repaired = g.flowField('home', 's', seeds).slice();
    expect(Array.from(repaired)).toEqual(Array.from(fullRebuild(g, 'm', seeds)));
    // the same cells built in another order (overlays before the field, as a rebuilt cache could) link the same way
    const world2 = portalWorld();
    const g2 = createLocoNavGrid(world2);
    for (const [i, k] of [...ring, [A.i, A.k] as [number, number]]) g2.setCostMult(i, k, Infinity);
    g2.attachField(createWorldField(world2, null), world2.prims);
    expect([g2.portals[0].cellA, g2.portals[0].cellB]).toEqual([g.portals[0].cellA, g.portals[0].cellB]);
    expect(Array.from(g2.flowField('home', 's', seeds))).toEqual(Array.from(repaired));
    // unblocking the mouth cell moves the mouth back and repairs exactly again
    g.setCostMult(A.i, A.k, 1);
    expect(g.portals[0].cellA).toBe(a0);
    expect(Array.from(g.flowField('home', 's', seeds))).toEqual(Array.from(fullRebuild(g, 'n', seeds)));
  });
});

function rngChoice(rng: ReturnType<typeof rngFork>): number {
  return rngRange(rng, 0, 1) < 0.3 ? 1 : rngRange(rng, 1, 6);
}
