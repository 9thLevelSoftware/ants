// Acceptance 7: the kernel builds from every generated world, a surface walker crosses the map along the nav grid,
// and a new game starts on each world (pre-carves applied, queen placed on the surface).
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { createKernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerStep } from '@/sim/locomotion/walker';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import type { WorldData } from '@/sim/types';
import { report, T1_ARCHETYPES } from './testing/fixtures';
import { cellAt, navDistances } from './validate/graph';
import { walkable } from './maps/nav';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 120_000 });

function navCtx(w: WorldData) {
  return { dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu }, world: w } as unknown as Parameters<typeof navDistances>[0];
}

/** Waypoints (cell centres) from `from` to `to` by steepest descent of the path distance to `to`. */
function navPath(w: WorldData, from: number, to: number): number[] | null {
  const ctx = navCtx(w);
  const d = navDistances(ctx, [to]);
  if (!(d[from] < Infinity)) return null;
  const n = w.nav.cls.nx, out = [from];
  let c = from;
  while (c !== to && out.length < 4 * n) {
    let best = c;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const x = (c % n) + di, z = Math.floor(c / n) + dk;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const j = z * n + x;
      if (d[j] < d[best]) best = j;
    }
    if (best === c) return null;
    out.push((c = best));
  }
  return out;
}

describe('kernel from generated worlds', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: kernel builds; a walker crosses the map along a nav path`, () => {
      const w = report(a, 2).world;
      const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] });
      expect(k.field.sampleXYZ(w.size / 2, (k.field.height(w.size / 2, w.size / 2)) + 10 * w.bu, w.size / 2)).toBeGreaterThan(0);
      const n = w.nav.cls.nx, cell = w.nav.cls.cell;
      // west -> east (or the longest walkable span): first and last walkable cells of the start's row
      const startCell = cellAt(navCtx(w), w.queenStart.pos.x, w.queenStart.pos.z);
      const row = Math.floor(startCell / n);
      const cols = [...Array(n).keys()].filter((i) => walkable(w.nav.cls.data[row * n + i]));
      const from = row * n + cols[0], to = row * n + cols[cols.length - 1];
      const path = navPath(w, from, to);
      expect(path, 'nav path').not.toBeNull();
      const kin = createWalkerKin(k.walker.footOffset);
      const centre = (c: number): Vec3 => ({ x: ((c % n) + 0.5) * cell, y: 0, z: (Math.floor(c / n) + 0.5) * cell });
      const p0 = centre(from);
      expect(walkerPlace(k.field, kin, { x: p0.x, y: k.field.height(p0.x, p0.z) + 20 * w.bu, z: p0.z }, {}, k.walker)).toBe(true);
      const speed = 60 * w.bu, dt = 0.1;
      let wp = 0, steps = 0;
      const dir: Vec3 = { x: 0, y: 0, z: 0 };
      while (wp < path!.length && steps < 40_000) {
        const t = centre(path![wp]);
        const dx = t.x - kin.pos.x, dz = t.z - kin.pos.z, l = Math.sqrt(dx * dx + dz * dz);
        if (l < 0.6 * cell) { wp++; continue; }
        dir.x = dx / l; dir.y = 0; dir.z = dz / l;
        walkerStep(k.field, kin, dir, speed, dt, k.walker);
        if (kin.medium === 'air') walkerStep(k.field, kin, null, 0, dt, k.walker);
        steps++;
        expect(Number.isFinite(kin.pos.x) && Number.isFinite(kin.pos.y)).toBe(true);
      }
      const end = centre(to);
      expect(Math.hypot(kin.pos.x - end.x, kin.pos.z - end.z), `${a} walker end`).toBeLessThan(cell);
      expect(Math.abs(end.x - p0.x)).toBeGreaterThan(0.5 * w.size);
    }, 120_000);

    it(`${a}: a new game starts on the world (queen on the surface)`, () => {
      const w = report(a, 2).world;
      const cfg = defaultGameConfig('lasius-niger', w.params.seed, 'naturalist');
      const { state } = createNewGame({ ...cfg, world: w.params }, w);
      const queen = state.ants.find((x) => x.caste === 'queen')!;
      expect(queen).toBeDefined();
      expect(Math.hypot(queen.pos.x - w.queenStart.pos.x, queen.pos.z - w.queenStart.pos.z)).toBeLessThan(2 * w.bu);
    }, 60_000);
  }
});
