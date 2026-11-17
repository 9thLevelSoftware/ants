// Wood-nesting diagnostics (GDD 07 §5.2.10, §6.2.10, App. D): `diag-wood` (worst parent moisture),
// `diag-cp-parent-moisture`, `diag-cp-satellites`, `diag-cp-growth`, `diag-cp-frass`. Factors carry weights by the
// share of the shortfall each explains; remedies are remedy ids the UI maps to controls.

import type { Colony, Diagnostic, DiagnosticFactor, DiagnosticStatus, Sim, SpeciesDef } from '@/sim/types';
import {
  DIAG_FRASS_WARN_UNITS, DIAG_MC_BAD_HIGH_PCT, DIAG_MC_BAD_LOW_PCT, DIAG_SHUTTLE_WAIT_GD,
} from '@/sim/balance/species-carpenter';
import { publishDiagnostic } from '@/sim/progression/diagnostics';
import { TICKS_PER_DAY } from '@/sim/time';
import type { WoodParams } from './params';
import { casteUnlocked, colonyAgeYears } from './castes';
import { parentSite, satelliteSites } from './sites';
import { woodOf } from './woodState';

const f = (cause: string, weight: number, detail: string): DiagnosticFactor => ({ cause, weight, detail, diagId: null });

function diag(id: string, status: DiagnosticStatus, label: string, value: number, factors: DiagnosticFactor[], remedies: string[]): Diagnostic {
  return { id, system: 'species', status, label, value, factors, remedies, sinceTick: -1, focus: null };
}

/** Status of the parent's young-brood moisture (GDD 07 §6.2.10: ok 15-30, warn 11-15 / 30-35, bad < 11 / > 35). */
export function parentMoistureStatus(p: WoodParams, mc: number): DiagnosticStatus {
  if (mc < DIAG_MC_BAD_LOW_PCT || mc > DIAG_MC_BAD_HIGH_PCT) return 'bad';
  if (mc < p.mcFullSurvivalPct || mc > p.mcMouldPct) return 'warn';
  return 'ok';
}

function dryingFactors(sim: Sim, col: Colony, p: WoodParams): DiagnosticFactor[] {
  const site = parentSite(col);
  const w = site ? woodOf(sim, site.primId) : undefined;
  if (!site || !w) return [];
  const out: DiagnosticFactor[] = [];
  if (site.moisture > p.mcMouldPct) out.push(f('mould', site.moisture - p.mcMouldPct, `${site.moisture.toFixed(0)} % moisture`));
  else {
    const windows = Math.max(0, (w.windowCount ?? 0) - 2);
    if (windows > 0) out.push(f('windows', windows, `${w.windowCount} openings ventilate the wood`));
    if ((w.sunExposure ?? 0) > 0.5) out.push(f('sun', w.sunExposure ?? 0, 'the wood lies in the sun'));
    if (w.placement === 'structural-dry') out.push(f('leak-repaired', 1, 'dry building timber'));
    if (out.length === 0) out.push(f('season', 1, 'the wood is drying'));
  }
  if ((w.carvedFrac ?? 0) >= p.satelliteCarvedFracTrigger) out.push(f('carved-out', w.carvedFrac ?? 0, `${Math.round((w.carvedFrac ?? 0) * 100)} % carved`));
  return out;
}

/** Publishes the colony's wood diagnostics (player colony only: the Why view is the player's). */
export function publishWoodDiagnostics(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): void {
  if (!col.isPlayer || !col.wood) return;
  const site = parentSite(col);
  const mc = site?.moisture ?? -1;
  // parent moisture
  if (site && mc >= 0) {
    const status = parentMoistureStatus(p, mc);
    const factors = status === 'ok' ? [] : dryingFactors(sim, col, p);
    const remedies = status === 'ok' ? [] : mc > p.mcMouldPct ? ['remedy.marker.move-brood', 'remedy.marker.move-queen'] : ['remedy.toggle.hideFrass', 'remedy.marker.move-queen'];
    publishDiagnostic(sim, diag('diag-cp-parent-moisture', status, 'Parent nest moisture', mc, factors, remedies));
    const w = woodOf(sim, site.primId);
    publishDiagnostic(sim, diag('diag-wood', status, 'Nest wood', mc, factors.length ? factors : [f('moisture', 1, `${mc.toFixed(0)} %, decay class ${w?.decay ?? site.decay}`)], remedies));
  }
  // satellites
  const sats = satelliteSites(col);
  const waiting = site && site.waitingSinceTick !== undefined && site.waitingSinceTick >= 0 ? (sim.state.tick - site.waitingSinceTick) / TICKS_PER_DAY : 0;
  const isolated = sats.filter((s) => s.state === 'isolated').length;
  const satStatus: DiagnosticStatus = waiting > DIAG_SHUTTLE_WAIT_GD || isolated > 0 ? 'warn' : 'info';
  const satFactors: DiagnosticFactor[] = [];
  if (sats.length === 0) satFactors.push(f('no-satellite', 1, 'no satellite nest yet'));
  if (isolated > 0) satFactors.push(f('isolated', isolated, `${isolated} satellite(s) cut off`));
  if (waiting > DIAG_SHUTTLE_WAIT_GD) satFactors.push(f('shuttle-short', waiting, `late brood waiting ${waiting.toFixed(1)} game days`));
  publishDiagnostic(sim, diag('diag-cp-satellites', satStatus, 'Satellite nests', sats.length, satFactors,
    satStatus === 'warn' ? ['remedy.marker.satellite', 'remedy.slider.nurse'] : []));
  // growth: castes unlocked and colony age
  const age = colonyAgeYears(sim, col);
  const unlocked = (['media', 'major'] as const).filter((c) => casteUnlocked(sim, def, col, c));
  publishDiagnostic(sim, diag('diag-cp-growth', 'info', 'Colony growth', age,
    unlocked.length === 2 ? [f('castes', 1, 'minors, medias and majors')] : [f('age-locked', 1, `larger workers from colony year 3 (age ${age.toFixed(1)} years)`)], []));
  // frass
  const interior = col.wood.frassUnitsInterior ?? 0;
  publishDiagnostic(sim, diag('diag-cp-frass', interior >= DIAG_FRASS_WARN_UNITS ? 'warn' : 'ok', 'Frass', col.wood.frassVisibility,
    interior >= DIAG_FRASS_WARN_UNITS ? [f('interior-windows', 1, `${interior.toFixed(1)} pile units indoors`)] : [],
    interior >= DIAG_FRASS_WARN_UNITS ? ['remedy.toggle.hideFrass'] : []));
}
