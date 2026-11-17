// Task `garden` for a leafcutter (GDD 07 §6.4.6 stages 4-8, §6.4.4 weeding, §6.4.2 re-seeding): a gardener goes to
// a garden chamber and takes the job it needs most that her size allows:
//   weed     an infected garden (any gardener)
//   process  fragments waiting in the cache (media and small media: process-leaf)
//   plant    chewed pulp waiting (tend-fungus "plant pulp")
//   waste    spent substrate to remove (small media and media; they become refuse workers for life: REFUSE flag,
//            remaining lifespan x refuseLifespanMult; a refuse worker only ever hauls waste afterwards)
//   harvest  standing staphylae (collected into the colony's stock: the larvae's and the queen's food)
//   piece    a fungus piece carried to an empty fungus chamber (re-seeding; never out of a quarantined garden)
//   tend     otherwise (presence: ftend)
// States: garden.find (choose room and job), garden.go, garden.work (the primitive), garden.carry (waste or a
// fungus piece to its destination), garden.dump.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Chamber, Colony, GardenRecord, Nest, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { endCycle, releaseAll, think } from '@/sim/ants/behaviours/nest/common';
import { setState } from '@/sim/ants/behaviours/nest/fsm';
import { chamberIn, homeNest, middenPoint } from '@/sim/ants/behaviours/nest/places';
import { actEnded, busy, entity, travel, tryAct } from '@/sim/ants/behaviours/nest/travel';
import { removeItem } from '@/sim/entities';
import { WASTE_HAUL_MIN_LOADS } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';
import { fungusParams, type FungusParams } from './params';
import { emptyFungusChambers, gardenOf, gcapOf, liveGardens, seedGarden } from './state';
import { colonyChambers } from '@/sim/colony/census';
import { chamberRh, chamberTempC } from '@/sim/colony/envAdapter';
import { fHumidity, fTemp } from './climate';
import { lotsLu } from './cache';
import { TEND_MODE, TM } from './actions';
import { AK, GJ, isSmallMedia } from './work';
import { isQuarantined } from './quarantine';
import { cutTripStep, cutTripsUnderway, startCutTrip } from './behaviourCut';
import { noCutters } from './actions';
import { minimCutTrips } from './allocation';

const ENTRY = 'garden.find';
const DUMP_X = 'at.dx', DUMP_Y = 'at.dy', DUMP_Z = 'at.dz';
/** Fungus piece carried (GU) and its source health / infection. */
const PIECE = { g: 'at.pg', h: 'at.ph2', i: 'at.pi', to: 'at.pto' } as const;

function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

function paramsOf(sim: Sim, col: Colony): FungusParams | null {
  return fungusParams(sim.getSpecies(col.species));
}

/** Gardeners (tend, weed, plant) already working each garden chamber. */
function staffOf(sim: Sim, col: Colony): Map<number, number> {
  const m = new Map<number, number>();
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.task !== 'garden') continue;
    const room = a.bb[AK.room];
    if (room !== undefined && room >= 0) m.set(room, (m.get(room) ?? 0) + 1);
  }
  return m;
}

