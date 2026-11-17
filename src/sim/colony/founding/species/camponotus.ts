// Camponotus founding in wood (GDD 07 §5.2.3 `claustral-wood`, GDD 03 §13.1 "CP 3 into wood"): which wood is a
// founding site, the site read-out's moisture, and the automatic founding's cell chewed into a log or stump (the
// `cheat.completeFounding` path, auto.ts). The player's own founding uses the same rules through the bite (dig-bite
// in wood, src/sim/species/modules/wood/biteRule.ts) and the readiness depth (nestDepthRule, the wood module).
// Registered by one import line in ../index.ts.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Primitive, Sim, WoodState } from '@/sim/types';
import { FOUNDING_TEMPLATE } from '@/sim/balance/nest';
import {
  FOUND_SOUND_MIN_MC_PCT, FOUND_WOOD_MIN_THICK_BU, FOUND_WOOD_SEARCH_BU, MC_WORD_DAMP_PCT, MC_WORD_WET_PCT,
} from '@/sim/balance/species-carpenter';
import { cellSiteIn, chewCell, type CellSize } from '@/sim/species/modules/wood/woodCell';
import { woodParamsOf } from '@/sim/species/modules/wood/params';
import { ensureWoodStates, primOf, woodClimateAt } from '@/sim/species/modules/wood/woodState';
import { autoFoundingRules } from '../auto';
import { siteAssessRules, type SiteReading } from '../siteAssess';
import { siteQuality, siteWordOf } from '../siteScore';
import { coverValueOf } from '@/worldgen/maps/suitability';
import { woodDecayFactor } from '@/sim/species/modules/wood/biteRule';
import { woodAt } from '@/sim/species/modules/wood/woodState';
import { speciesOf } from '../access';

const T = FOUNDING_TEMPLATE['camponotus-pennsylvanicus'];
/** The founding cell (GDD 03 §13.1 CP: tunnel 6 BU into the wood, cell 4 x 2.5 x 5 BU). */
const FOUNDING_CELL: CellSize = { tunnelD: T.shaftD, tunnelLen: T.shaftDepth, w: T.cell.w, h: T.cell.h, l: T.cell.l };

/** A wood founding site: the primitive, the entry point on its side, the outward direction there (horizontal). */
export interface WoodSite { prim: Primitive; wood: WoodState; entry: Vec3; out: Vec3; score: number }

/** Moisture word of the antennation read-out (GDD 07 §5.2.3 "dry / damp / wet"). */
export function moistureWord(mcPct: number): 'dry' | 'damp' | 'wet' {
  return mcPct < MC_WORD_DAMP_PCT ? 'dry' : mcPct >= MC_WORD_WET_PCT ? 'wet' : 'damp';
}

/**
 * Is this wood a founding site (GDD 07 §5.2.3): at least 10 BU thick; decayed wood of class 1-3, or sound wood
 * with mc >= 18 %; and moist enough that the brood can live (mc above the zero-survival moisture, 8 %).
 */
export function isFoundingWood(sim: Sim, w: WoodState): boolean {
  const p = woodParamsOf(sim.species);
  if (!p || (w.thicknessBu ?? 0) < FOUND_WOOD_MIN_THICK_BU) return false;
  const prim = primOf(sim, w.primId);
  if (!prim) return false;
  if (w.moisture <= p.mcZeroSurvivalPct) return false;
  if (prim.material === 'wood-sound') return w.moisture >= FOUND_SOUND_MIN_MC_PCT;
  return w.decay >= 1 && w.decay <= 3;
}

/** Suitability 0..1 of founding wood by moisture: 1 inside the young-brood band, falling to 0 at 8 % [EST]. */
function moistureScore(sim: Sim, mc: number): number {
  const p = woodParamsOf(sim.species)!;
  if (mc < p.mcFullSurvivalPct) return Math.max(0, (mc - p.mcZeroSurvivalPct) / (p.mcFullSurvivalPct - p.mcZeroSurvivalPct));
  if (mc > p.mcMouldPct) return Math.max(0, 1 - (mc - p.mcMouldPct) * p.hazardMouldPerPct * 10);
  return 1;
}

