// Step 2 — heightfield (GDD 04 §4.2): H = tilt + macro(zone) + micro(zone) + features, sampled at 4 BU, from
// integer-hash fBm only. Zone amplitudes are blurred across zone borders so H stays continuous; built zones replace
// H by their analytic level and natural ground within 300 mm blends to the built edge level (smoothstep). The only
// steep jumps are the intended one-cell steps at kerbs, raised beds and the house footprint.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import { fbm2 as fbm2Imp } from '@/core/math/noise';
import type { GenContext } from '../kit/context';
import type { BuiltShape } from '../layout/types';
import { RELIEF, TERRAIN } from '../tuning/terrain';
import { boxBlur, nearestSites } from './distance';
import { blendLevel, builtLevel } from './levels';
import { inRect } from '../layout/geom';

// hot import re-bound as a local const (module getters are slow under Vite/Vitest, docs/design/tdd/02-kernel.md §2.11)
const fbm2 = fbm2Imp;

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const bell = (r2: number) => (r2 >= 1 ? 0 : (1 - r2) * (1 - r2));

export function buildHeightfield(ctx: GenContext, rng: RngState): void {
  const { dims, layout: lay } = ctx;
  const { cells, samples, cell, navN, navCell, size: L } = dims;
  const H = ctx.world.terrain.data;
  const seed = ctx.seed | 0;

  // smooth per-nav-cell amplitude and offset fields from the natural zones
  const nCells = navN * navN;
  const macroA = new Float32Array(nCells), microA = new Float32Array(nCells), offs = new Float32Array(nCells);
  const waveW = new Map<number, number>();
  const zoneWave = lay.zones.map((z) => {
    const rl = RELIEF[z.type];
    return rl ? rl.macroWave[0] + rngFloat(rng) * (rl.macroWave[1] - rl.macroWave[0]) : 0;
  });
  for (let c = 0; c < nCells; c++) {
    const z = lay.zones[lay.nav[c]];
    const rl = RELIEF[z.type];
    if (!rl) continue;
    macroA[c] = rl.macroAmp; microA[c] = rl.microAmp; offs[c] = rl.offset;
    waveW.set(z.id, (waveW.get(z.id) ?? 0) + 1);
  }
  const blurR = Math.max(1, Math.round(TERRAIN.ampBlur / navCell));
  boxBlur(macroA, navN, navN, blurR); boxBlur(microA, navN, navN, blurR); boxBlur(offs, navN, navN, blurR);
  // one macro wavelength per map: area-weighted over the natural zones (wavelengths are within 3-6 m)
  let wsum = 0, wl = 0;
  for (const [id, n] of [...waveW.entries()].sort((a, b) => a[0] - b[0])) { wsum += n; wl += n * zoneWave[id]; }
  const macroInv = 1 / (wsum > 0 ? wl / wsum : 4000);
  const microInv = 1 / (TERRAIN.microWaveCells * cell);
  // tilt: grade up to 1 % toward a random direction
  let tx = 0, tz = 0;
  for (let t = 0; t < 16; t++) {
    tx = rngFloat(rng) * 2 - 1; tz = rngFloat(rng) * 2 - 1;
    const l = tx * tx + tz * tz;
    if (l > 0.01 && l <= 1) { const s = 1 / Math.sqrt(l); tx *= s; tz *= s; break; }
  }
  const grade = rngFloat(rng) * TERRAIN.tiltMax;

  // bilinear weights of the nav-cell fields at (x, z), shared by the three fields
  let fj = 0, fi1 = 0, fk1 = 0, fu = 0, fv = 0;
  const weights = (x: number, z: number) => {
    const fx = Math.min(navN - 1.000001, Math.max(0, x / navCell - 0.5)), fz = Math.min(navN - 1.000001, Math.max(0, z / navCell - 0.5));
    const i = Math.floor(fx), k = Math.floor(fz);
    fu = fx - i; fv = fz - k; fj = k * navN + i;
    fi1 = Math.min(navN - 1, i + 1) - i; fk1 = (Math.min(navN - 1, k + 1) - k) * navN;
  };
  const field = (a: Float32Array) =>
    a[fj] * (1 - fu) * (1 - fv) + a[fj + fi1] * fu * (1 - fv) + a[fj + fk1] * (1 - fu) * fv + a[fj + fi1 + fk1] * fu * fv;
  // macro noise is smooth at the nav-cell scale (finest octave >= 0.75 m vs 16 BU cells): sampled at nav cell
  // centres and interpolated with the same weights
  const macroN = new Float32Array(nCells);
  for (let c = 0; c < nCells; c++) {
    const x = ((c % navN) + 0.5) * navCell, z = (Math.floor(c / navN) + 0.5) * navCell;
    macroN[c] = fbm2(x * macroInv, z * macroInv, seed ^ 0x51ed, TERRAIN.macroOctaves);
  }
  const smoothAt = (x: number, z: number) =>
    grade * (tx * (x - L / 2) + tz * (z - L / 2)) + field(offs) + field(macroA) * field(macroN);

  // per-sample: natural height, built level and the blend
  const shapesByZone = new Map<number, BuiltShape[]>();
  for (const b of lay.built) { const a = shapesByZone.get(b.zoneId) ?? []; a.push(b); shapesByZone.set(b.zoneId, a); }
  const isBuilt = new Uint8Array(samples * samples);
  const blendTo = new Float32Array(samples * samples);
  for (let k = 0; k < samples; k++) {
    const z = k * cell, ck = Math.min(cells - 1, k);
    for (let i = 0; i < samples; i++) {
      const x = i * cell, ci = Math.min(cells - 1, i), j = k * samples + i;
      weights(x, z);
      const sm = smoothAt(x, z);
      const zid = lay.cells[ck * cells + ci];
      const shapes = shapesByZone.get(zid);
      if (shapes) {
        const cx = (ci + 0.5) * cell, cz = (ck + 0.5) * cell;
        const s = shapes.find((b) => !b.rect || inRect(b.rect, cx, cz)) ?? shapes[0];
        const lv = builtLevel(lay, s, x, z, sm, L);
        H[j] = lv;
        isBuilt[j] = 1;
        blendTo[j] = blendLevel(s, lv);
      } else {
        H[j] = sm + field(microA) * fbm2(x * microInv, z * microInv, seed ^ 0x3a1c, TERRAIN.microOctaves);
      }
    }
  }
  const dist = new Float32Array(samples * samples);
  const near = nearestSites(isBuilt, samples, samples, dist);
  const blendCells = TERRAIN.blendDist / cell;
  for (let j = 0; j < samples * samples; j++) {
    if (isBuilt[j] || near[j] < 0 || dist[j] >= blendCells) continue;
    const w = 1 - smooth01(dist[j] / blendCells);
    H[j] += (blendTo[near[j]] - H[j]) * w;
  }
  addFeatures(ctx, rng, isBuilt);
  const q = TERRAIN.heightQuantum;
  for (let j = 0; j < H.length; j++) H[j] = Math.round(H[j] * q) / q;
}

