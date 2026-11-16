// Colony diagnostics (GDD 02 §14, App D): value, weighted limiting factors and remedy ids, published into
// progression.diagnostics every DIAGNOSTICS_EVERY ticks for the player colony.

import { ti } from './taskIdx';
import { tsAt } from '@/core/timeSeries';
import type { Colony, Diagnostic, Sim, SpeciesDef } from '@/sim/types';
import { ALLOCATION_GROUPS } from '@/sim/types';
import {
  BROOD_STALLED_GD, DIAG_MIDDEN_BLOCKED_F, DIAG_MORTALITY_REF_LIFESPAN_GD, DIAG_QUEEN_CARE_FLOOR, DIAG_STORES_FULL_F, DIAG_TRAIL_LOST_REF_PER_GD,
  DIAG_TRIP_REF_S, DIAG_WASTE_PER_CHAMBER, DIET_RANGE, DIET_SHIFT, QUEEN_FAT_CAP, QUEEN_TARGET_GUT_C, QUEEN_TARGET_GUT_P,
  SIZE_FACTOR_MIN, SIZE_FACTOR_N0, SIZE_FACTOR_SPAN, TRAIL_IGNORE_P,
} from '@/sim/balance';
import { AntFlag } from '@/sim/types';
import { daysToTicks, HOURS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { accGet, accSet, coreOf } from './core';
import { censusOf, colonyChambers, itemCounts } from './census';
import { referenceDevRate } from './brood';
import { rainIntensityOf, surfaceActivityOf } from './envAdapter';
import { meanUnloadWaitS, popOf } from './population';
import { daysOfStock, needRates, targetDays } from './needs';
import { queenOf } from './queen';
import { GROUP_TASKS, knownCapacity } from './allocation';
import { type FactorIn, pct, publishWithHysteresis, statusOf, weighFactors } from './diagFactors';
import { colonyAlert, colonyClearAlert } from './alerts';
import { clamp } from '@/core/math/scalar';
import { isMiddenBlocked } from './midden';
import { nestSpaceDiag } from './nestSpaceDiag';

const SYSTEM = 'colony';

/**
 * Factors of GDD 02 §14 that need data other modules do not provide yet; listed so the gap is explicit:
 * intake `activation` (departure counts at target, beh-forage).
 */
export const PENDING_FACTORS: Readonly<Record<string, readonly string[]>> = {
  'diag-food-intake-c': ['activation'],
  'diag-food-intake-p': ['activation'],
};

/** Mean of n hourly samples of a series ending `skip` samples back (null when there are none). */
function recentMean(sim: Sim, id: string, n: number, skip = 0): number | null {
  const ts = sim.state.progression.history.hourly[id];
  if (!ts || ts.len <= skip) return null;
  let sum = 0, k = 0;
  for (let i = 1 + skip; i <= n + skip && i <= ts.len; i++) {
    const v = tsAt(ts, -i);
    if (v !== undefined) { sum += v; k++; }
  }
  return k > 0 ? sum / k : null;
}

function record(id: string, label: string, value: number, factors: FactorIn[], remedies: string[], statusRatio = value): Omit<Diagnostic, 'sinceTick'> {
  return { id, system: SYSTEM, status: statusOf(statusRatio), label, value, factors: weighFactors(factors), remedies, focus: null };
}

/** Death causes that count as predation of foragers (intake factor `predation`). */
const PREDATOR_CAUSES = ['predation', 'bird', 'antlion', 'parasitoid'] as const;

function tripFactors(col: Colony): FactorIn[] {
  const c = col.counters;
  const out: FactorIn[] = [];
  if (c.trips > 0) {
    const meanS = c.tripTicks / c.trips / TICKS_PER_SECOND;
    if (meanS > 0) {
      out.push({ cause: 'distance', f: Math.min(1, DIAG_TRIP_REF_S / meanS), detail: `${Math.round(meanS)} s per trip` });
      const wait = meanUnloadWaitS(col, TICKS_PER_SECOND);
      out.push({ cause: 'unloading', f: 1 - Math.min(0.99, wait / meanS), detail: `${wait.toFixed(1)} s waiting to unload` });
    }
    out.push({ cause: 'success', f: c.tripSuccesses / c.trips, detail: `${pct(c.tripSuccesses / c.trips)} of trips succeed` });
    const byCause = popOf(col).deathsByCause;
    const killed = PREDATOR_CAUSES.reduce((a, k) => a + (byCause[k] ?? 0), 0);
    out.push({ cause: 'predation', f: 1 - Math.min(0.99, killed / c.trips), detail: `${killed} foragers taken by predators` });
  }
  return out;
}

function intakeDiag(sim: Sim, col: Colony, nutrient: 'c' | 'p'): Diagnostic {
  const id = nutrient === 'c' ? 'diag-food-intake-c' : 'diag-food-intake-p';
  const label = nutrient === 'c' ? 'Carbohydrate intake' : 'Protein intake';
  // the founding queen alone feeds the brood from her own body: no foraging to judge yet (R6)
  if (foundingQueenAlone(sim, col)) {
    return publishWithHysteresis(sim, col, record(id, label, 1, [{ cause: 'founding', f: 1, detail: 'the queen lives on her reserves' }], [], 1));
  }
  const rates = needRates(col);
  const need = nutrient === 'c' ? rates.c : rates.p;
  const intake = recentMean(sim, nutrient === 'c' ? 'intake-c' : 'intake-p', HOURS_PER_DAY);
  const value = intake === null ? 1 : intake / need;
  const d = col.alloc.demand[ti('forage')];
  const actual = col.alloc.actual[ti('forage')];
  const known = knownCapacity(sim, col);
  const f: FactorIn[] = [
    { cause: 'foragers', f: d > 0 ? Math.min(1, actual / d) : 1, detail: `${actual} of ${d.toFixed(1)} foragers` },
    { cause: 'weather', f: surfaceActivityOf(sim, col.species), detail: 'surface activity' },
    { cause: 'sources', f: Math.min(1, known.loads / Math.max(need, 1e-6)), detail: `${col.knownSourceIds.length} known sources` },
    ...tripFactors(col),
  ];
  const remedies = nutrient === 'c'
    ? ['remedy.slider.forage', 'remedy.marker.forage', 'remedy.possess.forage', 'remedy.marker.entrance', 'remedy.slider.nurse']
    : ['remedy.diet.protein', 'remedy.marker.forage', 'remedy.slider.forage'];
  if (nutrient === 'p' && col.directives.diet !== 'auto' && col.directives.diet < 0) {
    f.push({ cause: 'diet', f: 1 + (DIET_SHIFT * col.directives.diet) / DIET_RANGE, detail: 'diet set toward carbohydrate' });
  }
  return publishWithHysteresis(sim, col, record(id, label, value, f, remedies, Math.min(1, value)));
}

/** The founding queen is alone (no worker yet): her reserves are the colony's food. */
function foundingQueenAlone(sim: Sim, col: Colony): boolean {
  const q = queenOf(sim, col);
  return !!q?.queen?.founding && censusOf(sim, col.id).workers === 0;
}

function storesDiag(sim: Sim, col: Colony): Diagnostic {
  const days = daysOfStock(col), t = targetDays(col);
  const rc = Math.min(1, days.c / t.c), rp = Math.min(1, days.p / t.p);
  const full = coreOf(col).fullSinceTick >= 0;
  const spoilP = accGet(coreOf(col), 'inst.spoilP');
  // Upkeep growth: C use over the last game day against the day before (a growing colony eats its stock down).
  const useNow = recentMean(sim, 'use-c', HOURS_PER_DAY);
  const usePrev = recentMean(sim, 'use-c', HOURS_PER_DAY, HOURS_PER_DAY);
  const upkeep = useNow !== null && usePrev !== null && useNow > 0 ? Math.min(1, usePrev / useNow) : 1;
  const f: FactorIn[] = [
    { cause: 'carbohydrate', f: rc, detail: `${days.c.toFixed(1)} of ${t.c} days`, diagId: 'diag-food-intake-c' },
    { cause: 'protein', f: rp, detail: `${days.p.toFixed(1)} of ${t.p} days`, diagId: 'diag-food-intake-p' },
    { cause: 'capacity', f: full ? DIAG_STORES_FULL_F : 1, detail: full ? 'stores full' : 'room left' },
    { cause: 'spoilage', f: 1 - Math.min(0.99, spoilP / needRates(col).p), detail: `${spoilP.toFixed(2)} P spoiling per day` },
    { cause: 'upkeep', f: upkeep, detail: upkeep < 1 ? 'the colony eats more each day' : 'steady upkeep' },
  ];
  return publishWithHysteresis(sim, col, record('diag-stores', 'Food stores', Math.min(rc, rp), f, ['remedy.dig.food', 'remedy.stock.low']));
}

function broodDiag(sim: Sim, col: Colony, def: SpeciesDef): Diagnostic {
  const core = coreOf(col);
  const n = accGet(core, 'win.larva');
  const r28 = referenceDevRate(def);
  const cen = censusOf(sim, col.id);
  const dN = col.alloc.demand[ti('nurse')];
  const nurses = col.alloc.actual[ti('nurse')];
  let value = 1;
  const f: FactorIn[] = [];
  if (n > 0) {
    value = accGet(core, 'win.larvaGrowth') / n / r28;
    f.push(
      { cause: 'protein', f: accGet(core, 'win.larvaP') / n, detail: 'larva-time with protein in the gut' },
      { cause: 'carbohydrate', f: accGet(core, 'win.larvaC') / n, detail: 'larva-time with carbohydrate in the gut' },
      { cause: 'temperature', f: Math.min(1, accGet(core, 'win.larvaR') / n / r28), detail: 'development rate at the brood temperature' },
      { cause: 'nurses', f: dN > 0 ? Math.min(1, nurses / dN) : 1, detail: `${nurses} of ${dN.toFixed(1)} nurses` },
      { cause: 'crowding', f: 1 - broodCrowding(sim, col), detail: 'brood chambers near capacity' },
      { cause: 'hygiene', f: Math.exp(-accGet(core, 'win.hygieneHaz') / n), detail: 'waste in brood chambers' },
      { cause: 'humidity', f: Math.exp(-accGet(core, 'win.humidityHaz') / n), detail: 'dry brood chambers' },
    );
  }
  for (const k of ['win.larva', 'win.larvaP', 'win.larvaC', 'win.larvaR', 'win.larvaGrowth', 'win.hygieneHaz', 'win.humidityHaz']) accSet(core, k, 0);
  const rec = publishWithHysteresis(sim, col, record('diag-brood-growth', 'Brood growth', value, f,
    ['remedy.slider.nurse', 'remedy.dig.nursery', 'remedy.marker.move-brood', 'remedy.slider.dig'], Math.min(1, value)));
  // Alert brood-stalled after BROOD_STALLED_GD of `bad`.
  if (rec.status === 'bad' && cen.larvae > 0 && sim.state.tick - rec.sinceTick >= daysToTicks(BROOD_STALLED_GD)) {
    colonyAlert(sim, 'brood-stalled', 'warning', col.id, 'Brood growth has stalled', rec.factors[0]?.cause ?? '', rec.id);
  } else if (rec.status !== 'bad') colonyClearAlert(sim, 'brood-stalled', col.id);
  return rec;
}

/** Brood-weighted mean `crowd` of the colony's brood chambers (GDD 02 §11: clamp((items / cap - 0.8) / 0.2, 0, 1)). */
function broodCrowding(sim: Sim, col: Colony): number {
  const perChamber = new Map<number, number>();
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.chamberId >= 0) perChamber.set(b.chamberId, (perChamber.get(b.chamberId) ?? 0) + 1);
  }
  let sum = 0, n = 0;
  for (const ch of colonyChambers(sim, col)) {
    const items = perChamber.get(ch.id) ?? 0;
    if (items === 0) continue;
    const cap = Math.max(1e-6, ch.capacity.brood);
    sum += items * clamp((items / cap - 0.8) / 0.2, 0, 1);
    n += items;
  }
  return n > 0 ? sum / n : 0;
}

