// Parent and satellite nests (GDD 07 §6.2.5-§6.2.7): the satellite proposal (architect rule, `satellite` marker,
// `satelliteAuto`), founding a satellite (a nest of kind `satellite` with a starter nursery chewed into the chosen
// wood), isolation, the late-brood shuttle rule (which brood should go, the job given to a parent nurse; the trip
// itself is the nurse behaviour's, shuttle.ts) and the queen-relocation proposal.

import type { Brood, Colony, Nest, NestSite, Primitive, Sim, SpeciesDef, WoodState } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { createNest } from '@/sim/entities';
import { devRate } from '@/sim/colony/life';
import { chamberTemp } from '@/sim/environment/chamber';
import { airTemp } from '@/sim/environment/temperature';
import { forageGateFor } from '@/sim/environment/thermalResponse';
import { TICKS_PER_DAY } from '@/sim/time';
import { SATELLITE_CELL, SATELLITE_MIN_THICK_BU } from '@/sim/balance/species-carpenter';
import type { WoodParams } from './params';
import { adultWorkers } from './castes';
import { dryHazardPerGd, isLateBrood } from './broodMoisture';
import { broodChamberOf, parentSite, refreshSites, satelliteSites, setSiteState, sitePoint } from './sites';
import { cellSiteIn, chewCell } from './woodCell';
import { horizLen } from './primGeom';
import { ensureWoodStates, primOf, woodClimateAt, woodOf } from './woodState';
import { SH, isShuttling } from './shuttleKeys';

/** Late-brood score of a place (GDD 07 §6.2.6): devRate(T) x 1.15 in 8-18 % wood, x 0.8 above 30 %. */
export function lateBroodScore(def: SpeciesDef, p: WoodParams, tempC: number, mc: number): number {
  let s = devRate(def, tempC);
  if (mc >= p.dryBonusMcMinPct && mc <= p.dryBonusMcMaxPct) s *= p.dryBonus;
  if (mc > p.mcMouldPct) s *= 0.8;
  return s;
}

function nestOf(sim: Sim, s: NestSite | undefined): Nest | undefined {
  return s ? sim.stores.nests.get(s.nestId) : undefined;
}

/** Temperature and moisture of a site's brood chamber. */
function climateOf(sim: Sim, nest: Nest): { temp: number; mc: number } | null {
  const c = broodChamberOf(nest);
  if (!c) return null;
  const mc = woodClimateAt(sim, c.center, 2 * sim.world.bu)?.mc;
  return mc === undefined ? null : { temp: chamberTemp(sim, nest, c), mc };
}

/** Score of a candidate satellite wood (GDD 07 §6.2.5): dry band, warmth, shelter, route length. */
function candidateScore(p: WoodParams, w: WoodState, routeBu: number, warmthC: number): number {
  const dry = w.moisture >= p.dryBonusMcMinPct && w.moisture <= p.dryBonusMcMaxPct ? 1 : 0;
  const shelter = 1 - (w.sunExposure ?? 1);
  return dry + 0.3 * (warmthC / 4) + 0.3 * shelter - routeBu / p.satelliteMaxRouteBu;
}

/** Chews a satellite's starter nursery into the wood and records the site (state `founding`). */
export function foundSatellite(sim: Sim, col: Colony, prim: Primitive, w: WoodState, from: { x: number; y: number; z: number }, p: WoodParams): NestSite | null {
  const parent = nestOf(sim, parentSite(col));
  const spot = cellSiteIn(sim, prim, w, from, SATELLITE_CELL);
  if (!parent || !spot) return null;
  const nest = createNest(sim, { colony: col.id, origin: spot.entry, kind: 'satellite', substrate: prim.material, parentNestId: parent.id });
  chewCell(sim, nest, w, spot.entry, spot.out, SATELLITE_CELL);
  nest.detectDue = true;
  const sites = refreshSites(sim, col);
  const site = sites.find((s) => s.nestId === nest.id) ?? null;
  if (site) { site.primId = prim.id; setSiteState(sim, site, 'founding'); }
  sendMigrants(sim, col, parent, nest, p);
  return site;
}

/**
 * Migrants (GDD 07 §6.2.5 `founding`: 5 % of the workers, at least 4): parent nurses walk over and settle in the
 * satellite, so the brood shuttled there is tended and helped to eclose. Their walk is the nurse behaviour's.
 */