/** The best founding wood within FOUND_WOOD_SEARCH_BU of p (moisture first, then distance; ties by primitive id). */
export function bestWoodSite(sim: Sim, p: Vec3): WoodSite | null {
  const bu = sim.world.bu, reach = FOUND_WOOD_SEARCH_BU * bu;
  let best: WoodSite | null = null;
  for (const w of ensureWoodStates(sim)) {
    if (!isFoundingWood(sim, w)) continue;
    const prim = primOf(sim, w.primId);
    if (!prim) continue;
    const d = Math.hypot(prim.pos.x - p.x, prim.pos.z - p.z);
    if (d > reach) continue;
    const score = moistureScore(sim, w.moisture) - d / reach;
    if (best && score <= best.score) continue;
    const found = cellSiteIn(sim, prim, w, p, FOUNDING_CELL);
    if (found) best = { prim, wood: w, entry: found.entry, out: found.out, score };
  }
  return best;
}

/**
 * The automatic founding's carve in wood: a horizontal tunnel of the template's diameter chewed in from the side,
 * and the cell (W x H x L, long along a horizontal grain) at its end. The queen is moved to the entry. False (the
 * soil template runs) when the species does not found in wood.
 */
export function carveWoodTemplate(sim: Sim, q: Ant, nest: Nest): boolean {
  const def = speciesOf(sim);
  if (def.opening.mode !== 'claustral-wood') return false;
  const site = bestWoodSite(sim, q.pos);
  if (!site) return false;
  const bu = sim.world.bu;
  const { entry, out, wood } = site;
  const { tp } = chewCell(sim, nest, wood, entry, out, FOUNDING_CELL);
  const stand = { x: entry.x + out.x * 0.6 * bu, y: entry.y, z: entry.z + out.z * 0.6 * bu };
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: stand });
  if (nest.founding && nest.founding.state === 'site-search') nest.founding.state = 'digging';
  nest.origin = { ...entry };
  nest.substrate = site.prim.material;
  if (nest.founding) nest.founding.cavitySeed = { ...tp.c };
  return true;
}

/**
 * Wood moisture at the queen for the opening's read-out (`opening.woodMoisture`, %): the wood she stands on or
 * faces within 1 BU, -1 when she is not at wood.
 */
export function woodMoistureAtQueen(sim: Sim, q: Ant): number {
  const hit = woodClimateAt(sim, q.pos, sim.world.bu);
  return hit ? hit.mc : -1;
}

/**
 * The site read-out of a wood nester (GDD 07 §5.2.3): antennating wood reads the wood, not the soil under it.
 * Diggability is the chewing speed (decay class and moisture, best = 1) and moisture is the brood-moisture band;
 * both fall to 0 at the zero-survival moisture (8 %). Inside wood the cell is roofed and above the ground water
 * (flood factor 1). Ground away from wood keeps the ground reading (not diggable for this species: poor).
 */
export function woodSiteReading(sim: Sim, p: Vec3, base: SiteReading): SiteReading {
  const def = speciesOf(sim);
  const wp = woodParamsOf(def);
  if (!wp || def.opening.mode !== 'claustral-wood') return base;
  const hit = woodAt(sim, p, 1.5 * sim.world.bu);
  if (!hit || !isFoundingWood(sim, hit.wood)) return base;
  const mc = hit.wood.moisture;
  const alive = Math.max(0, Math.min(1, (mc - wp.mcZeroSurvivalPct) / (wp.mcFullSurvivalPct - wp.mcZeroSurvivalPct)));
  const best = woodDecayFactor(wp, 3, wp.mcFullSurvivalPct);
  const fDig = Math.min(1, best / woodDecayFactor(wp, hit.wood.decay, mc)) * (mc >= wp.mcFullSurvivalPct ? 1 : alive);
  const factors = base.factors.slice();
  factors[0] = fDig;
  factors[1] = moistureScore(sim, mc);
  factors[3] = coverValueOf('ceiling');
  factors[4] = 1;
  const q = siteQuality(factors, def.id as Parameters<typeof siteQuality>[1]);
  return { ...base, factors, q, word: siteWordOf(q), raw: { ...base.raw, material: hit.prim.material, cover: 'ceiling' } };
}

autoFoundingRules.carve = carveWoodTemplate;
siteAssessRules.adjust = woodSiteReading;