function layingDiag(sim: Sim, col: Colony): Diagnostic | null {
  const q = queenOf(sim, col);
  if (!q || !q.queen || q.queen.founding) return null;
  const core = coreOf(col);
  const ref = accGet(core, 'lay.ref');
  const actual = core.layingRate;
  const season = accGet(core, 'lay.season'), temp = accGet(core, 'lay.temp');
  const health = accGet(core, 'lay.health'), cap = accGet(core, 'lay.cap');
  const potential = ref * season * temp * health * cap;
  const residual = potential > 1e-6 ? Math.min(1, actual / potential) : 1;
  const carers = col.alloc.actual[ti('queen-care')];
  const carersTarget = col.alloc.target[ti('queen-care')];
  const care = carersTarget > 0 ? Math.max(DIAG_QUEEN_CARE_FLOOR, Math.min(1, carers / carersTarget)) : 1;
  const f: FactorIn[] = [
    { cause: 'season', f: season, detail: 'laying season' },
    { cause: 'temperature', f: temp, detail: 'royal chamber temperature' },
    { cause: 'queen-health', f: health, detail: `health ${pct(q.hp / q.maxHp)}` },
    { cause: 'cap', f: cap, detail: 'colony size cap' },
    { cause: 'protein-supply', f: residual, detail: `${actual.toFixed(1)} of ${potential.toFixed(1)} eggs per day`, diagId: 'diag-food-intake-p' },
    { cause: 'queen-care', f: care, detail: `${carers} of ${carersTarget} attendants` },
  ];
  const value = ref > 0 ? actual / ref : 0;
  return publishWithHysteresis(sim, col, record('diag-egg-laying', 'Egg laying', value, f, ['remedy.diet.protein', 'remedy.slider.nurse'], Math.min(1, value)));
}

