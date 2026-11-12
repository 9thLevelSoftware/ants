// Heightfield, ground layers and the map boundary (GDD 04 §2.1-2.3, §14; acceptance 5).
import { describe, expect, it, vi } from 'vitest';
import { MATERIAL_IDS, NAV_CLASSES } from '@/sim/types';
import { digFactor } from '@/sim/balance';
import { FULL, report, T1_ARCHETYPES } from '../testing/fixtures';
import { heightAt } from '@/sim/world/terrainSample';
import type { WorldData } from '@/sim/types';
import { REGION_STRATA, STRATA, SOFT_ZONES, TERRAIN, LEVELS } from '../tuning/terrain';
import { NAV } from '../tuning/maps';
import { VALID } from '../tuning/pipeline';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 120_000 });

describe('ground layers agree with zones', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: surface material per zone; hard crust under asphalt and paving, none under lawn`, () => {
      const w = report(a, 2).world;
      const g = w.ground, n = g.surface.nx;
      for (let j = 0; j < n * n; j += 3) {
        const z = w.zones[w.maps.zone.data[j]];
        const st = STRATA[z.type];
        const m = MATERIAL_IDS[g.surface.data[j]];
        const reg = REGION_STRATA[w.params.region];
        expect(m, `${z.type}`).toBe(reg && SOFT_ZONES.includes(z.type) ? reg.surface : st.surface);
        if (z.type === 'asphalt' || z.type === 'pavement') {
          expect(g.crustMm.data[j]).toBeGreaterThan(0);
          expect(digFactor('lasius-niger', m)).toBe(0);
        }
        if (z.type === 'lawn') expect(digFactor('lasius-niger', m)).toBeGreaterThan(0);
      }
    }, 60_000);
  }
});

describe('heightfield continuity and levels', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: no jumps between natural samples beyond micro relief; steps only at built edges and raised beds`, () => {
      const w = report(a, 2).world;
      const t = w.terrain, n = t.nx, cells = w.ground.surface.nx;
      const zoneOf = (i: number, k: number) => w.zones[w.maps.zone.data[Math.min(cells - 1, k) * cells + Math.min(cells - 1, i)]];
      let maxNatural = 0;
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
        const h = t.data[k * n + i];
        expect(Number.isFinite(h)).toBe(true);
        if (i + 1 >= n) continue;
        // a pair is natural if every terrain cell touching both samples is a natural zone
        let natural = true;
        for (const [di, dk] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]]) {
          const ci = i + di, ck = k + dk;
          if (ci < 0 || ck < 0 || ci >= cells || ck >= cells) continue;
          const z = zoneOf(ci, ck);
          if (!['forest', 'lawn'].includes(z.type)) natural = false; // built zones; beds: raised-bed steps are intended
        }
        if (natural) maxNatural = Math.max(maxNatural, Math.abs(t.data[k * n + i + 1] - h));
      }
      // micro relief and worm casts are the only short-wavelength terms (<= cast height); no cliffs
      expect(maxNatural).toBeLessThanOrEqual(TERRAIN.wormCastHeight[1] + 0.5 * t.cell);
    }, 60_000);
  }

  it('built levels: car park -125 next to a kerb, interior terrain at the slab underside, sand +10', () => {
    const cp = report('car-park-verge', 2).world;
    const c = cp.terrain, n = c.nx, cells = cp.ground.surface.nx;
    let minAsphalt = Infinity;
    for (let k = 0; k < cells; k += 5) for (let i = 0; i < cells; i += 5) {
      if (cp.zones[cp.maps.zone.data[k * cells + i]].type === 'asphalt') minAsphalt = Math.min(minAsphalt, c.data[k * n + i]);
    }
    expect(Math.abs(minAsphalt - LEVELS.carParkSurface)).toBeLessThan(4); // lowest just beyond the kerb ramp (1:80 fall)
    const kd = report('kitchen-door', 2).world;
    const kn = kd.terrain.nx, kc = kd.ground.surface.nx;
    for (let k = 1; k < kc - 1; k += 7) for (let i = 1; i < kc - 1; i += 7) {
      if (kd.zones[kd.maps.zone.data[k * kc + i]].type === 'interior' && kd.zones[kd.maps.zone.data[(k - 1) * kc + i - 1]].type === 'interior') {
        expect(kd.terrain.data[k * kn + i]).toBe(LEVELS.slabUnderside);
      }
    }
  });
});

