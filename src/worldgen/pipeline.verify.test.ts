// Reviewer regression tests (worldgen-terrain): seed edge cases, fingerprint stability, and the zone fractions of
// acceptance 4 measured with the seeds the pipeline really uses (seed_a = hash32(seed, a), attempt 0), not the raw
// seed the layout test forks from.
import { describe, expect, it, vi } from 'vitest';
import { hash2u } from '@/core/math/noise';
import { rngFork } from '@/core/rng';
import { generateWorld, worldFingerprint } from './index';
import { worldDims } from './params';
import { paramsFor, T1_ARCHETYPES } from './testing/fixtures';
import { buildLayout } from './layout';
import { BUILT_SIZE, FRACTION_TOLERANCE } from './tuning/archetypes';
import { area } from './layout/geom';
import type { ArchetypeId, WorldData } from '@/sim/types';
import { generateWorldReport } from './pipeline';
import { primColumn } from './kit/column';
import { discoveredModules } from './kit/registry';
import { deriveMaps, mapState } from './maps';

declare const process: { env: Record<string, string | undefined> };
const LONG = process.env.FOUNDRESS_LONG === '1';

vi.setConfig({ testTimeout: 300_000 });

describe('seed edge cases', () => {
  it('seeds 0, 2^31 and 2^32 - 1 generate valid, repeatable and distinct worlds', () => {
    const prints: number[] = [];
    for (const seed of [0, 2 ** 31, 2 ** 32 - 1]) {
      const p = { ...paramsFor('playground-park', 1, 'compact'), seed };
      const a = generateWorld(p), b = generateWorld(p);
      expect(a.meta.fingerprint, `seed ${seed}`).toBe(b.meta.fingerprint);
      expect(a.meta.attempts).toBeLessThanOrEqual(8);
      for (const v of a.terrain.data) if (!Number.isFinite(v)) throw new Error(`non-finite height, seed ${seed}`);
      prints.push(a.meta.fingerprint);
    }
    expect(new Set(prints).size).toBe(3);
  });

  it('the fingerprint does not depend on object key order (DET-3)', () => {
    const w = generateWorld(paramsFor('car-park-verge', 3, 'compact'));
    const reversed = Object.fromEntries(Object.entries(w).reverse());
    expect(worldFingerprint(reversed)).toBe(w.meta.fingerprint);
  });
});

/** Layout of attempt 0 exactly as the pipeline builds it (seed_a = hash32(seed, 0), stream 'wg/zones'). */
function pipelineLayout(a: Parameters<typeof paramsFor>[0], s: number, size: Parameters<typeof paramsFor>[2]) {
  const params = paramsFor(a, s, size);
  const dims = worldDims(params);
  const seedA = hash2u(params.seed | 0, 0) | 0;
  return { lay: buildLayout(rngFork(seedA, 'wg/zones'), params, dims, seedA), dims };
}

/** Natural zone shares of the natural remainder on the 4 BU raster. */
function shares(lay: ReturnType<typeof pipelineLayout>['lay']) {
  const count = new Map<number, number>();
  let natural = 0;
  for (const v of lay.cells) if (!lay.zones[v].built) { count.set(v, (count.get(v) ?? 0) + 1); natural++; }
  return lay.zones.filter((z) => !z.built).map((z) => ({ z, got: (count.get(z.id) ?? 0) / natural }));
}

