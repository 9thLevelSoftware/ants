// Reviewer tests (worldgen-outdoor) on generated worlds: fence lines without holes on natural ground, the
// kitchen-door back step (GDD 04 §5.4: 1 per kitchen-door), climb routes ending at their point of interest, and
// decor descriptors that are deterministic (they are not part of the fingerprint, DET-8).
import { describe, expect, it, vi } from 'vitest';
import type { ArchetypeId, WorldData } from '@/sim/types';
import { generateWorldReport } from '../../pipeline';
import { report, paramsFor } from '../../testing/fixtures';
import { BEDS } from '../../catalog/outdoor/beds';

vi.setConfig({ testTimeout: 600_000 });

const NATURAL = new Set(['forest', 'lawn', 'garden-bed']);

function zoneTypeAt(w: WorldData, x: number, z: number): string {
  const r = w.maps.zone, i = Math.min(r.nx - 1, Math.max(0, Math.floor(x / r.cell))), k = Math.min(r.nz - 1, Math.max(0, Math.floor(z / r.cell)));
  return w.zones.find((q) => q.id === r.data[k * r.nx + i])?.type ?? '?';
}

/**
 * Fence sections missing on natural ground: along each fence line (objects grouped by the coordinate nearest the map
 * edge), consecutive sections more than one panel apart where the skipped stretch is lawn, bed or forest (panels
 * stop only at built ground: a gate).
 */
function fenceHoles(w: WorldData): string[] {
  const L = w.size, W = BEDS.fence.panelW;
  const lines = new Map<string, number[]>();
  for (const o of w.objects) {
    if (o.templateId !== 'fence') continue;
    const kx = Math.min(o.pos.x, L - o.pos.x), kz = Math.min(o.pos.z, L - o.pos.z);
    const key = kx < kz ? `x${Math.round(o.pos.x)}` : `z${Math.round(o.pos.z)}`;
    (lines.get(key) ?? lines.set(key, []).get(key)!).push(kx < kz ? o.pos.z : o.pos.x);
  }
  const out: string[] = [];
  for (const [key, us] of lines) {
    us.sort((a, b) => a - b);
    const c = Number(key.slice(1));
    // closing posts of perpendicular lines that ran on to the map edge are not a line of their own
    if (c < 1 || c > L - 1) continue;
    for (let i = 1; i < us.length; i++) {
      const missing = Math.round((us[i] - us[i - 1]) / W) - 1;
      for (let m = 0; m < missing; m++) {
        const u0 = us[i - 1] + W * (m + 1), um = u0 + W / 2;
        const at = (u: number) => (key[0] === 'x' ? zoneTypeAt(w, c, u) : zoneTypeAt(w, u, c));
        if (NATURAL.has(at(u0)) && NATURAL.has(at(um))) out.push(`${key} section at ${Math.round(u0)}`);
      }
    }
  }
  return out;
}

describe('map-edge fence lines (GDD 04 §4.2 step 1g, §5.3 fence: posts every 1830)', () => {
  for (const [a, seed] of [['suburban-garden', 1], ['kitchen-door', 1]] as [ArchetypeId, number][]) {
    it(`${a}#${seed}: no fence section is missing on natural ground`, () => {
      expect(fenceHoles(report(a, seed).world)).toEqual([]);
    });
  }
});

describe('kitchen-door back step (GDD 04 §5.4 back-step: 1 per kitchen-door)', () => {
  for (const seed of [1, 2]) {
    it(`kitchen-door#${seed} has its back step`, () => {
      const w = report('kitchen-door', seed).world;
      expect(w.objects.filter((o) => o.templateId === 'back-step').length).toBe(1);
    });
  }
});

describe('kitchen-door entrance and patio furniture (GDD 04 §5.4: doormat-outside 1; patio-chair 2-4 around the table)', () => {
  for (const seed of [1, 2]) {
    it(`kitchen-door#${seed} has its outside doormat`, () => {
      const w = report('kitchen-door', seed).world;
      expect(w.objects.filter((o) => o.templateId === 'doormat-outside').length).toBe(1);
    });
  }
  for (const [a, seed] of [['kitchen-door', 2], ['suburban-garden', 2]] as [ArchetypeId, number][]) {
    it(`${a}#${seed}: a placed patio table has 2-4 chairs`, () => {
      const w = report(a, seed).world;
      const tables = w.objects.filter((o) => o.templateId === 'patio-table').length;
      const chairs = w.objects.filter((o) => o.templateId === 'patio-chair').length;
      if (tables > 0) expect(chairs, `${tables} table(s)`).toBeGreaterThanOrEqual(2);
      expect(chairs).toBeLessThanOrEqual(4);
    });
  }
});

describe('climb routes end at their point of interest (GDD 04 §10)', () => {
  // routes whose last node is the POI by the template's own construction
  const ENDS_AT_POI = new Set(['bench', 'litter-bin', 'patio-table', 'bollard', 'lamp-post', 'bird-table', 'plant-pot', 'planter', 'water-butt', 'stump']);
  for (const a of ['playground-park', 'suburban-garden', 'woodland-edge', 'car-park-verge'] as ArchetypeId[]) {
    it(`${a}#1: the last node lies within 3 BU of a POI of the object (after route snapping)`, () => {
      const w = report(a, 1).world, bu = w.bu;
      const far: string[] = [];
      let n = 0;
      for (const ob of w.objects) {
        if (!ENDS_AT_POI.has(ob.templateId)) continue;
        const pois = w.pois.filter((p) => ob.poiIds.includes(p.id));
        for (const rid of ob.routeIds) {
          const route = w.climbRoutes.find((x) => x.id === rid)!;
          const e = route.points[route.points.length - 1];
          const d = Math.min(...pois.map((p) => Math.sqrt((p.pos.x - e.x) ** 2 + (p.pos.y - e.y) ** 2 + (p.pos.z - e.z) ** 2))) / bu;
          n++;
          if (!(d <= 3)) far.push(`${ob.templateId}#${ob.id}/${route.kind} ${d.toFixed(1)} BU`);
        }
      }
      expect(far).toEqual([]);
      void n;
    });
  }
});

describe('decor descriptors are deterministic (DET-8; not covered by the fingerprint)', () => {
  it('kitchen-door#1 generated twice gives identical decor, micro-connections and water bodies', () => {
    const p = paramsFor('kitchen-door', 1);
    const a = generateWorldReport(p).world, b = generateWorldReport(p).world;
    const ser = (w: WorldData) => JSON.stringify({ decor: w.decor, micro: w.micro, water: w.waterBodies, cav: w.cavities },
      (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v));
    expect(ser(a)).toBe(ser(b));
  });
});
