// Outdoor catalogue builders (GDD 04 §5.1-5.6): every template is well formed (finite positive sizes, materials,
// flags), deterministic for a given RNG stream, plants stay within PLANT_MAX_PRIMS, ellipsoids are never flatter
// than 3:1 (the field's ellipsoid distance is a bound, flat ones grow phantom surfaces), climb routes and POIs
// exist where GDD 04 §10 defines them, sockets are complete.
import { describe, expect, it, vi } from 'vitest';
import { rngFork } from '@/core/rng';
import { MATERIAL_IDS, CLIMB_ROUTE_KINDS, POI_KINDS } from '@/sim/types';
import { OUTDOOR_CATALOG, PLANT_MAX_PRIMS, fenceSection, dryStoneWall, kerbUnit, pavingSlab, raisedBedBoard, sandEdging, lawnEdge, edgingKerb } from './index';
import { EL_MAX_RATIO } from './prims';
import type { Built, Env } from './types';

// thousands of builds per test; the shared machine is often loaded
vi.setConfig({ testTimeout: 60_000 });

const ENV: Env = { bu: 4, foot: 0.6, woodNester: false };
const ENV_CP: Env = { bu: 9, foot: 1.35, woodNester: true };

function check(id: string, b: Built): void {
  expect(b.tpl.prims.length, id).toBeGreaterThan(0);
  for (const p of b.tpl.prims) {
    for (const v of [p.pos.x, p.pos.y, p.pos.z, p.size.x, p.size.y, p.size.z]) expect(Number.isFinite(v), id).toBe(true);
    expect(p.size.x, id).toBeGreaterThan(0);
    expect(p.size.y, id).toBeGreaterThan(0);
    if (p.shape === 'box' || p.shape === 'ellipsoid') expect(p.size.z, id).toBeGreaterThan(0);
    if (p.shape === 'ellipsoid') {
      const lo = Math.min(p.size.x, p.size.y, p.size.z), hi = Math.max(p.size.x, p.size.y, p.size.z);
      expect(hi / lo, `${id} ellipsoid ratio`).toBeLessThanOrEqual(EL_MAX_RATIO + 1e-9);
    }
    expect(MATERIAL_IDS, id).toContain(p.material);
  }
  for (const r of b.tpl.routes ?? []) {
    expect(CLIMB_ROUTE_KINDS, id).toContain(r.kind);
    expect(r.points.length, id).toBeGreaterThanOrEqual(2);
    for (const q of r.points) expect(Number.isFinite(q.x + q.y + q.z), id).toBe(true);
  }
  for (const p of b.tpl.pois ?? []) expect(POI_KINDS, id).toContain(p.kind);
  for (const m of b.micro ?? []) {
    expect(m.clearMm, id).toBeGreaterThan(0);
    if (m.cavity !== undefined && m.cavity >= 0) expect(b.cavities?.[m.cavity], id).toBeDefined();
  }
}

/** Templates whose GDD 04 §10 entry defines a climb route. */
const ROUTED = ['standing-tree', 'park-tree', 'fruit-tree', 'tree-pit', 'log', 'stump', 'herb-plant', 'dandelion', 'clover-patch', 'daisy',
  'perennial-plant', 'shrub', 'bean-row', 'plant-pot', 'planter', 'water-butt', 'bird-table', 'patio-table', 'patio-chair', 'bollard',
  'lamp-post', 'parked-car', 'slide', 'bench', 'litter-bin'];