describe('acceptance 4 / GDD 04 App. E 3 with the pipeline seeds', () => {
  // FAILS: on compact and large maps the last nav column/row is partial (L / 16 BU = 187.5 or 312.5 cells), and
  // rasterBuilt leaves it FREE behind band zones on the x1/z1 sides (the partial cell's centre is at x = L, outside
  // [x0, L)). A natural seed with an 'edge' preference can land in that 1-cell sliver, which the lane / car park /
  // house strip isolates, so the zone cannot grow; on the 4 BU raster the sliver is under the band and the zone
  // disappears. Found: woodland-edge compact 39 (no forest at all), suburban-garden compact 59 and kitchen-door
  // compact 52 (no garden-bed); generateWorldReport validates all three on the first attempt.
  it('mandatory natural zones never vanish (compact: woodland 39, suburban 59, kitchen-door 52)', () => {
    const bad: string[] = [];
    for (const [a, s] of [['woodland-edge', 39], ['suburban-garden', 59], ['kitchen-door', 52]] as const) {
      for (const { z, got } of shares(pipelineLayout(a, s, 'compact').lay)) if (got < 0.5 * z.range![0]) bad.push(`${a} s${s} ${z.type} ${got.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
  });

  for (const a of T1_ARCHETYPES) {
    it(`${a}: natural shares inside the GDD range (+-${FRACTION_TOLERANCE}) where reachable, built share <= 70 % (20 seeds, 3 sizes)`, () => {
      const bad: string[] = [];
      for (const size of ['compact', 'standard', 'large'] as const) {
        for (let s = 1; s <= 20; s++) {
          const { lay, dims } = pipelineLayout(a, s, size);
          const nat = lay.zones.filter((z) => !z.built);
          const lo = nat.reduce((t, z) => t + z.range![0], 0), hi = nat.reduce((t, z) => t + z.range![1], 0);
          for (const { z, got } of shares(lay)) {
            if (lo <= 1 && hi >= 1 && (got < z.range![0] - FRACTION_TOLERANCE || got > z.range![1] + FRACTION_TOLERANCE)) {
              bad.push(`${size} s${s} ${z.type} ${got.toFixed(3)} not in [${z.range}]`);
            }
          }
          let builtArea = 0;
          for (const b of lay.built) if (b.rect) builtArea += area(b.rect);
          if (builtArea / (dims.size * dims.size) > BUILT_SIZE.builtMaxFrac + 1e-9) bad.push(`${size} s${s} built share`);
        }
      }
      // FAILS for suburban-garden (compact s12: garden-bed 0.134, forest 0.248), same root cause as above
      expect(bad).toEqual([]);
    }, 300_000);
  }
});

// worldgen-fixes: the derived maps changed their column routine (closed form instead of the search, within the
// tolerance stated in maps/maps.verify.test.ts) and keep the geometric maps on a re-derivation whose inputs did not
// change. Nothing placed may move: placers rest objects with the search routine (kit/surface.ts supportAt), and the
// later steps read maps that differ by at most a few threshold cells.
describe('placed content does not depend on the derived-map column routine', () => {
  const OBJECT_LEVEL = ['prims', 'objects', 'micro', 'cavities', 'preCarve', 'climbRoutes', 'pois', 'waterBodies', 'placements', 'queenStart'] as const;

  function sameContent(a: ArchetypeId, seed: number): string[] {
    const p = paramsFor(a, seed);
    const legacy = generateWorldReport(p, { columns: primColumn }).world, analytic = generateWorldReport(p).world;
    const diff = OBJECT_LEVEL.filter((k) => JSON.stringify(legacy[k]) !== JSON.stringify(analytic[k])).map((k) => `${a} #${seed} ${k}`);
    if (legacy.meta.attempts !== analytic.meta.attempts) diff.push(`${a} #${seed} attempts`);
    return diff;
  }

  it('kitchen-door #1: object lists, cavities, routes, micro-connections, anchors and start identical', () => {
    expect(sameContent('kitchen-door', 1)).toEqual([]);
  });

  it.skipIf(!LONG)('FOUNDRESS_LONG: the same on 3 seeds of every Tier 1 archetype', () => {
    const diff: string[] = [];
    for (const a of T1_ARCHETYPES) for (const seed of [1, 2, 3]) diff.push(...sameContent(a, seed));
    expect(diff).toEqual([]);
  }, 3_600_000);

  it('a re-derivation after steps 7-9 that keeps the geometric maps equals a full rebuild', () => {
    const grab = (w: WorldData) => [w.nav.cls.data, w.nav.cost.data, w.nav.groundY!, w.nav.flags!.data, w.maps.shade.data, w.maps.moisture.data,
      w.maps.floodRisk.data, w.maps.exposure.data, w.maps.shelter.data, w.maps.suitability[w.params.speciesId].data].map((x) => Array.from(x));
    let kept = false, before: number[][] = [], after: number[][] = [];
    let first: unknown = null;
    generateWorldReport(paramsFor('car-park-verge', 2, 'compact'), { modules: [...discoveredModules(), { placers: [
      { id: 'verify/first', step: 'resources', order: -1e6, run: (ctx) => { first = mapState(ctx).col; } },
      { id: 'verify/full', step: 'start', order: -1e6, run: (ctx) => {
        kept = mapState(ctx).col === first;
        before = grab(ctx.world);
        deriveMaps(ctx, { full: true });
        after = grab(ctx.world);
      } },
    ] }] });
    expect(kept).toBe(true); // populate adds anchors and sites, no geometry
    expect(after).toEqual(before);
  });
});
