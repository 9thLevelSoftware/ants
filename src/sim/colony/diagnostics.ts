// Colony diagnostics (GDD 02 §14, App D): value, weighted limiting factors and remedy ids, published into
// progression.diagnostics every DIAGNOSTICS_EVERY ticks for the player colony.

import { ti } from './taskIdx';
import { tsAt } from '@/core/timeSeries';
import type { Colony, Diagnostic, Sim, SpeciesDef } from '@/sim/types';
import { ALLOCATION_GROUPS } from '@/sim/types';
import {
  BROOD_STALLED_GD, DIAG_QUEEN_CARE_FLOOR, DIAG_TRIP_REF_S, DIET_RANGE, DIET_SHIFT, QUEEN_FAT_CAP,
  QUEEN_TARGET_GUT_C, QUEEN_TARGET_GUT_P,
} from '@/sim/balance';
import { daysToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { accGet, accSet, coreOf } from './core';
import { censusOf, colonyChambers, itemCounts } from './census';
import { referenceDevRate } from './brood';
import { surfaceActivityOf } from './envAdapter';
import { daysOfStock, needRates, targetDays } from './needs';
import { queenOf } from './queen';
import { GROUP_TASKS, knownCapacity } from './allocation';
import { type FactorIn, pct, publishWithHysteresis, statusOf, weighFactors } from './diagFactors';
import { colonyAlert, colonyClearAlert } from './alerts';
import { clamp } from '@/core/math/scalar';

const SYSTEM = 'colony';

/** Mean of the last n hourly samples of a series (null when there are none). */
function recentMean(sim: Sim, id: string, n: number): number | null {
  const ts = sim.state.progression.history.hourly[id];
  if (!ts || ts.len === 0) return null;
  let sum = 0, k = 0;
  for (let i = 1; i <= n && i <= ts.len; i++) {
    const v = tsAt(ts, -i);
    if (v !== undefined) { sum += v; k++; }
  }
  return k > 0 ? sum / k : null;
}

function record(id: string, label: string, value: number, factors: FactorIn[], remedies: string[], statusRatio = value): Omit<Diagnostic, 'sinceTick'> {
  return { id, system: SYSTEM, status: statusOf(statusRatio), label, value, factors: weighFactors(factors), remedies, focus: null };
}

function tripFactors(col: Colony): FactorIn[] {
  const c = col.counters;
  const out: FactorIn[] = [];
  if (c.trips > 0) {
    const meanS = c.tripTicks / c.trips / TICKS_PER_SECOND;
    if (meanS > 0) out.push({ cause: 'distance', f: Math.min(1, DIAG_TRIP_REF_S / meanS), detail: `${Math.round(meanS)} s per trip` });
    out.push({ cause: 'success', f: c.tripSuccesses / c.trips, detail: `${pct(c.tripSuccesses / c.trips)} of trips succeed` });
  }
  return out;
}

function intakeDiag(sim: Sim, col: Colony, nutrient: 'c' | 'p'): Diagnostic {
  const rates = needRates(col);
  const need = nutrient === 'c' ? rates.c : rates.p;
  const intake = recentMean(sim, nutrient === 'c' ? 'intake-c' : 'intake-p', 24);
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
  const id = nutrient === 'c' ? 'diag-food-intake-c' : 'diag-food-intake-p';
  return publishWithHysteresis(sim, col, record(id, nutrient === 'c' ? 'Carbohydrate intake' : 'Protein intake', value, f, remedies, Math.min(1, value)));
}

function storesDiag(sim: Sim, col: Colony): Diagnostic {
  const days = daysOfStock(col), t = targetDays(col);
  const rc = Math.min(1, days.c / t.c), rp = Math.min(1, days.p / t.p);
  const full = coreOf(col).fullSinceTick >= 0;
  const spoilP = accGet(coreOf(col), 'inst.spoilP');
  const f: FactorIn[] = [
    { cause: 'carbohydrate', f: rc, detail: `${days.c.toFixed(1)} of ${t.c} days`, diagId: 'diag-food-intake-c' },
    { cause: 'protein', f: rp, detail: `${days.p.toFixed(1)} of ${t.p} days`, diagId: 'diag-food-intake-p' },
    { cause: 'capacity', f: full ? 0.5 : 1, detail: full ? 'stores full' : 'room left' },
    { cause: 'spoilage', f: 1 - Math.min(0.99, spoilP / needRates(col).p), detail: `${spoilP.toFixed(2)} P spoiling per day` },
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
  const f: FactorIn[] = [
    { cause: 'too-few-adults', f: sumD > 0 ? Math.min(1, cen.available / sumD) : 1, detail: `${cen.available} available for ${sumD.toFixed(0)} needed` },
    { cause: 'callows', f: 1 - cen.callows / n, detail: `${cen.callows} callows` },
    { cause: 'fatigue', f: 1 - cen.resting / n, detail: `${cen.resting} resting` },
    { cause: 'injured', f: 1 - cen.injured / n, detail: `${cen.injured} injured` },
  ];
  return publishWithHysteresis(sim, col, record('diag-workforce', 'Workforce', Math.min(1, worst), f, ['remedy.allocation.auto', 'remedy.slider.forage', 'remedy.slider.nurse']));
}

function trailsDiag(sim: Sim, col: Colony): Diagnostic {
  const n = censusOf(sim, col.id).workers;
  const size = clamp(0.3 + (0.7 * (n - 10)) / 65, 0.3, 1);
  const c = col.counters;
  const success = c.trips > 0 ? c.tripSuccesses / c.trips : 1;
  const f: FactorIn[] = [
    { cause: 'colony-size', f: size, detail: `${n} workers` },
    { cause: 'success', f: success, detail: `${pct(success)} successful trips` },
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
  // Reference: natural turnover N / 24 gd.
  const expected = n / 24;
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
  const value = clamp(1 - waste / (10 * chambers), 0, 1);
  const dH = col.alloc.demand[ti('haul')];
  const haulers = col.alloc.actual[ti('haul')];
  const f: FactorIn[] = [{ cause: 'haulers', f: dH > 0 ? Math.min(1, haulers / dH) : 1, detail: `${haulers} of ${dH.toFixed(1)} haulers` }];
  return publishWithHysteresis(sim, col, record('diag-hygiene', 'Nest hygiene', value, f, ['remedy.slider.dig']));
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
}
