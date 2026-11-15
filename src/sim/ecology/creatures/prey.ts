// Prey handling (GDD 05 §1.5): a creature killed by ants becomes food - a carcass item with its nutrients, or a
// carrion source to tear when no group of ants could move it - and the transport rule ants (AI and the possessed
// ant) share. Subduing by pinning is tracked per creature.

import type { Creature, CreatureKind, Item, Sim } from '@/sim/types';
import { killCreature, spawnItem } from '@/sim/entities';
import { carrionFromItem, carrionVariantForBulk } from '@/sim/ecology/sources';
import { REF_CARRY_MG } from '@/sim/balance/ecology';
import { COOP_MAX_ANTS, COOP_SHARE, SUBDUE_DIE_S, SUBDUE_HEALTH, SUBDUE_PIN_S } from '@/sim/balance/creatures';
import { CreatureFlag, holderIds, setState, statsOf, ticks } from './common';
import { releaseAnt } from './attack';

/** Tear hardness of soft-bodied prey (the carrion row's own hardness applies to the rest). */
const SOFT_HARDNESS: Partial<Record<CreatureKind, number>> = {
  caterpillar: 1.0, earthworm: 1.0, 'fly-larva': 1.0, snail: 1.0, 'ladybird-larva': 1.0, 'lacewing-larva': 1.0,
};

export type TransportMode = 'carry' | 'drag' | 'coop' | 'butcher';

/**
 * §1.5.3: helper slots H = clamp(round(3 l / L), 1, 12); solo carry if B <= carryCap, solo drag if B <= 2 carryCap,
 * cooperative drag if 0.75 B <= min(H, recruits) x carryCap, else butcher.
 */
export function transportMode(bulk: number, lengthMm: number, antLenMm: number, carryCap: number, recruits: number): TransportMode {
  if (bulk <= carryCap) return 'carry';
  if (bulk <= 2 * carryCap) return 'drag';
  const h = Math.min(COOP_MAX_ANTS, Math.max(1, Math.round((3 * lengthMm) / Math.max(1e-6, antLenMm))));
  return COOP_SHARE * bulk <= Math.min(h, recruits) * carryCap ? 'coop' : 'butcher';
}

export interface DeadPrey {
  /** Item id (carcass / food piece), -1 when it became a source. */
  itemId: number;
  /** Carrion source id to tear, -1 when it is an item. */
  sourceId: number;
}

/**
 * The creature's body as food at its position: bulk, nutrients and length of its catalogue row. A body no full
 * group of standard workers can drag becomes a carrion source (butchered into carryCap pieces by `tear`).
 */
export function preyRemains(sim: Sim, c: Creature): DeadPrey {
  const st = statsOf(c);
  if (st.deadBulk <= 0 || st.deadP + st.deadC <= 0) return { itemId: -1, sourceId: -1 };
  const ground = { x: c.pos.x - c.up.x * c.footOffset, y: c.pos.y - c.up.y * c.footOffset, z: c.pos.z - c.up.z * c.footOffset };
  const kind: Item['kind'] = st.deadBulk >= 0.5 ? 'carcass' : 'food-piece';
  const it = spawnItem(sim, {
    kind, pos: ground,
    init: {
      c: st.deadC, p: st.deadP, bulk: st.deadBulk, massMg: st.deadBulk * REF_CARRY_MG, lengthMm: st.sizeMm,
      hardness: SOFT_HARDNESS[c.kind] ?? 1, foodKind: 'carrion', variant: carrionVariantForBulk(st.deadBulk),
      nestId: c.nestId, inNest: c.nestId >= 0,
    },
  });
  const L = sim.world.bu;
  if (c.nestId < 0 && transportMode(st.deadBulk, st.sizeMm, L, 1, COOP_MAX_ANTS) === 'butcher') {
    const sid = carrionFromItem(sim, it.id);
    if (sid >= 0) {
      const s = sim.stores.sources.get(sid);
      if (s && SOFT_HARDNESS[c.kind] !== undefined) s.hardness = SOFT_HARDNESS[c.kind]!;
      return { itemId: -1, sourceId: sid };
    }
  }
  return { itemId: it.id, sourceId: -1 };
}

/**
 * Kills a creature and leaves its remains. `byAnts` (ids) emits `prey-subdued`. Combat should call this instead
 * of killCreature when ants kill a creature (the system also catches hp <= 0 on its own).
 */
export function creatureDies(sim: Sim, c: Creature, cause: string, byAnts: number[] = []): DeadPrey {
  if (!c.alive) return { itemId: -1, sourceId: -1 };
  if (c.seizedAntId >= 0) releaseAnt(sim, c, false); // a predator killed with an ant in its jaws lets it go
  const remains = c.kind === 'bird' ? { itemId: -1, sourceId: -1 } : preyRemains(sim, c);
  if (byAnts.length > 0) sim.emit({ type: 'prey-subdued', creatureId: c.id, kind: c.kind, antIds: byAnts.slice() });
  killCreature(sim, c.id, cause);
  return remains;
}

const _holders: number[] = [];

/** Pull of a standard ant of the holder's mass (§4.1: pull = 3 m^(2/3)). */
function antPull(massMg: number): number {
  return 3 * Math.pow(Math.max(0.01, massMg), 2 / 3);
}

/**
 * §1.5.1: pinned (>= 2 holders, sum of pull >= 1.5 x the creature's pull) for SUBDUE_PIN_S at health <= 0.5 stops
 * struggling (SUBDUED) and dies SUBDUE_DIE_S later. Returns true when it died this tick.
 */
export function subdueTick(sim: Sim, c: Creature): boolean {
  const now = sim.state.tick;
  if ((c.flags & CreatureFlag.SUBDUED) !== 0) {
    if (now >= (c.bb.subdueDie ?? now)) {
      holderIds(sim, c, c.radius + 4 * sim.world.bu, _holders);
      creatureDies(sim, c, 'combat', _holders);
      return true;
    }
    return false;
  }
  holderIds(sim, c, c.radius + 4 * sim.world.bu, _holders);
  let pull = 0;
  for (const id of _holders) { const a = sim.stores.ants.get(id); if (a) pull += antPull(a.massMg); }
  const pinned = _holders.length >= 2 && pull >= 1.5 * statsOf(c).pull;
  if (!pinned || c.hp > SUBDUE_HEALTH * c.maxHp) { c.bb.pinSince = -1; return false; }
  if ((c.bb.pinSince ?? -1) < 0) c.bb.pinSince = now;
  if (now - c.bb.pinSince >= ticks(SUBDUE_PIN_S)) {
    c.flags |= CreatureFlag.SUBDUED;
    c.bb.subdueDie = now + ticks(SUBDUE_DIE_S);
    setState(sim, c, 'subdued');
  }
  return false;
}
