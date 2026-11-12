// The per-tick action system: advances every running primitive, lays trail for ants with TRAIL_ON, the passive
// home marks of ants outside, regenerates acid charges (GDD 01 App. A `ant.acid`, `acidRegenTick`).

import type { Ant, Sim, System } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  HOME_DAB_SPACING_BU, HOME_MAX_DABS_PER_TICK, TRAIL_DAB, TRAIL_DAB_SPACING_BU, TRAIL_LADEN_CROP, TRAIL_MAX_DABS_PER_TICK,
  TRAIL_UNLADEN_FACTOR,
} from '@/sim/balance/actions';
import { HOME_DEPOSIT_PER_BU } from '@/sim/balance/pheromone';
import { carriedItem } from './carry';
import { acidRegenTicks } from './defs';
import { ports } from './ports';
import { stepAction } from './runner';
import { isFoodItem } from './sourceKinds';

/**
 * Trail dab factor: a behaviour may set `bb['act.trailFactor']` (GDD 02 §8.3 factors); otherwise the player rule
 * of GDD 01 §7.3 (x1.0 carrying food or crop >= 0.5, x0.6 otherwise).
 */
function dabFactor(sim: Sim, ant: Ant): number {
  const f = ant.bb['act.trailFactor'] ?? 0;
  if (f > 0) return f;
  const it = carriedItem(sim, ant);
  const laden = (it !== undefined && isFoodItem(it)) || ant.cropC + ant.cropP >= TRAIL_LADEN_CROP;
  return laden ? 1 : TRAIL_UNLADEN_FACTOR;
}

/** Deposits trail per BU walked last tick (trail is laid on surfaces outside the nest only, GDD 02 §8.1). */
export function layTrail(sim: Sim, ant: Ant): void {
  if ((ant.flags & AntFlag.TRAIL_ON) === 0 || ant.nestId >= 0 || ant.medium === 'air') return;
  const bu = sim.world.bu;
  const dist = Math.hypot(ant.pos.x - ant.prevPos.x, ant.pos.y - ant.prevPos.y, ant.pos.z - ant.prevPos.z) / bu;
  let acc = (ant.bb['act.trailDist'] ?? 0) + dist;
  let n = 0;
  while (acc >= TRAIL_DAB_SPACING_BU && n < TRAIL_MAX_DABS_PER_TICK) {
    ports.deposit(sim, ant.colony, 'trail', ant.pos, TRAIL_DAB * dabFactor(sim, ant));
    acc -= TRAIL_DAB_SPACING_BU;
    n++;
  }
  ant.bb['act.trailDist'] = n === TRAIL_MAX_DABS_PER_TICK ? 0 : acc;
}

/**
 * Passive home marking (GDD 02 §8.2 HOME_DEPOSIT): every colony ant walking on a surface outside the nest leaves
 * HOME_DEPOSIT_PER_BU ph per BU walked on the colony's `home` channel, as a dab every HOME_DAB_SPACING_BU. The
 * scouts' bias away from home-marked ground (GDD 02 §10.1) reads it.
 */
export function layHome(sim: Sim, ant: Ant): void {
  if (ant.nestId >= 0 || ant.medium !== 'surface' || ant.colony < 0) return;
  const bu = sim.world.bu;
  const dx = ant.pos.x - ant.prevPos.x, dy = ant.pos.y - ant.prevPos.y, dz = ant.pos.z - ant.prevPos.z;
  let acc = (ant.bb['act.homeDist'] ?? 0) + Math.sqrt(dx * dx + dy * dy + dz * dz) / bu;
  if (acc < HOME_DAB_SPACING_BU) { ant.bb['act.homeDist'] = acc; return; }
  let n = 0;
  while (acc >= HOME_DAB_SPACING_BU && n < HOME_MAX_DABS_PER_TICK) {
    ports.deposit(sim, ant.colony, 'home', ant.pos, HOME_DEPOSIT_PER_BU * HOME_DAB_SPACING_BU);
    acc -= HOME_DAB_SPACING_BU;
    n++;
  }
  ant.bb['act.homeDist'] = n === HOME_MAX_DABS_PER_TICK ? 0 : acc;
}

function regenAcid(sim: Sim, ant: Ant): void {
  if (ant.acidRegenTick <= 0 || sim.state.tick < ant.acidRegenTick) return;
  const colony = sim.stores.colonies.get(ant.colony);
  const max = (colony ? sim.getSpecies(colony.species)?.combat.acid?.max : undefined) ?? 0;
  if (ant.acid < max) ant.acid += 1;
  ant.acidRegenTick = ant.acid < max ? sim.state.tick + acidRegenTicks(sim, ant) : 0;
}

export const actionSystem: System = {
  name: 'actions',
  phase: 'actions',
  run(sim) {
    const list = sim.stores.ants.list;
    for (let i = 0; i < list.length; i++) {
      const ant = list[i];
      if (!ant.alive) continue;
      if (ant.action) stepAction(sim, ant);
      if (ant.flags & AntFlag.TRAIL_ON) layTrail(sim, ant);
      if (ant.nestId < 0) layHome(sim, ant);
      if (ant.acidRegenTick > 0) regenAcid(sim, ant);
    }
  },
};