function queenDiag(sim: Sim, col: Colony): Diagnostic {
  const q = queenOf(sim, col);
  if (!q || !q.queen) {
    return publishWithHysteresis(sim, col, record('diag-queen-condition', 'Queen', 0,
      [{ cause: 'orphaned', f: 0, detail: 'the colony has no queen' }], ['remedy.slider.nurse']));
  }
  const qs = q.queen;
  const h = q.hp / q.maxHp;
  const f: FactorIn[] = [
    { cause: 'gut-C', f: Math.min(1, qs.gut.c / QUEEN_TARGET_GUT_C), detail: `${qs.gut.c.toFixed(2)} C in her gut` },
    { cause: 'gut-P', f: Math.min(1, qs.gut.p / QUEEN_TARGET_GUT_P), detail: `${qs.gut.p.toFixed(2)} P in her gut` },
    { cause: 'reserve', f: Math.min(1, qs.reserve / QUEEN_FAT_CAP), detail: `${qs.reserve.toFixed(2)} C fat` },
    { cause: 'retinue', f: col.alloc.target[ti('queen-care')] > 0 ? Math.min(1, col.alloc.actual[ti('queen-care')] / col.alloc.target[ti('queen-care')]) : 1, detail: 'attendants' },
    { cause: 'heat', f: 1 - clamp(q.heatLoad, 0, 0.99), detail: 'heat load' },
    { cause: 'injury', f: h, detail: `health ${pct(h)}` },
  ];
  const value = qs.founding ? h : h * Math.min(1, (qs.gut.c + qs.reserve) / QUEEN_TARGET_GUT_C);
  return publishWithHysteresis(sim, col, record('diag-queen-condition', 'Queen', value, f, ['remedy.slider.nurse', 'remedy.marker.move-queen'], Math.min(1, value)));
}