describe('outdoor catalogue templates', () => {
  it('every builder makes a well-formed object for Lasius and Camponotus BU, 20 instances each', () => {
    for (const [id, make] of Object.entries(OUTDOOR_CATALOG)) {
      for (let i = 0; i < 20; i++) {
        check(id, make(rngFork(i, id), ENV));
        check(id, make(rngFork(i + 100, id), ENV_CP));
      }
    }
  });

  it('templates are a pure function of the RNG stream', () => {
    for (const [id, make] of Object.entries(OUTDOOR_CATALOG)) {
      expect(JSON.stringify(make(rngFork(7, id), ENV)), id).toBe(JSON.stringify(make(rngFork(7, id), ENV)));
    }
  });

  it('climb routes and points of interest exist where GDD 04 §10 defines them', () => {
    for (const id of ROUTED) {
      const b = OUTDOOR_CATALOG[id](rngFork(3, id), ENV);
      expect(b.tpl.routes?.length ?? 0, id).toBeGreaterThan(0);
    }
    const tree = OUTDOOR_CATALOG['standing-tree'](rngFork(1, 't'), ENV);
    expect(tree.tpl.routes!.every((r) => r.kind === 'trunk-to-branch')).toBe(true);
    expect(tree.tpl.pois!.some((p) => p.kind === 'aphid-site')).toBe(true);
    expect(tree.tpl.pois!.some((p) => p.kind === 'vantage')).toBe(true);
    expect(OUTDOOR_CATALOG['litter-bin'](rngFork(1, 'b'), ENV).tpl.pois!.some((p) => p.kind === 'bin-gap')).toBe(true);
    expect(OUTDOOR_CATALOG.dandelion(rngFork(1, 'd'), ENV).tpl.pois!.some((p) => p.kind === 'nectar-site')).toBe(true);
    expect(OUTDOOR_CATALOG['patio-table'](rngFork(1, 'p'), ENV).tpl.pois!.some((p) => p.kind === 'food-spot')).toBe(true);
  });

  it('plants stay within PLANT_MAX_PRIMS and carry host data', () => {
    for (const id of ['herb-plant', 'dandelion', 'clover-patch', 'daisy', 'perennial-plant', 'shrub', 'seed-grass']) {
      for (let i = 0; i < 40; i++) {
        const b = OUTDOOR_CATALOG[id](rngFork(i, id), ENV);
        expect(b.tpl.prims.length, id).toBeLessThanOrEqual(PLANT_MAX_PRIMS);
        expect(b.host, id).toBeDefined();
      }
    }
  });

  it('sized builders: slabs, kerbs (gap variant with its tunnel), fences (gap), walls (crevice), boards, edges', () => {
    check('paving-slab', pavingSlab(rngFork(1, 's'), 600, 50, 450, 'concrete', 0));
    const cracked = pavingSlab(rngFork(1, 's'), 600, 50, 450, 'concrete', 3);
    expect(cracked.tpl.id).toBe('cracked-slab');
    expect(cracked.tpl.prims).toHaveLength(2);
    const k = kerbUnit(rngFork(1, 'k'), ENV, { len: 915, upstand: 125, gap: true, paved: false, pavedDepth: 56 });
    check('kerb', k);
    expect(k.micro?.[0].kind).toBe('kerb-gap');
    expect(k.micro![0].clearMm).toBeGreaterThanOrEqual(0.6 * ENV.bu);
    expect(k.cavities?.[0].kind).toBe('kerb-void');
    const f = fenceSection(rngFork(1, 'f'), ENV, { panel: true, gap: true, route: true });
    check('fence', f);
    expect(f.micro?.[0].kind).toBe('fence-gap');
    expect(f.tpl.routes?.[0].kind).toBe('fence-rail');
    const w = dryStoneWall(rngFork(2, 'w'), ENV, 2000, 450, 350);
    check('garden-wall', w);
    expect(w.micro?.[0].kind).toBe('wall-crevice');
    check('raised-bed-board', raisedBedBoard(rngFork(1, 'r'), 1500, 200));
    check('sand-edging', sandEdging(rngFork(1, 'e'), 2400));
    check('lawn-edge', lawnEdge(rngFork(1, 'l'), 450));
    check('edging-kerb', edgingKerb());
  });

  it('micro-connection gaps are clamped to the 0.6 BU minimum where the real range allows (GDD 04 §6.1)', () => {
    for (let i = 0; i < 30; i++) {
      for (const env of [ENV, ENV_CP]) {
        const g = OUTDOOR_CATALOG['gully-grate'](rngFork(i, 'g'), env).micro![0];
        expect(g.gapMm).toBeGreaterThanOrEqual(Math.min(30, 0.6 * env.bu) - 1e-9);
        const k = kerbUnit(rngFork(i, 'k'), env, { len: 915, upstand: 125, gap: true, paved: true, pavedDepth: 56 }).micro![0];
        expect(k.clearMm).toBeGreaterThanOrEqual(Math.min(20, 0.6 * env.bu) - 1e-9);
      }
    }
  });
});
