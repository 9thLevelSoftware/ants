// Reviewer's tests (architect task): the growth scenario measured where the implementer's checks do not look.
// (1) Soil between every pair of architect plan volumes, tunnels and connectors included (nestChecks only compares
// rooms with rooms), measured on the carved grid away from each plan's own anchor junction. (2) The GDD 03 §8.6
// growth reference volumes (tester reference) are logged for the report.

import { describe, expect, it } from 'vitest';
import { ANCHOR_CONNECTION_BU } from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { planG } from '../plans/geometry';
import { forPlanSamples } from '../plans/targets';
import { wallMin } from '../substrate';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { grow, testLog } from './architectTestKit';

/** Half a voxel of discretisation slack, BU (as nestChecks). */
const TOL_BU = 0.5;

describe('architect growth verify: spacing of every plan volume, tunnels included', () => {
  it.each([1, 4, 7])('seed %i: later plans keep WALL_MIN of soil to earlier plan volumes outside their junction', (seed) => {
    const volumes: Record<number, number> = {};
    const g = grow({
      seed, workers: 300,
      each: (sim, nest) => {
        const w = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker').length;
        for (const mark of [40, 150, 300]) if (w >= mark && volumes[mark] === undefined) volumes[mark] = nest.volumeOpen;
      },
    });
    const { sim, created } = g, bu = sim.world.bu, v = sim.carve.voxel;
    const wm = wallMin('loam') * bu, junction = ANCHOR_CONNECTION_BU * bu;
    const kinds = created.map((p) => p.spec.kind + (p.spec.chamberType ? `:${p.spec.chamberType}` : ''));
    testLog(true, `seed ${seed} plans ${JSON.stringify(kinds)} volume at 40/150/300 workers ${JSON.stringify(volumes)}`);
    // open samples of each plan's volume, as carved
    const samplesOf = (n: number): number[] => {
      const geo = created[n].geometry, out: number[] = [];
      if (!geo) return out;
      forPlanSamples(sim, geo, (i, j, k) => {
        if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN && planG(geo, i * v, j * v, k * v) > 0) out.push(packSample(i, j, k));
      });
      return out;
    };
    const sets = created.map((_, n) => new Set(samplesOf(n)));
    const reach = Math.ceil(wm / v) + 1;
    const thin: string[] = [];
    created.forEach((b, nb) => {
      const anchor = b.spec.anchor.pos;
      for (let na = 0; na < nb; na++) {
        const aa = created[na].spec.anchor.pos, own = sets[na];
        let worst = Infinity, at = '';
        for (const key of sets[nb]) {
          const i = sampleI(key), j = sampleJ(key), k = sampleK(key), x = i * v, y = j * v, z = k * v;
          if (Math.hypot(x - anchor.x, y - anchor.y, z - anchor.z) <= junction) continue; // b's own junction
          if (Math.hypot(x - aa.x, y - aa.y, z - aa.z) <= junction) continue; // a's junction
          for (let dk = -reach; dk <= reach; dk++) for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
            if (!own.has(packSample(i + di, j + dj, k + dk))) continue;
            const soil = Math.max(0, Math.hypot(di, dj, dk) * v - v);
            if (soil < worst) { worst = soil; at = `${(planG(created[nb].geometry!, x, y, z) / bu).toFixed(1)}`; }
          }
        }
        if (worst < wm - TOL_BU * bu) thin.push(`${kinds[na]}#${na}-${kinds[nb]}#${nb} soil ${(worst / bu).toFixed(2)} BU (depth in b ${at} BU)`);
      }
    });
    expect(thin).toEqual([]);
  }, 300_000);
});
