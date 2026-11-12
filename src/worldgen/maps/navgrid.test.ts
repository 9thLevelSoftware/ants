// Coarse nav grid details found in review (GDD 04 §6.3, §11, §12.1): the closed back door blocks the grid so the
// door crack is the way in, steps onto non-climbable faces are blocked, the single-target distance query agrees
// with the full one, and the splatted fSpecial equals the per-cell definition.
import { describe, expect, it, vi } from 'vitest';
import { PrimFlag, type MaterialId, type Primitive, type SpeciesId } from '@/sim/types';
import { generateWorldReport } from '../pipeline';
import { paramsFor } from '../testing/fixtures';
import type { GenContext } from '../kit/context';
import type { WorldgenModule } from '../kit/registry';
import { placeObject } from '../kit/template';
import { cellAt, navDistances, navDistanceTo, snapWalkable } from '../validate/graph';
import { evaluateMicro, usefulInteriorAccess } from '../validate/micro';
import { specialFactor } from './special';
import { walkable } from './nav';
import { SUIT } from '../tuning/maps';

vi.setConfig({ testTimeout: 300_000 });

type Archetype = Parameters<typeof paramsFor>[0];

/** Generates a world with extra placers and runs `probe` on the finished context (after the start pose). */
function probeWorld<T>(a: Archetype, seed: number, sp: SpeciesId, extra: WorldgenModule['placers'], probe: (ctx: GenContext) => T): T {
  let out: T | undefined;
  const mod: WorldgenModule = { placers: [...(extra ?? []), { id: 'test/probe', step: 'start', order: 1000, run: (ctx) => { out = probe(ctx); } }] };
  generateWorldReport(paramsFor(a, seed, 'compact', sp), { modules: [mod] });
  return out as T;
}

describe('the closed back door', () => {
  it('blocks the nav grid; the door crack is the only way in and counts as useful interior access', () => {
    const cases: [number, SpeciesId][] = [[1, 'lasius-niger'], [2, 'lasius-niger'], [4, 'lasius-niger'], [5, 'lasius-niger'], [6, 'lasius-niger'], [1, 'camponotus-pennsylvanicus'], [2, 'messor-barbarus']];
    for (const [seed, sp] of cases) {
      const r = probeWorld('kitchen-door', seed, sp, [], (ctx) => {
        evaluateMicro(ctx);
        const door = ctx.world.micro.find((m) => m.kind === 'door-crack')!;
        const a = snapWalkable(ctx, cellAt(ctx, door.posA.x, door.posA.z)), b = snapWalkable(ctx, cellAt(ctx, door.posB.x, door.posB.z));
        return {
          reason: door.reason, useful: door.useful, access: usefulInteriorAccess(ctx),
          without: navDistanceTo(ctx, a, b, { skipMicro: door.id }), withPortal: navDistanceTo(ctx, a, b),
        };
      });
      const tag = `kitchen-door s${seed} ${sp}`;
      expect(r.useful, tag).toBe(true);
      expect(r.reason, tag).toBe('only path');
      expect(r.access, tag).toBeGreaterThanOrEqual(1);
      expect(r.without, tag).toBe(Infinity);
      expect(r.withPortal, tag).toBeLessThan(Infinity);
    }
  });
});

/** A flat block (h BU tall, below NAV_OVER_MAX) on open lawn near the map centre, placed in the props step. */
function blockPlacer(flags: number, material: MaterialId, hBu: number, at: { x: number; z: number }): NonNullable<WorldgenModule['placers']>[number] {
  return {
    id: 'test/block', step: 'props', run: (ctx) => {
      const h = hBu * ctx.dims.bu, half = 100 * ctx.dims.bu / 4;
      const id = placeObject(ctx, { id: 'test-block', prims: [{ shape: 'box', pos: { x: 0, y: h / 2, z: 0 }, size: { x: half, y: h / 2, z: half }, material, flags }] },
        { x: at.x, z: at.z, snap: true, tilt: false, collide: false, category: 'props' });
      if (id < 0) throw new Error('block not placed');
    },
  };
}

