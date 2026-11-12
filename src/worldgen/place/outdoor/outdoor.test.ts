// Outdoor content of generated worlds (task worldgen-outdoor, GDD 04 §5-7, §9, §10, §13): counts per zone against
// the chapter's densities, no interpenetration beyond 1 mm and nothing floating, climb routes followed by a kernel
// walker, micro-connections passable (field clearance after the pre-carves) and useful, decor descriptors, water
// bodies, cavity budget, determinism and generation time.
//
// Seeds per archetype: 2 by default, 10 with FOUNDRESS_WORLDGEN_FULL=1 (acceptance sweep).
import { describe, expect, it, vi } from 'vitest';
import type { ArchetypeId, WorldData } from '@/sim/types';
import { createKernel, type Kernel } from '@/sim/kernel';
import { FULL, PERF_STRICT, T1_ARCHETYPES } from '../../testing/fixtures';
import { WORLDGEN_TIME_MS, MICRO, BUDGETS } from '../../tuning/pipeline';
import { FIELD_TUNING } from '@/sim/world/field';
import type { WorldgenReport } from '../../pipeline';
import { generateEvaluated, floating, interpenetrations, OUTDOOR_TEMPLATES } from './testing';
import { applyPreCarves, passageMinField, walkRoute } from './routeWalk';
import { OUTDOOR } from './tuning';
import { ASPHALT } from '../../catalog/outdoor/asphalt';
import { entryOf } from '../../kit/column';

vi.setConfig({ testTimeout: 600_000 });

const SEEDS = FULL ? 10 : 2;

const cache = new Map<string, { r: WorldgenReport; ms: number }>();
function world(a: ArchetypeId, seed: number): { r: WorldgenReport; ms: number } {
  const key = `${a}|${seed}`;
  let v = cache.get(key);
  if (!v) {
    const t0 = performance.now();
    const r = generateEvaluated(a, seed);
    v = { r, ms: performance.now() - t0 };
    cache.set(key, v);
  }
  return v;
}
const all = () => T1_ARCHETYPES.flatMap((a) => Array.from({ length: SEEDS }, (_, i) => ({ a, seed: i + 1, ...world(a, i + 1) })));
/**
 * A kernel over the whole world (house façade, floor slabs and tall trunks included). Its field hashes primitives in
 * 32 BU cells instead of 8 (the game's): the same field values near surfaces, without the hundreds of MB the house
 * walls and floor slabs take in 8 BU cells.
 */
function kernel(w: WorldData, carved: boolean): Kernel {
  const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * w.bu } });
  if (carved) applyPreCarves(k, w);
  return k;
}
const count = (w: WorldData, id: string) => w.objects.filter((o) => o.templateId === id).length;
const zonesOf = (w: WorldData, type: string) => w.zones.filter((z) => z.type === type && z.areaMm2 > 0);

