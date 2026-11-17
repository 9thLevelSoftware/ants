// Task `garden` for a leafcutter (GDD 07 §6.4.6 stages 4-8, §6.4.4 weeding, §6.4.2 re-seeding): a gardener goes to
// a garden chamber and takes the job it needs most that her size allows:
//   weed     an infected garden (any gardener)
//   process  fragments waiting in the cache (media and small media: process-leaf)
//   plant    chewed pulp waiting (tend-fungus "plant pulp")
//   harvest  standing staphylae (collected into the colony's stock: the larvae's and the queen's food)
//   piece    a fungus piece carried to an empty fungus chamber (re-seeding; never out of a quarantined garden)
//   tend     otherwise (presence: ftend)
// Garden waste is not a gardener's job: it is task `haul` (behaviourHaul.ts, GDD 07 §6.4.6 stage 8), and the ants
// that do it become refuse workers who never garden again (refuse.ts).
// States: garden.find (choose room and job), garden.go, garden.work (the primitive), garden.carry (a fungus piece
// to its destination).

import type { Ant, Behaviour, Chamber, Colony, GardenRecord, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { endCycle, releaseAll, think } from '@/sim/ants/behaviours/nest/common';
import { setState } from '@/sim/ants/behaviours/nest/fsm';
import { chamberIn, homeNest } from '@/sim/ants/behaviours/nest/places';
import { perTick } from '@/sim/ants/behaviours/nest/perTick';
import { actEnded, busy, entity, travel, tryAct } from '@/sim/ants/behaviours/nest/travel';
import { GARDEN_ARRIVE_FRAC, GARDEN_CHAIN_MAX, GARDEN_INFECTED_NEED, GARDEN_MINE_BONUS, GARDEN_HERE_BONUS } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';
import { fungusParams, type FungusParams } from './params';
import { emptyFungusChambers, gardenOf, gcapOf, liveGardens, reusableForGarden, seedGarden } from './state';
import { colonyChambers } from '@/sim/colony/census';
import { gardenRh, gardenTempC } from './chamberClimate';
import { fHumidity, fTemp } from './climate';
import { lotsLu } from './cache';
import { TEND_MODE, TM } from './actions';
import { AK, GJ, isSmallMedia } from './work';
import { isQuarantined } from './quarantine';
import { cutTripStep, cutTripsUnderway, startCutTrip } from './behaviourCut';
import { noCutters, noProcessors } from './actions';
import { minimCutTrips } from './allocation';

const ENTRY = 'garden.find';
/** bb key: actions chained in this garden visit; at most GARDEN_CHAIN_MAX before the task cycle ends. */
const CHAIN = 'at.chain';
/** Fungus piece carried (GU) and its source health / infection. */
const PIECE = { g: 'at.pg', h: 'at.ph2', i: 'at.pi', to: 'at.pto' } as const;

function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

function paramsOf(sim: Sim, col: Colony): FungusParams | null {
  return fungusParams(sim.getSpecies(col.species));
}

/** Gardeners (tend, weed, plant) already working each garden chamber (computed once per tick). */
function staffOf(sim: Sim, col: Colony): Map<number, number> {
  return perTick(sim, `at.staff:${col.id}`, () => {
    const m = new Map<number, number>();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'garden') continue;
      const room = a.bb[AK.room];
      if (room !== undefined && room >= 0) m.set(room, (m.get(room) ?? 0) + 1);
    }
    return m;
  });
}

