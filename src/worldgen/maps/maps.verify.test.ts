// Reviewer tests (worldgen-terrain): derived maps after later steps, the nav grid at the back door, and GDD 04
// App. E 2, 5, 25 (partial). Tests marked FAILS demonstrate open defects and stay red until fixed.
import { describe, expect, it, vi } from 'vitest';
import { NAV_CLASSES } from '@/sim/types';
import { generateWorldReport } from '../pipeline';
import { paramsFor, report } from '../testing/fixtures';
import type { WorldgenModule } from '../kit/registry';
import type { GenContext } from '../kit/context';
import { addFoodAnchor } from '../kit/records';
import { cellAt, navDistances } from '../validate/graph';
import { evaluateMicro, usefulInteriorAccess } from '../validate/micro';
import { SEASONS } from '@/sim/types';
import { createKernel } from '@/sim/kernel';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { spherePasses } from '../testing/walker';

vi.setConfig({ testTimeout: 300_000 });

describe('derived maps see content placed after step 6', () => {
  // FAILS: specialFactor('messor-barbarus') counts seed anchors, but anchors are only placed in step 7 and the
  // pipeline re-derives after step 9 only when primitives or terrain holes were added; with no rival sites
  // applyRivalFactor returns early, so fSpecial stays 0 for Messor whatever the resources step placed.
  it('Messor suitability rises next to seed anchors placed by a resources placer', () => {
    const base = report('playground-park', 2, 'compact', 'messor-barbarus').world;
    const q0 = base.maps.suitability['messor-barbarus'].data;
    const n = base.nav.cls.nx, cell = base.nav.cls.cell;
    // the best non-vetoed open cell (open sky on a lawn) away from the edge
    let best = -1;
    for (let c = 0; c < q0.length; c++) {
      const i = c % n, k = Math.floor(c / n);
      if (i < 20 || k < 20 || i > n - 20 || k > n - 20) continue;
      if (q0[c] > 0 && q0[c] < 230 && (best < 0 || q0[c] > q0[best])) best = c;
    }
    expect(best).toBeGreaterThanOrEqual(0);
    const x = ((best % n) + 0.5) * cell, z = (Math.floor(best / n) + 0.5) * cell;
    const seeds: WorldgenModule = {
      placers: [{
        id: 'verify/seed-anchors', step: 'resources', run: (ctx) => {
          for (let s = 0; s < 2; s++) {
            addFoodAnchor(ctx, { kind: 'seed', pos: { x: x + s, y: 0, z }, up: { x: 0, y: 1, z: 0 }, hostObjectId: -1, seasonMask: (1 << SEASONS.length) - 1, initialState: 'full' });
          }
        },
      }],
    };
    const w = generateWorldReport(paramsFor('playground-park', 2, 'compact', 'messor-barbarus'), { modules: [seeds] }).world;
    expect(w.terrain.data).toEqual(base.terrain.data); // same attempt, same world apart from the anchors
    expect(w.placements.foodAnchors.length).toBe(2);
    // weight special 0.10 x fSpecial 1 (two anchors x 0.5) => about +25 on the byte map
    expect(w.maps.suitability['messor-barbarus'].data[best], `cell ${best}`).toBeGreaterThan(q0[best] + 10);
  });
});

/** Runs `probe` on the finished context (a start-step placer after the default start pose). */
function withContext<T>(a: Parameters<typeof paramsFor>[0], seed: number, size: Parameters<typeof paramsFor>[2], probe: (ctx: GenContext) => T): T {
  let out: T | undefined;
  const mod: WorldgenModule = { placers: [{ id: 'verify/probe', step: 'start', order: 1000, run: (ctx) => { out = probe(ctx); } }] };
  generateWorldReport(paramsFor(a, seed, size), { modules: [mod] });
  return out as T;
}

describe('back door: nav grid and the door-crack micro-connection (GDD 04 §6.3, §11, App. E 4)', () => {
  // FAILS (seed 1): the closed door leaf is 3-10 mm above the sill, which is more than the 0.45 BU contact
  // clearance, so columns.ts treats it as an overhead and the cells under the leaf stay walkable. The nav grid
  // then walks straight through the closed door; the door-crack portal is redundant, and evaluateMicro marks it
  // "no gain" (useful = false) on some seeds and "shortcut" on others. Once any placer provides 'micro',
  // v-micro needs a useful interior access on kitchen-door maps and fails all 8 attempts on such seeds.
  it('every kitchen-door map has a useful interior access, and only through the door-crack portal', () => {
    for (const seed of [1, 2, 3]) {
      const r = withContext('kitchen-door', seed, 'compact', (ctx) => {
        evaluateMicro(ctx);
        const door = ctx.world.micro.find((m) => m.kind === 'door-crack')!;
        const outside = cellAt(ctx, door.posA.x, door.posA.z), inside = cellAt(ctx, door.posB.x, door.posB.z);
        const d = navDistances(ctx, [outside], { skipMicro: door.id });
        return { useful: door.useful, reason: door.reason, access: usefulInteriorAccess(ctx), withoutPortal: d[inside] };
      });
      expect(r.access, `seed ${seed}: door-crack ${r.reason}`).toBeGreaterThanOrEqual(1);
      expect(r.withoutPortal, `seed ${seed}: interior reached without the portal`).toBe(Infinity);
    }
  });
});

