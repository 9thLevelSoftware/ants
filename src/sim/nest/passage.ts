// The passage check of tamping (sim-fix-colony item 2): would a fill (spheres of one radius) split the open space
// around it? Two tests in a local box around the fill: plain connectivity of the open samples (nav connectivity:
// the nest-nav graph's corner rule makes it face connectivity) and connectivity of the ERODED open set (samples
// whose face neighbours are open too, `e` steps deep: a passage at least 2e + 1 samples across, GDD 03 §5.1
// walkable; e = 1, 3 samples = 1.5 BU, for the standard worker).
// The fill is safe when every pair of samples that stays open (stays eroded-open) and was connected inside the
// box before is still connected inside it after. Conservative: two parts joined only outside the box count as
// split, and then the fill is refused.
// PassageProbe answers the same question for many subsets of one set of centres (tamping's greedy search): the
// carve samples of the union box are read once and the fill's openness is kept per sample as spheres are added and
// taken back, so each answer costs the labelling only (nest-fix3 review: single tamps of 20-75 ms).

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

/** Sample box of a fill of spheres at these centres (with the passage margin and the erosion apron). */
interface Box { i0: number; j0: number; k0: number; nx: number; ny: number; nz: number }

function fillBox(sim: Sim, centres: readonly Vec3[], r: number, steps: number): Box {
  const carve = sim.carve, v = carve.voxel, pad = r + carve.ramp / 2 + TAMP_PASSAGE_MARGIN_BU * sim.world.bu;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of centres) {
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z);
  }
  // `steps` samples of apron around the box so the eroded test can read the neighbours of the box's own cells
  const i0 = Math.floor((x0 - pad) / v) - steps, j0 = Math.floor((y0 - pad) / v) - steps, k0 = Math.floor((z0 - pad) / v) - steps;
  return {
    i0, j0, k0,
    nx: Math.ceil((x1 + pad) / v) + steps - i0 + 1, ny: Math.ceil((y1 + pad) / v) + steps - j0 + 1, nz: Math.ceil((z1 + pad) / v) + steps - k0 + 1,
  };
}

/** The verdict from the before / after open masks of one box: both connectivity tests (see the file comment). */
function verdict(before: Uint8Array, after: Uint8Array, b: Box, steps: number): boolean {
  const { nx, ny, nz } = b, n = nx * ny * nz;
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

/**
 * fillKeepsPassages for subsets of one set of centres, incrementally (see the file comment): add / pop centres,
 * then ask `keeps()`. The answer equals fillKeepsPassages(sim, added centres, r, across) exactly: the same box from
 * the added centres, the same masks (each sample's fill openness is the minimum over the spheres reaching it, which
 * is what the nearest sphere gives).
 */
export class PassageProbe {
  private readonly union: Box;
  private readonly old: Uint8Array;
  private readonly cur: Uint8Array;
  private readonly undo: number[][] = [];
  private readonly added: Vec3[] = [];
  private readonly steps: number;

  constructor(private readonly sim: Sim, all: readonly Vec3[], private readonly r: number, across = 3) {
    this.steps = Math.max(1, Math.ceil((across - 1) / 2));
    this.union = fillBox(sim, all.length > 0 ? all : [{ x: 0, y: 0, z: 0 }], r, this.steps);
    const { i0, j0, k0, nx, ny, nz } = this.union;
    this.old = new Uint8Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      this.old[i + nx * (j + ny * k)] = sim.carve.sampleAt(i0 + i, j0 + j, k0 + k);
    }
    this.cur = this.old.slice();
  }

  /** Adds the fill sphere at c (one of the centres given to the constructor). */
  push(c: Vec3): void {
    const { i0, j0, k0, nx, ny, nz } = this.union, carve = this.sim.carve, v = carve.voxel, ramp = carve.ramp;
    const reach = this.r + ramp / 2, changed: number[] = [];
    const a0 = Math.max(0, Math.floor((c.x - reach) / v) - i0), a1 = Math.min(nx - 1, Math.ceil((c.x + reach) / v) - i0);
    const b0 = Math.max(0, Math.floor((c.y - reach) / v) - j0), b1 = Math.min(ny - 1, Math.ceil((c.y + reach) / v) - j0);
    const d0 = Math.max(0, Math.floor((c.z - reach) / v) - k0), d1 = Math.min(nz - 1, Math.ceil((c.z + reach) / v) - k0);
    for (let k = d0; k <= d1; k++) for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
      const s = i + nx * (j + ny * k);
      const now = filledOpenness(this.cur[s], (i0 + i) * v, (j0 + j) * v, (k0 + k) * v, [c], this.r, ramp);
      if (now < this.cur[s]) { changed.push(s, this.cur[s]); this.cur[s] = now; }
    }
    this.undo.push(changed);
    this.added.push(c);
  }

  /** Takes the last added sphere back. */
  pop(): void {
    const changed = this.undo.pop();
    this.added.pop();
    if (!changed) return;
    for (let n = changed.length - 2; n >= 0; n -= 2) this.cur[changed[n]] = changed[n + 1];
  }

  /** fillKeepsPassages(sim, the added centres, r, across). */
  keeps(): boolean {
    if (this.added.length === 0) return true;
    const b = fillBox(this.sim, this.added, this.r, this.steps), U = this.union;
    const n = b.nx * b.ny * b.nz, before = new Uint8Array(n), after = new Uint8Array(n);
    let changed = false;
    for (let k = 0; k < b.nz; k++) for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) {
      const s = i + b.nx * (j + b.ny * k);
      const ui = b.i0 + i - U.i0, uj = b.j0 + j - U.j0, uk = b.k0 + k - U.k0;
      const u = ui + U.nx * (uj + U.ny * uk);
      const old = this.old[u];
      if (old < OPEN_MIN) continue;
      before[s] = 1;
      if (this.cur[u] >= OPEN_MIN) after[s] = 1; else changed = true;
    }
    if (!changed) return true;
    return verdict(before, after, b, this.steps);
  }
}

/**
 * Is a fill of these spheres safe for the passages around it (see the file comment)? `across`: samples across the
 * narrowest passage the species can walk (tamp.ts tampPassageSamples, default 3).
 */
export function fillKeepsPassages(sim: Sim, centres: readonly Vec3[], r: number, across = 3): boolean {
  if (centres.length === 0) return true;
  const steps = Math.max(1, Math.ceil((across - 1) / 2));
  const carve = sim.carve, v = carve.voxel, ramp = carve.ramp;
  const b = fillBox(sim, centres, r, steps), { i0, j0, k0, nx, ny, nz } = b;
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
  return verdict(before, after, b, steps);
}
