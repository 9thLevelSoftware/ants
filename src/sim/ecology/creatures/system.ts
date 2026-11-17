// The per-tick creature system: every creature's state machine, hit bookkeeping, deaths from damage, subduing;
// plus the bird event and the quiet-share sampling. Phase 'creatures' (after ant behaviours and actions, before
// locomotion, which moves the creatures and consumes this tick's antlion flicks).

import type { Creature, Sim } from '@/sim/types';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { conditions } from './conditions';
import { CreatureFlag } from './common';
import { ensureHooks, clearDisplacements } from './hooks';
import { installLifecycleListeners } from './lifecycle';
import { hitBookkeeping, recordHit, type HitKind } from './hits';
import { creatureDies, subdueTick, type DeadPrey } from './prey';
import { preyCaught } from './spawners';
import { finishInvasion } from './invasion';
import { quietTick } from './threat';
import { birdTick } from './bird';
import { possessedDangerAlerts, struckAlertTick } from './alerts';
import type { KindTable } from './kinds';
import { jumpingSpider, wolfSpider } from './spiders';
import { antSpider, centipede, roveBeetle } from './hunters';
import { antlion } from './antlion';
import { ladybird, ladybirdLarva, lacewingLarva } from './aphidPredators';
import { caterpillar, flyLarva, fruitFly, mite, springtail } from './preyFauna';
import { earthworm, millipede, snail, woodlouse } from './neutral';

/** One behaviour per Tier 2 creature kind (aphids are the herd model, the bird is an event, phorid flies are T3). */
export const KINDS: KindTable = {
  'jumping-spider': jumpingSpider, 'wolf-spider': wolfSpider, 'ant-spider': antSpider, antlion, centipede,
  'rove-beetle': roveBeetle, ladybird, 'ladybird-larva': ladybirdLarva, 'lacewing-larva': lacewingLarva, springtail, mite,
  'fly-larva': flyLarva, caterpillar, 'fruit-fly': fruitFly, woodlouse, earthworm, snail, millipede,
};

/** Ants that hit the creature in the last 5 s (bb `bit.<id>`), ascending. */
function recentBiters(c: Creature): number[] {
  const out: number[] = [];
  for (const k of Object.keys(c.bb)) if (k.startsWith('bit.')) out.push(Number(k.slice(4)));
  return out.sort((a, b) => a - b);
}

/** Death of a creature at the hands of ants (or the hp it lost): remains, patch count, events. */
export function killByAnts(sim: Sim, c: Creature, antIds: number[], cause = 'combat'): DeadPrey {
  if (c.bb.patch !== undefined) preyCaught(sim, c.bb.patch);
  if (c.kind === 'centipede') finishInvasion(sim, c);
  return creatureDies(sim, c, cause, antIds);
}

/** Records a hit reported by combat and runs the kind's reaction (flee, roll, coil, fly off, secretion ...). */
export function noteHit(sim: Sim, c: Creature, antId: number, kind: HitKind): void {
  if (!c.alive) return;
  recordHit(sim, c, antId, kind);
  KINDS[c.kind]?.onHit?.(sim, c, antId, kind);
}

/** True when the creature avoids this bite attempt (springtail jump, mite, fruit fly, caterpillar on silk). */
export function evades(sim: Sim, c: Creature, antId: number): boolean {
  return !!c.alive && !!KINDS[c.kind]?.evades?.(sim, c, antId);
}

function tickCreature(sim: Sim, c: Creature): void {
  if (hitBookkeeping(sim, c)) KINDS[c.kind]?.onHit?.(sim, c, -1, 'bite');
  if (!c.alive) return;
  if (c.hp <= 0) { killByAnts(sim, c, recentBiters(c)); return; }
  struckAlertTick(sim, c);
  const fam = CREATURE_STATS[c.kind].family;
  if ((fam === 'prey' || fam === 'neutral' || fam === 'aphid-predator') && subdueTick(sim, c)) return;
  if ((c.flags & CreatureFlag.SUBDUED) !== 0) return; // no longer struggling
  KINDS[c.kind]?.update(sim, c, conditions(sim));
  if (c.alive && c.kind === 'centipede' && c.bb.invading === 1 && c.state !== 'invade' && c.nestId < 0) finishInvasion(sim, c);
}

export function runCreatures(sim: Sim): void {
  ensureHooks(sim);
  installLifecycleListeners(sim);
  clearDisplacements(sim);
  quietTick(sim);
  birdTick(sim);
  const list = sim.stores.creatures.list;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const c = list[i];
    if (c && c.alive) tickCreature(sim, c);
  }
  possessedDangerAlerts(sim);
}
