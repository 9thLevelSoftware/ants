// Diagnostics of the granary module, published to the Why view (GDD 07 §5.3.10, §6.3.10, App. D):
//   diag-granary            stock, humidity and the share damp / germinating / sprouted / rotting
//   diag-mb-milling         paste stock under 1 GD of demand while the granaries hold more than 5 GD
//   diag-mb-animal-protein  larvae's mean animal share of protein under the 10 % minimum
//   diag-mb-heat            the heat-limited trip distance and the summer lull (info)
//   diag-mb-patrol          foraging held by the patrol gate: a patroller more than an hour late, or the hold

import type { Colony, Diagnostic, Sim, System } from '@/sim/types';
import { publishWithHysteresis, weighFactors, type FactorIn } from '@/sim/colony/diagFactors';
import { censusOf } from '@/sim/colony/census';
import { ti } from '@/sim/colony/taskIdx';
import { GRANARY_DIAG_TICKS, PATROL_HOLD_TICKS } from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';
import { pasteDemandPerGd } from './paste';
import { colonyStock, colonyTotals } from './state';
import { heatOf, lullMult } from './rhythm';
import { careDemand, millDemand } from './allocation';
import { patrolOverdueTicks } from './behaviourPatrol';
import { dailyRate } from './counters';

const SYSTEM = 'species';

type Rec = Omit<Diagnostic, 'sinceTick'>;

function rec(id: string, label: string, status: Diagnostic['status'], value: number, factors: FactorIn[], remedies: string[]): Rec {
  return { id, system: SYSTEM, status, label, value, factors: weighFactors(factors), remedies, focus: null };
}

/** Seed consumption the colony would draw per game day if all its food came from seed (paste demand / yield). */
export function seedDemandPerGd(col: Colony, g: GranaryParams): number {
  return pasteDemandPerGd(g, col) / g.pasteYield;
}

export function granaryDiag(sim: Sim, col: Colony, g: GranaryParams): Rec {
  const mod = col.granary!;
  const t = colonyTotals(mod);
  const stock = t.loads;
  const damp = t.damp + t.germinating + t.sprouted + t.rotting;
  const dampShare = stock > 0 ? damp / stock : 0;
  let hum = 0, n = 0;
  for (const gr of mod.granaries) { hum += gr.humidity ?? 0; n++; }
  const meanHum = n > 0 ? hum / n : 0;
  const status: Diagnostic['status'] = t.rotting > 0 || t.sprouted > 0.2 * Math.max(stock, 1e-9) ? 'bad' : dampShare > 0.2 ? 'warn' : 'ok';
  const cen = censusOf(sim, col.id);
  const careNeed = careDemand(sim, col, g, cen.workers);
  const care = cen.byTask[ti('store')];
  const days = stock / Math.max(1e-6, seedDemandPerGd(col, g));
  const f: FactorIn[] = [
    { cause: 'granary-damp', f: meanHum > g.uDamp ? Math.max(0.05, 1 - (meanHum - g.uDamp) / (1 - g.uDamp)) : 1, detail: `humidity ${meanHum.toFixed(2)}` },
    { cause: 'care-short', f: careNeed > 0 ? Math.min(1, care / careNeed) : 1, detail: `${care} of ${Math.ceil(careNeed)}` },
    { cause: 'seed-rot', f: stock > 0 ? Math.max(0.05, 1 - t.rotting / stock) : 1, detail: `${t.rotting.toFixed(1)} loads` },
  ];
  return rec('diag-granary', 'Granary', status, Math.round(days * 10) / 10, f,
    ['remedy.slider.store', 'remedy.granary.hygiene', 'remedy.dig.granary']);
}