function sendMigrants(sim: Sim, col: Colony, parent: Nest, sat: Nest, p: WoodParams): void {
  const want = Math.max(p.satelliteMigrantMin, Math.round(p.satelliteMigrantFrac * adultWorkers(sim, col)));
  let sent = 0;
  for (const a of sim.stores.ants.list) {
    if (sent >= want) break;
    if (!a.alive || a.colony !== col.id || a.task !== 'nurse' || a.nestId !== parent.id || isShuttling(a) || (a.flags & AntFlag.POSSESSED) !== 0) continue;
    a.bb[SH.migrate] = 1; a.bb[SH.nest] = sat.id; a.bb[SH.chamber] = -1; a.bb[SH.from] = parent.id; a.bb[SH.phase] = 0;
    sent++;
  }
}

/** Would the parent benefit from a satellite now (architect rule, §6.2.5)? */
function satelliteNeeded(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): boolean {
  if (adultWorkers(sim, col) < p.satelliteMinWorkers) return false;
  const site = parentSite(col);
  const w = site ? woodOf(sim, site.primId) : undefined;
  if (w && (w.carvedFrac ?? 0) >= p.satelliteCarvedFracTrigger) return true;
  const parent = nestOf(sim, site);
  if (!parent) return false;
  let late = 0;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.nestId === parent.id && isLateBrood(p, b)) late++;
  let cap = 0;
  for (const c of parent.chambers) if (c.type === 'nursery') cap += c.capacity.brood;
  return late > 0 && cap < p.satelliteNurseryFreeMax * late;
}

/** The best satellite wood within satelliteMaxRouteBu of the parent (straight-line route, §6.2.5 score). */
function bestCandidate(sim: Sim, col: Colony, p: WoodParams): { prim: Primitive; wood: WoodState } | null {
  const parent = nestOf(sim, parentSite(col));
  if (!parent) return null;
  const used = new Set(col.wood?.sites.filter((s) => s.state !== 'abandoned').map((s) => s.primId) ?? []);
  const bu = sim.world.bu;
  let best: { prim: Primitive; wood: WoodState; s: number } | null = null;
  for (const w of ensureWoodStates(sim)) {
    if (used.has(w.primId) || (w.thicknessBu ?? 0) < SATELLITE_MIN_THICK_BU || w.decay >= 4) continue;
    const prim = primOf(sim, w.primId);
    if (!prim) continue;
    const route = horizLen(prim.pos.x - parent.origin.x, prim.pos.z - parent.origin.z) / bu;
    if (route > p.satelliteMaxRouteBu) continue;
    const s = candidateScore(p, w, route, w.interior ? 4 : 0);
    if (!best || s > best.s) best = { prim, wood: w, s };
  }
  return best;
}

/** Satellite markers of the colony found a satellite in the wood under them (GDD 07 App. B), once. */
function markerSatellites(sim: Sim, col: Colony, p: WoodParams): void {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'satellite' || m.colony !== col.id) continue;
    m.alive = false; // one-shot: the marker is the proposal and its approval
    const hit = woodClimateAt(sim, m.pos, 4 * sim.world.bu);
    const w = hit ? woodOf(sim, hit.primId) : undefined;
    const prim = hit ? primOf(sim, hit.primId) : undefined;
    const site = w && prim ? foundSatellite(sim, col, prim, w, m.pos, p) : null;
    if (!site) sim.emit({ type: 'command-rejected', commandType: 'placeMarker', reason: 'invalid', detail: 'no suitable wood within 4 BU' });
  }
}

/** Isolation (§6.2.5): a satellite with no open entrance is cut off; after satelliteIsolatedGd it is `isolated`. */
function isolation(sim: Sim, col: Colony, p: WoodParams): void {
  for (const s of satelliteSites(col)) {
    const nest = nestOf(sim, s);
    if (!nest) continue;
    const open = nest.entrances.some((e) => e.status === 'open');
    if (open) {
      s.isolatedSinceTick = -1;
      if (s.state === 'isolated') setSiteState(sim, s, 'active');
      if (s.state === 'founding' && nest.chambers.length > 0) setSiteState(sim, s, 'active');
      continue;
    }
    if ((s.isolatedSinceTick ?? -1) < 0) s.isolatedSinceTick = sim.state.tick;
    if (s.state === 'active' && sim.state.tick - (s.isolatedSinceTick ?? 0) >= p.satelliteIsolatedGd * TICKS_PER_DAY) setSiteState(sim, s, 'isolated');
  }
}