describe('GDD 04 App. E checks at this level (regression)', () => {
  it('E2: Camponotus standard -> L = 36000 mm, 1001 x 1001 height samples, 250 x 250 nav cells', () => {
    const w = report('woodland-edge', 1, 'standard', 'camponotus-pennsylvanicus').world;
    expect(w.size).toBe(36000);
    expect([w.terrain.nx, w.terrain.nz]).toEqual([1001, 1001]);
    expect([w.nav.cls.nx, w.nav.cls.nz]).toEqual([250, 250]);
  });

  // E5 reads: "the door-crack gap is >= 5.4 mm (0.6 BU) or the door is sealed and a pipe penetration with
  // clearance >= 0.6 BU exists". The weather-strip variant (p 0.25) closes the crack (gap 0) and forces a pipe
  // penetration (GDD 04 §6.2), so the check accepts either and then proves the passage physically: a 0.6 BU sphere
  // travels through the field from one mouth to the other (pre-carves applied as at New Game).
  it('E5: Camponotus kitchen-door: door crack >= 5.4 mm (0.6 BU), or a sealed door and a pipe penetration >= 0.6 BU', () => {
    const minMm = 0.6 * 9;
    let sealed = 0;
    for (const seed of [1, 2, 3, 4]) {
      const w = report('kitchen-door', seed, 'standard', 'camponotus-pennsylvanicus').world;
      expect(w.bu).toBe(9);
      const door = w.micro.find((m) => m.kind === 'door-crack');
      expect(door, `seed ${seed}`).toBeDefined();
      let way = door!;
      if (door!.gapMm >= minMm - 1e-9) expect(door!.minClearanceBu).toBeGreaterThanOrEqual(0.6 - 1e-9);
      else {
        // weather strip: closed for every species, and a pipe penetration wide enough for this one
        sealed++;
        expect(door!.gapMm, `seed ${seed}: a crack under 5.4 mm must be the sealed variant`).toBe(0);
        expect(door!.useful).toBe(false);
        const pipe = w.micro.filter((m) => m.kind === 'pipe-penetration' && m.minClearanceBu >= 0.6 - 1e-9).sort((x, y) => x.id - y.id)[0];
        expect(pipe, `seed ${seed}: pipe penetration >= 0.6 BU`).toBeDefined();
        expect(pipe.useful).toBe(true);
        way = pipe;
      }
      const { state } = createNewGame({ ...defaultGameConfig('camponotus-pennsylvanicus', w.params.seed, 'naturalist'), world: w.params }, w);
      const k = createKernel(w, state.worldDelta.carve);
      // the passage runs past its pipe (up the wall to the hole): include the nearest pipe's top in the search box
      const pipes = w.objects.filter((o) => o.templateId === 'service-pipe').map((o) => w.prims[o.primStart]);
      const mid = { x: (way.posA.x + way.posB.x) / 2, z: (way.posA.z + way.posB.z) / 2 };
      const near = way.kind === 'pipe-penetration' && pipes.length > 0
        ? pipes.reduce((p, q) => (Math.hypot(p.pos.x - mid.x, p.pos.z - mid.z) <= Math.hypot(q.pos.x - mid.x, q.pos.z - mid.z) ? p : q)) : null;
      const include = near ? [{ x: near.pos.x, y: near.pos.y + near.size.x + 2 * w.bu, z: near.pos.z }] : [];
      expect(spherePasses(k, way.posA, way.posB, minMm / 2, { include }), `seed ${seed}: ${way.kind} passes a 0.6 BU sphere`).toBe(true);
    }
    // seeds 1 and 4 roll the weather strip today: the sealed branch is exercised
    expect(sealed).toBeGreaterThan(0);
  });

  it('E25 (first clause): Messor/mediterranean static Q is 0 on every interior and paving cell', () => {
    const w = report('suburban-garden', 3, 'standard', 'messor-barbarus').world;
    expect(w.params.region).toBe('mediterranean');
    const q = w.maps.suitability['messor-barbarus'].data;
    const n = w.nav.cls.nx, sub = w.maps.zone.nx / n;
    let checked = 0;
    for (let c = 0; c < q.length; c++) {
      // nav cells whose four quadrant samples are all interior or pavement
      const i = c % n, k = Math.floor(c / n);
      let all = true;
      for (const [oi, ok] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
        const ti = Math.min(w.maps.zone.nx - 1, i * sub + Math.floor((oi * sub) / 4)), tk = Math.min(w.maps.zone.nx - 1, k * sub + Math.floor((ok * sub) / 4));
        const t = w.zones[w.maps.zone.data[tk * w.maps.zone.nx + ti]].type;
        if (t !== 'interior' && t !== 'pavement') all = false;
      }
      if (!all) continue;
      checked++;
      expect(q[c], `cell ${c}`).toBe(0);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('edge class covers exactly the soft margin and partial cells for every size of a non-Lasius species', () => {
    for (const size of ['compact', 'large'] as const) {
      const w = report('car-park-verge', 2, size, 'messor-barbarus').world;
      const edge = NAV_CLASSES.indexOf('edge'), m = 32 * w.bu, nav = w.nav.cls;
      for (let k = 0; k < nav.nz; k++) for (let i = 0; i < nav.nx; i++) {
        const x = (i + 0.5) * nav.cell, z = (k + 0.5) * nav.cell;
        const out = x < m || z < m || x > w.size - m || z > w.size - m || (i + 1) * nav.cell > w.size + 1e-6 || (k + 1) * nav.cell > w.size + 1e-6;
        expect(nav.data[k * nav.nx + i] === edge, `${size} cell ${i},${k}`).toBe(out);
      }
    }
  });
});
