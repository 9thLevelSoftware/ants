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
 * A kernel walker (testing/walker.ts: walks at the AI's 12 BU/s, aims at each waypoint's ground point, climbs the
 * game's stuck ladder with its 2.5 s window, and where the game would relocate tries a climb and a let-go instead;
 * never teleports) walks the nav path across the start's row, end to end, each waypoint passed in 3D.
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
  expect(r.stuckAt, `${a} #${seed}: stuck after ${r.reached}/${r.points.length} points (${r.episodes} episodes, ${r.extras} beyond the game's ladder)`).toBeNull();
  expect(r.endDist, `${a} #${seed} walker end`).toBeLessThan(cell);
  // loco-fix3: with the game's ladder only (its edge gates included), never the test walker's climb-over pass
  expect(r.overs, `${a} #${seed}: climb-over passes`).toBe(0);
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

// loco-fix3: suburban-garden #4 (a nav cell open only through the strip under a raised gravel board at a fence end)
// now crosses through the game's edge gate, playground-park #3 without the climb-over pass. Two crossings fail on a
// world defect (AC3 of loco-fix3: named with the place and the reason, and the validation rule that would reject the
// world). They are expected to fail (`it.fails`): when a world or walker fix makes one cross, its case turns red and
// must move back to the plain list.
const WORLD_DEFECTS: Record<string, string> = {
  // the row path runs into a closed toy bucket: the 4 BU column raster samples between its thin walls,
  // so the nav cells inside are 'open' ground at the bucket floor; the walker gets in over the rim and is stuck on
  // the inner face of the wall at (1610.9, 21.1, 1181.4) BU, a wall it cannot climb back over (no climbable inside).
  // Rule: a passable nav cell must be leavable: each of its passable side neighbours is reached by a straight
  // crossing or an edge gate (grid/gates.ts crossingFree / findGate) or by a climb of at most gateTallBU on a
  // CLIMBABLE face; cells that fail are blocked, and a world whose start row has none left is rejected.
  'playground-park#4': 'closed toy bucket, walls thinner than the column raster',
  // the last cell of the row lies on a dry-stone garden wall; its waypoint sits across a crevice between two stones,
  // (3911.8, 4.5, 1995.0) BU, a point no surface walker reaches. Rule: a waypoint (cell ground point) must lie on
  // the walkable surface: the column top at the cell centre must be within footOffset of the level set
  // (field.sample within 0.5 BU), else the cell's ground point moves to the nearest sampled point that is, or the
  // cell is blocked.
  'woodland-edge#3': 'end cell ground point inside a crevice of a dry-stone wall',
};

describe.skipIf(!LONG)('walker crossings over more seeds (FOUNDRESS_LONG=1)', () => {
  for (const a of T1_ARCHETYPES) for (const s of [1, 3, 4]) {
    const defect = WORLD_DEFECTS[`${a}#${s}`];
    if (defect) it.fails(`${a} #${s} (known world defect: ${defect})`, () => crossesMap(a, s), 600_000);
    else it(`${a} #${s}`, () => crossesMap(a, s), 600_000);
  }
});
