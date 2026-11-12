// The coarse 16 BU nav grid (GDD 04 §11): classes from the world data, tall-object cover from the field, A* with
// smoothing, avoid discs, flow fields, runtime cost overlays and incremental re-derivation.
import { describe, expect, it } from 'vitest';
import type { Primitive, WorldData } from '@/sim/types';
import { NAV_CLASSES, PrimFlag } from '@/sim/types';
import { createWorldField } from '@/sim/world/field';
import { makeTestWorld } from '@/sim/testing/testWorld';
import { createNavGridImpl } from './navGrid';
import { createNavGrid } from './index';

const BU = 4;
const ROT = { x: 0, y: 0, z: 0, w: 1 };
const v = (x: number, z: number) => ({ x: x * BU, y: 0, z: z * BU });

function tallBox(id: number, x: number, z: number, hx: number, hz: number, heightBu = 60): Primitive {
  return {
    id, shape: 'box', pos: { x: x * BU, y: (heightBu / 2 - 1) * BU, z: z * BU }, rot: { ...ROT },
    size: { x: hx * BU, y: (heightBu / 2) * BU, z: hz * BU }, round: 0, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1,
  };
}

function gridFor(world: WorldData) {
  const g = createNavGridImpl(world);
  g.attachField(createWorldField(world, null), world.prims);
  return g;
}

describe('nav grid', () => {
  it('is what createNavGrid returns, with 16 BU cells', () => {
    const world = makeTestWorld({ sizeBu: 320 });
    const g = createNavGrid(world);
    expect(g.cell).toBe(16 * BU);
    expect(g.w).toBe(20);
    expect(typeof (g as { findPathEx?: unknown }).findPathEx).toBe('function');
  });

  it('marks map edges, holes and water, and cells under tall objects as blocked; low objects stay open', () => {
    const world = makeTestWorld({ sizeBu: 320, prims: [tallBox(1, 160, 160, 20, 20), tallBox(2, 100, 100, 20, 20, 20)] });
    world.waterBodies.push({ id: 1, kind: 'bowl-water', vesselObjectId: -1, pos: v(250, 250), radius: 10 * BU, levelMm: 5, capMm: 10 });
    const g = gridFor(world);
    expect(g.classAt(4 * BU, 160 * BU)).toBe('edge');
    expect(g.blocked(4 * BU, 160 * BU)).toBe(true);
    expect(g.classAt(160 * BU, 160 * BU)).toBe('blocked-solid');
    expect(g.blocked(160 * BU, 160 * BU)).toBe(true);
    expect(g.blocked(100 * BU, 100 * BU)).toBe(false); // 20 BU tall: climbable, not blocking
    expect(g.classAt(250 * BU, 250 * BU)).toBe('water-body');
    expect(g.blocked(250 * BU, 250 * BU)).toBe(true);
    expect(g.classAt(60 * BU, 260 * BU)).toBe('open');
    expect(NAV_CLASSES).toContain(g.classAt(60 * BU, 260 * BU));
  });

  it('thin tall walls crossing a cell block it (barrier rule)', () => {
    const world = makeTestWorld({ sizeBu: 320, prims: [tallBox(1, 160, 160, 1.6, 80)] });
    const g = gridFor(world);
    for (let z = 100; z <= 220; z += 16) expect(g.blocked(160 * BU, z * BU)).toBe(true);
  });

  it('A* goes around a wall through its gap and smooths the path to few waypoints', () => {
    const world = makeTestWorld({ sizeBu: 400, prims: [tallBox(1, 200, 140, 1.6, 80), tallBox(2, 200, 330, 1.6, 50)] });
    const g = gridFor(world);
    const out: { x: number; y: number; z: number }[] = [];
    expect(g.findPath(v(150, 150), v(250, 150), out)).toBe(true);
    // the gap lies between z = 220 and z = 280: the path passes through it
    expect(out.some((p) => p.z > 215 * BU && p.z < 285 * BU)).toBe(true);
    expect(out.length).toBeLessThan(8);
    expect(out[out.length - 1]).toEqual(v(250, 150));
    // a straight line on open ground (shorter than the 12-cell smoothing span) is one waypoint
    expect(g.findPath(v(60, 60), v(120, 200), out)).toBe(true);
    expect(out.length).toBe(1);
  });

  it('reports no path when the goal is walled in', () => {
    const world = makeTestWorld({ sizeBu: 400, prims: [
      tallBox(1, 200, 160, 40, 2), tallBox(2, 200, 240, 40, 2), tallBox(3, 160, 200, 2, 40), tallBox(4, 240, 200, 2, 40)] });
    const g = gridFor(world);
    expect(g.findPath(v(60, 60), v(200, 200), [])).toBe(false);
  });

  it('avoid discs push the path out of the marker; runtime cost overlays steer it too', () => {
    const world = makeTestWorld({ sizeBu: 400 });
    const g = gridFor(world);
    const out: { x: number; y: number; z: number }[] = [];
    const disc = { x: 200 * BU, z: 200 * BU, r: 40 * BU, mult: 20 };
    expect(g.findPathEx(v(100, 200), v(300, 200), out, { discs: [disc] })).toBe(true);
    let minD = Infinity, prev = v(100, 200);
    for (const p of out) {
      for (let t = 0; t <= 1; t += 0.05) minD = Math.min(minD, Math.hypot(prev.x + (p.x - prev.x) * t - disc.x, prev.z + (p.z - prev.z) * t - disc.z));
      prev = p;
    }
    expect(minD).toBeGreaterThan(38 * BU);
    const v0 = g.version;
    g.setCostMult(12, 12, Infinity);
    expect(g.version).toBe(v0 + 1);
    expect(g.blocked(12.5 * 16 * BU, 12.5 * 16 * BU)).toBe(true);
  });

  it('flow fields lead to their seeds and are cached until the signature or the grid changes', () => {
    const world = makeTestWorld({ sizeBu: 400, prims: [tallBox(1, 200, 160, 1.6, 100)] });
    const g = gridFor(world);
    const seed = v(260, 200);
    const d1 = g.flowField('k', 'a', [seed]);
    expect(g.flowField('k', 'a', [seed])).toBe(d1);
    expect(g.stats().flowBuilds).toBe(1);
    // following the flow from the far side of the wall reaches the seed cell
    let p = v(140, 200);
    const t = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 60; k++) { g.flowNext(d1, p, 1, t); p = { ...t }; }
    expect(Math.hypot(p.x - seed.x, p.z - seed.z)).toBeLessThan(16 * BU);
    g.flowField('k', 'b', [seed]);
    expect(g.stats().flowBuilds).toBe(2);
  });

  it('re-derives cells after a dynamic primitive is added', () => {
    const world = makeTestWorld({ sizeBu: 320 });
    const field = createWorldField(world, null);
    const g = createNavGridImpl(world);
    g.attachField(field, world.prims);
    expect(g.blocked(160 * BU, 160 * BU)).toBe(false);
    const p = tallBox(50, 160, 160, 20, 20);
    field.addPrim(p);
    g.refreshArea(130 * BU, 130 * BU, 190 * BU, 190 * BU, [...world.prims, p]);
    expect(g.blocked(160 * BU, 160 * BU)).toBe(true);
  });
});
