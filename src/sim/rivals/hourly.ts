// The hourly update of the rivals module (GDD 05 §3.2, §3.5, §3.7, §3.9): territory decay and core marks, the
// territory scan, the abstract model of every rival (with the virtual harvest drawn from real nodes in its
// claimed cells), display brood, relations and escalation, raid launches, destruction, new foundations, the
// founding queen's threat roll and the diagnostic.

import type { Sim } from '@/sim/types';
import { HOURLY_EVERY } from '@/sim/balance';
import { E_PER_CONTESTED_CELL, FORAGE_FRINGE_BU, RIVAL_LEVERS, TRUCE_E_CAP, WAR_CLAIM_CHANGE_CELLS } from '@/sim/balance/rivals';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { amountOf, setAmount } from '@/sim/ecology/sources/def';
import { isRaining } from '@/sim/environment';
import { currentYear, seasonLength, TICKS_PER_DAY } from '@/sim/time';
import { activityOf, clockOf, type Clock } from './env';
import { foundingThreatHour } from './founding';
import { coreRadiusBu } from './init';
import { checkDestruction, firstWorkers, newFoundations } from './lifecycle';
import { abstractStep, applyWinter } from './model';
import { addEscalation, claimStaleSince, ensureRelation, escalationDecay, nextState } from './relations';
import { launchBroodRaids, launchRaids, workerCount } from './raids';
import { publishRivalDiagnostic } from './report';
import { homeNest, syncDisplayBrood } from './setup';
import { colExt, relExt, rivalColonies, slotOf, type RivalColony } from './state';
import { claimAt, hourlyMarks, scanTerritory } from './territory';

const ids: number[] = [];

function raining(sim: Sim): boolean {
  try { return isRaining(sim); } catch { return false; }
}

/**
 * Draws the virtual harvest from real nodes inside the colony's claimed cells, nearest first (GDD 05 §3.2). What
 * the map cannot give is unsimulated food (prey, root aphids, honeydew outside the modelled herds): the model is
 * not limited by it, but real nodes in the territory are depleted first, so rivals compete with the player.
 */
function drawRealNodes(sim: Sim, col: RivalColony, c: number, p: number): void {
  const nest = homeNest(sim, col);
  if (!nest || c + p <= 0) return;
  const r = (coreRadiusBu(col.rival.n) + FORAGE_FRINGE_BU) * sim.world.bu;
  sim.index.querySources(nest.origin, r, ids);
  const list = ids.map((id) => sim.stores.sources.get(id)).filter((s) => !!s && s.alive && claimAt(sim, s.pos).owner === col.id);
  list.sort((a, b) => Math.hypot(a!.pos.x - nest.origin.x, a!.pos.z - nest.origin.z) - Math.hypot(b!.pos.x - nest.origin.x, b!.pos.z - nest.origin.z) || a!.id - b!.id);
  let needC = c, needP = p;
  for (const s of list) {
    if (!s || (needC <= 1e-6 && needP <= 1e-6)) break;
    const perUnit = s.c + s.p;
    if (perUnit <= 0) continue;
    const units = Math.min(amountOf(s), (needC + needP) / perUnit);
    if (units <= 0) continue;
    setAmount(s, amountOf(s) - units);
    needC = Math.max(0, needC - units * s.c);
    needP = Math.max(0, needP - units * s.p);
  }
}

function modelHour(sim: Sim, col: RivalColony, clock: Clock, a: number, dtGd: number): void {
  const ext = colExt(sim.state, col.id);
  const r = col.rival;
  const queens = col.queens.length;
  if (ext.firstWorkersTick >= 0) return; // a founding queen on her reserves with 12 brood: nothing moves yet
  if (clock.season === 'winter') {
    const year = currentYear(sim.state);
    if (ext.winterYear !== year) { ext.winterYear = year; applyWinter(r, queens, seasonLength(sim.state)); }
    return;
  }
  const d = sim.state.config.difficulty;
  const lev = RIVAL_LEVERS[d.preset] ?? RIVAL_LEVERS.naturalist;
  const p = rivalProfile(col.species);
  const res = abstractStep(r, {
    profile: p, queens, orphaned: r.orphaned || queens === 0, claimedCells: ext.claimedCells, season: clock.season,
    dayOfSeason: clock.dayOfSeason, activity: a, kMult: d.params.rivalKMult, growthMult: lev.rivalGrowthMult,
    aggMult: d.params.rivalAggMult, realC: ext.hourC, realP: ext.hourP,
  }, dtGd);
  ext.lastHourC = ext.hourC; ext.lastHourP = ext.hourP;
  ext.hourC = 0; ext.hourP = 0;
  drawRealNodes(sim, col, res.harvestC, res.harvestP);
}