describe('steps onto a face (GDD 04 §11)', () => {
  it('are climbable onto a CLIMBABLE block and blocked onto a slippery or unflagged one', () => {
    const where = probeWorld('woodland-edge', 3, 'lasius-niger', [], (ctx) => {
      // an open lawn or forest cell near the centre, at least 300 mm from anything built
      const { navN, navCell } = ctx.dims;
      const cls = ctx.world.nav.cls.data;
      for (let r = 0; r < navN / 2; r++) for (let d = -r; d <= r; d++) for (const [i, k] of [[navN / 2 + d, navN / 2 - r], [navN / 2 + d, navN / 2 + r]]) {
        const c = Math.floor(k) * navN + Math.floor(i);
        let ok = true;
        for (let dk = -6; dk <= 6 && ok; dk++) for (let di = -6; di <= 6 && ok; di++) {
          const j = c + dk * navN + di;
          ok = j >= 0 && j < cls.length && walkable(cls[j]) && !ctx.layout.zones[ctx.layout.nav[j]].built;
        }
        if (ok) return { x: (Math.floor(i) + 0.5) * navCell, z: (Math.floor(k) + 0.5) * navCell };
      }
      throw new Error('no open spot');
    });
    const reach = (flags: number) => probeWorld('woodland-edge', 3, 'lasius-niger', [blockPlacer(flags, 'glass', 20, where)], (ctx) => {
      const centre = cellAt(ctx, where.x, where.z), outside = cellAt(ctx, where.x + 12 * ctx.dims.navCell, where.z);
      return { top: ctx.world.nav.groundY![centre] - ctx.world.nav.groundY![outside], d: navDistanceTo(ctx, outside, centre), back: navDistanceTo(ctx, centre, outside) };
    });
    const climbable = reach(PrimFlag.CLIMBABLE), slippery = reach(PrimFlag.CLIMBABLE | PrimFlag.SLIPPERY), plain = reach(0);
    expect(climbable.top).toBeGreaterThan(10 * 4); // the block really raises the ground (20 BU)
    expect(climbable.d).toBeLessThan(Infinity);
    expect(slippery.d).toBe(Infinity);
    expect(slippery.back).toBe(Infinity);
    expect(plain.d).toBe(Infinity);
  });
});

describe('distance queries and fSpecial', () => {
  it('navDistanceTo equals navDistances at the target (also with maxBu and skipped portals)', () => {
    probeWorld('kitchen-door', 3, 'lasius-niger', [], (ctx) => {
      const s = cellAt(ctx, ctx.world.queenStart.pos.x, ctx.world.queenStart.pos.z);
      const all = navDistances(ctx, [s]);
      const n = ctx.dims.navN;
      for (let t = 0; t < 40; t++) {
        const c = ((t * 7919) % (n * n));
        expect(navDistanceTo(ctx, s, c)).toBe(all[c]);
      }
      const door = ctx.world.micro.find((m) => m.kind === 'door-crack')!;
      const lim = navDistances(ctx, [s], { maxBu: 300, skipMicro: door.id });
      for (let c = 0; c < n * n; c += 97) if (lim[c] <= 300) expect(navDistanceTo(ctx, s, c, { maxBu: 300, skipMicro: door.id })).toBe(lim[c]);
    });
  });

  it('the splatted fSpecial equals the per-cell definition (Camponotus wood volume, Atta leaf count)', () => {
    probeWorld('woodland-edge', 2, 'lasius-niger', [], (ctx) => {
      const { navN, navCell, bu, size } = ctx.dims;
      const extra: Primitive[] = [];
      for (let i = 0; i < 60; i++) {
        const x = ((i * 0.61803) % 1) * size, z = ((i * 0.41421) % 1) * size;
        const material: MaterialId = i % 2 ? 'wood-decayed' : 'plant';
        extra.push({ id: 1e6 + i, shape: i % 3 ? 'cylinder' : 'box', pos: { x, y: 50, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 30 + i, y: 40, z: 25 }, round: 0, material, flags: 0, objectId: -1 });
      }
      ctx.world.prims.push(...extra);
      try {
        const camp = specialFactor(ctx, 'camponotus-pennsylvanicus'), atta = specialFactor(ctx, 'atta-texana');
        const need = SUIT.woodVolumeBu3 * bu ** 3, rw = SUIT.woodRadiusBu * bu, rl = SUIT.leafRadiusBu * bu;
        const vol = (p: Primitive) => (p.shape === 'box' ? 8 * p.size.x * p.size.y * p.size.z : Math.PI * p.size.x * p.size.x * 2 * p.size.y);
        for (let c = 0; c < navN * navN; c += 13) {
          const x = ((c % navN) + 0.5) * navCell, z = (Math.floor(c / navN) + 0.5) * navCell;
          let v = 0, leaves = 0;
          for (const p of ctx.world.prims) {
            const d2 = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2;
            if (p.material === 'wood-decayed' && d2 <= rw * rw) v += vol(p);
            if (p.material === 'plant' && d2 <= rl * rl) leaves++;
          }
          expect(camp(c)).toBeCloseTo(Math.min(1, v / need), 5);
          if (atta(c) > 0) expect(atta(c)).toBeCloseTo(Math.min(1, leaves / SUIT.leafPrimsFull), 5);
        }
      } finally {
        ctx.world.prims.length -= extra.length;
      }
    });
  });
});