/** Forest hollows, raised beds and worm casts (natural samples only). */
function addFeatures(ctx: GenContext, rng: RngState, isBuilt: Uint8Array): void {
  const { dims, layout: lay } = ctx;
  const { samples, cell, cells, size: L } = dims;
  const H = ctx.world.terrain.data;
  const zoneAt = (x: number, z: number) => lay.cells[Math.min(cells - 1, Math.max(0, Math.floor(z / cell))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / cell)))];
  const stamp = (cx: number, cz: number, r: number, dh: number) => {
    const i0 = Math.max(0, Math.floor((cx - r) / cell)), i1 = Math.min(samples - 1, Math.ceil((cx + r) / cell));
    const k0 = Math.max(0, Math.floor((cz - r) / cell)), k1 = Math.min(samples - 1, Math.ceil((cz + r) / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const j = k * samples + i;
      if (isBuilt[j]) continue; // features straddling a zone border stay continuous; only built ground is exempt
      const dx = i * cell - cx, dz = k * cell - cz;
      H[j] += dh * bell((dx * dx + dz * dz) / (r * r));
    }
  };
  for (const zn of lay.zones) {
    if (zn.type === 'forest') {
      const n = rngInt(rng, TERRAIN.hollowCount[0], TERRAIN.hollowCount[1]);
      for (let h = 0, t = 0; h < n && t < 64; t++) {
        const x = rngFloat(rng) * L, z = rngFloat(rng) * L;
        const d = TERRAIN.hollowDiam[0] + rngFloat(rng) * (TERRAIN.hollowDiam[1] - TERRAIN.hollowDiam[0]);
        const depth = TERRAIN.hollowDepth[0] + rngFloat(rng) * (TERRAIN.hollowDepth[1] - TERRAIN.hollowDepth[0]);
        if (zoneAt(x, z) !== zn.id) continue;
        stamp(x, z, d / 2, -depth);
        h++;
      }
    }
    if (zn.type === 'lawn') {
      const castR = (TERRAIN.wormCastDiam[0] + TERRAIN.wormCastDiam[1]) / 4;
      if (castR * 2 < 1.5 * cell) continue; // narrower than 1.5 terrain cells: not representable
      let area = 0;
      for (let c = 0; c < lay.cells.length; c++) if (lay.cells[c] === zn.id) area++;
      const count = Math.round(TERRAIN.wormCastPerM2 * (area * cell * cell) / 1e6);
      for (let c = 0, t = 0; c < count && t < count * 4; t++) {
        const x = rngFloat(rng) * L, z = rngFloat(rng) * L;
        const d = TERRAIN.wormCastDiam[0] + rngFloat(rng) * (TERRAIN.wormCastDiam[1] - TERRAIN.wormCastDiam[0]);
        const h = TERRAIN.wormCastHeight[0] + rngFloat(rng) * (TERRAIN.wormCastHeight[1] - TERRAIN.wormCastHeight[0]);
        if (zoneAt(x, z) !== zn.id) continue;
        stamp(x, z, d / 2, h);
        c++;
      }
    }
  }
  for (const rb of lay.raisedBeds) {
    const r = rb.rect;
    for (let k = Math.ceil(r.z0 / cell); k <= Math.floor(r.z1 / cell); k++) for (let i = Math.ceil(r.x0 / cell); i <= Math.floor(r.x1 / cell); i++) {
      if (i < 0 || k < 0 || i >= samples || k >= samples) continue;
      const j = k * samples + i;
      if (!isBuilt[j]) H[j] += rb.lift;
    }
  }
}