function workforceDiag(sim: Sim, col: Colony): Diagnostic {
  const cen = censusOf(sim, col.id);
  let worst = 1;
  for (const g of ALLOCATION_GROUPS) {
    let t = 0, a = 0;
    for (const task of GROUP_TASKS[g]) { t += col.alloc.target[ti(task)]; a += col.alloc.actual[ti(task)]; }
    if (t > 0) worst = Math.min(worst, a / t);
  }
  let sumD = 0;
  for (let i = 0; i < col.alloc.demand.length; i++) sumD += col.alloc.demand[i];
  const n = Math.max(1, cen.workers);
  // Manual targets below the group's need (the 25 % floor keeps them above 0): the player's shares conflict.
  let conflict = 1;
  const short: { g: string; r: number }[] = [];
  for (const g of ALLOCATION_GROUPS) {
    let d = 0, t = 0, a = 0;
    for (const task of GROUP_TASKS[g]) { d += col.alloc.demand[ti(task)]; t += col.alloc.target[ti(task)]; a += col.alloc.actual[ti(task)]; }
    if (col.directives.allocation !== 'auto' && d > 0) conflict = Math.min(conflict, Math.min(1, t / d));
    if (t > 0 && a < t) short.push({ g, r: a / t });
  }
  const f: FactorIn[] = [
    { cause: 'too-few-adults', f: sumD > 0 ? Math.min(1, cen.available / sumD) : 1, detail: `${cen.available} available for ${sumD.toFixed(0)} needed` },
    { cause: 'callows', f: 1 - cen.callows / n, detail: `${cen.callows} callows` },
    { cause: 'manual-conflict', f: conflict, detail: conflict < 1 ? 'slider shares leave a need short' : 'targets cover the needs' },
    { cause: 'fatigue', f: 1 - cen.resting / n, detail: `${cen.resting} resting` },
    { cause: 'injured', f: 1 - cen.injured / n, detail: `${cen.injured} injured` },
  ];
  // Remedies: the sliders of the groups furthest below target (registry ids only, 00-index §B).
  short.sort((x, y) => x.r - y.r || x.g.localeCompare(y.g));
  const remedies = short.length > 0 ? short.map((x) => `remedy.slider.${x.g}`) : ['remedy.slider.forage', 'remedy.slider.nurse'];
  return publishWithHysteresis(sim, col, record('diag-workforce', 'Workforce', Math.min(1, worst), f, remedies));
}