export function millingDiag(sim: Sim, col: Colony, g: GranaryParams): Rec {
  const mod = col.granary!;
  const demand = Math.max(1e-6, pasteDemandPerGd(g, col));
  const pasteDays = (mod.pasteLoads + (col.stores.c + col.stores.p)) / demand;
  const stockDays = colonyStock(mod) / Math.max(1e-6, seedDemandPerGd(col, g));
  const short = pasteDays < 1 && stockDays > 5;
  const cen = censusOf(sim, col.id);
  let majors = 0, bigMedia = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id) continue;
    if (a.caste === 'major') majors++;
    else if (a.caste === 'media' && a.lengthBu >= g.millMediaMinBu) bigMedia++;
  }
  const millers = cen.byTask[ti('mill')];
  const need = millDemand(col, g, cen.workers);
  const milled = dailyRate(sim, mod.milledToday, mod.milledYesterday);
  const f: FactorIn[] = [
    { cause: 'majors-few', f: Math.min(1, (majors + 0.5 * bigMedia) / Math.max(1, need)), detail: `${majors} majors, ${bigMedia} large media` },
    { cause: 'millers-few', f: need > 0 ? Math.min(1, millers / need) : 1, detail: `${millers} of ${Math.ceil(need)}` },
    { cause: 'seeds-hard', f: majors > 0 ? 1 : 0.5, detail: majors > 0 ? '' : 'only majors crack hard seed' },
  ];
  const value = Math.round(Math.min(10, pasteDays) * 10) / 10;
  const r = rec('diag-mb-milling', 'Milling', short ? 'warn' : 'ok', value, f, ['remedy.slider.mill', 'remedy.caste-emphasis', 'remedy.marker.forage']);
  r.label = `Milling (${milled.toFixed(1)} loads a day)`;
  return r;
}

export function animalProteinDiag(sim: Sim, col: Colony): Rec {
  const def = sim.getSpecies(col.species);
  const min = def?.life.animalProteinMinFrac ?? 0.1;
  let sum = 0, n = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'larva' || b.fedP <= 0) continue;
    sum += b.animalPShare;
    n++;
  }
  const share = n > 0 ? sum / n : 1;
  const f: FactorIn[] = [{ cause: 'animal-protein', f: Math.max(0.05, Math.min(1, share / min)), detail: `${Math.round(share * 100)} % animal` }];
  return rec('diag-mb-animal-protein', 'Animal protein', n > 0 && share < min ? 'warn' : 'ok', share, f, ['remedy.marker.forage', 'remedy.diet.protein']);
}

export function heatDiag(sim: Sim, col: Colony, g: GranaryParams): Rec {
  const h = heatOf(sim, col, g);
  const lull = lullMult(sim, col, g);
  const f: FactorIn[] = [
    { cause: 'trail-heat', f: Math.max(0.05, h.tripMult * (1 - h.heatStress)), detail: `trails ${h.tTrail.toFixed(0)} °C` },
    { cause: 'summer-lull', f: lull, detail: lull < 1 ? 'few seeds coming in' : '' },
  ];
  return rec('diag-mb-heat', `Heat: range ${Math.round(h.tripMaxBu)} BU`, 'info', h.tripMult, f, ['remedy.marker.forage']);
}

export function patrolDiag(sim: Sim, col: Colony): Rec {
  const gate = col.granary?.patrol;
  const now = sim.state.tick;
  // held = a patroller more than an hour late (GDD 07 §5.3.10 "> 1 h"); the normal round (walking out, the look
  // round, walking back) is not a hold
  let late = 0;
  if (gate && !gate.open && gate.closedTick >= 0) {
    for (const id of gate.out) { const a = sim.stores.ants.get(id); if (a) late = Math.max(late, patrolOverdueTicks(sim, a)); }
  }
  const heldClosed = late > PATROL_HOLD_TICKS;
  const held = !!gate && gate.holdUntilTick > now;
  const f: FactorIn[] = [
    { cause: 'patrol-out', f: heldClosed ? 0.2 : 1, detail: gate ? `${gate.returns.length} back, ${gate.out.length} out` : '' },
    { cause: 'patrol-lost', f: held ? 0.2 : 1, detail: '' },
  ];
  return rec('diag-mb-patrol', 'Morning patrol', heldClosed || held ? 'warn' : 'ok', gate?.open ? 1 : 0, f,
    ['remedy.guard.entrance', 'remedy.marker.entrance']);
}

/** Publishes every granary diagnostic of a colony; returns them (tests). */
export function publishGranaryDiagnostics(sim: Sim, col: Colony, g: GranaryParams): Diagnostic[] {
  return [granaryDiag(sim, col, g), millingDiag(sim, col, g), animalProteinDiag(sim, col), heatDiag(sim, col, g), patrolDiag(sim, col)]
    .map((r) => publishWithHysteresis(sim, col, r));
}

export const granaryDiagnosticsSystem: System = {
  name: 'granary-diagnostics', phase: 'progression', every: GRANARY_DIAG_TICKS,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) if (col.isPlayer) publishGranaryDiagnostics(sim, col, g);
  },
};
