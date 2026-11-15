// The abstract colony model of a rival (GDD 05 §3.2): one hourly step on plain numbers, the winter rule, upkeep,
// carrying capacity, aggression and strength. Pure: no Sim, no randomness; the system feeds it the season,
// activity, claimed cells and real deliveries.

import type { Season } from '@/sim/types';
import {
  AGG_HUNGRY, AGG_SEASON, BIRTH_COST_C, BIRTH_COST_P, BIRTH_N_MIN, DEATH_BASE, DEATH_ORPHAN, DEATH_STARVE,
  DEMAND_C_PER_BIRTH, DEMAND_C_PER_U, DEMAND_P_PER_BIRTH, HARVEST_PER_N, K_CLAIM_CLAMP, MATURATION_GD, ORPHAN_AGG_MULT,
  PLAYER_S_FACTOR, S_AGG_BASE, S_AGG_SLOPE, SEASON_FACTOR, SPRING_FROM_DAY, STORE_C_CAP_U, STORE_P_BASE, STORE_P_PER_N,
  UPKEEP_PER_N, UPKEEP_PER_QUEEN, WINTER_LOSS, WINTER_LOSS_POOR, WINTER_POOR_U, WINTER_STORE_SHARE,
} from '@/sim/balance/rivals';
import type { RivalModelProfile } from '@/sim/species/rivals/profiles';

/** The numbers the model changes (a RivalAbstract satisfies this). */
export interface AbstractNumbers {
  n: number;
  b: number;
  cS: number;
  pS: number;
  agg: number;
}

/** Everything else one hourly step reads. */
export interface ModelEnv {
  profile: Pick<RivalModelProfile, 'kMax' | 'growthPerGd' | 'aggression' | 'aRef'>;
  queens: number;
  orphaned: boolean;
  claimedCells: number;
  season: Season;
  dayOfSeason: number;
  /** Activity 0..1 (temperature window and time of day). */
  activity: number;
  kMult: number;
  growthMult: number;
  aggMult: number;
  /** Real deliveries of returning agents during the last hour, loads. */
  realC: number;
  realP: number;
}

/** What one step did (for diagnostics and tests). */
export interface HourResult {
  births: number;
  matured: number;
  deaths: number;
  harvestC: number;
  harvestP: number;
  upkeepC: number;
  starving: boolean;
  kEff: number;
}

/** Upkeep U, C loads per gd. */
export function upkeepOf(n: number, queens: number): number {
  return UPKEEP_PER_N * n + UPKEEP_PER_QUEEN * queens;
}

/** Season growth factor sR (spring from its second day). */
export function seasonFactor(season: Season, dayOfSeason: number): number {
  if (season === 'spring' && dayOfSeason < SPRING_FROM_DAY) return 0;
  return SEASON_FACTOR[season];
}

/** K_eff = K_max x kMult x clamp(claimed / A_ref, 0.3, 1). */
export function kEffOf(kMax: number, kMult: number, claimedCells: number, aRef: number): number {
  const f = Math.min(K_CLAIM_CLAMP[1], Math.max(K_CLAIM_CLAMP[0], claimedCells / Math.max(1, aRef)));
  return kMax * kMult * f;
}

/** Potential births per gd: g x max(N, 20) x (1 - N / K_eff) x sR x growthMult (0 when orphaned, never negative). */
export function potentialBirths(n: number, kEff: number, g: number, sR: number, growthMult: number, orphaned: boolean): number {
  if (orphaned || kEff <= 0) return 0;
  return Math.max(0, g * Math.max(n, BIRTH_N_MIN) * (1 - n / kEff) * sR * growthMult);
}

/** Aggression: base x season x (1.3 when C_s < U) x aggMult (x0.5 orphaned), clamped 0..1. */
export function aggressionOf(base: number, season: Season, cS: number, upkeep: number, aggMult: number, orphaned: boolean): number {
  const a = base * AGG_SEASON[season] * (cS < upkeep ? AGG_HUNGRY : 1) * aggMult * (orphaned ? ORPHAN_AGG_MULT : 1);
  return Math.max(0, Math.min(1, a));
}

