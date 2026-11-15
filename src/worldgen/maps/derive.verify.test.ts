// Reviewer tests (worldgen-fixes): the re-derivation cache (maps/index.ts keeps the geometric maps when
// geometrySignature is unchanged) must rebuild whenever a late step changes what those maps read, and the
// door crack that E5 accepts must really be 0.6 BU wide for Camponotus.
import { describe, expect, it, vi } from 'vitest';
import type { WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createKernel } from '@/sim/kernel';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { generateWorldReport } from '../pipeline';
import { discoveredModules, type WorldgenModule } from '../kit/registry';
import type { GenContext } from '../kit/context';
import { placeObject } from '../kit/template';
import { paramsFor, report } from '../testing/fixtures';
import { spherePasses } from '../testing/walker';
import { deriveMaps, mapState } from './index';

vi.setConfig({ testTimeout: 300_000 });

const grab = (w: WorldData) => [w.nav.cls.data, w.nav.cost.data, w.nav.groundY!, w.nav.flags!.data, w.maps.shade.data, w.maps.moisture.data,
  w.maps.floodRisk.data, w.maps.exposure.data, w.maps.shelter.data, w.maps.suitability[w.params.speciesId].data].map((x) => Array.from(x));

/** Runs `late` as a cavities-step placer, then compares the pipeline's re-derived maps with a full rebuild. */
function lateChange(late: (ctx: GenContext) => void): { kept: boolean; same: boolean } {
  let first: unknown = null, kept = true, same = false;
  const mod: WorldgenModule = { placers: [
    { id: 'verify/first', step: 'resources', order: -1e6, run: (ctx) => { first = mapState(ctx).col; } },
    { id: 'verify/late', step: 'cavities', order: 1e6, run: late },
    { id: 'verify/full', step: 'start', order: -1e6, run: (ctx) => {
      kept = mapState(ctx).col === first;
      const before = grab(ctx.world);
      deriveMaps(ctx, { full: true });
      same = JSON.stringify(grab(ctx.world)) === JSON.stringify(before);
    } },
  ] };
  generateWorldReport(paramsFor('car-park-verge', 2, 'compact'), { modules: [...modules(), mod] });
  return { kept, same };
}

describe('re-derivation cache invalidation (maps/index.ts, maps/state.ts)', () => {
  it('a primitive placed in step 9 rebuilds the geometric maps', () => {
    const r = lateChange((ctx) => {
      const id = placeObject(ctx, { id: 'verify-slab', tags: ['prop'], prims: [{ shape: 'box', pos: { x: 0, y: 30, z: 0 }, size: { x: 400, y: 30, z: 400 }, material: 'stone', flags: PrimFlag.CLIMBABLE }] },
        { x: ctx.dims.size / 2, z: ctx.dims.size / 2 });
      expect(id).toBeGreaterThanOrEqual(0);
    });
    expect(r.kept).toBe(false);
    expect(r.same).toBe(true);
  });

  it('a terrain height edit in step 9 rebuilds the geometric maps', () => {
    const r = lateChange((ctx) => {
      const t = ctx.world.terrain, mid = (t.nz >> 1) * t.nx + (t.nx >> 1);
      for (let d = -40; d <= 40; d++) t.data[mid + d] += 50;
    });
    expect(r.kept).toBe(false);
    expect(r.same).toBe(true);
  });

  it('a ground-paint edit in step 9 (surface material) rebuilds the geometric maps', () => {
    const r = lateChange((ctx) => {
      const g = ctx.world.ground.surface, mid = (g.nz >> 1) * g.nx + (g.nx >> 1);
      for (let d = 0; d < 200; d++) g.data[mid + d] = (g.data[mid + d] + 1) % 8;
    });
    expect(r.kept).toBe(false);
    expect(r.same).toBe(true);
  });
});

describe('E5: the door crack is physically 0.6 BU wide for Camponotus (not only 0.45 BU)', () => {
  // maps.verify.test.ts proves a 0.45 BU sphere passes and a gap + 1.5 mm sphere does not; E5 itself asks for a
  // 5.4 mm (0.6 BU) gap. A sphere of 5.2 mm diameter (0.2 mm lattice margin) must pass the door crack in the
  // unblended field on every seed where the crack is open.
  it('a 5.2 mm sphere passes every open door crack (kitchen-door seeds 3, 4)', () => {
    let open = 0;
    for (const seed of [3, 4]) {
      const w = report('kitchen-door', seed, 'standard', 'camponotus-pennsylvanicus').world;
      const door = w.micro.find((m) => m.kind === 'door-crack')!;
      if (door.gapMm === 0) continue;
      open++;
      expect(door.gapMm, `seed ${seed}`).toBeGreaterThanOrEqual(5.4 - 1e-9);
      const { state } = createNewGame({ ...defaultGameConfig('camponotus-pennsylvanicus', w.params.seed, 'naturalist'), world: w.params }, w);
      const k = createKernel(w, state.worldDelta.carve);
      expect(spherePasses(k, door.posA, door.posB, 2.6, { exact: true, step: 0.35, margin: 2 * w.bu, reach: 2 * w.bu }), `seed ${seed} gap ${door.gapMm}`).toBe(true);
    }
    expect(open).toBeGreaterThan(0);
  });
});

let cache: WorldgenModule[] | null = null;
function modules(): WorldgenModule[] {
  return (cache ??= discoveredModules());
}
