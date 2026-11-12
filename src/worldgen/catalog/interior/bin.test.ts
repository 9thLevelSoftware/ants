// The pedal bin's `bin-to-rim` route on its own, on a flat test floor: a kernel walker follows it there and back
// for every seam width (1-2 mm), both route sides and every species BU (GDD 04 §10; acceptance 4).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFork } from '@/core/rng';
import { materialCode, type ByteMap, type Primitive, type SpeciesId } from '@/sim/types';
import { createKernel } from '@/sim/kernel';
import { walkerParamsForBU } from '@/sim/locomotion/walkerParams';
import { speciesBuMm } from '../../params';
import { follow, walkerAt } from '../../place/interior/testkit';
import { PLACE } from '../../tuning/pipeline';
import { pedalBinTemplate } from './furniture';

/** A kernel on a flat loam floor at y = 0 carrying the given primitives (no generated world needed). */
function flatKernel(bu: number, prims: Primitive[]) {
  const size = 128 * bu, cell = 2 * bu, n = Math.ceil(size / cell);
  const map = (v: number): ByteMap => ({ cell, nx: n, nz: n, data: new Uint8Array(n * n).fill(v) });
  const terrain = { cell, nx: n + 1, nz: n + 1, data: new Float32Array((n + 1) * (n + 1)) };
  const ground = { surface: map(materialCode('loam')), crustMm: map(0), subsoil: map(materialCode('loam')) };
  return createKernel({ size, bu, terrain, ground, prims }, { voxel: bu / 2, keys: [], chunks: [], breaches: [] });
}

/** Template prims and route at (c, 0, c), the route resampled like the kit's addClimbRoute. */
function binWorld(species: SpeciesId, seed: number, side: 1 | -1) {
  const bu = speciesBuMm(species), foot = walkerParamsForBU(bu).footOffset;
  const t = pedalBinTemplate(rngFork(seed, 'bin'), foot, side);
  // the centre moves over the field's voxel grid from seed to seed (bu / 2 voxels)
  const c = 64 * bu + (seed % 4) * bu / 8;
  const prims: Primitive[] = t.prims.map((p, i) => ({
    id: i + 1, shape: p.shape, pos: { x: c + p.pos.x, y: p.pos.y, z: c + p.pos.z }, rot: p.rot ?? { x: 0, y: 0, z: 0, w: 1 },
    size: { ...p.size }, round: p.round ?? 0, material: p.material, flags: p.flags, objectId: -1,
  }));
  const raw = t.routes![0].points.map((p) => ({ x: c + p.x, y: p.y, z: c + p.z }));
  const pts: Vec3[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / (PLACE.routeNodeBu * bu)));
    for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return { k: flatKernel(bu, prims), pts };
}

describe('pedal-bin climb route on its own', () => {
  for (const species of ['lasius-niger', 'messor-barbarus', 'camponotus-pennsylvanicus'] as const) {
    it(`${species}: there and back for 60 seam/material draws on both sides`, () => {
      const failed: string[] = [];
      for (let seed = 1; seed <= 60; seed++) for (const side of [1, -1] as const) {
        const { k, pts } = binWorld(species, seed, side);
        const kin = walkerAt(k, pts[0]);
        if (!kin) { failed.push(`seed ${seed} side ${side}: no base`); continue; }
        const up = follow(k, kin, pts.map((p) => ({ p })));
        const down = up.ok ? follow(k, kin, [...pts].reverse().map((p) => ({ p }))) : null;
        if (!up.ok || !down?.ok) {
          const r = up.ok ? down! : up;
          failed.push(`seed ${seed} side ${side}: ${up.ok ? 'back' : 'up'} stopped at ${r.reached}/${pts.length} fell=${r.fell} y=${r.pos.y.toFixed(1)}`);
        }
      }
      expect(failed).toEqual([]);
    });
  }
});
