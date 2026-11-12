// Creatures: surface walkers with simple naturalistic AI (contracts guidance §6, GDD 05 §2, App. A).

import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind } from './ids';
import type { CreatureVariant } from './ids/ecology';
import type { TargetRef } from './refs';
import type { Walker } from './walker';

export interface Creature extends Walker {
  id: number;
  alive: boolean;
  kind: CreatureKind;
  variant: CreatureVariant | null;
  /** Damage points. */
  hp: number;
  maxHp: number;
  /** FSM state id (creature module's own state names). */
  state: string;
  stateTick: number;
  /** Generic timer for the current state, ticks remaining. */
  stateTimer: number;
  target: TargetRef;
  /** Home territory centre (mm) and radius (mm). */
  homeCenter: Vec3;
  homeRadius: number;
  /** Territory slot id in EcologyState.director.territories, -1 none. */
  territoryId: number;
  /** Deterrence 0.. (half-life 20 s) and harassment counter. */
  deterrence: number;
  harass: number;
  /** Ant currently seized, -1 none. */
  seizedAntId: number;
  /** Prey eaten (aphids, ants). */
  eaten: number;
  /** Tick it leaves / dies of old age, -1 none. */
  lifeEndTick: number;
  /** Nest it has invaded, -1 none. */
  nestId: number;
  thinkTick: number;
  /** Bit flags (module-defined). */
  flags: number;
  /** Scratch values (numbers only). */
  bb: Record<string, number>;
}