function relationsHour(sim: Sim, dtGd: number, claimedBySlot: number[], winter: boolean): void {
  const living = sim.stores.colonies.list.filter((c) => c.alive && (c.isPlayer || c.rival));
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) ensureRelation(sim.state, living[i].id, living[j].id);
  }
  const decay = escalationDecay(dtGd);
  const now = sim.state.tick;
  for (const r of sim.state.rivals.relations) {
    const ca = sim.stores.colonies.get(r.a), cb = sim.stores.colonies.get(r.b);
    if (!ca || !cb) continue;
    const ext = relExt(sim.state, r.a, r.b);
    r.e *= decay;
    if (ext.contested > 0) addEscalation(sim, r.a, r.b, E_PER_CONTESTED_CELL * ext.contested);
    if (r.state === 'truce') r.e = Math.min(r.e, TRUCE_E_CAP);
    // claim balance (war staleness)
    const sa = slotOf(sim.state, r.a), sb = slotOf(sim.state, r.b);
    const ka = sa >= 0 ? claimedBySlot[sa] : 0, kb = sb >= 0 ? claimedBySlot[sb] : 0;
    if (Math.abs(ka - ext.claimA) >= WAR_CLAIM_CHANGE_CELLS || Math.abs(kb - ext.claimB) >= WAR_CLAIM_CHANGE_CELLS) {
      ext.claimA = ka; ext.claimB = kb; ext.claimChangeTick = now;
    }
    const from = r.state;
    let to = nextState(r, { nA: workerCount(sim, ca), nB: workerCount(sim, cb), winter }, now, claimStaleSince(sim.state, r));
    if (to === 'war' && from !== 'war' && (otherWar(sim, r.a, r) || otherWar(sim, r.b, r))) to = 'skirmish'; // I9: one war per colony
    if (to === from) continue;
    r.state = to;
    r.stateSinceTick = now;
    if (to === 'war') { ext.claimA = ka; ext.claimB = kb; ext.claimChangeTick = now; }
    if (to === 'truce') r.e = Math.min(r.e, TRUCE_E_CAP);
    sim.emit({ type: 'rival-relation-changed', a: r.a, b: r.b, from, to, e: r.e });
  }
}

function otherWar(sim: Sim, colonyId: number, except: { a: number; b: number }): boolean {
  return sim.state.rivals.relations.some((x) => x.state === 'war' && x !== except && (x.a === colonyId || x.b === colonyId));
}

/** The hourly rivals system body. */
export function rivalsHourly(sim: Sim): void {
  const dtGd = HOURLY_EVERY / TICKS_PER_DAY;
  const clock = clockOf(sim);
  const cols = rivalColonies(sim);
  const act = new Map<number, number>();
  for (const c of cols) act.set(c.id, activityOf(sim, c, clock));
  hourlyMarks(sim, dtGd, (id) => act.get(id) ?? 0, raining(sim));
  const scan = scanTerritory(sim);
  firstWorkers(sim);
  for (const c of cols) {
    if (!colExt(sim.state, c.id).setupDone) continue;
    modelHour(sim, c, clock, act.get(c.id) ?? 0, dtGd);
    syncDisplayBrood(sim, c);
  }
  relationsHour(sim, dtGd, scan.claimed, clock.season === 'winter');
  launchRaids(sim, (c) => act.get(c.id) ?? 0);
  launchBroodRaids(sim);
  checkDestruction(sim);
  newFoundations(sim);
  foundingThreatHour(sim, dtGd);
  publishRivalDiagnostic(sim);
}
