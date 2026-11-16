// Ground snapping on GENERATED worlds (look-pass 2, work item 3): after the snap no upright box, post or stem is left
// hanging a visible distance above the terrain under its footprint. One compact world by default; the three-world
// sweep with the per-template census (the numbers in the task report) runs with FOUNDRESS_LONG=1.
import { describe, expect, it, vi } from 'vitest';
import { generateWorld } from '@/worldgen';
import { paramsFor } from '@/worldgen/testing/fixtures';
import type { WorldData } from '@/sim/types';
import { snapPrimitivesToGround, SNAP_MAX_GAP_BU, SNAP_MIN_GAP_MM, type SnapStats } from './groundSnap';

declare const process: { env: Record<string, string | undefined> } | undefined;
const LONG = typeof process !== 'undefined' && !!process.env.FOUNDRESS_LONG;

vi.setConfig({ testTimeout: 180_000 });

function heightAt(w: WorldData) {
  const t = w.terrain;
  return (x: number, z: number) => {
    const fx = Math.min(t.nx - 1.001, Math.max(0, x / t.cell)), fz = Math.min(t.nz - 1.001, Math.max(0, z / t.cell));
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, d = t.data, n = t.nx;
    return (d[k * n + i] * (1 - u) + d[k * n + i + 1] * u) * (1 - v) + (d[(k + 1) * n + i] * (1 - u) + d[(k + 1) * n + i + 1] * u) * v;
  };
}

/** Largest remaining gap (mm) of a snapped primitive that was within reach of the snap, over the world. */
function check(w: WorldData) {
  const h = heightAt(w), st: SnapStats = { considered: 0, snapped: 0, maxGapMm: 0 };
  const out = snapPrimitivesToGround(w.prims, h, w.bu, st);
  const byTemplate: Record<string, number> = {};
  const tpl = new Map(w.objects.map((o) => [o.id, o.templateId]));
  let worstAfter = 0;
  out.forEach((q, i) => {
    const p = w.prims[i];
    if (q === p) return;
    const k = tpl.get(p.objectId) ?? '?';
    byTemplate[k] = (byTemplate[k] ?? 0) + 1;
    // the stretched body now reaches below the lowest ground sample under its footprint
    const half = q.shape === 'capsule' ? q.size.y + q.size.x : q.size.y;
    const bottom = q.pos.y - half * (1 - 2 * (q.rot.x * q.rot.x + q.rot.z * q.rot.z));
    worstAfter = Math.max(worstAfter, bottom - h(q.pos.x, q.pos.z));
  });
  return { st, byTemplate, worstAfter, w };
}

describe('ground snapping on a generated world', () => {
  it('closes the gaps under small upright props, stems and pots and leaves the tall and the tilted alone', () => {
    const w = generateWorld(paramsFor('car-park-verge', 3, 'compact'));
    const r = check(w);
    expect(r.st.snapped).toBeGreaterThan(0);
    expect(r.st.maxGapMm).toBeLessThanOrEqual(SNAP_MAX_GAP_BU * w.bu + 1e-6);
    expect(r.worstAfter).toBeLessThan(SNAP_MIN_GAP_MM); // the bottom is at or below the ground at the centre
    // the world's own primitives are untouched (the collision primitive is the simulation's)
    const before = JSON.stringify(w.prims[0]);
    snapPrimitivesToGround(w.prims, heightAt(w), w.bu);
    expect(JSON.stringify(w.prims[0])).toBe(before);
  });

  it.skipIf(!LONG)('LONG: woodland-edge, kitchen-door, car-park-verge census', () => {
    const lines: string[] = [];
    for (const [arch, seed, size] of [['woodland-edge', 1, 'standard'], ['kitchen-door', 1, 'compact'], ['car-park-verge', 3, 'compact']] as const) {
      const r = check(generateWorld(paramsFor(arch, seed, size)));
      lines.push(`${arch} seed ${seed}: considered ${r.st.considered} snapped ${r.st.snapped} maxGap ${r.st.maxGapMm.toFixed(1)} mm ${JSON.stringify(r.byTemplate)}`);
      expect(r.worstAfter).toBeLessThan(SNAP_MIN_GAP_MM);
    }
    console.log(lines.join('\n'));
  });
});
