// Step 2 — heightfield (GDD 04 §4.2): H = tilt + macro(zone) + micro(zone) + features, sampled at 4 BU, from
// integer-hash fBm only. Zone amplitudes are blurred across zone borders so H stays continuous. Rigid built zones
// replace H by their analytic level; footpaths follow the smooth ground; natural ground and paths within 300 mm of
// rigid built ground blend to its edge level (smoothstep), and micro relief fades out toward paths. The only steep
// jumps are the intended steps at kerbs, raised beds, between built levels and under the house wall.

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

  // per-sample base heights. A sample is a cell corner: it takes the zone of one of its four touching cells
  // (see sampleCell), so that the house interior never claims a corner it shares with outside ground.
  const shapesByZone = new Map<number, BuiltShape[]>();
  for (const b of lay.built) { const a = shapesByZone.get(b.zoneId) ?? []; a.push(b); shapesByZone.set(b.zoneId, a); }
  const nS = samples * samples;
  /** 0 natural, 1 footpath (follows the smooth ground), 2 rigid built level. */
  const role = new Uint8Array(nS);
  const smooth = new Float32Array(nS), micro = new Float32Array(nS), blendTo = new Float32Array(nS);
  const rigidGroup = new Int8Array(nS).fill(-1);
  const groups: BuiltShape['kind'][] = [];
  for (let k = 0; k < samples; k++) {
    const z = k * cell;
    for (let i = 0; i < samples; i++) {
      const x = i * cell, j = k * samples + i;
      weights(x, z);
      const sm = smoothAt(x, z);
      smooth[j] = sm;
      const c = sampleCell(lay, cells, i, k);
      const shapes = shapesByZone.get(lay.cells[c]);
      if (!shapes) {
        micro[j] = field(microA) * fbm2(x * microInv, z * microInv, seed ^ 0x3a1c, TERRAIN.microOctaves);
        continue;
      }
      const cx = ((c % cells) + 0.5) * cell, cz = (Math.floor(c / cells) + 0.5) * cell;
      const sh = shapes.find((b) => !b.rect || inRect(b.rect, cx, cz)) ?? shapes[0];
      if (sh.kind === 'path') { role[j] = 1; continue; }
      const lv = builtLevel(lay, sh, x, z, sm, L);
      role[j] = 2;
      H[j] = lv;
      blendTo[j] = blendLevel(sh, lv);
      let g = groups.indexOf(sh.kind);
      if (g < 0) { g = groups.length; groups.push(sh.kind); }
      rigidGroup[j] = g;
    }
  }

  // natural ground and footpaths within 300 mm of rigid built ground blend toward its edge level (smoothstep).
  // Each built kind has its own distance field and the targets are mixed by inverse distance, so the blend stays
  // continuous where two built zones meet (a nearest-site switch would jump between their levels).
  const blendCells = TERRAIN.blendDist / cell;
  const wMax = new Float32Array(nS), wSum = new Float32Array(nS), vSum = new Float32Array(nS);
  for (let g = 0; g < groups.length; g++) accumulateBlend(rigidGroup, g, role, blendTo, samples, blendCells, wMax, wSum, vSum);
  for (let j = 0; j < nS; j++) {
    if (role[j] === 2) continue;
    const target = wSum[j] > 0 ? vSum[j] / wSum[j] : smooth[j];
    H[j] = smooth[j] + (target - smooth[j]) * wMax[j];
  }
  // micro relief fades out toward footpaths (a path is the smooth ground, so its edges stay flush)
  const isPath = Uint8Array.from(role, (r) => (r === 1 ? 1 : 0));
  const pathDist = new Float32Array(nS);
  nearestSites(isPath, samples, samples, pathDist);
  const castW = new Float32Array(nS), hollowW = new Float32Array(nS);
  for (let j = 0; j < nS; j++) {
    if (role[j] === 2) continue;
    const free = 1 - wMax[j];
    hollowW[j] = free;
    if (role[j] === 0) {
      castW[j] = free * smooth01(pathDist[j] / blendCells);
      H[j] += micro[j] * castW[j];
    }
  }
  addFeatures(ctx, rng, role, hollowW, castW);
  const q = TERRAIN.heightQuantum;
  for (let j = 0; j < H.length; j++) H[j] = Math.round(H[j] * q) / q;
}

/**
 * Terrain cell whose zone a sample (cell corner i, k) takes: the cell on its +x/+z side unless that cell is the
 * house interior and another touching cell is not. The interior level (the slab underside) then starts one cell
 * inside the house, under the wall, whichever map side the house is on; the ground just outside the wall's
 * outer face keeps the outside level.
 */
