// Nesting suitability (GDD 04 §12.1-12.2): Q = veto x sum w f over the eight factors, per nav cell as the max
// over 4 sample points (terrain cells at the quadrant centres). Kept separate from travel access (surface.ts).
// fRival is 1 until rival sites exist (applyRivalFactor after step 8).
//
// Calibration (directions §K, founding-site quality must discriminate): missing cover is a low factor value, not
// a neutral one (bare ground SUIT.coverBare, sward SUIT.coverSward), the ground right beside a stone, slab edge or
// log counts as cover (SUIT.coverBeside), and the word thresholds (SUIT.fair / good / excellent) are calibrated on
// final generated worlds (populate/calibration.test.ts).
//
// The raw inputs of the 4 samples of every nav cell are read once per derived-maps pass into a table; a profile
// (the played species, or a rival mapped onto a playable profile) is then a cheap weighted combination.

import type { SpeciesId } from '@/sim/types';
import { MATERIAL_IDS, materialFromCode } from '@/sim/types';
import { digFactor } from '@/sim/balance';
import type { GenContext } from '../kit/context';
import { CLS } from './nav';
import { mapState, type MapState } from './state';
import { DISTURBANCE_FULL, DISTURBANCE_PASSES, SUIT, SUITABILITY, WOOD_MOIST, type SuitabilityProfile } from '../tuning/maps';
import { heightAt } from '@/sim/world/terrainSample';
import { OVER_WARM } from './columns';

/** Site words of the static map (directions §K). */
export type SiteClass = 'excellent' | 'good' | 'fair' | 'poor';

/** Word of a Q value (0 = vetoed counts as poor). */
export function siteClass(q: number): SiteClass {
  return q >= SUIT.excellent ? 'excellent' : q >= SUIT.good ? 'good' : q >= SUIT.fair ? 'fair' : 'poor';
}

/** Moisture window factor (linear ramps). */
export function moistFactor(p: SuitabilityProfile['moist'], t: number): number {
  if (t <= p.lo0) return 0;
  if (t < p.lo1) return (t - p.lo0) / (p.lo1 - p.lo0);
  if (t <= p.hi1) return 1;
  const v = t >= p.hi0 ? 0 : 1 - (t - p.hi1) / (p.hi0 - p.hi1);
  return p.floorAboveHi !== undefined ? Math.max(p.floorAboveHi, v) : v;
}

export interface SuitabilityFactors {
  q: number;
  fDig: number; fCover: number; fWarm: number; fMoist: number; fFlood: number; fQuiet: number; fRival: number; fSpecial: number;
  veto: boolean;
}

export const emptyFactors = (): SuitabilityFactors =>
  ({ q: 0, fDig: 0, fCover: 0, fWarm: 0, fMoist: 0, fFlood: 0, fQuiet: 0, fRival: 0, fSpecial: 0, veto: false });

/**
 * A profile with its digging table: the played species' own, or a rival species mapped onto one of the four
 * (GDD 04 §12.5: a damp-lawn Myrmica-type uses the Lasius profile with its own moisture window, ...).
 */
export interface SiteProfileInput {
  /** Species whose digging table (GDD 03 §2.1 multipliers) is used. */
  digSpecies: SpeciesId;
  profile: SuitabilityProfile;
  /** fCover x this under or beside a slab or stone (pavement Tetramorium-type), capped 1. Default 1. */
  slabCoverMult?: number;
}

/** Cover kinds, in increasing order (index into COVER_VALUES). */
const COVER_BARE = 0, COVER_SWARD = 1, COVER_LITTER = 2, COVER_BESIDE = 3, COVER_CEILING = 4;
const coverValue = (k: number) =>
  k === COVER_CEILING ? SUIT.coverCeiling : k === COVER_BESIDE ? SUIT.coverBeside : k === COVER_LITTER ? SUIT.coverLitter : k === COVER_SWARD ? SUIT.coverSward : SUIT.coverBare;

/** Raw inputs of one sample (what the profile combines). */
interface RawSample { veto: boolean; fDig: number; cover: number; warmCover: boolean; moist: number; fQuiet: number }