function trailsDiag(sim: Sim, col: Colony): Diagnostic {
  const n = censusOf(sim, col.id).workers;
  const size = clamp(SIZE_FACTOR_MIN + ((1 - SIZE_FACTOR_MIN) * (n - SIZE_FACTOR_N0)) / SIZE_FACTOR_SPAN, SIZE_FACTOR_MIN, 1);
  const c = col.counters;
  const success = c.trips > 0 ? c.tripSuccesses / c.trips : 1;
  const dayFrac = Math.max(1e-3, (sim.state.tick - col.ledger.dayStartTick) / daysToTicks(1));
  const lostPerGd = accGet(coreOf(col), 'trailLost.today') / dayFrac;
  const rain = rainIntensityOf(sim);
  // Ignorers above the normal share (TRAIL_IGNORE_P of bouts) weaken recruitment.
  let foragers = 0, ignorers = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.task !== 'forage') continue;
    foragers++;
    if (a.flags & AntFlag.TRAIL_IGNORER) ignorers++;
  }
  const ignoreShare = foragers > 0 ? ignorers / foragers : 0;
  const f: FactorIn[] = [
    { cause: 'colony-size', f: size, detail: `${n} workers` },
    { cause: 'success', f: success, detail: `${pct(success)} successful trips` },
    { cause: 'trail-lost', f: 1 / (1 + lostPerGd / DIAG_TRAIL_LOST_REF_PER_GD), detail: `${lostPerGd.toFixed(1)} lost trails per day` },
    { cause: 'washed', f: 1 - Math.min(0.99, rain), detail: rain > 0 ? 'rain washes the trails' : 'dry' },
    { cause: 'ignorers', f: Math.min(1, (1 - ignoreShare) / (1 - TRAIL_IGNORE_P)), detail: `${ignorers} of ${foragers} foragers ignore trails` },
  ];
  return publishWithHysteresis(sim, col, record('diag-foraging-trails', 'Foraging trails', Math.min(size, success), f, ['remedy.possess.forage', 'remedy.marker.forage']));
}

