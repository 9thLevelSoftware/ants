// Milling seeds into paste (GDD 07 §6.3.6), paste spoilage, the paste that tops up the colony pool (the pool is what
// nurses load their crops from to feed larvae, the queen and adults), and the animal share of the pool's protein
// (§6.3.7). Paste exists only by milling: seeds in the granary feed nobody.

import type { Ant, Colony, GranaryModule, GranaryState, SeedCohort } from '@/sim/types';
import { deposit } from '@/sim/colony/stores';
import { PASTE_POOL_BUFFER_GD, PASTE_RELEASE_MIN } from '@/sim/balance/species-harvester';
import type { GranaryParams } from './params';
import { cohortStateOf, pruneCohorts } from './cohorts';

/**
 * Game seconds one load of this cohort takes the ant to mill, at work rate 1; Infinity when the ant may not mill
 * it. Majors: millBaseS x (1 + millHardnessMult x hardness). Media of at least millMediaMinBu: only hardness up to
 * millMediaMaxHardness, x millMediaTimeMult. Sprouted seed is soft: any caste mills it at sproutedMillTimeMult of
 * the major's time (GDD 07 §6.3.4; §6.3.6 "minors only sprouted seeds"; the minors' action list in §5.3.1 omits
 * `mill-seed`, so actions.ts admits minors through `who` for sprouted seed only).
 */
export function millSecondsPerLoad(g: GranaryParams, ant: Pick<Ant, 'caste' | 'lengthBu'>, c: SeedCohort): number {
  const sprouted = c.state === 'sprouted';
  let mult: number;
  if (ant.caste === 'major') mult = 1;
  else if (ant.caste === 'media' && ant.lengthBu >= g.millMediaMinBu && (sprouted || c.hardness <= g.millMediaMaxHardness)) mult = g.millMediaTimeMult;
  else if (sprouted && (ant.caste === 'minor' || ant.caste === 'media')) mult = 1; // §6.3.4: sprouted seed, any caste
  else return Infinity;
  const base = g.millBaseS * (1 + g.millHardnessMult * c.hardness) * mult;
  return sprouted ? base * g.sproutedMillTimeMult : base;
}

/** The cohort of a granary this ant mills first: sprouted (it rots otherwise), then the fastest; null none. */
export function millCohort(g: GranaryParams, ant: Pick<Ant, 'caste' | 'lengthBu'>, gr: GranaryState): SeedCohort | null {
  let best: SeedCohort | null = null, bestS = Infinity;
  for (const c of gr.cohorts) {
    if (c.loads <= 0) continue;
    const s = millSecondsPerLoad(g, ant, c) * (c.state === 'sprouted' ? 0.01 : 1);
    if (s < bestS) { best = c; bestS = s; }
  }
  return Number.isFinite(bestS) ? best : null;
}

/** Paste and chaff made from milled loads of a cohort. */
export function millYield(g: GranaryParams, c: SeedCohort, loads: number): { paste: number; chaff: number } {
  const y = c.state === 'sprouted' ? g.sproutedPasteYield : g.pasteYield;
  return { paste: loads * y, chaff: loads * (1 - y) };
}

/** Mills `loads` of the cohort: the seed leaves the granary, paste joins the stock, chaff waits for the midden. */
export function millLoads(mod: GranaryModule, gr: GranaryState, g: GranaryParams, c: SeedCohort, loads: number): { paste: number; chaff: number } {
  const x = Math.min(loads, c.loads);
  if (!(x > 0)) return { paste: 0, chaff: 0 };
  const out = millYield(g, c, x);
  c.loads -= x;
  c.state = cohortStateOf(g, c);
  pruneCohorts(gr);
  mod.pasteLoads += out.paste;
  mod.chaffPending = (mod.chaffPending ?? 0) + out.chaff;
  mod.milledToday = (mod.milledToday ?? 0) + x;
  return out;
}

/** Paste spoils with half-life pasteHalfLifeGd (GDD 07 §6.3.6). */
export function decayPaste(mod: GranaryModule, g: GranaryParams, dtGd: number): void {
  mod.pasteLoads *= Math.pow(0.5, dtGd / g.pasteHalfLifeGd);
  if (mod.pasteLoads < 1e-9) mod.pasteLoads = 0;
}

/** Paste demand of the colony, paste loads per game day: what keeps its C and P needs met from paste alone. */
export function pasteDemandPerGd(g: GranaryParams, col: Colony): number {
  return Math.max(col.needs.rateC / g.pasteC, col.needs.rateP / g.pasteP, 0);
}

/**
 * Keeps the colony pool topped up from the paste stock to PASTE_POOL_BUFFER_GD of its need, per nutrient. The
 * paste taken is gone whether or not the pool had room for all of its C (a full social stomach wastes it).
 * Returns the paste loads released.
 */
export function releasePaste(col: Colony, mod: GranaryModule, g: GranaryParams): number {
  if (mod.pasteLoads <= 0) return 0;
  const tC = col.needs.rateC * PASTE_POOL_BUFFER_GD, tP = col.needs.rateP * PASTE_POOL_BUFFER_GD;
  const want = Math.max((tC - col.stores.c) / g.pasteC, (tP - col.stores.p) / g.pasteP, 0);
  if (want < PASTE_RELEASE_MIN) return 0;
  const x = Math.min(want, mod.pasteLoads);
  const got = deposit(col, x * g.pasteC, x * g.pasteP, 0, 'delivery');
  if (got.c + got.p <= 0) return 0;
  mod.pasteLoads -= x;
  mod.pasteUseToday = (mod.pasteUseToday ?? 0) + x;
  return x;
}

/**
 * Animal share of the pool's protein. Called once per granary step, before any release: the pool's P was used in
 * proportion since the last step, so the animal part keeps its share of what is left.
 */
export function rescaleAnimalP(col: Colony, mod: GranaryModule): void {
  const last = mod.poolPLast ?? 0;
  const p = col.stores.p;
  let a = mod.poolAnimalP ?? 0;
  if (last > 0 && p < last) a *= p / last;
  mod.poolAnimalP = Math.max(0, Math.min(a, p));
}

/** Animal protein that just entered the pool (a carrion or prey item put down in the nest). */
export function addAnimalP(mod: GranaryModule, p: number): void {
  mod.poolAnimalP = (mod.poolAnimalP ?? 0) + Math.max(0, p);
}

/** Fraction of the pool's P that is animal now, 0..1. */
export function animalFraction(col: Colony, mod: GranaryModule): number {
  return col.stores.p > 0 ? Math.min(1, (mod.poolAnimalP ?? 0) / col.stores.p) : 0;
}