const digTables = new Map<SpeciesId, Float32Array>();
function digTable(species: SpeciesId): Float32Array {
  let t = digTables.get(species);
  if (!t) {
    t = Float32Array.from(MATERIAL_IDS, (m) => Math.max(0, Math.min(1, digFactor(species, m) / SUIT.digNorm)));
    digTables.set(species, t);
  }
  return t;
}

function coverKind(st: MapState, cells: number, ti: number, tk: number, litter: number, lawn: boolean): number {
  const cc = st.col.coverCeil;
  const ceil = (a: number, b: number) => a >= 0 && b >= 0 && a < cells && b < cells && cc[b * cells + a] === 1;
  if (ceil(ti, tk) && ceil(ti - 1, tk) && ceil(ti + 1, tk) && ceil(ti, tk - 1) && ceil(ti, tk + 1)) return COVER_CEILING;
  const r = SUIT.besideCells;
  for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) if (ceil(ti + di, tk + dk)) return COVER_BESIDE;
  if (litter >= SUIT.litterMin) return COVER_LITTER;
  return lawn ? COVER_SWARD : COVER_BARE;
}

/** Reads the raw inputs of terrain cell (ti, tk) of nav cell c. */
function rawSample(ctx: GenContext, digSpecies: SpeciesId, woodNester: boolean, c: number, ti: number, tk: number, out: RawSample): RawSample {
  const dig = digTable(digSpecies);
  const st = mapState(ctx);
  const { cells, bu } = ctx.dims;
  const w = ctx.world, lay = ctx.layout;
  const j = tk * cells + ti;
  const zone = lay.zones[lay.cells[j]];
  const cls = w.nav.cls.data[c];
  const theta = st.surface.theta0[c];
  let veto = zone.type === 'interior' || cls === CLS.edge || cls === CLS.hole || cls === CLS['water-body']
    || Number.isNaN(st.col.walkTop[j]) || (w.terrainHoles?.data[j] ?? 0) !== 0;
  // fDig: wood primitive for wood nesters, else the strata in the founding band
  let fDig = 0;
  const woodIdx = st.col.wood[j];
  if (woodNester && woodIdx >= 0) fDig = w.prims[woodIdx].material === 'wood-decayed' ? SUIT.woodDecayed : SUIT.woodSound;
  else {
    const surf = w.ground.surface.data[j], crust = w.ground.crustMm.data[j], subsoil = w.ground.subsoil.data[j];
    if (!(crust > 0 && dig[surf] === 0)) {
      for (let s = 0; s < SUIT.bandSamples; s++) {
        const d = (SUIT.bandBu[0] + ((SUIT.bandBu[1] - SUIT.bandBu[0]) * s) / (SUIT.bandSamples - 1)) * bu;
        const code = d < crust ? surf : subsoil;
        const m = materialFromCode(code);
        fDig += m === 'sand' ? (theta >= SUIT.dampSandTheta ? SUIT.dampSand : SUIT.drySand) * (dig[code] > 0 ? 1 : 0) : dig[code];
      }
      fDig /= SUIT.bandSamples;
    }
  }
  if (fDig <= 0) veto = true;
  const cover = coverKind(st, cells, ti, tk, st.surface.litter[c], zone.type === 'lawn');
  // wood nesters read the moisture of the wood they nest in (GDD 04 §13.6), else the soil's theta0
  let moist = theta;
  if (woodNester && woodIdx >= 0) {
    const p = w.prims[woodIdx], shade = st.shade.mean[c];
    const minY = p.pos.y - Math.max(p.size.x, p.size.y, p.size.z);
    const contact = minY <= heightAt(w.terrain, p.pos.x, p.pos.z) + WOOD_MOIST.contactBu * bu ? 1 : 0;
    moist = (p.material === 'wood-decayed' ? WOOD_MOIST.decayed : WOOD_MOIST.sound) + WOOD_MOIST.contact * contact
      + WOOD_MOIST.shadeK * shade - WOOD_MOIST.shadeK * (1 - shade);
  }
  out.veto = veto; out.fDig = fDig; out.cover = cover; out.moist = moist;
  out.warmCover = cover >= COVER_BESIDE && (st.col.over[j] & OVER_WARM) !== 0;
  out.fQuiet = 1 - Math.min(1, (zone.variant ? DISTURBANCE_PASSES[zone.variant] ?? 0 : 0) / DISTURBANCE_FULL);
  return out;
}

