// The passage check of tamping (sim-fix-colony item 2): would a fill (spheres of one radius) split the open space
// around it? Two tests in a local box around the fill: plain connectivity of the open samples (nav connectivity:
// the nest-nav graph's corner rule makes it face connectivity) and connectivity of the ERODED open set (samples
// whose face neighbours are open too, `e` steps deep: a passage at least 2e + 1 samples across, GDD 03 §5.1
// walkable; e = 1, 3 samples = 1.5 BU, for the standard worker).
// The fill is safe when every pair of samples that stays open (stays eroded-open) and was connected inside the
// box before is still connected inside it after. Conservative: two parts joined only outside the box count as
// split, and then the fill is refused.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { TAMP_PASSAGE_MARGIN_BU } from '@/sim/balance/nest';
import { OPEN_MIN } from './carve/keys';

/** Openness a fill of spheres (centres, r) leaves at a sample: the brush ramp rule of the carve grid. */
function filledOpenness(old: number, x: number, y: number, z: number, centres: readonly Vec3[], r: number, ramp: number): number {
  let sd = Infinity;
  for (const c of centres) sd = Math.min(sd, Math.hypot(x - c.x, y - c.y, z - c.z) - r);
  let q = 0.5 - sd / ramp;
  q = q < 0 ? 0 : q > 1 ? 1 : q;
  return Math.min(old, 255 - Math.round(q * 255));
}

const FACE = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

/** Component labels (6-connected) of the cells with mask 1 in an nx x ny x nz box; -1 elsewhere. */
function label(mask: Uint8Array, nx: number, ny: number, nz: number): Int32Array {
  const lab = new Int32Array(mask.length).fill(-1), stack: number[] = [];
  let next = 0;
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] !== 1 || lab[s] !== -1) continue;
    lab[s] = next;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % nx, j = Math.floor(c / nx) % ny, k = Math.floor(c / (nx * ny));
      for (let f = 0; f < 18; f += 3) {
        const ni = i + FACE[f], nj = j + FACE[f + 1], nk = k + FACE[f + 2];
        if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue;
        const n = ni + nx * (nj + ny * nk);
        if (mask[n] === 1 && lab[n] === -1) { lab[n] = next; stack.push(n); }
      }
    }
    next++;
  }
  return lab;
}

/** Does every before-component keep its remaining cells in one after-component? */
function noSplit(before: Int32Array, after: Int32Array): boolean {
  const map = new Map<number, number>();
  for (let s = 0; s < after.length; s++) {
    if (after[s] < 0) continue;
    const b = before[s];
    const have = map.get(b);
    if (have === undefined) map.set(b, after[s]);
    else if (have !== after[s]) return false;
  }
  return true;
}

/**
 * Is a fill of these spheres safe for the passages around it (see the file comment)? `across`: samples across the
 * narrowest passage the species can walk (tamp.ts tampPassageSamples, default 3).
 */
export function fillKeepsPassages(sim: Sim, centres: readonly Vec3[], r: number, across = 3): boolean {
  if (centres.length === 0) return true;
  const steps = Math.max(1, Math.ceil((across - 1) / 2));
  const carve = sim.carve, v = carve.voxel, ramp = carve.ramp, pad = r + ramp / 2 + TAMP_PASSAGE_MARGIN_BU * sim.world.bu;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of centres) {
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z);
  }
  // `steps` samples of apron around the box so the eroded test can read the neighbours of the box's own cells
  const i0 = Math.floor((x0 - pad) / v) - steps, j0 = Math.floor((y0 - pad) / v) - steps, k0 = Math.floor((z0 - pad) / v) - steps;
  const nx = Math.ceil((x1 + pad) / v) + steps - i0 + 1, ny = Math.ceil((y1 + pad) / v) + steps - j0 + 1, nz = Math.ceil((z1 + pad) / v) + steps - k0 + 1;
  const n = nx * ny * nz, before = new Uint8Array(n), after = new Uint8Array(n);
  let changed = false;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = i + nx * (j + ny * k);
    const old = carve.sampleAt(i0 + i, j0 + j, k0 + k);
    if (old < OPEN_MIN) continue;
    before[s] = 1;
    const now = filledOpenness(old, (i0 + i) * v, (j0 + j) * v, (k0 + k) * v, centres, r, ramp);
    if (now >= OPEN_MIN) after[s] = 1; else changed = true;
  }
  if (!changed) return true;
  if (!noSplit(label(before, nx, ny, nz), label(after, nx, ny, nz))) return false;
  const erode = (m: Uint8Array): Uint8Array => {
    const out = new Uint8Array(n);
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const s = i + nx * (j + ny * k);
      if (m[s] === 1 && m[s + 1] === 1 && m[s - 1] === 1 && m[s + nx] === 1 && m[s - nx] === 1 && m[s + nx * ny] === 1 && m[s - nx * ny] === 1) out[s] = 1;
    }
    return out;
  };
  let eb: Uint8Array = before, ea: Uint8Array = after;
  for (let e = 0; e < steps; e++) { eb = erode(eb); ea = erode(ea); }
  return noSplit(label(eb, nx, ny, nz), label(ea, nx, ny, nz));
}