/** The garden this gardener should work: the one furthest below its tending need (her current one on a tie). */
function chooseGarden(sim: Sim, ant: Ant, col: Colony, P: FungusParams): GardenRecord | undefined {
  const staff = staffOf(sim, col);
  let best: GardenRecord | undefined, bestScore = -Infinity;
  for (const g of col.fungus!.gardens) {
    if (g.state === 'dead' && g.waste <= 1e-6) continue;
    const need = P.gardenersPerGu * Math.max(0.5, g.biomass) + lotsLu(g.cache) + lotsLu(g.pulp) + g.waste + (g.infection > 0 ? 3 : 0);
    const mine = (ant.bb[AK.room] ?? -1) === g.chamberId ? 1 : 0;
    const score = need - (staff.get(g.chamberId) ?? 0) + mine + (ant.chamberId === g.chamberId ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

/** The job this ant takes at this garden now. */
export function chooseJob(sim: Sim, ant: Ant, col: Colony, g: GardenRecord, P: FungusParams): number {
  const refuse = (ant.flags & AntFlag.REFUSE) !== 0;
  const big = ant.caste === 'media'; // small media and media
  const wasteDue = g.waste > WASTE_HAUL_MIN_LOADS * Math.max(1, g.biomass) || (g.state === 'dead' && g.waste > 1e-6);
  if (refuse) return wasteDue || g.waste > 1e-6 ? GJ.waste : GJ.none;
  if (g.state === 'dead') return big && g.waste > 1e-6 ? GJ.waste : GJ.none;
  if (g.infection > 0) return GJ.weed;
  if (big && lotsLu(g.cache) > 1e-6) return GJ.process;
  if (lotsLu(g.pulp) > 1e-6) return GJ.plant;
  if (big && wasteDue) return GJ.waste;
  if ((g.yieldStanding ?? 0) >= P.staphylaeFl * 0.5) return GJ.harvest;
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
      const f = fTemp(P, chamberTempC(sim, ch.id)) * fHumidity(P, chamberRh(sim, ch.id, ch.center));
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
    case GJ.waste: return TM.waste;
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
  const st = travel(sim, ant, entity('chamber', ch.id, ch.center), 0.6 * Math.min(ch.radii.x, ch.radii.z));
  if (st === 'arrived') setState(sim, ant, 'garden.work');
  else if (st === 'failed') endCycle(sim, ant, ENTRY, 'stuck');
}

function becomeRefuse(sim: Sim, ant: Ant, P: FungusParams): void {
  if ((ant.flags & AntFlag.REFUSE) !== 0) return;
  ant.flags |= AntFlag.REFUSE;
  // remaining lifespan x 0.5 (GDD 07 §6.4.4)
  const left = Math.max(0, ant.lifespanGd - ant.physioAgeGd);
  ant.lifespanGd = ant.physioAgeGd + left * P.refuseLifespanMult;
}

function work(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const P = col ? paramsOf(sim, col) : null;
  const g = col?.fungus ? gardenOf(col.fungus, ant.bb[AK.room] ?? -1) : undefined;
  if (!col || !P || !g) { setState(sim, ant, ENTRY); return; }
  const job = ant.bb[AK.job] ?? GJ.tend;
  if (actEnded(ant)) {
    if (job === GJ.waste && ant.carry.kind === 'item') { becomeRefuse(sim, ant, P); startDump(sim, ant); return; }
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

/** Where garden waste goes: the midden chamber, else the surface refuse heap beside the nest. */
function dumpPoint(sim: Sim, nest: Nest, out: Vec3): Vec3 | null {
  return middenPoint(sim, nest, out);
}

function startDump(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const p = nest ? dumpPoint(sim, nest, { x: 0, y: 0, z: 0 }) : null;
  if (!p) { tryAct(sim, ant, 'put-down', null); endCycle(sim, ant, ENTRY); return; }
  ant.bb[DUMP_X] = p.x; ant.bb[DUMP_Y] = p.y; ant.bb[DUMP_Z] = p.z;
  setState(sim, ant, 'garden.carry', 'job:waste');
}

/** A fungus piece taken from this garden (fungusPieceGu, its health and infection go with it). */
function takePiece(sim: Sim, ant: Ant, col: Colony, g: GardenRecord, P: FungusParams): void {
  const to = pieceTarget(sim, col, g, P);
  if (!to || ant.carry.kind !== 'none') { setState(sim, ant, ENTRY); return; }
  g.biomass -= P.fungusPieceGu;
  ant.bb[PIECE.g] = P.fungusPieceGu; ant.bb[PIECE.h] = g.health; ant.bb[PIECE.i] = g.infection; ant.bb[PIECE.to] = to.id;
  ant.bb[DUMP_X] = to.center.x; ant.bb[DUMP_Y] = to.center.y; ant.bb[DUMP_Z] = to.center.z;
  setState(sim, ant, 'garden.carry', 'job:garden');
}

function carry(sim: Sim, ant: Ant): void {
  const col = colonyOf(sim, ant);
  const P = col ? paramsOf(sim, col) : null;
  if (!col?.fungus || !P) { setState(sim, ant, ENTRY); return; }
  const piece = (ant.bb[PIECE.g] ?? 0) > 0;
  const dest = { x: ant.bb[DUMP_X] ?? ant.pos.x, y: ant.bb[DUMP_Y] ?? ant.pos.y, z: ant.bb[DUMP_Z] ?? ant.pos.z };
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
    if (travel(sim, ant, entity('chamber', ch.id, ch.center), 0.6 * Math.min(ch.radii.x, ch.radii.z)) === 'failed') { returnPiece(sim, ant, col); endCycle(sim, ant, ENTRY, 'stuck'); }
    return;
  }
  if (ant.carry.kind !== 'item') { endCycle(sim, ant, ENTRY); return; }
  const st = travel(sim, ant, entity('point', -1, dest), 1.5 * sim.world.bu);
  if (st === 'arrived' || st === 'failed') {
    const it = sim.stores.items.get(ant.carry.id);
    if (it) { it.droppedTick = sim.state.tick; }
    tryAct(sim, ant, 'put-down', null);
    sim.emit({ type: 'waste-dumped', antId: ant.id, itemId: ant.carry.id, to: 'midden' });
    endCycle(sim, ant, ENTRY);
  }
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

/** Old garden waste items lying in the nest are taken out too (a carrier that dropped one). */
export function removeStrayWaste(sim: Sim, col: Colony): void {
  for (const it of sim.stores.items.list) {
    if (it.alive && it.kind === 'garden-waste' && it.colony === col.id && it.carrierIds.length === 0 && it.inNest && it.hardness !== 0
      && sim.state.tick - it.droppedTick > TICKS_PER_DAY) removeItem(sim, it.id, 'decayed');
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