/** Combines a raw sample with a profile into the factors and Q. */
function combine(st: MapState, inp: SiteProfileInput, c: number, r: RawSample, fRival: number, fSpecial: number, out: SuitabilityFactors): SuitabilityFactors {
  let fCover = coverValue(r.cover);
  if (r.warmCover && inp.slabCoverMult) fCover = Math.min(1, fCover * inp.slabCoverMult);
  const fWarm = Math.min(1, (1 - st.shade.mean[c]) * (r.warmCover ? SUIT.warmStoneMult : 1));
  const fMoist = moistFactor(inp.profile.moist, r.moist);
  const fFlood = 1 - st.water.flood[c];
  const wt = inp.profile.weights;
  out.veto = r.veto; out.fDig = r.fDig; out.fCover = fCover; out.fWarm = fWarm; out.fMoist = fMoist; out.fFlood = fFlood;
  out.fQuiet = r.fQuiet; out.fRival = fRival; out.fSpecial = fSpecial;
  out.q = r.veto ? 0 : wt.dig * r.fDig + wt.cover * fCover + wt.warm * fWarm + wt.moist * fMoist + wt.flood * fFlood
    + wt.quiet * r.fQuiet + wt.rival * fRival + wt.special * fSpecial;
  return out;
}

const _raw: RawSample = { veto: false, fDig: 0, cover: 0, warmCover: false, moist: 0, fQuiet: 0 };

/** Factors and Q at terrain cell (ti, tk) of nav cell c for a profile. */
export function sampleFactors(
  ctx: GenContext, inp: SiteProfileInput, c: number, ti: number, tk: number, fRival: number, fSpecial: number,
  out: SuitabilityFactors,
): SuitabilityFactors {
  return combine(mapState(ctx), inp, c, rawSample(ctx, inp.digSpecies, inp.profile.woodNester, c, ti, tk, _raw), fRival, fSpecial, out);
}

/** Terrain-cell offsets (in quarter nav cells) of the 4 samples of a nav cell. */
export const SAMPLE_OFFSETS: readonly [number, number][] = [[1, 1], [3, 1], [1, 3], [3, 3]];

/** Terrain cell of sample s of nav cell c, as [ti, tk]. */
export function sampleCell(ctx: GenContext, c: number, s: number): [number, number] {
  const { navN, cells, sub } = ctx.dims;
  const i = c % navN, k = Math.floor(c / navN), scale = sub / 4;
  const [oi, ok] = SAMPLE_OFFSETS[s];
  return [Math.min(cells - 1, i * sub + Math.floor(oi * scale)), Math.min(cells - 1, k * sub + Math.floor(ok * scale))];
}

/** Raw samples of every nav cell (4 per cell), per derived-maps pass and digging table. */
interface RawTable { veto: Uint8Array; fDig: Float32Array; cover: Uint8Array; warm: Uint8Array; moist: Float32Array; quiet: Float32Array }
const rawTables = new WeakMap<MapState, Map<string, RawTable>>();

function rawTable(ctx: GenContext, digSpecies: SpeciesId, woodNester: boolean): RawTable {
  const st = mapState(ctx);
  let m = rawTables.get(st);
  if (!m) { m = new Map(); rawTables.set(st, m); }
  const key = `${digSpecies}|${woodNester}`;
  let t = m.get(key);
  if (t) return t;
  const n = ctx.dims.navN * ctx.dims.navN * SAMPLE_OFFSETS.length;
  t = { veto: new Uint8Array(n), fDig: new Float32Array(n), cover: new Uint8Array(n), warm: new Uint8Array(n), moist: new Float32Array(n), quiet: new Float32Array(n) };
  const r: RawSample = { veto: false, fDig: 0, cover: 0, warmCover: false, moist: 0, fQuiet: 0 };
  for (let c = 0, j = 0; c < n / SAMPLE_OFFSETS.length; c++) {
    for (let s = 0; s < SAMPLE_OFFSETS.length; s++, j++) {
      const [ti, tk] = sampleCell(ctx, c, s);
      rawSample(ctx, digSpecies, woodNester, c, ti, tk, r);
      t.veto[j] = r.veto ? 1 : 0; t.fDig[j] = r.fDig; t.cover[j] = r.cover; t.warm[j] = r.warmCover ? 1 : 0; t.moist[j] = r.moist; t.quiet[j] = r.fQuiet;
    }
  }
  m.set(key, t);
  return t;
}

