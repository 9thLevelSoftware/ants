// Seed cohorts in one granary (GDD 07 §6.3.3-6.3.4): moisture u following the chamber humidity, the germination
// clock g while damp, germinating and sprouted states, rot while wet, and merging new seeds. Pure functions over
// plain state; the systems and the action primitives call them.

import { clamp } from '@/core/math/scalar';
import type { GranaryState, SeedClass, SeedCohort, SeedCohortState } from '@/sim/types';
import { COHORT_MIN_LOADS, COHORTS_MAX } from '@/sim/balance/species-harvester';
import type { GranaryParams } from './params';

/** Seed class of a seed carrying `loads` (the class table's load values, GDD 07 §6.3.1). */
export function seedClassOf(g: GranaryParams, loads: number): SeedClass {
  if (loads >= (g.seedLoadsM + g.seedLoadsL) / 2) return 'L';
  if (loads >= (g.seedLoadsS + g.seedLoadsM) / 2) return 'M';
  return 'S';
}

/** Seed loads of one seed of a class. */
export function loadsOfClass(g: GranaryParams, c: SeedClass): number {
  return c === 'S' ? g.seedLoadsS : c === 'M' ? g.seedLoadsM : g.seedLoadsL;
}

/** Hardness band 0 (0.0-0.3), 1 (0.3-0.6), 2 (0.6-1.0). */
export function hardnessBand(h: number): number {
  return h < 0.3 ? 0 : h < 0.6 ? 1 : 2;
}

/** Germination temperature factor: 0 at <= germTempMinC, 1 at germTempRefC, germFactorHot at >= germTempHotC. */
export function germTempFactor(g: GranaryParams, tempC: number): number {
  if (tempC <= g.germTempMinC) return 0;
  if (tempC <= g.germTempRefC) return (tempC - g.germTempMinC) / (g.germTempRefC - g.germTempMinC);
  if (tempC >= g.germTempHotC) return g.germFactorHot;
  return 1 + (g.germFactorHot - 1) * ((tempC - g.germTempRefC) / (g.germTempHotC - g.germTempRefC));
}

/** Germination clock speed of a cohort now, per game day (0 when dry, degermed or too cold). */
export function germRatePerGd(g: GranaryParams, c: SeedCohort, tempC: number): number {
  if (c.degermed || c.u <= g.uDamp) return 0;
  return ((c.u - g.uDamp) / g.germDenominator) * germTempFactor(g, tempC);
}

/** The state a cohort is in from its numbers (sprouted > germinating > rotting > damp > stored). */
export function cohortStateOf(g: GranaryParams, c: SeedCohort): SeedCohortState {
  if (c.g >= g.sproutedG) return 'sprouted';
  if (c.g >= g.germinatingG && !c.degermed) return 'germinating';
  if ((c.wetGd ?? 0) >= g.rotWetGd) return 'rotting';
  if (c.u > g.uDamp) return 'damp';
  return 'stored';
}

export function newCohort(g: GranaryParams, seedClass: SeedClass, hardness: number, loads: number, u: number, gProg: number, degermed = false): SeedCohort {
  const c: SeedCohort = { seedClass, state: 'stored', loads, hardness, u, g: gProg, degermed, wetGd: 0, sproutedGd: 0 };
  c.state = cohortStateOf(g, c);
  return c;
}

/** Whether new seeds may merge into this cohort (same class, band and germ state; not germinating yet). */
function mergeable(g: GranaryParams, c: SeedCohort, seedClass: SeedClass, hardness: number, degermed: boolean): boolean {
  return c.seedClass === seedClass && hardnessBand(c.hardness) === hardnessBand(hardness) && !!c.degermed === degermed
    && c.g < g.germinatingG;
}

/**
 * Adds seed loads to a granary: they merge into the matching cohort with load-weighted u, g and hardness (GDD 07
 * §6.3.3), else start a cohort. With COHORTS_MAX cohorts the closest cohort by u, g and class takes them, but only
 * one with the same germ state (degermed or not) that is not germinating yet: gnawed seed must stay degermed, fresh
 * seed must keep its germ, and nothing merges into seed whose radicle is out. With no such cohort a new one starts
 * (at most two beyond the cap, one of each germ state).
 */