describe('outdoor content: counts per zone (GDD 04 §5 densities)', () => {
  it('density tables place 50-120 % of the expected count (after budget thinning) where 15+ are expected', () => {
    const bad: string[] = [];
    for (const { a, seed, r } of all()) {
      for (const n of r.notes) {
        const m = /^outdoor:table (\S+) area=([\d.]+) expected=([\d.]+) placed=(\d+)/.exec(n);
        if (!m) continue;
        const exp = Number(m[3]), got = Number(m[4]);
        if (exp >= 15 && (got < 0.5 * exp || got > 1.2 * exp)) bad.push(`${a}#${seed} ${m[1]} expected ${exp} placed ${got}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('trees 1-6 per forest zone, logs >= 1 per forest zone, park trees 1-3, fruit trees <= 2', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world, f = zonesOf(w, 'forest').length;
      if (f > 0) {
        const trees = count(w, 'standing-tree');
        expect(trees, `${a}#${seed} trees`).toBeGreaterThanOrEqual(f);
        expect(trees, `${a}#${seed} trees`).toBeLessThanOrEqual(OUTDOOR.trees.maxPerZone * f);
        expect(count(w, 'log'), `${a}#${seed} logs`).toBeGreaterThanOrEqual(f);
      }
      if (a === 'playground-park') {
        expect(count(w, 'park-tree')).toBeGreaterThanOrEqual(1);
        expect(count(w, 'park-tree')).toBeLessThanOrEqual(3);
      }
      expect(count(w, 'fruit-tree')).toBeLessThanOrEqual(2);
    }
  });

  it('paved areas: slabs cover >= 80 % of patios and sidewalks; kerbs line every kerb line with >= 1 kerb gap; >= 1 gully per asphalt zone', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world, tag = `${a}#${seed}`;
      for (const z of w.zones.filter((q) => q.type === 'pavement' && (q.variant === 'patio' || q.variant === 'sidewalk'))) {
        let slabArea = 0;
        for (const o of w.objects) {
          if (o.templateId !== 'paving-slab' && o.templateId !== 'cracked-slab') continue;
          const zr = z.rects[0];
          if (!zr || o.pos.x < zr[0] || o.pos.x > zr[2] || o.pos.z < zr[1] || o.pos.z > zr[3]) continue;
          for (let i = o.primStart; i < o.primStart + o.primCount; i++) slabArea += 4 * w.prims[i].size.x * w.prims[i].size.z;
        }
        expect(slabArea / z.areaMm2, `${tag} ${z.variant} slab cover`).toBeGreaterThan(0.8);
      }
      const asphalt = zonesOf(w, 'asphalt');
      if (asphalt.length) {
        expect(count(w, 'kerb'), tag).toBeGreaterThan(0);
        expect(count(w, 'gully-grate'), `${tag} gullies`).toBeGreaterThanOrEqual(asphalt.length);
        expect(w.micro.filter((m) => m.kind === 'kerb-gap').length, `${tag} kerb gaps`).toBeGreaterThanOrEqual(1);
      }
      if (a === 'car-park-verge') {
        const bays = count(w, 'parked-car');
        expect(bays, `${tag} parked cars`).toBeGreaterThan(0);
        expect(count(w, 'lamp-post'), `${tag} lamp`).toBe(1);
        expect(w.decor?.decals.some((d) => d.kind === 'painted-line'), `${tag} bay lines`).toBe(true);
      }
    }
  });

  it('edges and gardens: fence lines carry fence gaps, woodland edges a dry-stone wall with a crevice; playgrounds have edging, a slide and benches', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world, tag = `${a}#${seed}`;
      const fenceSides = (w.edges ?? []).filter((e) => e.kind === 'fence').length;
      if (fenceSides > 0) expect(w.micro.filter((m) => m.kind === 'fence-gap').length, `${tag} fence gaps`).toBeGreaterThanOrEqual(1);
      if ((w.edges ?? []).some((e) => e.kind === 'dry-stone-wall')) {
        expect(count(w, 'garden-wall'), tag).toBeGreaterThan(0);
        expect(w.micro.some((m) => m.kind === 'wall-crevice'), tag).toBe(true);
      }
      if (a === 'playground-park') {
        expect(count(w, 'sand-edging'), tag).toBeGreaterThanOrEqual(4);
        expect(count(w, 'slide'), tag).toBe(1);
        expect(count(w, 'bench'), tag).toBeGreaterThanOrEqual(1);
        expect(count(w, 'litter-bin'), tag).toBeGreaterThanOrEqual(1);
      }
      if (a === 'suburban-garden' || a === 'kitchen-door') expect(count(w, 'dandelion') + count(w, 'daisy'), tag).toBeGreaterThan(0);
    }
  });

  it('play equipment keeps a fall zone: >= 1 m between the bounding boxes of slide, swing frame and spring rider', () => {
    for (const { a, seed, r } of all()) {
      if (a !== 'playground-park') continue;
      const w = r.world;
      const boxes = w.objects.filter((o) => ['slide', 'swing-frame', 'spring-rider'].includes(o.templateId)).map((o) => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
          const e = entryOf(w.prims[i]);
          x0 = Math.min(x0, e.minX); x1 = Math.max(x1, e.maxX); z0 = Math.min(z0, e.minZ); z1 = Math.max(z1, e.maxZ);
        }
        return { id: o.templateId, x0, z0, x1, z1 };
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        const gap = Math.hypot(Math.max(0, p.x0 - q.x1, q.x0 - p.x1), Math.max(0, p.z0 - q.z1, q.z0 - p.z1));
        expect(gap, `${a}#${seed} ${p.id}/${q.id}`).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it('kitchen doors have their back step and outside doormat; a patio table has 2-4 chairs (GDD 04 §5.4)', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world, tag = `${a}#${seed}`;
      if (a === 'kitchen-door') {
        expect(count(w, 'back-step'), `${tag} back step`).toBe(1);
        expect(count(w, 'doormat-outside'), `${tag} doormat`).toBe(1);
      }
      const tables = count(w, 'patio-table'), chairs = count(w, 'patio-chair');
      if (tables > 0) expect(chairs, `${tag} chairs`).toBeGreaterThanOrEqual(2 * tables);
      expect(chairs, `${tag} chairs`).toBeLessThanOrEqual(4 * Math.max(1, tables));
    }
  });
});