/** Q per nav cell (max over the 4 samples) of a profile; written nowhere. `only` limits the cells evaluated. */
export function profileQ(
  ctx: GenContext, inp: SiteProfileInput, rivalFactor: (c: number) => number = () => 1, specialFactor: (c: number) => number = () => 0,
  only?: (c: number) => boolean,
): Float32Array {
  const nn = ctx.dims.navN * ctx.dims.navN;
  const t = rawTable(ctx, inp.digSpecies, inp.profile.woodNester);
  const q = new Float32Array(nn);
  const f = emptyFactors();
  const r: RawSample = { veto: false, fDig: 0, cover: 0, warmCover: false, moist: 0, fQuiet: 0 };
  const st = mapState(ctx);
  for (let c = 0; c < nn; c++) {
    if (only && !only(c)) continue;
    const fr = rivalFactor(c), fs = specialFactor(c);
    let best = 0;
    for (let s = 0, j = c * SAMPLE_OFFSETS.length; s < SAMPLE_OFFSETS.length; s++, j++) {
      if (t.veto[j]) continue;
      r.veto = false; r.fDig = t.fDig[j]; r.cover = t.cover[j]; r.warmCover = t.warm[j] === 1; r.moist = t.moist[j]; r.fQuiet = t.quiet[j];
      best = Math.max(best, combine(st, inp, c, r, fr, fs, f).q);
    }
    q[c] = best;
  }
  return q;
}

const playedInput = (species: SpeciesId): SiteProfileInput => ({ digSpecies: species, profile: SUITABILITY[species] });

/**
 * Static suitability map of a species (0..1 per nav cell, max over 4 samples); written into
 * maps.suitability[species] and the map state. `rivalFactor` / `specialFactor` give fRival and fSpecial per cell.
 */
export function computeSuitability(
  ctx: GenContext, species: SpeciesId, rivalFactor: (c: number) => number = () => 1, specialFactor: (c: number) => number = () => 0,
): Float32Array {
  const { navN, navCell } = ctx.dims;
  const q = profileQ(ctx, playedInput(species), rivalFactor, specialFactor);
  mapState(ctx).q[species] = q;
  ctx.world.maps.suitability[species] = { cell: navCell, nx: navN, nz: navN, data: Uint8Array.from(q, (v) => Math.round(v * 255)) };
  return q;
}

/** Factors at a world point (debug inspect, diag-site). */
export function suitabilityAt(ctx: GenContext, species: SpeciesId, x: number, z: number): SuitabilityFactors {
  const { navN, navCell, cell, cells } = ctx.dims;
  const c = Math.min(navN - 1, Math.floor(z / navCell)) * navN + Math.min(navN - 1, Math.floor(x / navCell));
  return sampleFactors(ctx, playedInput(species), c, Math.min(cells - 1, Math.floor(x / cell)), Math.min(cells - 1, Math.floor(z / cell)), 1, 0, emptyFactors());
}

/** fRival per nav cell: clamp(distance to the nearest established or incipient rival site / 600 BU, 0, 1). */
export function rivalFactorOf(ctx: GenContext): (c: number) => number {
  const sites = ctx.world.placements.rivalSites;
  if (sites.length === 0) return () => 1;
  const { navN, navCell, bu } = ctx.dims;
  const full = SUIT.rivalFullBu * bu;
  return (c) => {
    const x = ((c % navN) + 0.5) * navCell, z = (Math.floor(c / navN) + 0.5) * navCell;
    let d = Infinity;
    for (const s of sites) d = Math.min(d, Math.sqrt((s.origin.x - x) ** 2 + (s.origin.z - z) ** 2));
    return Math.min(1, d / full);
  };
}

/** Re-applies fRival = clamp(distance to the nearest rival site / 600 BU) to the played species' map. */
export function applyRivalFactor(ctx: GenContext, special: (c: number) => number = () => 0): void {
  if (ctx.world.placements.rivalSites.length === 0) return;
  computeSuitability(ctx, ctx.params.speciesId, rivalFactorOf(ctx), special);
}
