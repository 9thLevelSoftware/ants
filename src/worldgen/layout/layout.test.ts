// Zone layout (GDD 04 §1.3, §1.4, §4.2 step 1): zone mixes and natural fractions over 20 seeds per archetype,
// built-zone size rules, adjacency, rasters, kerbs and edges. Layout only (cheap), so 20 seeds always run.
import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import { hash2u } from '@/core/math/noise';
import type { ArchetypeId, WorldSizeId } from '@/sim/types';
import { defaultWorldParams, worldDims } from '../params';
import { ARCHETYPE_DEFS, BUILT_SIZE, BUILT_ZONE, FRACTION_TOLERANCE, ZONE_TYPES_MAX, ZONE_TYPES_MIN } from '../tuning/archetypes';
import { buildLayout } from './index';
import { touches } from './geom';
import type { Layout } from './types';

const T1: ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];
const SEEDS = 20;

function layoutFor(a: ArchetypeId, seed: number, size: WorldSizeId = 'standard') {
  const params = { ...defaultWorldParams('lasius-niger', seed, 'naturalist', size), archetype: a };
  const dims = worldDims(params);
  return { lay: buildLayout(rngFork(seed, 'wg/zones'), params, dims, seed), dims };
}

/** Share of the natural remainder per natural zone on the 4 BU raster. */
function naturalShares(lay: Layout): Map<number, number> {
  const count = new Map<number, number>();
  let total = 0;
  for (const v of lay.cells) if (!lay.zones[v].built) { count.set(v, (count.get(v) ?? 0) + 1); total++; }
  return new Map([...count].map(([k, n]) => [k, n / total]));
}

describe('zone mix per archetype (GDD 04 §1.3)', () => {
  for (const a of T1) {
    it(`${a}: 3-5 zone types, all mandatory zones, natural fractions within the stated ranges (${SEEDS} seeds)`, () => {
      const def = ARCHETYPE_DEFS[a];
      for (let s = 1; s <= SEEDS; s++) {
        const { lay } = layoutFor(a, s);
        const types = new Set(lay.zones.map((z) => z.type));
        expect(types.size, `seed ${s}`).toBeGreaterThanOrEqual(ZONE_TYPES_MIN);
        expect(types.size, `seed ${s}`).toBeLessThanOrEqual(ZONE_TYPES_MAX);
        for (const n of def.natural) expect(types.has(n.type), `${a} seed ${s} natural ${n.type}`).toBe(true);
        for (const b of def.built) expect(lay.zones.some((z) => z.built === b), `${a} seed ${s} built ${b}`).toBe(true);
        // every zone of the table occupies cells
        const present = new Set(lay.cells);
        for (const z of lay.zones) expect(present.has(z.id), `${a} seed ${s} zone ${z.type}/${z.variant} empty`).toBe(true);
        const shares = naturalShares(lay);
        const nat = lay.zones.filter((z) => !z.built);
        const lo = nat.reduce((t, z) => t + z.range![0], 0), hi = nat.reduce((t, z) => t + z.range![1], 0);
        for (const z of nat) {
          const got = shares.get(z.id) ?? 0;
          if (lo <= 1 && hi >= 1) {
            expect(got, `${a} seed ${s} ${z.type}`).toBeGreaterThanOrEqual(z.range![0] - FRACTION_TOLERANCE);
            expect(got, `${a} seed ${s} ${z.type}`).toBeLessThanOrEqual(z.range![1] + FRACTION_TOLERANCE);
          }
          expect(Math.abs(got - z.target), `${a} seed ${s} ${z.type} vs target`).toBeLessThanOrEqual(FRACTION_TOLERANCE);
        }
      }
    }, 120_000);
  }
});