/** The garden this gardener should work: the one furthest below its tending need (her current one on a tie). */
function chooseGarden(sim: Sim, ant: Ant, col: Colony, P: FungusParams): GardenRecord | undefined {
  const staff = staffOf(sim, col);
  let best: GardenRecord | undefined, bestScore = -Infinity;
  for (const g of col.fungus!.gardens) {
    if (g.state === 'dead') continue;
    const need = P.gardenersPerGu * Math.max(0.5, g.biomass) + lotsLu(g.cache) + lotsLu(g.pulp) + (g.infection > 0 ? GARDEN_INFECTED_NEED : 0);
    const mine = (ant.bb[AK.room] ?? -1) === g.chamberId ? GARDEN_MINE_BONUS : 0;
    const score = need - (staff.get(g.chamberId) ?? 0) + mine + (ant.chamberId === g.chamberId ? GARDEN_HERE_BONUS : 0);
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

/** The job this ant takes at this garden now. */
export function chooseJob(sim: Sim, ant: Ant, col: Colony, g: GardenRecord, P: FungusParams): number {
  // a refuse worker never gardens (GDD 07 §6.4.4; refuse.ts moves her to haul)
  if ((ant.flags & AntFlag.REFUSE) !== 0 || g.state === 'dead') return GJ.none;
  // small media and media process; while no media works the gardens the minims process too (first-brood deviation;
  // never the waste: GDD 07 §6.4.6 stage 8 gives it to the media, who become refuse workers)
  const big = ant.caste === 'media' || (ant.caste === 'minor' && noProcessors(sim, col));
  if (g.infection > 0) return GJ.weed;
  // the minims' first work is the brood's food (GDD 07 §6.4.6 stage 7); the larger gardeners' is the leaf
  const harvest = (g.yieldStanding ?? 0) >= P.staphylaeFl * 0.5;
  if (ant.caste === 'minor' && harvest) return GJ.harvest;
  if (big && lotsLu(g.cache) > 1e-6) return GJ.process;
  if (lotsLu(g.pulp) > 1e-6) return GJ.plant;
  if (harvest) return GJ.harvest;
  if ((isSmallMedia(ant) || ant.caste === 'minor') && pieceTarget(sim, col, g, P)) return GJ.piece;
  return GJ.tend;
}

/**
 * Where a fungus piece of this garden goes, or none (never out of a quarantined garden):
 *   relocation (GDD 07 §6.4.2): the garden's climate has been below relocateFclim for relocateWaitGd and another
 *   fungus chamber with room has a better one: pieces go there (to its garden, or seeding it);
 *   re-seeding: a healthy garden at 70 % of its chamber seeds an empty fungus chamber.
 */
export function pieceTarget(sim: Sim, col: Colony, g: GardenRecord, P: FungusParams): Chamber | undefined {
  if (isQuarantined(sim, col, g.chamberId) || g.biomass < P.fungusPieceGu) return undefined;
  const bad = (g.climBadSince ?? -1) >= 0 && sim.state.tick - (g.climBadSince ?? 0) >= P.relocateWaitGd * TICKS_PER_DAY;
  if (bad) {
    let best: Chamber | undefined, bestF = (g.fclim ?? 0) + 0.1;
    for (const ch of colonyChambers(sim, col)) {
      if (ch.type !== 'fungus' || ch.id === g.chamberId) continue;
      const other = gardenOf(col.fungus!, ch.id);
      if (other && other.state !== 'dead' && other.biomass + P.fungusPieceGu > gcapOf(P, ch)) continue;
      if (other && other.state === 'dead' && !reusableForGarden(col.fungus!, ch.id)) continue; // its waste first
      const f = fTemp(P, gardenTempC(sim, ch.id)) * fHumidity(P, gardenRh(sim, ch.id));
      if (f > bestF) { bestF = f; best = ch; }
    }
    if (best) return best;
  }
  if (g.state !== 'healthy' || g.biomass < 2 * P.fungusPieceGu || g.biomass < 0.7 * (g.gcap ?? 0)) return undefined;
  for (const ch of emptyFungusChambers(sim, col)) if (ch.id !== g.chamberId) return ch;
  return undefined;
}

function modeFor(job: number): number {
  switch (job) {
    case GJ.weed: return TM.weed;
    case GJ.plant: return TM.plant;
    case GJ.harvest: return TM.harvest;
    default: return TM.tend;
  }
}

function find(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const P = col ? paramsOf(sim, col) : null;
  if (!col?.fungus || !P) { endCycle(sim, ant, ENTRY); return; }
  // first-brood deviation: while the colony has no cutting caste, minim gardeners make the cut trips
  if (ant.caste === 'minor' && (ant.flags & AntFlag.REFUSE) === 0 && noCutters(sim, col)
    && cutTripsUnderway(sim, col) < minimCutTrips(sim, col, P) && startCutTrip(sim, ant)) return;
  const g = chooseGarden(sim, ant, col, P);
  if (!g) { ant.bb[AK.room] = -1; endCycle(sim, ant, ENTRY, 'job:garden'); return; }
  const job = chooseJob(sim, ant, col, g, P);
  if (job === GJ.none) { ant.bb[AK.room] = -1; endCycle(sim, ant, ENTRY, 'job:garden'); return; }
  ant.bb[AK.room] = g.chamberId;
  ant.bb[AK.job] = job;
  setState(sim, ant, 'garden.go', 'job:garden');
}

function go(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const ch = nest ? chamberIn(nest, ant.bb[AK.room] ?? -1) : undefined;
  if (!ch) { setState(sim, ant, ENTRY); return; }
  if (ant.chamberId === ch.id) { setState(sim, ant, 'garden.work'); return; }
  const st = travel(sim, ant, entity('chamber', ch.id, ch.center), GARDEN_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z));
  if (st === 'arrived') setState(sim, ant, 'garden.work');
  else if (st === 'failed') endCycle(sim, ant, ENTRY, 'stuck');
}

function work(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const P = col ? paramsOf(sim, col) : null;
  const g = col?.fungus ? gardenOf(col.fungus, ant.bb[AK.room] ?? -1) : undefined;
  if (!col || !P || !g) { setState(sim, ant, ENTRY); return; }
  const job = ant.bb[AK.job] ?? GJ.tend;
  if (actEnded(ant)) {
    // chained work in the same garden (no walk-out-and-back between two harvests): up to GARDEN_CHAIN_MAX actions
    const n = (ant.bb[CHAIN] ?? 0) + 1;
    const next = chooseJob(sim, ant, col, g, P);
    if (n < GARDEN_CHAIN_MAX && next !== GJ.none && next !== GJ.piece) {
      ant.bb[CHAIN] = n;
      ant.bb[AK.job] = next;
      ant.bb[TEND_MODE] = modeFor(next);
      const why2 = next === GJ.process ? tryAct(sim, ant, 'process-leaf', null) : tryAct(sim, ant, 'tend-fungus', null);
      if (why2 === null) return;
    }
    ant.bb[CHAIN] = 0;
    endCycle(sim, ant, ENTRY);
    return;
  }
  if (busy(ant)) return;
  if (ant.chamberId !== g.chamberId) { setState(sim, ant, 'garden.go'); return; }
  if (job === GJ.piece) { takePiece(sim, ant, col, g, P); return; }
  ant.bb[TEND_MODE] = modeFor(job);
  const why = job === GJ.process ? tryAct(sim, ant, 'process-leaf', null) : tryAct(sim, ant, 'tend-fungus', null);
  if (why !== null) setState(sim, ant, ENTRY);
}

/** A fungus piece taken from this garden (fungusPieceGu, its health and infection go with it). */
function takePiece(sim: Sim, ant: Ant, col: Colony, g: GardenRecord, P: FungusParams): void {
  const to = pieceTarget(sim, col, g, P);
  if (!to || ant.carry.kind !== 'none') { setState(sim, ant, ENTRY); return; }
  g.biomass -= P.fungusPieceGu;
  ant.bb[PIECE.g] = P.fungusPieceGu; ant.bb[PIECE.h] = g.health; ant.bb[PIECE.i] = g.infection; ant.bb[PIECE.to] = to.id;
  setState(sim, ant, 'garden.carry', 'job:garden');
}

function carry(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const P = col ? paramsOf(sim, col) : null;
  if (!col?.fungus || !P) { setState(sim, ant, ENTRY); return; }
  const piece = (ant.bb[PIECE.g] ?? 0) > 0;
  if (piece) {
    const to = ant.bb[PIECE.to] ?? -1;
    if (ant.chamberId === to) {
      seedGarden(sim, col.fungus, P, to, ant.bb[PIECE.g], ant.bb[PIECE.h] ?? 1, ant.bb[PIECE.i] ?? 0);
      ant.bb[PIECE.g] = 0;
      sim.emit({ type: 'garden-state', chamberId: to, state: gardenOf(col.fungus, to)?.state ?? 'seeded', cause: 'reseeded' });
      endCycle(sim, ant, ENTRY);
      return;
    }
    const nest = homeNest(sim, ant);
    const ch = nest ? chamberIn(nest, to) : undefined;
    if (!ch) { returnPiece(sim, ant, col); endCycle(sim, ant, ENTRY); return; }
    if (travel(sim, ant, entity('chamber', ch.id, ch.center), GARDEN_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z)) === 'failed') { returnPiece(sim, ant, col); endCycle(sim, ant, ENTRY, 'stuck'); }
    return;
  }
  setState(sim, ant, ENTRY);
}

