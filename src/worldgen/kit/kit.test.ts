// Placement kit: resting and tilt, collisions, budgets, quantisation, removal, routes, pre-carve budget, Poisson
// spacing, tables with thinning, registry ordering, deterministic maths.
import { describe, expect, it, vi } from 'vitest';
import { rngFork } from '@/core/rng';
import { PrimFlag } from '@/sim/types';
import { defaultWorldParams, worldDims } from '../params';
import { buildLayout, zoneDefs } from '../layout';
import { buildHeightfield } from '../terrain/heightfield';
import { buildStrata } from '../terrain/strata';
import { createContext, type GenContext } from './context';
import { placeObject, removeObject, type ObjectTemplate } from './template';
import { addClimbRoute, addPreCarve } from './records';
import { poissonDisk } from './poisson';
import { placeTables, thinning, type PlacementTable } from './tables';
import { buildRegistry, placersFor } from './registry';
import { supportAt, terrainAt } from './surface';
import { dcos, dlog, dlog10, dsin } from './dmath';
import { restViolations } from '../validate/checks';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 120_000 });

function ctxFor(archetype: 'suburban-garden' | 'woodland-edge' = 'suburban-garden', seed = 3): GenContext {
  const params = { ...defaultWorldParams('lasius-niger', seed, 'naturalist', 'compact'), archetype };
  const dims = worldDims(params);
  const lay = buildLayout(rngFork(seed, 'wg/zones'), params, dims, seed);
  const ctx = createContext(params, dims, 0, seed, lay);
  ctx.world.zones = zoneDefs(lay, dims);
  buildHeightfield(ctx, ctx.rng('wg/height'));
  buildStrata(ctx, ctx.rng('wg/height/strata'));
  return ctx;
}

const slab = (w = 300, h = 20, d = 200): ObjectTemplate => ({
  id: 'test-slab', tags: ['prop'],
  prims: [{ shape: 'box', pos: { x: 0, y: h / 2, z: 0 }, size: { x: w / 2, y: h / 2, z: d / 2 }, round: 2, material: 'stone', flags: PrimFlag.CLIMBABLE }],
  routes: [{ kind: 'stump-top', points: [{ x: -w / 2, y: 0, z: 0 }, { x: -w / 2, y: h, z: 0 }, { x: 0, y: h, z: 0 }] }],
  pois: [{ kind: 'vantage', pos: { x: 0, y: h, z: 0 } }],
});