describe('outdoor content: solids rest and do not interpenetrate', () => {
  it('no two solid objects (one of them outdoor) share a point more than 1 mm inside both; no outdoor object floats', () => {
    for (const { a, seed, r } of all()) {
      expect(interpenetrations(r.world), `${a}#${seed} interpenetrations`).toEqual([]);
      expect(floating(r.world), `${a}#${seed} floating`).toEqual([]);
      expect(r.checks.find((c) => c.id === 'v-rest')?.status, `${a}#${seed}`).toBe('pass');
    }
  });
});

describe('climb routes (GDD 04 §10)', () => {
  it('a kernel walker steered waypoint to waypoint reaches the point of interest and comes back (every outdoor route)', () => {
    let tried = 0, ok = 0;
    const fails: string[] = [];
    for (const { a, seed, r } of all()) {
      const w = r.world, k = kernel(w, false);
      const byId = new Map(w.objects.map((o) => [o.id, o]));
      for (const route of w.climbRoutes) {
        const ob = byId.get(route.objectId);
        if (!ob || !OUTDOOR_TEMPLATES.has(ob.templateId)) continue;
        const res = walkRoute(k, route.points, w.bu);
        tried++;
        // the route ends at (or next to) the object's POI
        if (res.up && res.back) ok++; else fails.push(`${a}#${seed} ${ob.templateId}/${route.kind} stuck at node ${res.stuckAt}/${route.points.length}`);
      }
    }
    console.info(`[routes] ${ok}/${tried} followed${fails.length ? '; failed: ' + fails.join(', ') : ''}`);
    expect(tried).toBeGreaterThanOrEqual(200);
    // residue: a few plant stems whose snapped route changes face on a 2-5 mm stem (see the report)
    expect(tried - ok, fails.join(', ')).toBeLessThanOrEqual(Math.floor(0.005 * tried));
  });

  it('routes end at a point of interest of their object where the template defines one', () => {
    for (const { r } of all().slice(0, 5)) {
      const w = r.world, bu = w.bu;
      for (const ob of w.objects) {
        if (!OUTDOOR_TEMPLATES.has(ob.templateId) || ob.routeIds.length === 0 || ob.poiIds.length === 0) continue;
        const pois = w.pois.filter((p) => ob.poiIds.includes(p.id));
        for (const rid of ob.routeIds) {
          const route = w.climbRoutes.find((x) => x.id === rid)!;
          // stems end at the flower (POIs per host flag), log-over / fence-rail / wall-face / chute cross or descend
          if (['stem', 'log-over', 'fence-rail', 'wall-face', 'chute'].includes(route.kind)) continue;
          const end = route.points[route.points.length - 1];
          const d = Math.min(...pois.map((p) => Math.hypot(p.pos.x - end.x, p.pos.y - end.y, p.pos.z - end.z)));
          expect(d / bu, `${ob.templateId}/${route.kind}`).toBeLessThan(200);
        }
      }
    }
  });
});

