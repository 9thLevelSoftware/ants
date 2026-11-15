// Life and death of rival colonies (GDD 05 §3.8, §3.9): queens lost (killed or abandoned) -> orphaned, the
// destruction rule (N < 5 while orphaned, or N = 0), the aftermath (agents wander and die within 0.5 gd, the nest
// stays as an abandoned, explorable cavity), first workers of incipients, and new foundations in the flight window.

import { rngChance, rngRange } from '@/core/rng';
import type { Colony, Nest, Sim } from '@/sim/types';
import { destroyColony, spawnItem } from '@/sim/entities';
import { processAntDeath } from '@/sim/ants';
import { getSpecies } from '@/sim/species';
import {
  AFTERMATH_BROOD_BULK, AFTERMATH_DIE_GD, DESTROYED_N, RAIDED_BROOD_FOOD_P, FOUNDATION_HOUR, FOUNDATION_P, FOUNDATION_P_EMPTY, FOUNDATION_SITE_MIN_BU,
  INCIPIENT_BROOD, INCIPIENT_MAX,
} from '@/sim/balance/rivals';
import { currentDefaultYearDoy, currentHour, TICKS_PER_DAY } from '@/sim/time';
import { agentsOf, setJob } from './agents';
import { capRoom } from './fielding';
import { dropRelationsOf } from './relations';
import { endRaid } from './raids';
import { addRivalColony, displayBrood, homeNest, removeBroodQuietly } from './setup';
import { BB, colExt, JOB, rivalColonies, rmod, type RivalColony } from './state';
import { d2 } from './behaviours/move';

/** Every pass: dead queens leave the record; the last one orphans the colony (events). */
export function watchQueens(sim: Sim): void {
  for (const col of rivalColonies(sim)) {
    const ext = colExt(sim.state, col.id);
    if (!ext.setupDone) continue;
    // abandonment: no workers and no brood left after a brood raid
    if (ext.abandonTick >= 0 && sim.state.tick >= ext.abandonTick) {
      ext.abandonTick = -1;
      for (const q of col.queens) if (sim.stores.ants.get(q.antId)) processAntDeath(sim, q.antId, 'starvation');
    }
    const before = col.queens.length;
    if (before === 0) continue;
    const alive = col.queens.filter((q) => sim.stores.ants.get(q.antId)?.alive);
    if (alive.length === before) continue;
    const nest = homeNest(sim, col);
    const pos = nest ? { ...nest.origin } : { x: 0, y: 0, z: 0 };
    for (let i = alive.length; i < before; i++) sim.emit({ type: 'rival-queen-killed', colonyId: col.id, species: col.species, pos });
    col.queens = alive;
    col.queenId = alive[0]?.antId ?? -1;
    if (alive.length === 0 && !col.rival.orphaned) {
      col.rival.orphaned = true;
      col.orphanedAtTick = sim.state.tick;
      sim.emit({ type: 'rival-orphaned', colonyId: col.id, species: col.species, pos });
    }
  }
}

/** Incipient colonies: the 12 founding brood become the first workers 4.5 gd after founding. */
export function firstWorkers(sim: Sim): void {
  for (const col of rivalColonies(sim)) {
    const ext = colExt(sim.state, col.id);
    if (ext.firstWorkersTick < 0 || sim.state.tick < ext.firstWorkersTick || col.rival.orphaned) continue;
    ext.firstWorkersTick = -1;
    const n = Math.min(col.rival.b, INCIPIENT_BROOD);
    col.rival.b -= n;
    col.rival.n += n;
  }
}

/**
 * Hourly: an incipient colony whose workers pass INCIPIENT_MAX leaves the founding phase ("then the normal model",
 * GDD 05 §3.8): normal field cap, war raids, and it counts as established for the rival setting.
 */
export function graduateIncipients(sim: Sim): void {
  for (const col of rivalColonies(sim)) {
    if (col.rival.incipient && colExt(sim.state, col.id).firstWorkersTick < 0 && col.rival.n > INCIPIENT_MAX) col.rival.incipient = false;
  }
}

/** Hourly: the destruction rule and its aftermath. */
export function checkDestruction(sim: Sim): void {
  for (const col of rivalColonies(sim)) {
    const r = col.rival;
    const ext = colExt(sim.state, col.id);
    if (!ext.setupDone) continue;
    const queenless = r.orphaned || col.queens.length === 0;
    if (!((queenless && r.n < DESTROYED_N) || (r.n <= 0 && r.b <= 0 && ext.firstWorkersTick < 0))) continue;
    destroy(sim, col);
  }
}

