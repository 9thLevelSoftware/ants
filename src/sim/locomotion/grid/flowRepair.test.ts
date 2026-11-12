// Flow-field repair (Stage 1A gate, truncated loco finding "any nav-grid change rebuilds every flow field
// synchronously"): after cost overlays, re-derived areas and portal changes, the repaired field must equal a full
// rebuild bit for bit (determinism across save / load), and a local change must not cost a full rebuild.
import { describe, expect, it } from 'vitest';
import { rngFork, rngInt, rngRange } from '@/core/rng';
import type { Primitive } from '@/sim/types';
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

function rngChoice(rng: ReturnType<typeof rngFork>): number {
  return rngRange(rng, 0, 1) < 0.3 ? 1 : rngRange(rng, 1, 6);
}
