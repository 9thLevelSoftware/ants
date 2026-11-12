// worldgen-interior acceptance 4: every interior climb route (counter, table, chairs, bin, bowls, window sill,
// houseplant) is followed by a kernel walker waypoint to waypoint and back, for a sample of seeds; the table
// route passes the underside (walker upside down) before the edge onto the top.
import { describe, expect, it, vi } from 'vitest';
import { GLAZING_ID } from '../../catalog/interior/shell';
import { report } from '../../testing/fixtures';
import { follow, kernelFor, walkerAt } from './testkit';

vi.setConfig({ testTimeout: 600_000 });

const INTERIOR = new Set(['base-cabinet-run', 'kitchen-table', 'chair', 'pedal-bin', 'pet-bowl-pair', 'houseplant', GLAZING_ID]);

describe('interior climb routes, there and back with a kernel walker', () => {
  for (const [seed, species] of [[1, 'lasius-niger'], [2, 'lasius-niger'], [3, 'lasius-niger'], [4, 'lasius-niger'], [1, 'camponotus-pennsylvanicus']] as const) {
    it(`${species} seed ${seed}`, () => {
      const w = report('kitchen-door', seed, 'standard', species).world;
      const k = kernelFor(w);
      const objs = new Map(w.objects.map((o) => [o.id, o]));
      const routes = w.climbRoutes.filter((r) => INTERIOR.has(objs.get(r.objectId)?.templateId ?? ''));
      expect(routes.length).toBeGreaterThanOrEqual(6);
      const failed: string[] = [];
      const kinds = new Set<string>();
      for (const r of routes) {
        const name = `${objs.get(r.objectId)!.templateId}/${r.kind}#${r.id}`;
        const kin = walkerAt(k, r.points[0]);
        if (!kin) { failed.push(`${name}: no surface at the base`); continue; }
        const up = follow(k, kin, r.points.map((p) => ({ p })));
        const down = up.ok ? follow(k, kin, [...r.points].reverse().map((p) => ({ p }))) : null;
        if (!up.ok || !down?.ok) {
          const res = up.ok ? down! : up;
          failed.push(`${name}: ${up.ok ? 'back' : 'up'} stopped at node ${res.reached}/${r.points.length} fell=${res.fell} at ${JSON.stringify(res.pos)}`);
          continue;
        }
        kinds.add(r.kind);
        if (r.kind === 'leg-to-top' || r.kind === 'cabinet-to-counter') expect(up.minUpY, `${name} goes upside down`).toBeLessThan(-0.9);
      }
      expect(failed).toEqual([]);
      for (const k2 of ['cabinet-to-counter', 'leg-to-top', 'leg-to-seat', 'bin-to-rim']) expect(kinds.has(k2), k2).toBe(true);
    });
  }
});