/** Largest |dH| between neighbouring samples whose touching terrain cells all satisfy `ok` (zone type). */
function maxStepWhere(w: WorldData, ok: (type: string) => boolean): number {
  const t = w.terrain, n = t.nx, cells = w.maps.zone.nx;
  const type = (i: number, k: number) => w.zones[w.maps.zone.data[k * cells + i]].type;
  let best = 0;
  for (let k = 1; k < n - 1; k++) for (let i = 1; i < n - 1; i++) for (const [di, dk] of [[1, 0], [0, 1]] as const) {
    let all = true;
    for (let b = -1; b <= (dk ? 1 : 0) && all; b++) for (let a = -1; a <= (di ? 1 : 0) && all; a++) {
      const ci = i + a, ck = k + b;
      if (ci >= 0 && ck >= 0 && ci < cells && ck < cells && !ok(type(ci, ck))) all = false;
    }
    if (all) best = Math.max(best, Math.abs(t.data[(k + dk) * n + i + di] - t.data[k * n + i]));
  }
  return best;
}

describe('heightfield continuity over many seeds (review fix: path junctions, pavement joins, house wall)', () => {
  const seeds = FULL ? 8 : 3;
  const bound = TERRAIN.wormCastHeight[1] + 0.5 * 16; // worm casts + half a Lasius cell of slope
  for (const a of T1_ARCHETYPES) {
    it(`${a}: natural ground and pavement have no cliffs where built zones meet (${seeds} seeds)`, () => {
      for (let s = 1; s <= seeds; s++) {
        const w = report(a, s).world;
        // paths blend to rigid built levels like natural ground does, so lawn and forest next to a junction and
        // path-to-patio joins stay continuous
        expect(maxStepWhere(w, (t) => t === 'forest' || t === 'lawn'), `${a} s${s} natural`).toBeLessThanOrEqual(bound);
        expect(maxStepWhere(w, (t) => t === 'pavement'), `${a} s${s} pavement`).toBeLessThanOrEqual(bound);
      }
    }, 300_000);
  }

  it('the ground outside the house wall keeps its level on every side (no groove at the outer face)', () => {
    const sides = new Set<string>();
    for (let s = 1; s <= (FULL ? 12 : 6); s++) {
      const w = report('kitchen-door', s).world;
      const t = w.terrain, cells = w.maps.zone.nx, c = t.cell;
      const interior = (i: number, k: number) => w.zones[w.maps.zone.data[k * cells + i]].type === 'interior';
      sides.add(w.edges!.find((e) => e.kind === 'facade')!.side);
      let worst = 0;
      for (let k = 2; k < cells - 2; k++) for (let i = 2; i < cells - 2; i++) {
        if (interior(i, k)) continue;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!interior(i + di, k + dk)) continue;
          const fx = (i + 0.5 + 0.5 * di) * c, fz = (k + 0.5 + 0.5 * dk) * c; // the zone boundary = the wall face
          const drop = heightAt(t, fx - di * 1.5 * c, fz - dk * 1.5 * c) - heightAt(t, fx - di * 0.1 * c, fz - dk * 0.1 * c);
          worst = Math.max(worst, drop);
        }
      }
      expect(worst, `kitchen-door s${s}`).toBeLessThan(10);
    }
    expect(sides.size).toBeGreaterThanOrEqual(2); // the seeds cover the house on more than one map side
  }, 300_000);
});

describe('map boundary (GDD 04 §14)', () => {
  it('terrain covers [0, L]; nav cells outside the soft margin and partial cells are edge; start >= 300 BU inside', () => {
    for (const size of ['compact', 'standard'] as const) {
      const w = report('suburban-garden', 2, size).world;
      expect((w.terrain.nx - 1) * w.terrain.cell).toBe(w.size);
      const nav = w.nav.cls, m = NAV.edgeMarginBu * w.bu, edge = NAV_CLASSES.indexOf('edge');
      for (let k = 0; k < nav.nz; k++) for (let i = 0; i < nav.nx; i++) {
        const x = (i + 0.5) * nav.cell, z = (k + 0.5) * nav.cell;
        const outside = x < m || z < m || x > w.size - m || z > w.size - m || (i + 1) * nav.cell > w.size + 1e-6 || (k + 1) * nav.cell > w.size + 1e-6;
        if (outside) expect(nav.data[k * nav.nx + i]).toBe(edge);
        else expect(nav.data[k * nav.nx + i]).not.toBe(edge);
      }
      const s = w.queenStart.pos, lim = VALID.startEdgeMinBu * w.bu;
      expect(Math.min(s.x, s.z, w.size - s.x, w.size - s.z)).toBeGreaterThanOrEqual(lim - nav.cell);
      expect(w.edges?.map((e) => e.side).sort()).toEqual(['x0', 'x1', 'z0', 'z1']);
      expect(w.edges?.some((e) => e.kind === 'facade')).toBe(true);
    }
  });
});