describe('built-zone size rules (GDD 04 §1.4)', () => {
  it('interior strip, kitchen slice, door, patio, car park, sand and rubber respect their sizes and adjacency', () => {
    for (const size of ['compact', 'standard', 'large'] as const) {
      for (let s = 1; s <= (size === 'standard' ? SEEDS : 6); s++) {
        for (const a of T1) {
          const { lay, dims } = layoutFor(a, s, size);
          const L = dims.size, B = BUILT_SIZE;
          const rect = (k: string) => lay.built.filter((b) => b.kind === k && b.rect).map((b) => b.rect!);
          const w = (r: { x0: number; x1: number }) => r.x1 - r.x0, h = (r: { z0: number; z1: number }) => r.z1 - r.z0;
          const clampR = (c: { f: number; lo: number; hi: number }) => Math.min(c.hi, Math.max(c.lo, c.f * L));
          if (lay.house) {
            const hs = lay.house;
            const depth = hs.side[0] === 'x' ? w(hs.strip) : h(hs.strip);
            expect(depth).toBeLessThanOrEqual(clampR(B.interiorDepth) + 1e-6);
            expect(depth).toBeGreaterThanOrEqual(B.interiorDepth.lo - 1e-6);
            const k = hs.kitchen!;
            const kw = hs.side[0] === 'x' ? h(k) : w(k);
            expect(kw).toBeGreaterThanOrEqual(Math.min(B.kitchenWidth.lo, L - 2 * B.kitchenCornerMin) - 1e-6);
            expect(kw).toBeLessThanOrEqual(clampR(B.kitchenWidth) + 1e-6);
            const k0 = hs.side[0] === 'x' ? k.z0 : k.x0, k1 = hs.side[0] === 'x' ? k.z1 : k.x1;
            expect(k0).toBeGreaterThanOrEqual(B.kitchenCornerMin - 1e-6);
            expect(L - k1).toBeGreaterThanOrEqual(B.kitchenCornerMin - 1e-6);
          }
          for (const p of rect('patio')) {
            const along = lay.facadeSide![0] === 'x' ? h(p) : w(p), deep = lay.facadeSide![0] === 'x' ? w(p) : h(p);
            expect(along).toBeLessThanOrEqual(clampR(B.patioWidth) + 1e-6);
            expect(deep).toBeLessThanOrEqual(clampR(B.patioDepth) + 1e-6);
            if (lay.house?.door) { // kitchen-door / suburban with interior: the patio is in front of the door
              const d = lay.house.door;
              const da = lay.facadeSide![0] === 'x' ? d.z : d.x, p0 = lay.facadeSide![0] === 'x' ? p.z0 : p.x0, p1 = lay.facadeSide![0] === 'x' ? p.z1 : p.x1;
              expect(da).toBeGreaterThan(p0);
              expect(da).toBeLessThan(p1);
            }
          }
          for (const c of rect('car-park')) {
            const depth = Math.min(w(c), h(c));
            expect(depth).toBeLessThanOrEqual(clampR(B.carParkDepth) + 1e-6);
            expect(depth).toBeGreaterThanOrEqual(Math.min(B.carParkDepth.lo, clampR(B.carParkDepth)) * 0.5);
            for (const sw of rect('sidewalk')) expect(touches(sw, c)).toBe(true);
            if (lay.facadeSide) expect(lay.carPark!.side).not.toBe(lay.facadeSide);
          }
          for (const sd of rect('sand')) {
            expect(Math.max(w(sd), h(sd))).toBeLessThanOrEqual(Math.max(B.sandSide[1], 0.25 * L) + 1e-6);
            expect(Math.min(sd.x0, sd.z0, L - sd.x1, L - sd.z1)).toBeGreaterThanOrEqual(B.sandEdgeMin - 1e-6);
            for (const r of rect('rubber')) expect(touches(r, sd)).toBe(true);
          }
          for (const p of lay.built.filter((b) => b.kind === 'path')) {
            expect(p.width).toBeGreaterThanOrEqual(B.pathWidth[0]);
            expect(p.width).toBeLessThanOrEqual(B.pathWidth[1]);
          }
          // built zones never overlap each other
          const rs = lay.built.filter((b) => b.rect).map((b) => b.rect!);
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const ow = Math.min(rs[i].x1, rs[j].x1) - Math.max(rs[i].x0, rs[j].x0), oh = Math.min(rs[i].z1, rs[j].z1) - Math.max(rs[i].z0, rs[j].z0);
            expect(ow > 1 && oh > 1, `${a} ${size} seed ${s} overlap`).toBe(false);
          }
        }
      }
    }
  }, 300_000);

  it('built rasters match the analytic shapes and kerbs line every asphalt edge facing higher ground', () => {
    const { lay, dims } = layoutFor('car-park-verge', 4);
    const cp = lay.carPark!;
    for (let k = 0; k < dims.cells; k += 7) for (let i = 0; i < dims.cells; i += 7) {
      const x = (i + 0.5) * dims.cell, z = (k + 0.5) * dims.cell;
      const inCp = x >= cp.rect.x0 && x < cp.rect.x1 && z >= cp.rect.z0 && z < cp.rect.z1;
      expect(lay.zones[lay.cells[k * dims.cells + i]].type === 'asphalt').toBe(inCp);
    }
    expect(lay.kerbs.length).toBeGreaterThanOrEqual(1);
    expect(lay.edges.find((e) => e.side === cp.side)?.kind).toBe('road');
    expect(BUILT_ZONE['car-park'].type).toBe('asphalt');
  });
});

