// How fast an ant works (GDD 01 §7.1): workRate = tempFactor' x healthFactor x caste multiplier, and who may do what.

import type { ActionId, Ant, CasteDef, Sim, SpeciesId } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { HEALTH_FACTOR_BASE } from '@/sim/balance/actions';
import { casteDef } from '@/sim/entities';
import { ports } from './ports';

export function isPossessed(ant: Ant): boolean {
  return (ant.flags & AntFlag.POSSESSED) !== 0;
}

/** The ant is gripping (locomotion: speed x GRIP_SPEED_MULT and dislodge immunity). */
export function isGripping(ant: Ant): boolean {
  return ant.action?.id === 'grip';
}

/** Temperature factor of work and movement; the possessed ant gets the difficulty's comfort floor (GDD 01 §3.4). */
export function tempFactor(sim: Sim, ant: Ant): number {
  const colony = sim.stores.colonies.get(ant.colony);
  const t = ports.speedMult(sim, ant.tb, colony ? colony.species : sim.species.id);
  if (!isPossessed(ant) || t <= 0) return t;
  return Math.max(sim.state.config.difficulty.params.playerTempFloor, t);
}

export function healthFactor(ant: Ant): number {
  const h = ant.maxHp > 0 ? ant.hp / ant.maxHp : 0;
  return h >= 1 ? 1 : HEALTH_FACTOR_BASE + (1 - HEALTH_FACTOR_BASE) * Math.max(0, h);
}

/** workRate without the per-primitive caste multiplier (dig power is applied by dig-bite itself). */
export function workRate(sim: Sim, ant: Ant): number {
  return tempFactor(sim, ant) * healthFactor(ant);
}

/** Playable species of the ant's colony (rival-only species fall back to the player's species). */
export function speciesIdOf(sim: Sim, ant: Ant): SpeciesId {
  const colony = sim.stores.colonies.get(ant.colony);
  return (colony ? sim.getSpecies(colony.species)?.id : undefined) ?? sim.species.id;
}

/** The caste definition of an ant's species, if the species is playable. */
export function antCasteDef(sim: Sim, ant: Ant): CasteDef | undefined {
  const colony = sim.stores.colonies.get(ant.colony);
  const def = colony ? sim.getSpecies(colony.species) : sim.species;
  return casteDef(def, ant.caste);
}

/**
 * Whether the species data enables this primitive for the ant's caste (the catalogue's "Who" column, GDD 01
 * App. F 18). Rival-only species have no caste table: they may use every primitive.
 */
export function casteAllows(sim: Sim, ant: Ant, action: ActionId): boolean {
  const cd = antCasteDef(sim, ant);
  return cd ? cd.actions.includes(action) : true;
}
