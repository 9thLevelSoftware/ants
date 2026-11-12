// diag-nest-space (GDD 03 App. D) for the colony's main nest, from the architect's own need cache
// (ArchitectState.needCache, written at each architect evaluation; live pressures before the first one): adult
// crowding ρ, brood space ρ_b, food space. Factors: the three pressures, the architect switched off, no diggers.

import type { Colony, Diagnostic, Nest, Sim } from '@/sim/types';
import {
  BROOD_TRIGGER, CROWDING_TRIGGER, FOOD_TRIGGER, NEST_SPACE_BAD, NEST_SPACE_BLOCKER_F,
} from '@/sim/balance';
import { architectPressures } from '@/sim/nest/architect';
import { ti } from './taskIdx';
import { type FactorIn, publishWithHysteresis, weighFactors } from './diagFactors';

/** The pressures the architect last evaluated (needCache), or live ones while it has not evaluated yet. */
export function nestSpacePressures(sim: Sim, nest: Nest): { crowding: number; brood: number; food: number } {
  const cache = nest.architect.lastEvalTick >= 0 ? nest.architect.needCache : architectPressures(sim, nest.id) ?? {};
  return { crowding: cache.crowding ?? 0, brood: cache['brood-space'] ?? 0, food: cache['food-space'] ?? 0 };
}

const fOf = (x: number, limit: number): number => (x > limit ? limit / x : 1);

/** Evaluates and publishes diag-nest-space for the colony's first nest; null when it has none. */
export function nestSpaceDiag(sim: Sim, col: Colony): Diagnostic | null {
  const nest = sim.stores.nests.get(col.nestIds[0] ?? -1);
  if (!nest || !nest.alive) return null;
  const p = nestSpacePressures(sim, nest);
  const short = p.crowding > CROWDING_TRIGGER || p.brood > BROOD_TRIGGER || p.food > FOOD_TRIGGER;
  const status = p.crowding >= NEST_SPACE_BAD || p.brood >= NEST_SPACE_BAD ? 'bad' : short ? 'warn' : 'ok';
  const diggers = col.alloc.actual[ti('dig')] + col.alloc.actual[ti('haul')];
  const f: FactorIn[] = [
    { cause: 'adult-crowding', f: fOf(p.crowding, CROWDING_TRIGGER), detail: `crowding ${p.crowding.toFixed(2)}` },
    { cause: 'brood-space', f: fOf(p.brood, BROOD_TRIGGER), detail: `brood space ${p.brood.toFixed(2)}` },
    { cause: 'food-space', f: fOf(p.food, FOOD_TRIGGER), detail: `food space ${p.food.toFixed(2)}` },
    { cause: 'architect-off', f: short && nest.architect.mode === 'off' ? NEST_SPACE_BLOCKER_F : 1, detail: `architect ${nest.architect.mode}` },
    { cause: 'no-diggers', f: short && diggers === 0 ? NEST_SPACE_BLOCKER_F : 1, detail: `${diggers} diggers and haulers` },
  ];
  const remedies: string[] = [];
  if (p.crowding > CROWDING_TRIGGER) remedies.push('remedy.dig.rest');
  if (p.brood > BROOD_TRIGGER) remedies.push('remedy.dig.nursery');
  if (p.food > FOOD_TRIGGER) remedies.push('remedy.dig.food');
  if (short && nest.architect.mode === 'off') remedies.push('remedy.architect.auto');
  if (short) remedies.push('remedy.slider.dig');
  return publishWithHysteresis(sim, col, {
    id: 'diag-nest-space', system: 'nest', status, label: 'Nest space', value: Math.max(p.crowding, p.brood, p.food),
    factors: weighFactors(f), remedies, focus: null,
  });
}
