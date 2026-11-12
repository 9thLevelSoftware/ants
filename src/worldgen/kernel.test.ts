// Acceptance 7: the kernel builds from every generated world, a surface walker crosses the map along the nav grid,
// and a new game starts on each world (pre-carves applied, queen placed on the surface).
import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
import { report, T1_ARCHETYPES } from './testing/fixtures';
import { crossPath, rowCrossing } from './testing/walker';
import { cellAt } from './validate/graph';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 300_000 });

declare const process: { env: Record<string, string | undefined> };
const LONG = process.env.FOUNDRESS_LONG === '1';

/**
 * A kernel walker (testing/walker.ts: aims at each waypoint's ground point, recovers by sidestepping, climbing,
 * backing off or letting go; never teleports) walks the nav path across the start's row, end to end.
 */
function crossesMap(a: ArchetypeId, seed: number): void {
  const w = report(a, seed).world;
  const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] });
  expect(k.field.sampleXYZ(w.size / 2, (k.field.height(w.size / 2, w.size / 2)) + 10 * w.bu, w.size / 2)).toBeGreaterThan(0);
  const ctx = { dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu }, world: w } as unknown as Parameters<typeof cellAt>[0];
  const path = rowCrossing(w, cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z));
  expect(path, `${a} #${seed}: nav path across the start's row`).not.toBeNull();
  const n = w.nav.cls.nx, cell = w.nav.cls.cell;
  expect(Math.abs((path![path!.length - 1] % n) - (path![0] % n)) * cell).toBeGreaterThan(0.5 * w.size);
  const r = crossPath(w, k, path!);
  expect(Number.isFinite(r.kin.pos.x) && Number.isFinite(r.kin.pos.y) && Number.isFinite(r.kin.pos.z)).toBe(true);
  expect(r.stuckAt, `${a} #${seed}: stuck after ${r.reached}/${path!.length} waypoints`).toBeNull();
  expect(r.endDist, `${a} #${seed} walker end`).toBeLessThan(cell);
}

describe('kernel from generated worlds', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: kernel builds; a walker crosses the map along a nav path`, () => crossesMap(a, 2));

    it(`${a}: a new game starts on the world (queen on the surface)`, () => {
      const w = report(a, 2).world;
      const cfg = defaultGameConfig('lasius-niger', w.params.seed, 'naturalist');
      const { state } = createNewGame({ ...cfg, world: w.params }, w);
      const queen = state.ants.find((x) => x.caste === 'queen')!;
      expect(queen).toBeDefined();
      expect(Math.hypot(queen.pos.x - w.queenStart.pos.x, queen.pos.z - w.queenStart.pos.z)).toBeLessThan(2 * w.bu);
    });
  }
});

describe.skipIf(!LONG)('walker crossings over more seeds (FOUNDRESS_LONG=1)', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: seeds 1, 3, 4`, () => { for (const s of [1, 3, 4]) crossesMap(a, s); }, 600_000);
  }
});