describe('placeObject', () => {
  it('rests on the terrain without floating, tilts at most 20 deg, quantises, registers routes and POIs', () => {
    const ctx = ctxFor('woodland-edge');
    const x = ctx.dims.size * 0.31, z = ctx.dims.size * 0.47;
    const id = placeObject(ctx, slab(), { x, z, yaw: 0.7, category: 'props', collide: true });
    expect(id).toBeGreaterThanOrEqual(0);
    const ob = ctx.world.objects[0];
    const p = ctx.world.prims[ob.primStart];
    for (const v of [p.pos.x, p.pos.y, p.pos.z, p.size.x]) expect(v * 256).toBe(Math.round(v * 256));
    const up = { x: 2 * (p.rot.x * p.rot.y - p.rot.w * p.rot.z), y: 1 - 2 * (p.rot.x * p.rot.x + p.rot.z * p.rot.z), z: 2 * (p.rot.y * p.rot.z + p.rot.w * p.rot.x) };
    expect(up.y).toBeGreaterThanOrEqual(Math.cos((20 * Math.PI) / 180) - 1e-6);
    expect(restViolations(ctx)).toEqual([]);
    expect(ob.routeIds.length).toBe(1);
    expect(ob.poiIds.length).toBe(1);
    // the support under the slab is now its top
    expect(supportAt(ctx, x, z)).toBeGreaterThan(terrainAt(ctx, x, z) + 10);
    expect(supportAt(ctx, x, z, terrainAt(ctx, x, z) + 5)).toBeCloseTo(terrainAt(ctx, x, z), 5);
  });

  it('collision tests reject overlaps deeper than 1 mm; ignoreObjects allows rest-on hosts', () => {
    const ctx = ctxFor();
    const x = ctx.dims.size * 0.5, z = ctx.dims.size * 0.6;
    const a = placeObject(ctx, slab(), { x, z, y: 0, snap: false, collide: true });
    expect(placeObject(ctx, slab(), { x: x + 50, z, y: 5, snap: false, collide: true })).toBe(-1);
    expect(placeObject(ctx, slab(), { x: x + 50, z, y: 5, snap: false, collide: true, ignoreObjects: [a] })).toBeGreaterThanOrEqual(0);
    expect(placeObject(ctx, slab(), { x: x + 400, z, y: 0, snap: false, collide: true })).toBeGreaterThanOrEqual(0);
  });

  it('budgets cap placement; removeObject drops primitives, routes and POIs and reindexes', () => {
    const ctx = ctxFor();
    ctx.budget.limit.trees = 2;
    const L = ctx.dims.size;
    expect(placeObject(ctx, slab(), { x: L * 0.2, z: L * 0.2, category: 'trees' })).toBe(0);
    expect(placeObject(ctx, slab(), { x: L * 0.4, z: L * 0.2, category: 'trees' })).toBe(1);
    expect(placeObject(ctx, slab(), { x: L * 0.6, z: L * 0.2, category: 'trees' })).toBe(-1);
    const third = placeObject(ctx, slab(), { x: L * 0.8, z: L * 0.2 });
    expect(removeObject(ctx, 1)).toBe(true);
    expect(ctx.world.objects.map((o) => o.id)).toEqual([0, third]);
    expect(ctx.world.objects[1].primStart).toBe(1);
    expect(ctx.world.prims.every((p, i) => p.objectId === ctx.world.objects.find((o) => i >= o.primStart && i < o.primStart + o.primCount)!.id)).toBe(true);
    expect(ctx.world.climbRoutes.every((r) => r.objectId !== 1)).toBe(true);
  });
});

describe('records', () => {
  it('climb routes are resampled to <= 8 BU nodes; pre-carves refuse beyond the chunk budget', () => {
    const ctx = ctxFor();
    const bu = ctx.dims.bu;
    const id = addClimbRoute(ctx, -1, 'post-to-top', [{ x: 0, y: 0, z: 0 }, { x: 0, y: 100 * bu, z: 0 }]);
    const r = ctx.world.climbRoutes[id];
    for (let i = 1; i < r.points.length; i++) expect(r.points[i].y - r.points[i - 1].y).toBeLessThanOrEqual(8 * bu + 1e-9);
    expect(r.lengthBu).toBeCloseTo(100, 3);
    ctx.budget.limit.precarveChunks = 3;
    expect(addPreCarve(ctx, { shape: 'sphere', a: { x: 4 * bu, y: -4 * bu, z: 4 * bu }, b: { x: 0, y: 0, z: 0 }, r: bu, natural: true, cavityId: -1 })).toBe(true);
    expect(addPreCarve(ctx, { shape: 'capsule', a: { x: 0, y: -4 * bu, z: 0 }, b: { x: 200 * bu, y: -4 * bu, z: 0 }, r: bu, natural: true, cavityId: -1 })).toBe(false);
    expect(ctx.world.preCarve.length).toBe(1);
  });
});

