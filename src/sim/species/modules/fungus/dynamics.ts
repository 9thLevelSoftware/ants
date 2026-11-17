// One garden over dtGd game days (GDD 07 §6.4.2 dynamics, §6.4.4 Escovopsis growth and weeding, §6.4.8 founding
// garden): growth, starvation, health, contamination, infection and the yield of staphylae. Pure: the economy
// system gathers the inputs (climate, gardeners, substrate) and applies the state machine (states.ts) after.

import type { GardenRecord } from '@/sim/types';
import type { FungusParams } from './params';
import { climateDamagePerGd, fHumidity, fTemp } from './climate';
import { HEALTH_RECOVER_MAX_C, HEALTH_RECOVER_TOXIN_MAX } from '@/sim/balance/species-leafcutter';

export interface GardenInputs {
  tempC: number;
  rh: number;
  /** Gardeners tending in the chamber (minims and small media on `garden`). */
  gardeners: number;
  /** Of those, weeding infected patches. */
  weeders: number;
  /** Substrate planted over the last game day, LU, and its load-weighted traits over the last 1.5 GD. */
  subIn1Gd: number;
  subQ: number;
  subP: number;
  subT: number;
  /**
   * The founding garden (GDD 07 §6.4.8): the queen's fertilisation stands in for substrate (fsub 1), ftend is 1 while
   * she is in the chamber, and a seeded garden grows at the founding rate.
   */
  founding: boolean;
  queenInChamber: boolean;
}

export interface GardenStepOut {
  /** Staphylae produced this step, FL. */
  yieldFl: number;
  /** Garden mass weeded out into waste this step, GU. */
  weeded: number;
  /** Health lost to each cause this step (for the death cause and the diagnostics). */
  lossHeat: number;
  lossCold: number;
  lossDry: number;
  lossPoison: number;
  lossInfection: number;
  lossStarvation: number;
}

const live = (g: GardenRecord) => g.state !== 'dead';

/** fsub = subIn1Gd / (SUB_NEED_PER_GU x G). */
export function fsubOf(P: FungusParams, g: GardenRecord, subIn1Gd: number): number {
  return g.biomass > 1e-9 ? subIn1Gd / (P.subNeedPerGu * g.biomass) : 0;
}

/** ftend = min(1, gardeners / (GARDENERS_PER_GU x G)). */
export function ftendOf(P: FungusParams, g: GardenRecord, gardeners: number): number {
  const need = P.gardenersPerGu * Math.max(g.biomass, 1e-9);
  return Math.min(1, Math.max(0, gardeners) / need);
}

/** weedCoverage = min(1, weeders / (0.25 x G)). */
export function weedCoverageOf(P: FungusParams, g: GardenRecord, weeders: number): number {
  return Math.min(1, Math.max(0, weeders) / (P.weedersPerGu * Math.max(g.biomass, 1e-9)));
}

/** Growth rate r: the burst rate while well supplied and small, else the sustained rate (GDD 07 §6.4.2). */
function growthRate(P: FungusParams, g: GardenRecord, fsub: number, gcap: number): number {
  if (fsub >= P.burstFsub && g.biomass < P.burstGFrac * gcap) return P.gardenRBurst;
  return P.gardenR;
}

