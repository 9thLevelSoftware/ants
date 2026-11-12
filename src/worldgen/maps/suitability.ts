// Nesting suitability (GDD 04 §12.1-12.2): Q = veto x sum w f over the eight factors, per nav cell as the max
// over 4 sample points (terrain cells at the quadrant centres). Kept separate from travel access (surface.ts).
// fRival is 1 until rival sites exist (applyRivalFactor after step 8).

import type { SpeciesId } from '@/sim/types';
import { MATERIAL_IDS, materialFromCode } from '@/sim/types';
import { digFactor } from '@/sim/balance';
import type { GenContext } from '../kit/context';
import { CLS } from './nav';
import { mapState } from './state';
import { DISTURBANCE_FULL, DISTURBANCE_PASSES, SUIT, SUITABILITY, WOOD_MOIST, type SuitabilityProfile } from '../tuning/maps';
import { heightAt } from '@/sim/world/terrainSample';
import { OVER_WARM } from './columns';

/** Moisture window factor (linear ramps). */
export function moistFactor(p: SuitabilityProfile['moist'], t: number): number {
  if (t <= p.lo0) return 0;
  if (t < p.lo1) return (t - p.lo0) / (p.lo1 - p.lo0);
  if (t <= p.hi1) return 1;
  const v = t >= p.hi0 ? 0 : 1 - (t - p.hi1) / (p.hi0 - p.hi1);
  return p.floorAboveHi !== undefined ? Math.max(p.floorAboveHi, v) : v;
}

/** Diggable-material factor table for a species (clamp(digSpeed x mult / 1.2, 0, 1)). */
function digTable(species: SpeciesId): Float32Array {
  return Float32Array.from(MATERIAL_IDS, (m) => Math.max(0, Math.min(1, digFactor(species, m) / SUIT.digNorm)));
}

export interface SuitabilityFactors {
  q: number;
  fDig: number; fCover: number; fWarm: number; fMoist: number; fFlood: number; fQuiet: number; fRival: number; fSpecial: number;
  veto: boolean;
}

/**
 * Evaluates the factors for terrain cell (ti, tk) of nav cell c. Rival factor and special factor are supplied.
 */
function factorsAt(ctx: GenContext, species: SpeciesId, dig: Float32Array, c: number, ti: number, tk: number, fRival: number, fSpecial: number, out: SuitabilityFactors): SuitabilityFactors {
  const prof = SUITABILITY[species];
  const st = mapState(ctx);
  const { cells, bu } = ctx.dims;
  const w = ctx.world, lay = ctx.layout;
  const j = tk * cells + ti;
  const zone = lay.zones[lay.cells[j]];
  const cls = w.nav.cls.data[c];
  const theta = st.surface.theta0[c];
  out.veto = zone.type === 'interior' || cls === CLS.edge || cls === CLS.hole || cls === CLS['water-body']
    || Number.isNaN(st.col.walkTop[j]) || (w.terrainHoles?.data[j] ?? 0) !== 0;
  // fDig: wood primitive for wood nesters, else the strata in the founding band
  let fDig = 0;
  const woodIdx = st.col.wood[j];
  if (prof.woodNester && woodIdx >= 0) fDig = w.prims[woodIdx].material === 'wood-decayed' ? SUIT.woodDecayed : SUIT.woodSound;
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
  if (fDig <= 0) out.veto = true;
  // fCover: a ceiling here and on the 4 neighbouring cells (>= 3 BU around), else litter / sward
  const ceil = (a: number, b: number) => a >= 0 && b >= 0 && a < cells && b < cells && st.col.coverCeil[b * cells + a] === 1;
  let fCover = 0;
  if (ceil(ti, tk) && ceil(ti - 1, tk) && ceil(ti + 1, tk) && ceil(ti, tk - 1) && ceil(ti, tk + 1)) fCover = SUIT.coverCeiling;
  else if (st.surface.litter[c] >= 0.5) fCover = SUIT.coverLitter;
  else if (zone.type === 'lawn') fCover = SUIT.coverSward;
  const warmMult = fCover === SUIT.coverCeiling && (st.col.over[j] & OVER_WARM) !== 0 ? SUIT.warmStoneMult : 1;
  const fWarm = Math.min(1, (1 - st.shade.mean[c]) * warmMult);
  // wood nesters read the moisture of the wood they nest in (GDD 04 §13.6), else the soil's theta0
  let moist = theta;
  if (prof.woodNester && woodIdx >= 0) {
    const p = w.prims[woodIdx], shade = st.shade.mean[c];
    const minY = p.pos.y - Math.max(p.size.x, p.size.y, p.size.z);
    const contact = minY <= heightAt(w.terrain, p.pos.x, p.pos.z) + WOOD_MOIST.contactBu * bu ? 1 : 0;
    moist = (p.material === 'wood-decayed' ? WOOD_MOIST.decayed : WOOD_MOIST.sound) + WOOD_MOIST.contact * contact
      + WOOD_MOIST.shadeK * shade - WOOD_MOIST.shadeK * (1 - shade);
  }
  const fMoist = moistFactor(prof.moist, moist);
  const fFlood = 1 - st.water.flood[c];
  const fQuiet = 1 - Math.min(1, (DISTURBANCE_PASSES[zone.variant] ?? 0) / DISTURBANCE_FULL);
  const wt = prof.weights;
  out.fDig = fDig; out.fCover = fCover; out.fWarm = fWarm; out.fMoist = fMoist; out.fFlood = fFlood; out.fQuiet = fQuiet;
  out.fRival = fRival; out.fSpecial = fSpecial;
  out.q = out.veto ? 0 : wt.dig * fDig + wt.cover * fCover + wt.warm * fWarm + wt.moist * fMoist + wt.flood * fFlood
    + wt.quiet * fQuiet + wt.rival * fRival + wt.special * fSpecial;
  return out;
}

