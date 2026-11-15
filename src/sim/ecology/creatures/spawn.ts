// Creating creatures with their catalogue stats, standing on the surface (or not at all).

import type { Vec3 } from '@/core/math/vec3';
import type { Creature, CreatureKind, CreatureVariant, Sim } from '@/sim/types';
import { despawnCreature, spawnCreature } from '@/sim/entities';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { setState, statsOf } from './common';
import { ports } from './ports';

/** Body (collision) radius of elongated animals, mm; others use 0.4 x length. */
const ELONGATED_RADIUS_MM: Partial<Record<CreatureKind, number>> = {
  earthworm: 2.5, centipede: 2, millipede: 2, 'fly-larva': 1.5, caterpillar: 1.5, 'lacewing-larva': 1.5, 'ladybird-larva': 1.5,
};

export function bodyRadiusMm(kind: CreatureKind, variant: CreatureVariant | null): number {
  if (kind === 'caterpillar' && variant === 'medium') return 3;
  return ELONGATED_RADIUS_MM[kind] ?? 0.4 * CREATURE_STATS[kind].sizeMm;
}

export interface SpawnKindOptions {
  variant?: CreatureVariant | null;
  state?: string;
  stateS?: number;
  homeCenter?: Vec3;
  homeRadius?: number;
  territoryId?: number;
  /** Tick it leaves / pupates, -1 none. */
  lifeEndTick?: number;
  fwd?: Vec3;
  flags?: number;
  bb?: Record<string, number>;
}

/**
 * A creature of `kind` with its catalogue stats, placed on the level set near `pos` (a surface point). Returns null
 * (nothing left behind) when no surface is found there.
 */
export function spawnKind(sim: Sim, kind: CreatureKind, pos: Vec3, o: SpawnKindOptions = {}): Creature | null {
  const variant = o.variant ?? null;
  const st = statsOf({ kind, variant });
  const c = spawnCreature(sim, {
    kind, pos, fwd: o.fwd, radiusMm: bodyRadiusMm(kind, variant), maxHp: st.maxHp,
    init: {
      variant, homeCenter: { ...(o.homeCenter ?? pos) }, homeRadius: o.homeRadius ?? 0, territoryId: o.territoryId ?? -1,
      lifeEndTick: o.lifeEndTick ?? -1, flags: o.flags ?? 0, bb: { ...(o.bb ?? {}) },
    },
  });
  if (!ports.placeOnSurface(sim, c, pos)) {
    despawnCreature(sim, c.id, 'no-surface');
    return null;
  }
  if (!o.homeCenter) c.homeCenter = { x: c.pos.x - c.up.x * c.footOffset, y: c.pos.y - c.up.y * c.footOffset, z: c.pos.z - c.up.z * c.footOffset };
  setState(sim, c, o.state ?? 'idle', o.stateS ?? 0);
  return c;
}