export function addSeeds(gr: GranaryState, g: GranaryParams, seedClass: SeedClass, hardness: number, loads: number, u: number, gProg = 0, degermed = false): void {
  if (!(loads > 0)) return;
  let into = gr.cohorts.find((c) => mergeable(g, c, seedClass, hardness, degermed));
  if (!into && gr.cohorts.length >= COHORTS_MAX) {
    let best = Infinity;
    for (const c of gr.cohorts) {
      if (!!c.degermed !== degermed || c.g >= g.germinatingG) continue;
      const d = Math.abs(c.u - u) + Math.abs(c.g - gProg) + (c.seedClass === seedClass ? 0 : 1);
      if (d < best) { best = d; into = c; }
    }
  }
  if (!into) { gr.cohorts.push(newCohort(g, seedClass, hardness, loads, u, gProg, degermed)); return; }
  const w = into.loads + loads;
  into.u = (into.u * into.loads + u * loads) / w;
  into.g = (into.g * into.loads + gProg * loads) / w;
  into.hardness = (into.hardness * into.loads + hardness * loads) / w;
  into.loads = w;
  into.state = cohortStateOf(g, into);
}

/** Loads lost to rot by one step (the caller turns them into refuse). */
export interface StepResult { rotten: number }

/**
 * Advances every cohort of a granary by dtGd game days at the chamber's humidity and temperature: u relaxes toward
 * the humidity at seedURate per GD; damp seeds (u > uDamp) germinate at (u - uDamp) / germDenominator x fT per GD
 * unless degermed; u > uRot for rotWetGd starts rot at rotRatePerGd of the loads; sprouted seeds rot as a whole once
 * sproutedExpireGd has passed.
 */
export function stepCohorts(gr: GranaryState, g: GranaryParams, humidity: number, tempC: number, dtGd: number): StepResult {
  let rotten = 0;
  const relax = 1 - Math.exp(-g.seedURate * dtGd);
  const fT = germTempFactor(g, tempC);
  for (const c of gr.cohorts) {
    c.u = clamp(c.u + (humidity - c.u) * relax, 0, 1);
    if (c.g >= g.sproutedG) {
      c.sproutedGd = (c.sproutedGd ?? 0) + dtGd;
      if (c.sproutedGd >= g.sproutedExpireGd) { rotten += c.loads; c.loads = 0; continue; }
    } else if (!c.degermed && c.u > g.uDamp) {
      c.g = Math.min(g.sproutedG, c.g + ((c.u - g.uDamp) / g.germDenominator) * fT * dtGd);
    }
    if (c.u > g.uRot) {
      c.wetGd = (c.wetGd ?? 0) + dtGd;
      if (c.wetGd >= g.rotWetGd) {
        const lost = c.loads * (1 - Math.exp(-g.rotRatePerGd * dtGd));
        c.loads -= lost;
        rotten += lost;
      }
    } else {
      c.wetGd = 0;
    }
    c.state = cohortStateOf(g, c);
  }
  pruneCohorts(gr);
  return { rotten };
}

/** Drops empty cohorts. */
export function pruneCohorts(gr: GranaryState): void {
  if (gr.cohorts.some((c) => c.loads < COHORT_MIN_LOADS)) gr.cohorts = gr.cohorts.filter((c) => c.loads >= COHORT_MIN_LOADS);
}

/** Totals of a granary by state, loads. */
export interface GranaryTotals { loads: number; stored: number; damp: number; germinating: number; sprouted: number; rotting: number }

export function totalsOf(gr: GranaryState): GranaryTotals {
  const t: GranaryTotals = { loads: 0, stored: 0, damp: 0, germinating: 0, sprouted: 0, rotting: 0 };
  for (const c of gr.cohorts) {
    t.loads += c.loads;
    if (c.state === 'stored') t.stored += c.loads;
    else if (c.state === 'damp') t.damp += c.loads;
    else if (c.state === 'germinating') t.germinating += c.loads;
    else if (c.state === 'sprouted') t.sprouted += c.loads;
    else if (c.state === 'rotting') t.rotting += c.loads;
  }
  return t;
}

/** Germinating (radicle out, not yet sprouted) loads of a granary. */
export function germinatingLoads(gr: GranaryState): number {
  let n = 0;
  for (const c of gr.cohorts) if (c.state === 'germinating') n += c.loads;
  return n;
}

/**
 * Radicle gnawing (GDD 07 §6.3.4): `loads` of germinating (or sprouted) seed move to a degermed cohort with g = 0.
 * Returns the loads gnawed.
 */
export function gnawLoads(gr: GranaryState, g: GranaryParams, loads: number, includeSprouted = true): number {
  let left = loads;
  const sorted = [...gr.cohorts].sort((a, b) => b.g - a.g);
  for (const c of sorted) {
    if (left <= 0) break;
    const ok = c.state === 'germinating' || (includeSprouted && c.state === 'sprouted');
    if (!ok) continue;
    const take = Math.min(left, c.loads);
    c.loads -= take;
    left -= take;
    addSeeds(gr, g, c.seedClass, c.hardness, take, c.u, 0, true);
    c.state = cohortStateOf(g, c);
  }
  pruneCohorts(gr);
  return loads - left;
}