/** Queen relocation proposal (§6.2.7): parent young-brood hazard > trigger for the window, or crumbling wood. */
function relocation(sim: Sim, col: Colony, p: WoodParams): void {
  const site = parentSite(col);
  if (!site || !col.wood || site.moisture < 0) return;
  const k = Math.min(1, (1 / 24) / Math.max(1e-6, p.relocateHazardWindowGd)); // hourly EMA over the window
  site.hazardEma = (site.hazardEma ?? 0) + k * (dryHazardPerGd(p, site.moisture) - (site.hazardEma ?? 0));
  const bad = (site.hazardEma ?? 0) > p.relocateHazardTrigger || site.decay >= 4;
  if (!bad || col.wood.queenMove) return;
  const target = satelliteSites(col).find((s) => s.moisture >= p.mcFullSurvivalPct && s.moisture <= p.mcMouldPct);
  if (!target) return;
  col.wood.queenMove = { targetSiteId: target.id, dueTick: sim.state.tick + Math.round(p.relocateAlertGd * TICKS_PER_DAY) };
  sim.emit({ type: 'queen-relocation', fromSite: site.id, toSite: target.id, phase: 'proposed' });
}

/** The colony's hourly satellite work: markers, the architect rule, isolation, relocation proposal. */
export function satellitePass(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): void {
  if (!col.wood) return;
  markerSatellites(sim, col, p);
  const outdoor = satelliteSites(col).filter((s) => !woodOf(sim, s.primId)?.interior).length;
  if (col.directives.satelliteAuto && outdoor < p.satellitesMaxOutdoor && satelliteNeeded(sim, def, col, p)
    && !satelliteSites(col).some((s) => s.state === 'founding')) {
    const c = bestCandidate(sim, col, p);
    if (c) foundSatellite(sim, col, c.prim, c.wood, sitePoint(nestOf(sim, parentSite(col))!), p);
  }
  isolation(sim, col, p);
  relocation(sim, col, p);
}

/** Free late-brood places in a satellite: its nursery and rest capacity minus the brood already there. */
function freeIn(sim: Sim, col: Colony, nest: Nest): number {
  let cap = 0;
  for (const c of nest.chambers) cap += Math.max(c.capacity.brood, 0);
  if (cap <= 0) cap = nest.chambers.length > 0 ? 1e9 : 0; // a fresh cell without a capacity record yet
  let used = 0;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.nestId === nest.id) used++;
  return cap - used;
}

/**
 * Shuttle jobs (GDD 07 §6.2.6): late brood in the parent whose satellite score beats the parent's by the margin go,
 * one item per nurse, to the best satellite with room. Shuttling ignores the light preference but obeys the forage
 * temperature gate and heat. Returns the jobs given. Keeps the parent's `waitingSinceTick` for the diagnostic.
 */
export function assignShuttles(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): number {
  const parentRec = parentSite(col);
  const parent = nestOf(sim, parentRec);
  if (!parent || !parentRec) return 0;
  const sats = satelliteSites(col).filter((s) => s.state === 'active').map((s) => nestOf(sim, s)).filter((n): n is Nest => !!n);
  if (sats.length === 0) { parentRec.waitingSinceTick = -1; return 0; }
  const air = airTemp(sim);
  if (forageGateFor(def.thermal, air) <= 0 || air >= def.thermal.stressC) return 0;
  const pc = climateOf(sim, parent);
  if (!pc) return 0;
  const parentScore = lateBroodScore(def, p, pc.temp, pc.mc);
  let target: Nest | null = null, best = -Infinity;
  for (const n of sats) {
    const c = climateOf(sim, n);
    if (!c || freeIn(sim, col, n) <= 0) continue;
    const s = lateBroodScore(def, p, c.temp, c.mc);
    if (s >= parentScore + p.shuttleScoreMargin && s > best) { best = s; target = n; }
  }
  if (!target) { parentRec.waitingSinceTick = -1; return 0; }
  const taken = new Set<number>();
  for (const a of sim.stores.ants.list) if (a.alive && isShuttling(a)) taken.add(a.bb[SH.brood]);
  const waiting: Brood[] = [];
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.nestId === parent.id && b.carriedBy < 0 && isLateBrood(p, b) && !taken.has(b.id)) waiting.push(b);
  }
  if (waiting.length === 0) { parentRec.waitingSinceTick = -1; return 0; }
  const room = target.chambers[0];
  let given = 0;
  for (const a of sim.stores.ants.list) {
    if (given >= waiting.length) break;
    if (!a.alive || a.colony !== col.id || a.task !== 'nurse' || a.nestId !== parent.id || a.carry.kind !== 'none') continue;
    if ((a.flags & AntFlag.POSSESSED) !== 0 || isShuttling(a)) continue;
    const b = waiting[given++];
    a.bb[SH.brood] = b.id; a.bb[SH.nest] = target.id; a.bb[SH.chamber] = room?.id ?? -1; a.bb[SH.phase] = 0;
    a.bb[SH.from] = parent.id;
  }
  if (given < waiting.length) { if ((parentRec.waitingSinceTick ?? -1) < 0) parentRec.waitingSinceTick = sim.state.tick; }
  else parentRec.waitingSinceTick = -1;
  return given;
}
