// Ant lifecycle helpers: death processing (cause, corpse item, dropping what was carried, events), removal without
// death (lost / dispersed), the eclosion hook, and the lifecycle system that gives every ant killed this tick by
// any module (entities.killAnt) its corpse before the end-of-tick sweep removes it.

import type { Ant, DeathCause, Sim, System } from '@/sim/types';
import { AntFlag, DEATH_CAUSES, isOneOf } from '@/sim/types';
import { BEHAVIOUR_THINK_TICKS, CORPSE_CUE_S, CORPSE_P_PER_MG, REF_CARRY_MG } from '@/sim/balance/actions';
import { killAnt, spawnItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { broodCarriedBy, releaseCarried } from './actions/carry';
import { feetPoint } from './actions/geometry';
import { ports } from './actions/ports';
import { cancel } from './actions/runner';
import { exitBehaviour } from './behaviourRunner';

/** ant.bb keys of the lifecycle: corpse item id once made; 1 = removed without a body (lost / dispersed). */
const CORPSE_KEY = 'life.corpse';
const NO_BODY_KEY = 'life.noBody';

const at = { x: 0, y: 0, z: 0 };

/** Lets go of everything (brood intact, clump mates included), ends the action and the behaviour's claims. */
function letGoOfEverything(sim: Sim, ant: Ant): void {
  if (ant.action) cancel(sim, ant, 'conditions');
  if (ant.bb['run.task'] !== undefined && ant.bb['run.task'] >= 0) exitBehaviour(sim, ant);
  if (ant.carry.kind !== 'none' || broodCarriedBy(sim, ant).length > 0) releaseCarried(sim, ant, feetPoint(ant, at));
}

/** The corpse item of a dead ant (GDD 05 §4.7): bulk mass / 2 mg, 0.4 P per mg, necrophoresis cue after 60 s. */
function makeCorpse(sim: Sim, ant: Ant): number {
  const colony = sim.stores.colonies.get(ant.colony);
  const it = spawnItem(sim, {
    kind: 'corpse', pos: feetPoint(ant, at),
    init: {
      p: CORPSE_P_PER_MG * ant.massMg, bulk: ant.massMg / REF_CARRY_MG, massMg: ant.massMg,
      lengthMm: ant.lengthBu * sim.world.bu, species: colony ? colony.species : null, colony: ant.colony,
      necroCueTick: sim.state.tick + CORPSE_CUE_S * TICKS_PER_SECOND, nestId: ant.nestId, chamberId: ant.chamberId,
      inNest: ant.nestId >= 0,
    },
  });
  ant.bb[CORPSE_KEY] = it.id;
  sim.emit({ type: 'cue', cue: 'death', pos: { ...it.pos }, strength: 1 });
  return it.id;
}

/**
 * Kills an ant with a cause: drops what it carries (brood intact), ends its action and behaviour, ends possession
 * (entities.killAnt emits `ant-died`, `possessed-ant-died`, `possession-ended`) and leaves a corpse item.
 * Returns the corpse item id, -1 when the ant was unknown or already dead.
 */
export function processAntDeath(sim: Sim, antId: number, cause: DeathCause): number {
  const ant = sim.stores.ants.get(antId);
  if (!ant) return -1;
  letGoOfEverything(sim, ant);
  ports.navStop(sim, ant);
  if (!killAnt(sim, antId, cause)) return -1;
  return makeCorpse(sim, ant);
}

/** Removes an ant without a body (carried off the map, flown off as an alate): cause `lost` / `dispersed`. */
export function removeAnt(sim: Sim, antId: number, cause: 'lost' | 'dispersed'): boolean {
  const ant = sim.stores.ants.get(antId);
  if (!ant) return false;
  letGoOfEverything(sim, ant);
  ant.bb[NO_BODY_KEY] = 1;
  return killAnt(sim, antId, cause);
}

/** A death cause from free text (debug commands); unknown words become `unknown`. */
export function toDeathCause(s: string): DeathCause {
  return isOneOf(DEATH_CAUSES, s) ? s : 'unknown';
}

/**
 * Eclosion hook (called by the brood system for a freshly spawned adult): callow flag, no behaviour entered yet,
 * first think staggered by id so a batch of eclosions does not think in the same tick.
 */
export function onEclosion(sim: Sim, ant: Ant): void {
  ant.flags |= AntFlag.CALLOW;
  ant.bb['run.task'] = -1;
  ant.thinkTick = sim.state.tick + (ant.id % BEHAVIOUR_THINK_TICKS);
  sim.emit({ type: 'cue', cue: 'eclosion', pos: { ...ant.pos }, strength: 1 });
}

/** Clump mates of a dead carrier stay as they were (carriedBy the dead id): put them down where it died. */
function releaseOrphanedBrood(sim: Sim, ant: Ant): void {
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.carriedBy === ant.id) {
      b.carriedBy = -1;
      b.pos = feetPoint(ant, { x: 0, y: 0, z: 0 });
      b.nestId = ant.nestId;
      b.chamberId = ant.chamberId;
    }
  }
}

/**
 * Runs last in the tick, before the sweep: every ant that died this tick without passing through processAntDeath
 * (combat, starvation, cheats ...) gets its corpse, its clump mates put down and its action ended.
 */
export const lifecycleSystem: System = {
  name: 'lifecycle',
  phase: 'lifecycle',
  run(sim) {
    const list = sim.stores.ants.list;
    for (let i = 0; i < list.length; i++) {
      const ant = list[i];
      if (ant.alive || ant.bb[CORPSE_KEY] !== undefined || ant.bb[NO_BODY_KEY] === 1) continue;
      if (ant.action) cancel(sim, ant, 'conditions');
      if ((ant.bb['run.task'] ?? -1) >= 0) exitBehaviour(sim, ant); // frees dig slots and other claims
      releaseOrphanedBrood(sim, ant);
      makeCorpse(sim, ant);
    }
  },
};