describe('determinism of the layout', () => {
  it('same seed -> identical rasters; different seed -> different', () => {
    const a = layoutFor('suburban-garden', 9).lay, b = layoutFor('suburban-garden', 9).lay, c = layoutFor('suburban-garden', 10).lay;
    const eq = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
    expect(eq(a.cells, b.cells)).toBe(true);
    expect(eq(a.cells, c.cells)).toBe(false);
  });
});

describe('compact and large maps: the partial last nav column and row (review fix)', () => {
  // L / 16 BU is 187.5 (compact) or 312.5 (large) cells: the last nav column and row are half cells. A band on the
  // x1/z1 side used to leave them free (their centre at x = L lay outside the band), a natural zone seeded there
  // was boxed in behind the band and vanished on the 4 BU raster.
  for (const size of ['compact', 'large'] as const) {
    it(`${size}: bands reaching x1/z1 cover the partial cells; mandatory natural zones keep >= half their minimum share`, () => {
      for (const a of T1) for (let s = 1; s <= SEEDS; s++) {
        // the seed the pipeline really uses on attempt 0
        const params = { ...defaultWorldParams('lasius-niger', s, 'naturalist', size), archetype: a };
        const dims = worldDims(params), seedA = hash2u(s, 0) | 0;
        const lay = buildLayout(rngFork(seedA, 'wg/zones'), params, dims, seedA);
        const n = dims.navN, L = dims.size;
        expect(n * dims.navCell).toBeGreaterThan(L);
        for (const b of lay.built) {
          if (!b.rect) continue;
          const r = b.rect;
          const zMid = Math.min(n - 1, Math.floor((r.z0 + r.z1) / 2 / dims.navCell)), xMid = Math.min(n - 1, Math.floor((r.x0 + r.x1) / 2 / dims.navCell));
          if (r.x1 >= L) expect(lay.nav[zMid * n + n - 1], `${a} s${s} ${b.kind} x1`).toBe(b.zoneId);
          if (r.z1 >= L) expect(lay.nav[(n - 1) * n + xMid], `${a} s${s} ${b.kind} z1`).toBe(b.zoneId);
        }
        const shares = naturalShares(lay);
        for (const z of lay.zones.filter((q) => !q.built)) {
          expect(shares.get(z.id) ?? 0, `${a} s${s} ${z.type}`).toBeGreaterThanOrEqual(0.5 * z.range![0]);
        }
      }
    }, 300_000);
  }
});