/** A piece that could not be delivered goes back to its garden (no mass is lost). */
function returnPiece(sim: Sim, ant: Ant, col: Colony): void {
  const g = col.fungus ? liveGardens(col.fungus).find((x) => x.chamberId === (ant.bb[AK.room] ?? -1)) : undefined;
  if (g) g.biomass += ant.bb[PIECE.g] ?? 0;
  ant.bb[PIECE.g] = 0;
}

function step(sim: Sim, ant: Ant): void {
  if (cutTripStep(sim, ant)) return;
  switch (ant.state) {
    case 'garden.go': go(sim, ant); return;
    case 'garden.work': work(sim, ant); return;
    case 'garden.carry': carry(sim, ant); return;
    default: find(sim, ant);
  }
}

export const gardenBehaviour: Behaviour = {
  task: 'garden', species: ['atta-texana'],
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => {
    const col = colonyOf(sim, ant);
    if (col && (ant.bb[PIECE.g] ?? 0) > 0) returnPiece(sim, ant, col);
    ant.bb[AK.job] = GJ.none;
    ant.bb[AK.room] = -1;
    releaseAll(sim, ant);
  },
  delivering: (_sim, ant) => ant.state === 'garden.carry' || ant.carry.kind !== 'none' || (ant.nestId < 0 && ant.state.startsWith('cut.')),
};
