// Creatures (GDD 05 §2; owner: creatures). Prey, neutral fauna, aphid predators, ant predators, the bird event, the
// creature director, the danger grid and the threat director's quiet share. See README.md for states, flags and the
// seams other modules use (combat: noteCreatureHit / preyEvades / creatureKilled; behaviours: threatsNear /
// preyNear / knownHazardsNear; player control: addStruggleInput; rivals: requestMajorThreat / endMajorThreat).

import type { Vec3 } from '@/core/math/vec3';
import type { CommandHandlerMap, Creature, CreatureKind, CreatureVariant, Herd, Sim, System } from '@/sim/types';
import { CREATURE_DIRECTOR_EVERY, CREATURE_DIRECTOR_OFFSET } from '@/sim/balance';
import { runDirector } from './director';
import { runCreatures, killByAnts, noteHit, evades } from './system';
import { spawnKind, type SpawnKindOptions } from './spawn';
import { triggerBird } from './bird';
import { triggerInvasion } from './invasion';
import { createPit } from './antlion';
import { ANTLION_PIT_DEPTH_PER_R, ANTLION_PIT_RADIUS_MM } from '@/sim/balance/creatures';
import type { DeadPrey } from './prey';
import type { HitKind } from './hits';

export { threatsNear, preyNear, knownHazardsNear, creatureArmour, creaturePull, type ThreatInfo, type PreyInfo } from './queries';
export { addStruggleInput, isSeized } from './attack';
export { requestMajorThreat, endMajorThreat, canStartMajorThreat, quietShare, quietTracker } from './threat';
export { dangerAt, addDanger } from './danger';
export { transportMode, preyRemains, type TransportMode, type DeadPrey } from './prey';
export { herdSite } from './aphidPredators';
import { arriveAt } from './aphidPredators';
export { startBird, triggerBird, isExposedAnt } from './bird';
export { CreatureFlag } from './common';
export { capOf } from './caps';
export { isEngaged } from './director';
export type { HitKind } from './hits';

/** Spawns / despawns creatures within caps (territories, patches, arrivals), hourly rolls, danger grid. */
export const creatureDirectorSystem: System = {
  name: 'creature-director', phase: 'creatures', every: CREATURE_DIRECTOR_EVERY, offset: CREATURE_DIRECTOR_OFFSET,
  run: runDirector,
};

/** Creature state machines, the bird event, quiet-share sampling. */
export const creatureSystem: System = { name: 'creatures', phase: 'creatures', run: runCreatures };

export const systems: readonly System[] = [creatureDirectorSystem, creatureSystem];

/** A debug / scripted arrival of an aphid predator at a herd (stays even when the aphids drop below its cap). */
export function arriveAtHerd(sim: Sim, herd: Herd, kind: 'ladybird' | 'lacewing-larva'): Creature | null {
  return arriveAt(sim, herd, kind, true);
}

/** A creature of `kind` with its catalogue stats on the surface near pos (null if no surface there). */
export function spawnCreatureOfKind(sim: Sim, kind: CreatureKind, pos: Vec3, o: SpawnKindOptions = {}): Creature | null {
  if (kind === 'antlion') {
    const r = (ANTLION_PIT_RADIUS_MM[0] + ANTLION_PIT_RADIUS_MM[1]) / 2;
    const pit = createPit(sim, pos, r, r * ANTLION_PIT_DEPTH_PER_R);
    return spawnKind(sim, kind, pos, { state: 'wait', homeRadius: r, ...o, bb: { pit: pit.id, ...(o.bb ?? {}) } });
  }
  return spawnKind(sim, kind, pos, o);
}

/**
 * Combat reports each bite / spray / sting that lands on a creature (deterrence, harassment, the kind's reaction:
 * flee, roll, coil, fly off, secretion). Damage applied without a report is noticed from the hp drop.
 */
export function noteCreatureHit(sim: Sim, creatureId: number, antId: number, kind: HitKind): void {
  const c = sim.stores.creatures.get(creatureId);
  if (c) noteHit(sim, c, antId, kind);
}

/** Combat asks before a bite on a creature: true = the prey escaped / dodged this attempt (springtail jump ...). */
export function preyEvades(sim: Sim, creatureId: number, antId: number): boolean {
  const c = sim.stores.creatures.get(creatureId);
  return !!c && evades(sim, c, antId);
}

/** Combat kills a creature through this (not killCreature) so its remains become food (items / tear source). */
export function creatureKilled(sim: Sim, creatureId: number, antIds: number[], cause = 'combat'): DeadPrey {
  const c = sim.stores.creatures.get(creatureId);
  return c ? killByAnts(sim, c, antIds, cause) : { itemId: -1, sourceId: -1 };
}

/** Live creatures per kind. */
export function creatureCounts(sim: Sim): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of sim.stores.creatures.list) if (c.alive) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}

const VARIANTS_OK: Partial<Record<CreatureKind, readonly CreatureVariant[]>> = { caterpillar: ['small', 'medium', 'hairy'] };

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.spawnCreature': (sim, c) => {
    const variant = c.variant && VARIANTS_OK[c.kind]?.includes(c.variant) ? c.variant : null;
    const made = spawnCreatureOfKind(sim, c.kind, c.pos, { variant, state: c.state ?? undefined, bb: { forced: 1 } });
    if (!made) sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'no surface at pos' });
  },
  'cheat.triggerBird': (sim, c) => {
    if (!triggerBird(sim, c.variant, c.pos, c.force)) sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'no target or blocked' });
  },
  'cheat.triggerNestInvasion': (sim, c) => {
    const ok = triggerInvasion(sim, c.colonyId, c.force, (p) => spawnKind(sim, 'centipede', p, { state: 'prowl' }));
    if (!ok) sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'no nest with brood or blocked' });
  },
};