describe('Poisson disk and placement tables', () => {
  it('points keep their spacing, stay in the rect and the acceptor, and are deterministic', () => {
    const r = { x0: 0, z0: 0, x1: 2000, z1: 1000 };
    const pts = poissonDisk(rngFork(1, 'p'), r, 100, (x) => x < 1500);
    expect(pts.length).toBeGreaterThan(50);
    for (let i = 0; i < pts.length; i++) {
      expect(pts[i].x).toBeLessThan(1500);
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThanOrEqual(100 - 1e-9);
    }
    expect(poissonDisk(rngFork(1, 'p'), r, 100, (x) => x < 1500)).toEqual(pts);
  });

  it('tables thin to the budget and place about density x area objects in their zones', () => {
    const ctx = ctxFor();
    const t: PlacementTable = {
      id: 'stones', category: 'props', zones: ['lawn'], densityPerM2: 0.4, spacingMm: 300,
      template: () => slab(80, 15, 60), options: () => ({ tilt: false }),
    };
    expect(thinning(ctx, [t]).props).toBe(1);
    const placed = placeTables(ctx, 'props', [t]).stones;
    const lawnArea = ctx.world.zones.filter((z) => z.type === 'lawn').reduce((s, z) => s + z.areaMm2, 0) / 1e6;
    expect(placed).toBeGreaterThan(0.6 * 0.4 * lawnArea);
    expect(placed).toBeLessThan(1.5 * 0.4 * lawnArea); // binomial acceptance over a few dozen points
    ctx.budget.limit.props = ctx.budget.used.props + 5;
    expect(thinning(ctx, [t]).props).toBeLessThan(1);
    expect(placeTables(ctx, 'props', [{ ...t, id: 'more' }]).more).toBeLessThanOrEqual(5);
  });

  it('a sparse table with a tiny minimum spacing samples at its density, not at the spacing (cost trap)', () => {
    const ctx = ctxFor();
    // 5 mm spacing over every lawn of a standard map would be millions of Poisson points before the fix
    const t: PlacementTable = {
      id: 'pebbles', category: 'props', zones: ['lawn'], densityPerM2: 0.4, spacingMm: 5,
      template: () => slab(80, 15, 60), options: () => ({ tilt: false }),
    };
    const t0 = Date.now();
    const placed = placeTables(ctx, 'props', [t]).pebbles;
    const lawnArea = ctx.world.zones.filter((z) => z.type === 'lawn').reduce((s, z) => s + z.areaMm2, 0) / 1e6;
    expect(placed).toBeGreaterThan(0.6 * 0.4 * lawnArea);
    expect(placed).toBeLessThan(1.5 * 0.4 * lawnArea);
    expect(Date.now() - t0).toBeLessThan(20_000); // load-tolerant: well under a second when idle
  });
});

describe('registry', () => {
  it('same-id placers replace defaults; order is step, order, id; archetype filters apply', () => {
    const run = () => {};
    const reg = buildRegistry(
      { placers: [{ id: 'default/x', step: 'props', run }, { id: 'default/y', step: 'structures', run }] },
      [{ placers: [{ id: 'b', step: 'props', order: 1, run }, { id: 'a', step: 'props', order: 1, run }, { id: 'default/x', step: 'plants', run }, { id: 'kd', step: 'props', archetypes: ['kitchen-door'], run }] }],
    );
    expect(reg.placers.map((p) => p.id)).toEqual(['default/y', 'kd', 'a', 'b', 'default/x']);
    expect(placersFor(reg, 'props', 'suburban-garden').map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('deterministic maths (DET-4)', () => {
  it('dsin / dcos / dlog match the platform functions closely', () => {
    for (let a = -10; a <= 10; a += 0.37) {
      expect(dsin(a)).toBeCloseTo(Math.sin(a), 6);
      expect(dcos(a)).toBeCloseTo(Math.cos(a), 6);
    }
    for (const x of [1e-6, 0.3, 1, 2, 21, 12345.6]) expect(dlog(x)).toBeCloseTo(Math.log(x), 10);
    expect(dlog10(1000)).toBeCloseTo(3, 10);
    // non-finite and extreme inputs terminate (dlog(Infinity) used to loop forever)
    expect(dlog(Infinity)).toBe(Infinity);
    expect(dlog10(Infinity)).toBe(Infinity);
    expect(dlog(Number.NaN)).toBeNaN();
    expect(dlog(-Infinity)).toBeNaN();
    expect(dlog(0)).toBe(-Infinity);
    expect(dlog(Number.MIN_VALUE)).toBeCloseTo(Math.log(Number.MIN_VALUE), 8);
    expect(dlog(Number.MAX_VALUE)).toBeCloseTo(Math.log(Number.MAX_VALUE), 8);
  });
});