function sampleCell(lay: { cells: Uint8Array; zones: { built: BuiltShape['kind'] | null }[] }, cells: number, i: number, k: number): number {
  let first = -1;
  for (const [di, dk] of CORNER_CELLS) {
    const ci = Math.min(cells - 1, Math.max(0, i + di)), ck = Math.min(cells - 1, Math.max(0, k + dk));
    const c = ck * cells + ci;
    if (first < 0) first = c;
    if (lay.zones[lay.cells[c]].built !== 'interior') return c;
  }
  return first;
}
const CORNER_CELLS: readonly [number, number][] = [[0, 0], [-1, 0], [0, -1], [-1, -1]];

/**
 * Adds the blend contribution of rigid group g to the non-rigid samples within `blendCells` of it: blend weight
 * w = 1 - smoothstep(d / blendCells) (wMax keeps the largest), target weight w / (1 + d)^2. Works on the bounding
 * box of the group's samples grown by the blend distance.
 */
function accumulateBlend(
  group: Int8Array, g: number, role: Uint8Array, blendTo: Float32Array, n: number, blendCells: number,
  wMax: Float32Array, wSum: Float32Array, vSum: Float32Array,
): void {
  let i0 = n, i1 = -1, k0 = n, k1 = -1;
  for (let j = 0; j < group.length; j++) {
    if (group[j] !== g) continue;
    const i = j % n, k = (j / n) | 0;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
  }
  if (i1 < 0) return;
  const pad = Math.ceil(blendCells) + 1;
  i0 = Math.max(0, i0 - pad); i1 = Math.min(n - 1, i1 + pad); k0 = Math.max(0, k0 - pad); k1 = Math.min(n - 1, k1 + pad);
  const w = i1 - i0 + 1, h = k1 - k0 + 1;
  const site = new Uint8Array(w * h);
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) site[k * w + i] = group[(k + k0) * n + i + i0] === g ? 1 : 0;
  const dist = new Float32Array(w * h);
  const near = nearestSites(site, w, h, dist);
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
    const c = k * w + i, d = dist[c];
    if (near[c] < 0 || d >= blendCells) continue;
    const j = (k + k0) * n + i + i0;
    if (role[j] === 2) continue;
    const bw = 1 - smooth01(d / blendCells);
    const s = near[c], sj = (((s / w) | 0) + k0) * n + (s % w) + i0;
    const tw = bw / ((1 + d) * (1 + d));
    if (bw > wMax[j]) wMax[j] = bw;
    wSum[j] += tw;
    vSum[j] += tw * blendTo[sj];
  }
}

/**
 * Forest hollows (natural ground and footpaths, weight hollowW), worm casts (natural ground, weight castW) and
 * raised beds (natural ground). The weights fade features out next to built ground so they cannot cut a step there.
 */
function addFeatures(ctx: GenContext, rng: RngState, role: Uint8Array, hollowW: Float32Array, castW: Float32Array): void {
  const { dims, layout: lay } = ctx;
  const { samples, cell, cells, size: L } = dims;
  const H = ctx.world.terrain.data;
  const zoneAt = (x: number, z: number) => lay.cells[Math.min(cells - 1, Math.max(0, Math.floor(z / cell))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / cell)))];
  const stamp = (cx: number, cz: number, r: number, dh: number, weight: Float32Array) => {
    const i0 = Math.max(0, Math.floor((cx - r) / cell)), i1 = Math.min(samples - 1, Math.ceil((cx + r) / cell));
    const k0 = Math.max(0, Math.floor((cz - r) / cell)), k1 = Math.min(samples - 1, Math.ceil((cz + r) / cell));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const j = k * samples + i;
      const dx = i * cell - cx, dz = k * cell - cz;
      H[j] += dh * weight[j] * bell((dx * dx + dz * dz) / (r * r));
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
        stamp(x, z, d / 2, -depth, hollowW);
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
        stamp(x, z, d / 2, h, castW);
        c++;
      }
    }
  }
  for (const rb of lay.raisedBeds) {
    const r = rb.rect;
    for (let k = Math.ceil(r.z0 / cell); k <= Math.floor(r.z1 / cell); k++) for (let i = Math.ceil(r.x0 / cell); i <= Math.floor(r.x1 / cell); i++) {
      if (i < 0 || k < 0 || i >= samples || k >= samples) continue;
      const j = k * samples + i;
      if (role[j] === 0) H[j] += rb.lift;
    }
  }
}
