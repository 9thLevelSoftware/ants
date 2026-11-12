// Loader validation of a SpeciesDef (GDD 07 §3.16): the loader rejects a definition that fails. Pure and
// allocation-light; runs when species are registered (src/sim/species/index.ts) and in the tests.
//
// Rule ids: `3.16.1` .. `3.16.7` are the numbered rules of GDD 07 §3.16; `x.*` are structural checks the schema
// implies (finite numbers, ordered curves, unique castes, mix rows that sum to 1).

import type { Curve, SpeciesDef } from '@/sim/types';
import { DEFAULT_DAYS_PER_YEAR } from '@/sim/time';
import {
  ACTION_IDS, ALARM_MODES, CASTES, CHAMBER_TYPES, CLIMATE_IDS, DIRECTIVE_EXTRAS, ECONOMY_MODULES, FOOD_KINDS,
  FOOD_ROUTES, FOUNDING_MODES, LARVA_FOODS, MIDDEN_STYLES, MOUND_STYLES, MATERIALS, SEASONS, SPECIES_IDS, SPECIES_TIERS,
  SUBFAMILIES, TASK_SUBTYPES, TASKS, WEAPONS, WINTER_MODES, allCodexIds, isOneOf,
} from '@/sim/types';

export interface ValidationIssue {
  /** `3.16.<n>` or `x.<name>`. */
  rule: string;
  /** Dotted path into the definition. */
  path: string;
  message: string;
}

/** Species data always uses default-year day numbers (00-index C1). */
const DEFAULT_YEAR_DAYS = DEFAULT_DAYS_PER_YEAR;
/** Tolerance of the standard-worker length (1.0 +- 0.1 BU) and of the devRate value at the reference temperature. */
const STD_LENGTH_TOL = 0.1;
const DEV_REF_TOL = 0.01;
const EPS = 1e-9;
/** Adult worker cap of every species (rule 7). */
export const SIM_CAP_MAX = 1500;

/** Castes that count as the species' standard worker (`m = 1`): the monomorphic worker or the polymorphic media. */
const STANDARD_CASTES = ['worker', 'media'] as const;

