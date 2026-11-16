// Rain erosion of mounds (GDD 03 §1.4, T2): for each game hour with rain intensity I > 0.2 at the mound, one
// relaxation pass over the whole grid at the repose angle minus 8 deg x I. Volume is conserved (material only moves
// between usable cells; kept-clear cells and the crater cap of moundRelax.ts are respected), so mounds slump,
// spread and the crater rim that protects the entrance against rain wears down.

import type { Mound, Sim } from '@/sim/types';
import { EROSION_DEG_PER_I, EROSION_MIN_I } from '@/sim/balance/weather';
import { moundMask, usableCell } from '../moundRelax';
import { publishMound } from '../mounds';
import { reposeDeg } from '../substrate';
import { intensityAt } from './inflow';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DD = DX.map((x, i) => Math.hypot(x, DZ[i]));

/** One erosion pass over a mound at intensity I; returns the height moved, mm (summed transfers). */
export function erodeMound(sim: Sim, m: Mound, intensity: number): number {
  if (intensity <= EROSION_MIN_I) return 0;
  const mask = moundMask(sim, m);
  const n = m.n, h = m.h, base = m.base;
  const angle = Math.max(1, reposeDeg(m.material) - EROSION_DEG_PER_I * intensity);
  const tan = Math.tan((angle * Math.PI) / 180) * m.cell;
  let moved = 0;
  for (let i = 0; i < n * n; i++) {
    if (h[i] <= 0 || !usableCell(mask, i)) continue;
    const ix = i % n, iz = (i - ix) / n;
    const top = base[i] + h[i];
    for (let d = 0; d < DX.length; d++) {
      const jx = ix + DX[d], jz = iz + DZ[d];
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const j = jz * n + jx;
      if (!usableCell(mask, j)) continue;
      const excess = top - (base[j] + h[j]) - tan * DD[d];
      if (excess <= 0) continue;
      const t = Math.min(h[i], excess / 2, Math.max(0, mask.cap[j] - (base[j] + h[j])));
      if (t <= 0) continue;
      h[i] -= t;
      h[j] += t;
      moved += t;
      if (h[i] <= 0) break;
    }
  }
  if (moved > 0) publishMound(sim, m);
  return moved;
}

/** Hourly erosion of every mound by the rain at its centre. */
export function erodeMounds(sim: Sim): number {
  let moved = 0;
  for (const m of sim.state.worldDelta.mounds) {
    const I = intensityAt(sim, { x: m.centerX, y: 0, z: m.centerZ });
    moved += erodeMound(sim, m, I);
  }
  return moved;
}
