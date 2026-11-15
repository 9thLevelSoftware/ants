// The per-kind behaviour interface every creature family implements (one file per family).

import type { Creature, Sim } from '@/sim/types';
import type { Conditions } from './conditions';
import type { HitKind } from './hits';

export interface KindBehaviour {
  /** One tick of the state machine (alive creatures only). */
  update(sim: Sim, c: Creature, cond: Conditions): void;
  /** Reaction to a bite / spray / sting that landed (after deterrence and harassment were recorded). */
  onHit?(sim: Sim, c: Creature, antId: number, kind: HitKind): void;
  /** Can an ant bite this creature right now; false makes the attempt miss (escape, dodge, out of reach). */
  evades?(sim: Sim, c: Creature, antId: number): boolean;
}

export type KindTable = Partial<Record<Creature['kind'], KindBehaviour>>;