class Collector {
  readonly issues: ValidationIssue[] = [];
  add(rule: string, path: string, message: string): void {
    this.issues.push({ rule, path, message });
  }
  /** Records an issue unless `ok`. */
  check(ok: boolean, rule: string, path: string, message: string): void {
    if (!ok) this.add(rule, path, message);
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Checks `keys` (first element of every pair) are strictly increasing and every number is finite. */
function checkCurve(c: Collector, rule: string, path: string, curve: Curve): boolean {
  if (curve.length === 0) { c.add(rule, path, 'curve is empty'); return false; }
  let ok = true;
  for (let i = 0; i < curve.length; i++) {
    const [x, y] = curve[i];
    if (!finite(x) || !finite(y)) { c.add(rule, `${path}[${i}]`, 'not finite'); ok = false; continue; }
    if (i > 0 && !(x > curve[i - 1][0])) { c.add(rule, `${path}[${i}]`, `key ${x} is not above ${curve[i - 1][0]}`); ok = false; }
  }
  return ok;
}

/** Every key of `rec` is a member of `set` (rule 5 style canonical-id check). */
function checkKeys(c: Collector, rule: string, path: string, rec: Record<string, unknown>, set: readonly string[]): void {
  for (const k of Object.keys(rec)) c.check(isOneOf(set, k), rule, `${path}.${k}`, `'${k}' is not a canonical id`);
}

function checkMembers(c: Collector, rule: string, path: string, list: readonly string[], set: readonly string[]): void {
  list.forEach((v, i) => c.check(isOneOf(set, v), rule, `${path}[${i}]`, `'${v}' is not a canonical id`));
}

/** All numbers found anywhere under `v` must be finite (NaN or Infinity in species data is always a typo). */
function checkFiniteDeep(c: Collector, path: string, v: unknown): void {
  if (typeof v === 'number') c.check(Number.isFinite(v), 'x.finite', path, `${v} is not finite`);
  else if (Array.isArray(v)) v.forEach((e, i) => checkFiniteDeep(c, `${path}[${i}]`, e));
  else if (v && typeof v === 'object') for (const [k, e] of Object.entries(v)) checkFiniteDeep(c, `${path}.${k}`, e);
}

function checkCastes(c: Collector, def: SpeciesDef): void {
  const seen = new Set<string>();
  def.castes.forEach((cd, i) => {
    const p = `castes[${i}](${cd.caste})`;
    c.check(isOneOf(CASTES, cd.caste), '3.16.5', `${p}.caste`, 'not a canonical caste');
    c.check(!seen.has(cd.caste), 'x.castes', p, 'caste defined twice');
    seen.add(cd.caste);
    const l = cd.lengthBu;
    c.check(l.min > 0 && l.min <= l.mean + EPS && l.mean <= l.max + EPS, '3.16.1', `${p}.lengthBu`, `needs 0 < min <= mean <= max, got ${l.min} / ${l.mean} / ${l.max}`);
    c.check(cd.casteMassMg > 0, 'x.castes', `${p}.casteMassMg`, 'mass must be positive');
    c.check(cd.sprintBuS > 0 && cd.cruiseMult > 0, 'x.castes', `${p}.speed`, 'speeds must be positive');
    c.check(cd.lifespanGd.mean > 0 && cd.lifespanGd.sd >= 0, 'x.castes', `${p}.lifespanGd`, 'needs mean > 0 and sd >= 0');
    c.check(cd.mandibleFactor > 0, 'x.castes', `${p}.mandibleFactor`, 'must be positive');
    c.check(cd.ageRateOutside > 0 && cd.ageRateDormant >= 0, 'x.castes', `${p}.ageRate`, 'rates must be positive');
    cd.sizeClasses.forEach((s, j) => c.check(s.minBu < s.maxBu, '3.16.1', `${p}.sizeClasses[${j}]`, 'minBu must be below maxBu'));
    checkCurve(c, 'x.castes', `${p}.lifespanBySize`, cd.lifespanBySize.length ? cd.lifespanBySize : [[0, 1]]);
    checkMembers(c, '3.16.4', `${p}.actions`, cd.actions, ACTION_IDS);
    c.check(new Set(cd.actions).size === cd.actions.length, 'x.castes', `${p}.actions`, 'duplicate action');
    checkKeys(c, '3.16.5', `${p}.taskWeights`, cd.taskWeights, TASKS);
    for (const [t, w] of Object.entries(cd.taskWeights)) c.check(w >= 0 && w <= 1, 'x.castes', `${p}.taskWeights.${t}`, 'weight must be within 0..1');
    // The brood and economy code multiplies by these: zero or negative values give zero-length stages or negative costs.
    c.check(cd.devMult > 0, 'x.castes', `${p}.devMult`, 'development multiplier must be positive');
    c.check(cd.cropMax === null || cd.cropMax >= 0, 'x.castes', `${p}.cropMax`, 'crop cap must not be negative');
    c.check(cd.carryOverride === null || cd.carryOverride >= 0, 'x.castes', `${p}.carryOverride`, 'carry cap must not be negative');
    if (cd.upkeepOverride) {
      const u = cd.upkeepOverride;
      c.check(u.restC >= 0 && u.activeC >= 0 && u.p >= 0, 'x.castes', `${p}.upkeepOverride`, 'upkeep must not be negative');
    }
    if (cd.fixedStats) c.check(cd.fixedStats.maxHp > 0 && cd.fixedStats.bite >= 0, 'x.castes', `${p}.fixedStats`, 'needs maxHp > 0, bite >= 0');
  });
  for (const must of ['queen', 'gyne', 'male'] as const) c.check(seen.has(must), 'x.castes', 'castes', `missing caste ${must}`);
  c.check(STANDARD_CASTES.some((s) => seen.has(s)), 'x.castes', 'castes', 'missing a standard worker caste (worker or media)');
}

/** Rule 1: the standard worker's mean is 1.0 +- 0.1 BU and `buMm` is that worker's length in whole mm. */
function checkStandardWorker(c: Collector, def: SpeciesDef): void {
  const std = def.castes.find((x) => x.caste === 'worker') ?? def.castes.find((x) => x.caste === 'media');
  c.check(Number.isInteger(def.buMm) && def.buMm > 0, '3.16.1', 'buMm', `buMm must be a whole number of mm, got ${def.buMm}`);
  if (!std) return;
  c.check(Math.abs(std.lengthBu.mean - 1) <= STD_LENGTH_TOL + EPS, '3.16.1', `castes(${std.caste}).lengthBu.mean`, `standard worker mean must be 1.0 +- 0.1 BU, got ${std.lengthBu.mean}`);
  c.check(std.casteMassMg === def.stdMassMg, '3.16.1', 'stdMassMg', `stdMassMg ${def.stdMassMg} must equal the standard worker's casteMassMg ${std.casteMassMg}`);
}

function checkLife(c: Collector, def: SpeciesDef): void {
  const L = def.life;
  // Rule 2: devRate keys strictly increasing, 1.0 at devRefC, zeros at both ends.
  if (checkCurve(c, '3.16.2', 'life.devRate', L.devRate)) {
    const first = L.devRate[0], last = L.devRate[L.devRate.length - 1];
    c.check(first[1] === 0 && last[1] === 0, '3.16.2', 'life.devRate', 'must be 0 at both ends');
    c.check(L.devRate.every(([, r]) => r >= 0), '3.16.2', 'life.devRate', 'rates must not be negative');
    c.check(L.devRefC >= first[0] && L.devRefC <= last[0], '3.16.2', 'life.devRefC', 'reference temperature is outside the table');
    c.check(Math.abs(curveValue(L.devRate, L.devRefC) - 1) <= DEV_REF_TOL, '3.16.2', 'life.devRate', `value at devRefC ${L.devRefC} must be 1.0 +- 0.01`);
  }
  // Rule 3: the season factor covers the whole default year with keys in [0, 28].
  if (checkCurve(c, '3.16.3', 'life.fSeason', L.fSeason)) {
    c.check(L.fSeason[0][0] === 0, '3.16.3', 'life.fSeason', 'first key must be d28 = 0');
    c.check(L.fSeason[L.fSeason.length - 1][0] >= DEFAULT_YEAR_DAYS - EPS, '3.16.3', 'life.fSeason', `last key must reach d28 = ${DEFAULT_YEAR_DAYS}`);
    c.check(L.fSeason.every(([d, f]) => d >= 0 && d <= DEFAULT_YEAR_DAYS && f >= 0 && f <= 1), '3.16.3', 'life.fSeason', 'keys must lie in [0, 28] and factors in [0, 1]');
  }
  if (checkCurve(c, 'x.life', 'life.fTempQ', L.fTempQ)) {
    c.check(L.fTempQ[0][1] === 0 && L.fTempQ[L.fTempQ.length - 1][1] === 0, 'x.life', 'life.fTempQ', 'must be 0 at both ends');
  }
  L.layWindows?.forEach(([a, b], i) => c.check(a >= 0 && b > a && b <= DEFAULT_YEAR_DAYS, '3.16.3', `life.layWindows[${i}]`, `window [${a}, ${b}) must lie in [0, 28]`));
  c.check(L.qMax > 0 && L.sizeBase >= 0 && L.sizeBase <= 1 && L.sizeK > 0, 'x.life', 'life', 'needs qMax > 0, 0 <= sizeBase <= 1, sizeK > 0');
  c.check(L.queenLifespanYears.min > 0 && L.queenLifespanYears.max >= L.queenLifespanYears.min, 'x.life', 'life.queenLifespanYears', 'needs 0 < min <= max');
  for (const s of ['egg', 'larva', 'pupa'] as const) c.check(L.stageGd[s] > 0, 'x.life', `life.stageGd.${s}`, 'duration must be positive');
  c.check(isOneOf(LARVA_FOODS, L.larvaFood), '3.16.5', 'life.larvaFood', 'not a canonical larva food');
  c.check(L.animalProteinMinFrac >= 0 && L.animalProteinMinFrac <= 1, 'x.life', 'life.animalProteinMinFrac', 'must be within 0..1');
  // casteMixTarget rows [N, minor, media, major]: N strictly increasing, shares sum to 1.
  let prevN = -Infinity;
  L.casteMixTarget.forEach((r, i) => {
    c.check(r[0] > prevN, 'x.life', `life.casteMixTarget[${i}]`, 'N must increase');
    prevN = r[0];
    c.check(Math.abs(r[1] + r[2] + r[3] - 1) < 1e-6 && r.slice(1).every((s) => s >= 0), 'x.life', `life.casteMixTarget[${i}]`, 'shares must be non-negative and sum to 1');
  });
  c.check(L.casteMixTarget.length > 0, 'x.life', 'life.casteMixTarget', 'needs at least one row');
}

function checkOpening(c: Collector, def: SpeciesDef): void {
  const o = def.opening;
  c.check(isOneOf(FOUNDING_MODES, o.mode), '3.16.5', 'opening.mode', 'not a canonical founding mode');
  checkKeys(c, '3.16.5', 'opening.siteMaterials', o.siteMaterials, MATERIALS);
  for (const [m, v] of Object.entries(o.siteMaterials)) c.check(v >= 0 && v <= 1, 'x.opening', `opening.siteMaterials.${m}`, 'suitability must be within 0..1');
  c.check(o.dMinOpenBu > 0 && o.dMinCoverBu > 0 && o.vMinBu3 > 0 && o.wMinBu > 0 && o.shaftTargetBu > 0, 'x.opening', 'opening', 'founding geometry must be positive');
  c.check(o.clutchCap > 0 && o.R0 > 0, 'x.opening', 'opening', 'R0 and clutchCap must be positive');
  c.check(o.trophicFraction >= 0 && o.trophicFraction < 1, 'x.opening', 'opening.trophicFraction', 'must be within [0, 1)');
  c.check(isOneOf(CASTES, o.firstBroodClass.caste), '3.16.5', 'opening.firstBroodClass', 'not a canonical caste');
  c.check(def.castes.some((x) => x.caste === o.firstBroodClass.caste), 'x.opening', 'opening.firstBroodClass', `species has no '${o.firstBroodClass.caste}' caste`);
  c.check(o.expectedFirstWorkers.min > 0 && o.expectedFirstWorkers.max >= o.expectedFirstWorkers.min, 'x.opening', 'opening.expectedFirstWorkers', 'needs 0 < min <= max');
  const d = o.startDoy;
  c.check(d.min >= 1 && d.max <= DEFAULT_YEAR_DAYS && d.min <= d.default && d.default <= d.max, '3.16.3', 'opening.startDoy', 'needs 1 <= min <= default <= max <= 28');
  c.check(o.startHours[0] >= 0 && o.startHours[1] <= 24 && o.startHours[0] < o.startHours[1], 'x.opening', 'opening.startHours', 'needs 0 <= h0 < h1 <= 24');
}

function checkScale(c: Collector, def: SpeciesDef): void {
  const s = def.scale;
  // Rule 7.
  c.check(s.simCapWorkers > 0 && s.simCapWorkers <= SIM_CAP_MAX, '3.16.7', 'scale.simCapWorkers', `must be within 1..${SIM_CAP_MAX}, got ${s.simCapWorkers}`);
  c.check(s.wildColonySize.max >= s.simCapWorkers, '3.16.7', 'scale.wildColonySize.max', 'must be at least simCapWorkers');
  c.check(s.wildColonySize.typical[0] <= s.wildColonySize.typical[1] && s.wildColonySize.typical[1] <= s.wildColonySize.max, '3.16.7', 'scale.wildColonySize', 'needs typical min <= max <= max');
  c.check(s.growThreshold > 0 && s.matureThreshold > s.growThreshold, 'x.scale', 'scale', 'needs 0 < growThreshold < matureThreshold');
  let prevYear = 0;
  s.growthTargets.forEach(([y, lo, hi], i) => {
    c.check(y > prevYear && lo >= 0 && hi >= lo, 'x.scale', `scale.growthTargets[${i}]`, 'needs increasing years and 0 <= min <= max');
    c.check(hi <= s.simCapWorkers, 'x.scale', `scale.growthTargets[${i}]`, 'a target above the worker cap cannot be reached');
    prevYear = y;
  });
}

function checkReproduction(c: Collector, def: SpeciesDef): void {
  const r = def.reproduction;
  const win = (p: string, w: readonly [number, number]): void =>
    c.check(w[0] >= 1 && w[1] <= DEFAULT_YEAR_DAYS && w[0] <= w[1], '3.16.3', p, `needs 1 <= doy0 <= doy1 <= 28, got ${w[0]}-${w[1]}`);
  win('reproduction.alateLayWindow', r.alateLayWindow);
  win('reproduction.alateFlightWindow', r.alateFlightWindow);
  c.check(r.flightPeak[0] >= r.alateFlightWindow[0] && r.flightPeak[1] <= r.alateFlightWindow[1] && r.flightPeak[0] <= r.flightPeak[1], 'x.reproduction', 'reproduction.flightPeak', 'must lie inside the flight window');
  c.check(r.launchHours.every((h) => h >= 0 && h <= 24), 'x.reproduction', 'reproduction.launchHours', 'hours must be within 0..24 (h1 < h0 wraps midnight)');
  c.check(r.reproMaxFrac > 0 && r.reproMaxFrac <= 1 && r.reproGyneShare >= 0 && r.reproGyneShare <= 1, 'x.reproduction', 'reproduction', 'fractions must be within 0..1');
  c.check(r.sexualCostMult.gyne > 0 && r.sexualCostMult.male > 0, 'x.reproduction', 'reproduction.sexualCostMult', 'must be positive');
  for (const k of ['pAir', 'pMate', 'pFound'] as const) c.check(r[k] > 0 && r[k] <= 1, 'x.reproduction', `reproduction.${k}`, 'probability must be within (0, 1]');
  c.check(r.matureAgeYears > 0, 'x.reproduction', 'reproduction.matureAgeYears', 'must be positive');
}

function checkDiet(c: Collector, def: SpeciesDef): void {
  checkKeys(c, '3.16.5', 'diet.foods', def.diet.foods, FOOD_KINDS);
  for (const [k, f] of Object.entries(def.diet.foods)) {
    c.check(f.pref >= 0 && f.pref <= 1, 'x.diet', `diet.foods.${k}.pref`, 'preference must be within 0..1');
    c.check(isOneOf(FOOD_ROUTES, f.route), '3.16.5', `diet.foods.${k}.route`, 'not a canonical food route');
    c.check(isOneOf(SPECIES_TIERS, f.tier), '3.16.5', `diet.foods.${k}.tier`, 'not a tier');
  }
  c.check(def.diet.pTargetFrac >= 0 && def.diet.pTargetFrac <= 1 && def.diet.pTargetFracNoLarvae >= 0 && def.diet.pTargetFracNoLarvae <= 1, 'x.diet', 'diet.pTargetFrac', 'must be within 0..1');
}

function checkNest(c: Collector, def: SpeciesDef): void {
  const n = def.nestTemplate;
  checkKeys(c, '3.16.5', 'nestTemplate.nestMaterials', n.nestMaterials, MATERIALS);
  for (const [m, v] of Object.entries(n.nestMaterials)) c.check(v > 0, 'x.nest', `nestTemplate.nestMaterials.${m}`, 'dig-speed factor must be positive (omit a material to forbid it)');
  checkMembers(c, '3.16.5', 'nestTemplate.coverBonus', n.coverBonus, MATERIALS);
  c.check(n.tunnelWidthBu > 0 && n.shaftWidthBu >= n.tunnelWidthBu - EPS, 'x.nest', 'nestTemplate', 'needs 0 < tunnel width <= shaft width');
  n.chambers.forEach((ch, i) => {
    const p = `nestTemplate.chambers[${i}](${ch.type})`;
    c.check(isOneOf(CHAMBER_TYPES, ch.type), '3.16.5', `${p}.type`, 'not a canonical chamber type');
    c.check(ch.widthBu > 0 && ch.heightBu > 0 && ch.depthBu[0] >= 0 && ch.depthBu[1] > ch.depthBu[0], 'x.nest', p, 'needs positive size and 0 <= depth min < max');
    c.check(ch.depthBu[1] <= n.maxDepthBu, 'x.nest', `${p}.depthBu`, 'deeper than maxDepthBu');
    c.check(ch.perUnit > 0 && ch.minWorkers >= 0, 'x.nest', p, 'perUnit must be positive');
  });
  c.check(n.entrances.start >= 1 && n.entrances.max >= n.entrances.start && n.entrances.perWorkers >= 0, 'x.nest', 'nestTemplate.entrances', 'needs 1 <= start <= max and perWorkers >= 0 (0 = cap max at every size)');
  c.check(n.maxDepthBu > 0 && n.footprintRBu > 0 && n.volumeCapBu3 > 0 && n.maxPathToEntranceBu > 0, 'x.nest', 'nestTemplate', 'limits must be positive');
  c.check(isOneOf(MOUND_STYLES, n.mound) && isOneOf(MIDDEN_STYLES, n.midden), '3.16.5', 'nestTemplate', 'not a canonical mound or midden style');
  for (const b of n.broodClimate) {
    c.check(b.tMin < b.tOpt[0] && b.tOpt[0] <= b.tOpt[1] && b.tOpt[1] < b.tMax && b.rh[0] <= b.rh[1], 'x.nest', `nestTemplate.broodClimate(${b.stage})`, 'needs tMin < tOpt <= tMax and rh a <= b');
  }
  c.check(n.broodClimate.length === 3, 'x.nest', 'nestTemplate.broodClimate', 'needs one entry per brood stage');
}

function checkThermalSignalsCombat(c: Collector, def: SpeciesDef): void {
  const t = def.thermal;
  const g = t.forageGate;
  c.check(g.a < g.b && g.b <= g.c && g.c < g.d, 'x.thermal', 'thermal.forageGate', 'needs a < b <= c < d');
  c.check(t.freezeC < t.chillC && t.chillC < g.a + EPS && t.shadeSeekC < t.stressC, 'x.thermal', 'thermal', 'needs freeze < chill <= gate a and shadeSeek < stress');
  for (const [ph, v] of Object.entries(t.lightPref)) c.check(v >= 0 && v <= 1, 'x.thermal', `thermal.lightPref.${ph}`, 'must be within 0..1');
  for (const [s, o] of Object.entries(t.lightPrefSeason)) c.check(isOneOf(SEASONS, s) && Object.values(o ?? {}).every((v) => v >= 0 && v <= 1), 'x.thermal', `thermal.lightPrefSeason.${s}`, 'bad season override');
  const s = def.signals;
  c.check(s.trailHalfLifeS > 0 && s.homeHalfLifeGd > 0 && s.ignorerFrac >= 0 && s.ignorerFrac <= 1, 'x.signals', 'signals', 'half-lives must be positive and ignorerFrac within 0..1');
  c.check(s.recruitUnlockWorkers >= 0 && s.recruitGroup.min >= 1 && s.recruitGroup.max >= s.recruitGroup.min, 'x.signals', 'signals', 'bad recruitment numbers');
  c.check(isOneOf(ALARM_MODES, s.alarmMode) && s.alarmRadiusBu > 0, '3.16.5', 'signals.alarmMode', 'not a canonical alarm mode');
  const cb = def.combat;
  checkMembers(c, '3.16.5', 'combat.weapons', cb.weapons, WEAPONS);
  checkMembers(c, '3.16.5', 'combat.guardCastes', cb.guardCastes, CASTES);
  cb.guardCastes.forEach((g, i) => c.check(def.castes.some((x) => x.caste === g), 'x.combat', `combat.guardCastes[${i}]`, `species has no '${g}' caste`));
  c.check(cb.weapons.includes('spray-acid') === (cb.acid !== null), 'x.combat', 'combat.acid', 'spray-acid needs an acid block and vice versa');
  c.check(cb.weapons.includes('sting') === (cb.sting !== null), 'x.combat', 'combat.sting', 'sting needs a sting block and vice versa');
  c.check(cb.aggression >= 0 && cb.aggression <= 1, 'x.combat', 'combat.aggression', 'must be within 0..1');
  // Weapons and the rear weapon of the appearance agree (formicines spray, myrmicines sting).
  const rear = def.appearance.rearWeapon;
  c.check(rear === 'acidopore' ? def.subfamily === 'formicinae' : def.subfamily === 'myrmicinae', 'x.appearance', 'appearance.rearWeapon', 'rear weapon does not fit the subfamily');
}

function checkIdentity(c: Collector, def: SpeciesDef): void {
  c.check(isOneOf(SPECIES_IDS, def.id), '3.16.5', 'id', 'not a canonical species id');
  c.check(isOneOf(SUBFAMILIES, def.subfamily), '3.16.5', 'subfamily', 'not a subfamily');
  c.check(isOneOf(SPECIES_TIERS, def.tier), '3.16.5', 'tier', 'not a tier');
  c.check(isOneOf(SEASONS, def.foundingSeason), '3.16.5', 'foundingSeason', 'not a season');
  c.check(isOneOf(CLIMATE_IDS, def.climate), '3.16.5', 'climate', 'not a canonical climate id');
  c.check(isOneOf(WINTER_MODES, def.winter.mode), '3.16.5', 'winter.mode', 'not a canonical winter mode');
  c.check(def.complexity >= 1 && def.complexity <= 3, 'x.identity', 'complexity', 'must be 1..3');
  c.check(def.cruiseBuS > 0 && def.loadSpeedMult > 0 && def.loadSpeedMult <= 1, 'x.identity', 'cruiseBuS', 'needs cruiseBuS > 0 and 0 < loadSpeedMult <= 1');
  c.check(def.stdMassMg > 0, 'x.identity', 'stdMassMg', 'must be positive');
  const codex = new Set(allCodexIds());
  def.codexIds.forEach((id, i) => c.check(codex.has(id), '3.16.5', `codexIds[${i}]`, `'${id}' is not a codex id`));
  checkMembers(c, '3.16.5', 'directiveTasks', def.directiveTasks, TASKS);
  checkMembers(c, '3.16.5', 'directiveExtras', def.directiveExtras, DIRECTIVE_EXTRAS);
  checkMembers(c, '3.16.5', 'taskSubtypes', def.taskSubtypes, TASK_SUBTYPES);
}

/** Rule 6: a parameter block for every listed module, none for the others. */
function checkModules(c: Collector, def: SpeciesDef): void {
  checkMembers(c, '3.16.5', 'economyModules', def.economyModules, ECONOMY_MODULES);
  for (const id of ECONOMY_MODULES) {
    const listed = def.economyModules.includes(id);
    const block = def.modules[id];
    c.check(!listed || block !== undefined, '3.16.6', `modules.${id}`, 'module is listed but has no parameter block');
    c.check(listed || block === undefined, '3.16.6', `modules.${id}`, 'parameter block present for a module the species does not list');
  }
  for (const [id, block] of Object.entries(def.modules)) {
    c.check(isOneOf(ECONOMY_MODULES, id), '3.16.5', `modules.${id}`, 'not a canonical economy module');
    for (const [k, v] of Object.entries(block ?? {})) c.check(finite(v), '3.16.6', `modules.${id}.${k}`, 'parameters must be finite numbers');
  }
}

/** Piecewise-linear value, clamped at both ends. */
function curveValue(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
}

/** All rule violations of a species definition (empty = valid). */
export function validateSpecies(def: SpeciesDef): ValidationIssue[] {
  const c = new Collector();
  checkFiniteDeep(c, 'def', { ...def, modules: undefined });
  checkIdentity(c, def);
  checkCastes(c, def);
  checkStandardWorker(c, def);
  checkLife(c, def);
  checkOpening(c, def);
  checkScale(c, def);
  checkReproduction(c, def);
  checkDiet(c, def);
  checkNest(c, def);
  checkThermalSignalsCombat(c, def);
  checkModules(c, def);
  return c.issues;
}

/** Error thrown by `assertValidSpecies`: the message lists every issue. */
export class SpeciesValidationError extends Error {
  constructor(readonly speciesId: string, readonly issues: ValidationIssue[]) {
    super(`species ${speciesId} failed validation:\n` + issues.map((i) => `  [${i.rule}] ${i.path}: ${i.message}`).join('\n'));
    this.name = 'SpeciesValidationError';
  }
}

/** Throws a SpeciesValidationError if the definition breaks any rule (the loader's rejection). */
export function assertValidSpecies(def: SpeciesDef): void {
  const issues = validateSpecies(def);
  if (issues.length > 0) throw new SpeciesValidationError(def.id, issues);
}