function mortalityDiag(sim: Sim, col: Colony): Diagnostic {
  const core = coreOf(col);
  const n = Math.max(1, censusOf(sim, col.id).workers);
  const dayFrac = Math.max(1e-3, (sim.state.tick - col.ledger.dayStartTick) / daysToTicks(1));
  let deaths = 0;
  for (const v of Object.values(core.deathsToday)) deaths += v;
  const ratePerGd = deaths / dayFrac;
  // Reference: natural turnover N / realised lifespan.
  const expected = n / DIAG_MORTALITY_REF_LIFESPAN_GD;
  const value = ratePerGd > 0 ? Math.min(1, expected / ratePerGd) : 1;
  const factors = Object.entries(core.deathsToday).filter(([, v]) => v > 0).map(([cause, v]) => ({
    cause, weight: v / Math.max(1, deaths), detail: `${v} today`, diagId: null,
  })).sort((a, b) => b.weight - a.weight || a.cause.localeCompare(b.cause));
  const rec: Omit<Diagnostic, 'sinceTick'> = {
    id: 'diag-mortality', system: SYSTEM, status: statusOf(value), label: 'Mortality', value: ratePerGd / n, factors,
    remedies: ['remedy.marker.avoid', 'remedy.slider.forage'], focus: null,
  };
  return publishWithHysteresis(sim, col, rec);
}

function hygieneDiag(sim: Sim, col: Colony): Diagnostic {
  const items = itemCounts(sim).byColony.get(col.id);
  const waste = items ? items.waste : 0;
  const chambers = Math.max(1, colonyChambers(sim, col).length);
  const value = clamp(1 - waste / (DIAG_WASTE_PER_CHAMBER * chambers), 0, 1);
  const dH = col.alloc.demand[ti('haul')];
  const haulers = col.alloc.actual[ti('haul')];
  const blocked = isMiddenBlocked(col);
  const f: FactorIn[] = [
    { cause: 'haulers', f: dH > 0 ? Math.min(1, haulers / dH) : 1, detail: `${haulers} of ${dH.toFixed(1)} haulers` },
    { cause: 'midden-blocked', f: blocked ? DIAG_MIDDEN_BLOCKED_F : 1, detail: blocked ? 'no way out to the midden' : 'midden reachable' },
  ];
  const remedies = blocked ? ['remedy.marker.entrance', 'remedy.slider.dig'] : ['remedy.slider.dig'];
  return publishWithHysteresis(sim, col, record('diag-hygiene', 'Nest hygiene', blocked ? Math.min(value, DIAG_MIDDEN_BLOCKED_F) : value, f, remedies));
}

/** Evaluates and publishes all colony diagnostics of a colony (the player's). */
export function runColonyDiagnostics(sim: Sim, col: Colony, def: SpeciesDef): void {
  intakeDiag(sim, col, 'c');
  intakeDiag(sim, col, 'p');
  storesDiag(sim, col);
  broodDiag(sim, col, def);
  layingDiag(sim, col);
  queenDiag(sim, col);
  workforceDiag(sim, col);
  trailsDiag(sim, col);
  mortalityDiag(sim, col);
  hygieneDiag(sim, col);
  nestSpaceDiag(sim, col);
}