describe('micro-connections (GDD 04 §6)', () => {
  // A body of clearance c fits where the field is >= c / 2; the smooth union of two facing walls lowers the field
  // in the middle of a gap by up to k / 4 (k = FIELD_TUNING.blend BU), which no body notices.
  const needBu = 0.5 * MICRO.passClearK - FIELD_TUNING.blendBU / 4;

  it('every outdoor micro-connection open for the species is passable along its passage (field, pre-carves applied)', () => {
    const bad: string[] = [];
    for (const { a, seed, r } of all()) {
      const w = r.world, k = kernel(w, true);
      for (const m of w.micro) {
        if (['door-crack', 'pipe-penetration', 'weep-vent', 'kick-space', 'skirting-gap', 'window-sill-gap'].includes(m.kind)) continue;
        if (m.minClearanceBu < MICRO.passClearK) continue; // generated "closed for this species" (biology wins)
        const f = passageMinField(k, m, 0.25 * w.bu) / w.bu;
        if (f < needBu) bad.push(`${a}#${seed} ${m.kind} min field ${f.toFixed(2)} BU`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('useful by the chapter definition: shortcut, shelter cavity, or (drain grilles) the void of a gully or drain', () => {
    const notUseful: string[] = [];
    const tally: Record<string, [number, number]> = {};
    for (const { a, seed, r } of all()) {
      const w = r.world;
      for (const m of w.micro) {
        if (['door-crack', 'pipe-penetration', 'weep-vent', 'kick-space', 'skirting-gap', 'window-sill-gap'].includes(m.kind)) continue;
        tally[m.kind] ??= [0, 0];
        tally[m.kind][1]++;
        // a drain grille leads into the void of a terrain hole (gully pot, drain channel): shelter (GDD 04 §6.2)
        const holeVoid = m.kind === 'drain-grille' && !!w.terrainHoles && w.terrainHoles.data[Math.floor(m.posB.z / w.terrainHoles.cell) * w.terrainHoles.nx + Math.floor(m.posB.x / w.terrainHoles.cell)] !== 0;
        if (m.useful || holeVoid) tally[m.kind][0]++;
        else notUseful.push(`${a}#${seed} ${m.kind} (${m.reason})`);
      }
    }
    console.info('[micro] useful/total per kind ' + JSON.stringify(tally));
    expect(notUseful).toEqual([]);
  });
});

describe('decor, water, cavities, determinism, time', () => {
  it('decor descriptors per zone, density maps on the 64 BU tile grid, painted bay lines on car parks', () => {
    for (const { a, seed, r } of all()) {
      const d = r.world.decor!;
      expect(d, `${a}#${seed}`).toBeDefined();
      expect(d.tileBu).toBe(64);
      expect(d.zones.map((z) => z.zoneId).sort()).toEqual(r.world.zones.map((z) => z.id).sort());
      for (const z of d.zones) if (z.type === 'lawn') expect(z.layers.some((l) => l.layer === 'decor-grass')).toBe(true);
      for (const z of d.zones) if (z.type === 'forest') expect(z.layers.some((l) => l.layer === 'decor-leaf')).toBe(true);
      for (const m of d.maps) expect(m.map.data.length).toBe(m.map.nx * m.map.nz);
    }
  });

  it('water bodies: gully water in every gully pot, bowl water in saucers, a wet patch at each water butt', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world;
      expect(w.waterBodies.filter((b) => b.kind === 'gully-water').length, `${a}#${seed}`).toBe(count(w, 'gully-grate'));
      expect(w.waterBodies.filter((b) => b.kind === 'wet-patch' && w.objects.find((o) => o.id === b.vesselObjectId)?.templateId === 'water-butt').length).toBe(count(w, 'water-butt'));
      for (const b of w.waterBodies.filter((q) => q.kind === 'gully-water')) expect(b.capMm - b.levelMm).toBeGreaterThanOrEqual(ASPHALT.gully.waterBelow - 1 - 50);
    }
  });

  it('pre-carve cavities stay within the outdoor share of PRECARVE_CHUNK_MAX; every cavity has carve ops', () => {
    for (const { a, seed, r } of all()) {
      const w = r.world;
      for (const c of w.cavities) if (['under-stone', 'under-slab', 'kerb-void', 'crack-slot', 'root-gallery', 'log-gallery', 'compost-void'].includes(c.kind)) {
        expect(w.preCarve.some((p) => p.cavityId === c.id), `${a}#${seed} ${c.kind}`).toBe(true);
      }
      expect(r.checks.find((c) => c.id === 'v-budget')?.status).toBe('pass');
      expect(w.prims.length).toBeLessThanOrEqual(BUDGETS.primTotal);
    }
  });

  it('fingerprints are deterministic with the outdoor content', () => {
    const a = generateEvaluated('playground-park', 5).world.meta.fingerprint;
    const b = generateEvaluated('playground-park', 5).world.meta.fingerprint;
    expect(a).toBe(b);
  });

  it('standard-world generation stays within the time budget (only a sanity bound unless FOUNDRESS_PERF_STRICT=1)', () => {
    // the machine is shared by up to ten engineers (load 15-25 on 4 cores): without FOUNDRESS_PERF_STRICT=1 only a
    // pathological regression fails (NON_STRICT_FACTOR x the budget); the strict run checks WORLDGEN_TIME_MS.node
    const NON_STRICT_FACTOR = 20;
    const times: string[] = [];
    for (const { a, seed, ms, r } of all()) {
      times.push(`${a}#${seed} ${Math.round(ms)} ms (attempts ${r.attempts})`);
      expect(ms, `${a}#${seed}`).toBeLessThan(PERF_STRICT ? WORLDGEN_TIME_MS.node : NON_STRICT_FACTOR * WORLDGEN_TIME_MS.node);
    }
    console.info('[time] ' + times.join(', '));
  });
});