/** Integrates one garden over dtGd. Mutates the record's numbers (not its state); returns yield and losses. */
export function stepGarden(P: FungusParams, g: GardenRecord, inp: GardenInputs, dtGd: number): GardenStepOut {
  const out: GardenStepOut = { yieldFl: 0, weeded: 0, lossHeat: 0, lossCold: 0, lossDry: 0, lossPoison: 0, lossInfection: 0, lossStarvation: 0 };
  if (!live(g) || !(dtGd > 0)) return out;
  const gcap = Math.max(1e-6, g.gcap ?? 1);
  const G = g.biomass;
  const fT = fTemp(P, inp.tempC), fRH = fHumidity(P, inp.rh);
  const fclim = fT * fRH;
  const fsub = inp.founding ? 1 : fsubOf(P, g, inp.subIn1Gd);
  const ftend = inp.founding && inp.queenInChamber ? 1 : ftendOf(P, g, inp.gardeners);
  const ftendEff = P.tendFloor + (1 - P.tendFloor) * ftend;
  const h = g.health, i = g.infection;
  const subQ = inp.founding ? 1 : inp.subQ;
  const subP = inp.founding ? 0 : inp.subP;
  const subT = inp.founding ? 0 : inp.subT;
  g.fT = fT; g.fRH = fRH; g.fclim = fclim; g.fsub = fsub; g.ftend = ftend;
  g.subQ = subQ; g.subP = subP; g.subT = subT;

  // growth (a seeded founding garden grows at the queen's founding rate)
  const r = inp.founding && g.state === 'seeded' ? P.foundingGrowth : growthRate(P, g, fsub, gcap);
  let dG = G * r * Math.min(fsub, 1) * fclim * h * (0.5 + 0.5 * subQ) * ftendEff * (1 - G / gcap);
  // maintenance unmet
  let starve = 0;
  if (fsub < P.starveFsub) starve = P.starveRate * G * (P.starveFsub - fsub) / P.starveFsub;
  dG -= starve;
  if (g.state === 'collapsing') dG -= P.collapseRate * G;

  // Escovopsis: logistic growth against weeding (GDD 07 §6.4.4); weeding removes infected mass into waste
  let di = 0, weeded = 0;
  if (i > 0) {
    const cov = weedCoverageOf(P, g, inp.weeders);
    di = P.escR * i * (1 - i) - P.weedR * cov * i;
    if (cov > 0) weeded = P.weedMassFrac * i * G * Math.min(1, cov / 1);
  }

  // health
  const dmg = climateDamagePerGd(P, inp.tempC, inp.rh);
  const poison = P.subProteinRate * Math.max(0, subP - P.subProteinMax) + P.subToxinRate * subT;
  const infection = P.escHealthRate * i;
  let dh = -(dmg.heat + dmg.cold + dmg.dry + poison + infection);
  const contamination = g.contamination ?? 0;
  // "no toxin" is read as no harmful dose: every plant carries some defence, ordinary herbage only a trace
  if (i <= 0 && contamination < HEALTH_RECOVER_MAX_C && fclim >= P.healthRecoverFclim && subT <= HEALTH_RECOVER_TOXIN_MAX) dh += P.healthRecover;

  // contamination from retained waste
  let dc = 0;
  const W = g.waste;
  if (G > 1e-9 && W > P.contamWasteFrac * G) dc = P.contamRate * (W / G - P.contamWasteFrac) / P.contamWasteFrac;
  else if (W <= P.contamClearWasteFrac * Math.max(G, 1e-9)) dc = -P.contamClearRate;

  // yield (before this step's changes): full when healthy, half while establishing, scaled by health
  let yieldRate = P.yieldPerGu * G * h * (fclim >= 0.5 ? 1 : fclim);
  if (g.state === 'seeded' || g.state === 'establishing') yieldRate *= P.establishingYieldMult;

  g.biomass = Math.max(0, G + dG * dtGd - weeded * dtGd);
  g.waste = W + weeded * dtGd;
  g.health = Math.max(0, Math.min(1, h + dh * dtGd));
  g.infection = Math.max(0, Math.min(1, i + di * dtGd));
  g.contamination = Math.max(0, Math.min(1, contamination + dc * dtGd));
  out.yieldFl = Math.max(0, yieldRate * dtGd);
  out.weeded = weeded * dtGd;
  out.lossHeat = dmg.heat * dtGd;
  out.lossCold = dmg.cold * dtGd;
  out.lossDry = dmg.dry * dtGd;
  out.lossPoison = poison * dtGd;
  out.lossInfection = infection * dtGd;
  out.lossStarvation = starve * dtGd;
  return out;
}