/** Store caps: C_s <= 10 U, P_s <= 0.2 N + 20. */
export function storeCaps(n: number, upkeep: number): { c: number; p: number } {
  return { c: STORE_C_CAP_U * upkeep, p: STORE_P_PER_N * n + STORE_P_BASE };
}

/** Strength of a rival for decisions: S = N x CP x (0.5 + 0.5 agg). */
export function rivalStrength(n: number, cp: number, agg: number): number {
  return n * cp * (S_AGG_BASE + S_AGG_SLOPE * agg);
}

/** Strength of the player colony: workers x CP x 0.75. */
export function playerStrength(workers: number, cp: number): number {
  return workers * cp * PLAYER_S_FACTOR;
}

/**
 * One step of dtGd (normally 1/24) in the active season. Order: virtual harvest in (capacity, demand, minus the
 * real deliveries), upkeep out, births (paid from the stores), maturation, deaths, store caps, aggression.
 */
export function abstractStep(m: AbstractNumbers, env: ModelEnv, dtGd: number): HourResult {
  const n0 = m.n;
  const upkeep = upkeepOf(n0, env.queens);
  const kEff = kEffOf(env.profile.kMax, env.kMult, env.claimedCells, env.profile.aRef);
  const sR = seasonFactor(env.season, env.dayOfSeason);
  const bPot = potentialBirths(n0, kEff, env.profile.growthPerGd, sR, env.growthMult, env.orphaned);
  // virtual harvest: min(capacity, demand) minus what the real agents brought in, split by the demand mix
  const cap = HARVEST_PER_N * n0 * env.activity;
  const dC = DEMAND_C_PER_U * upkeep + DEMAND_C_PER_BIRTH * bPot;
  const dP = DEMAND_P_PER_BIRTH * bPot;
  const wanted = Math.min(cap, dC + dP) * dtGd;
  const shareC = dC + dP > 0 ? dC / (dC + dP) : 1;
  const harvestC = Math.max(0, wanted * shareC - env.realC);
  const harvestP = Math.max(0, wanted * (1 - shareC) - env.realP);
  m.cS += harvestC;
  m.pS += harvestP;
  // upkeep
  const upkeepC = upkeep * dtGd;
  m.cS -= upkeepC;
  const starving = m.cS <= 0;
  if (m.cS < 0) m.cS = 0;
  // births into the brood pipeline, paid from the stores
  const births = Math.max(0, Math.min(bPot * dtGd, m.pS / BIRTH_COST_P, m.cS / BIRTH_COST_C));
  m.pS = Math.max(0, m.pS - births * BIRTH_COST_P);
  m.cS = Math.max(0, m.cS - births * BIRTH_COST_C);
  // maturation and deaths
  const matured = Math.min(m.b + births, (m.b / MATURATION_GD) * dtGd);
  const rate = DEATH_BASE + (starving ? DEATH_STARVE : 0) + (env.orphaned ? DEATH_ORPHAN : 0);
  const deaths = Math.min(n0, n0 * rate * dtGd);
  m.b = Math.max(0, m.b + births - matured);
  m.n = Math.max(0, n0 + matured - deaths);
  // caps and aggression on the new numbers
  const u1 = upkeepOf(m.n, env.queens);
  const caps = storeCaps(m.n, u1);
  m.cS = Math.min(m.cS, caps.c);
  m.pS = Math.min(m.pS, caps.p);
  m.agg = aggressionOf(env.profile.aggression, env.season, m.cS, u1, env.aggMult, env.orphaned);
  return { births, matured, deaths, harvestC, harvestP, upkeepC, starving, kEff };
}

/**
 * Winter (time-lapse) rule, applied once per winter: N x (1 - 0.08 - 0.10 x [C_s < 0.35 U]); the stores lose
 * 5 % of the (summer) upkeep x the season's length in gd; brood is frozen.
 */
export function applyWinter(m: AbstractNumbers, queens: number, seasonDays: number): void {
  const u = upkeepOf(m.n, queens);
  const poor = m.cS < WINTER_POOR_U * u;
  m.n = Math.max(0, m.n * (1 - WINTER_LOSS - (poor ? WINTER_LOSS_POOR : 0)));
  m.cS = Math.max(0, m.cS - WINTER_STORE_SHARE * u * seasonDays);
}