const SAMPLE_OFFSETS: readonly [number, number][] = [[1, 1], [3, 1], [1, 3], [3, 3]];

/**
 * Static suitability map of a species (0..1 per nav cell, max over 4 samples); written into
 * maps.suitability[species] and the map state. `rivalFactor` / `specialFactor` give fRival and fSpecial per cell.
 */
export function computeSuitability(
  ctx: GenContext, species: SpeciesId, rivalFactor: (c: number) => number = () => 1, specialFactor: (c: number) => number = () => 0,
): Float32Array {
  const { navN, navCell, cells, sub } = ctx.dims;
  const nn = navN * navN;
  const dig = digTable(species);
  const q = new Float32Array(nn);
  const f: SuitabilityFactors = { q: 0, fDig: 0, fCover: 0, fWarm: 0, fMoist: 0, fFlood: 0, fQuiet: 0, fRival: 0, fSpecial: 0, veto: false };
  const scale = sub / 4;
  for (let c = 0; c < nn; c++) {
    const i = c % navN, k = Math.floor(c / navN);
    const fr = rivalFactor(c), fs = specialFactor(c);
    let best = 0;
    for (const [oi, ok] of SAMPLE_OFFSETS) {
      const ti = Math.min(cells - 1, i * sub + Math.floor(oi * scale)), tk = Math.min(cells - 1, k * sub + Math.floor(ok * scale));
      best = Math.max(best, factorsAt(ctx, species, dig, c, ti, tk, fr, fs, f).q);
    }
    q[c] = best;
  }
  mapState(ctx).q[species] = q;
  ctx.world.maps.suitability[species] = { cell: navCell, nx: navN, nz: navN, data: Uint8Array.from(q, (v) => Math.round(v * 255)) };
  return q;
}

/** Factors at a world point (debug inspect, diag-site). */
export function suitabilityAt(ctx: GenContext, species: SpeciesId, x: number, z: number): SuitabilityFactors {
  const { navN, navCell, cell, cells } = ctx.dims;
  const c = Math.min(navN - 1, Math.floor(z / navCell)) * navN + Math.min(navN - 1, Math.floor(x / navCell));
  const f: SuitabilityFactors = { q: 0, fDig: 0, fCover: 0, fWarm: 0, fMoist: 0, fFlood: 0, fQuiet: 0, fRival: 0, fSpecial: 0, veto: false };
  return factorsAt(ctx, species, digTable(species), c, Math.min(cells - 1, Math.floor(x / cell)), Math.min(cells - 1, Math.floor(z / cell)), 1, 0, f);
}

/** Re-applies fRival = clamp(distance to the nearest rival site / 600 BU) to the played species' map. */
export function applyRivalFactor(ctx: GenContext, special: (c: number) => number = () => 0): void {
  const sites = ctx.world.placements.rivalSites;
  if (sites.length === 0) return;
  const { navN, navCell, bu } = ctx.dims;
  const full = SUIT.rivalFullBu * bu;
  computeSuitability(ctx, ctx.params.speciesId, (c) => {
    const x = ((c % navN) + 0.5) * navCell, z = (Math.floor(c / navN) + 0.5) * navCell;
    let d = Infinity;
    for (const s of sites) d = Math.min(d, Math.sqrt((s.origin.x - x) ** 2 + (s.origin.z - z) ** 2));
    return Math.min(1, d / full);
  }, special);
}