/** Destroys a rival colony: `rival-destroyed`, relations dropped, agents wander and die, the nest is abandoned. */
export function destroy(sim: Sim, col: RivalColony): void {
  const ext = colExt(sim.state, col.id);
  if (ext.destroyedTick >= 0) return;
  ext.destroyedTick = sim.state.tick;
  const nest = homeNest(sim, col);
  const pos = nest ? { ...nest.origin } : { x: 0, y: 0, z: 0 };
  for (const rd of rmod(sim.state).raids) if (rd.attacker === col.id || rd.target === col.id) endRaid(sim, rd);
  const rng = sim.stream('rng.rivals');
  for (const a of agentsOf(sim, col)) {
    setJob(sim, a, JOB.wander);
    a.bb[BB.dieTick] = sim.state.tick + Math.round(rngRange(rng, 0.1, 1) * AFTERMATH_DIE_GD * TICKS_PER_DAY);
  }
  for (const q of col.queens) if (sim.stores.ants.get(q.antId)) processAntDeath(sim, q.antId, 'starvation');
  col.queens = [];
  col.queenId = -1;
  if (nest) leaveBrood(sim, col, nest);
  r0(col);
  if (nest && !rmod(sim.state).abandonedNests.includes(nest.id)) rmod(sim.state).abandonedNests.push(nest.id);
  dropRelationsOf(sim.state, col.id);
  sim.emit({ type: 'rival-destroyed', colonyId: col.id, species: col.species, pos });
  destroyColony(sim, col.id, 'destroyed');
}

/**
 * Aftermath of the display brood (GDD 05 §3.9, "food or adoptable"): brood of the player's species stays as brood
 * (whoever of the player carries it adopts it, watchTheft); any other brood becomes a food piece (prey, P) where it lay.
 */
function leaveBrood(sim: Sim, col: RivalColony, nest: Nest): void {
  const adoptable = col.species === sim.state.config.species;
  for (const b of displayBrood(sim, col, nest)) {
    if (adoptable) continue;
    spawnItem(sim, {
      kind: 'food-piece', pos: b.pos,
      init: { p: RAIDED_BROOD_FOOD_P, bulk: AFTERMATH_BROOD_BULK, foodKind: 'prey', nestId: b.nestId, chamberId: b.chamberId, inNest: b.nestId >= 0 },
    });
    removeBroodQuietly(sim, b, 'aftermath');
  }
}

function r0(col: RivalColony): void {
  col.rival.n = 0;
  col.rival.fieldedIds = [];
  col.rival.raid = null;
}

/** Established (non-incipient) rivals alive. */
function established(sim: Sim): number {
  return rivalColonies(sim).filter((c) => !c.rival.incipient).length;
}

/**
 * Hourly, at 16:00 on each day of the flight window of the player's species (GDD 06 §11.2): while established
 * rivals < the setting, an abandoned rival nest (or a world rival site >= 250 BU from every nest) gets an incipient
 * conspecific colony with p 0.3 (1.0 when every established rival is gone and the setting is above 0).
 */
export function newFoundations(sim: Sim): void {
  const setting = sim.state.config.rules.rivals;
  if (setting <= 0 || Math.floor(currentHour(sim.state)) !== FOUNDATION_HOUR) return;
  const m = rmod(sim.state);
  const day = currentDefaultYearDoy(sim.state);
  if (m.lastFoundingRollDay === day) return;
  m.lastFoundingRollDay = day;
  const def = getSpecies(sim.state.config.species);
  const win = def?.reproduction.alateFlightWindow;
  if (!win || day < win[0] || day > win[1]) return;
  const have = established(sim);
  if (have >= setting) return;
  const p = have === 0 ? FOUNDATION_P_EMPTY : FOUNDATION_P;
  if (!rngChance(sim.stream('rng.rivals'), p)) return;
  const site = vacantSite(sim);
  if (site && capRoom(sim) >= 1) addRivalColony(sim, { species: sim.state.config.species, origin: site, incipient: true });
}

function vacantSite(sim: Sim): { x: number; y: number; z: number } | null {
  const m = rmod(sim.state);
  const nests = sim.stores.nests.list.filter((n) => n.alive && sim.stores.colonies.get(n.colony));
  const free = (p: { x: number; z: number }) => nests.every((n) => d2(n.origin, p) >= FOUNDATION_SITE_MIN_BU * sim.world.bu);
  for (const id of m.abandonedNests) {
    const n = sim.stores.nests.get(id);
    if (n && free(n.origin)) return { ...n.origin };
  }
  for (const s of sim.world.placements.rivalSites) if (free(s.origin)) return { ...s.origin };
  return null;
}

/** Re-export for the cheats: kill every queen of a colony. */
export function killQueens(sim: Sim, col: Colony): void {
  for (const q of col.queens) if (sim.stores.ants.get(q.antId)) processAntDeath(sim, q.antId, 'combat');
}
