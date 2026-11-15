// Which creatures a fighting ant attacks (GDD 05 §2.4 mobbing, §1.4 herd defence, §1.5 subduing prey): ant
// predators and aphid predators; any creature that seizes a nestmate, that a nestmate holds, or that the ant's
// alarm came from. Neutral fauna and free prey are left to the foraging behaviours.

import type { Ant, Creature, CreatureKind, Sim } from '@/sim/types';
import { holdersOf } from '@/sim/combat';

const PREDATORS: ReadonlySet<CreatureKind> = new Set<CreatureKind>([
  'jumping-spider', 'wolf-spider', 'ant-spider', 'centipede', 'rove-beetle', 'ladybird', 'ladybird-larva', 'lacewing-larva',
]);
const ids: number[] = [];

export function hostileCreature(sim: Sim, ant: Ant, c: Creature): boolean {
  if (PREDATORS.has(c.kind)) return true;
  if ((ant.bb['cb.alBy'] ?? -1) === c.id) return true;
  if (c.seizedAntId >= 0 && sim.stores.ants.get(c.seizedAntId)?.colony === ant.colony) return true;
  for (const id of holdersOf(sim, { kind: 'creature', c }, ids)) if (sim.stores.ants.get(id)?.colony === ant.colony) return true;
  return false;
}
