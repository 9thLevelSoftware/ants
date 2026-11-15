// What happens to herds from outside (GDD 05 §1.4 Disturbances, Aphid predators, Culling): predators eating
// aphids (the creatures module calls herdDamage), culling an aphid as prey, mowing, a host plant destroyed, and
// rain emptying the films.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { CULL_PIECE, MOW_A_MULT, MOW_RECOVERY_GD, REF_CARRY_MG } from '@/sim/balance/ecology';
import { TICKS_PER_DAY } from '@/sim/time';
import { setAmount } from '../sources/def';
import { dropHerd, plantPos } from './hosts';
import { herdPoint } from './links';

/**
 * A predator (ladybird, larvae) or any other cause removes `amount` aphids from a herd in real time; returns the
 * aphids actually removed. The herd collapses on the next hourly step if fewer than HERD_EXTINCT_A remain.
 */
export function herdDamage(sim: Sim, herdId: number, amount: number): number {
  const h = sim.stores.herds.get(herdId);
  if (!h || !(amount > 0)) return 0;
  const n = Math.min(h.a, amount);
  h.a -= n;
  return n;
}

/**
 * `cull-aphid`: one aphid taken as prey becomes a food piece (bulk 0.15, 0.02 C, 0.08 P) at the herd, or in the
 * culler's mandibles when given (event aphid-culled). Returns the item id, -1 when the herd has no aphid to take.
 */
export function cullAphid(sim: Sim, herdId: number, antId = -1): number {
  const h = sim.stores.herds.get(herdId);
  if (!h || h.a < 1) return -1;
  h.a -= 1;
  const ant = sim.stores.ants.get(antId);
  const at = ant?.pos ?? herdPoint(sim, h) ?? { x: 0, y: 0, z: 0 };
  const it = spawnItem(sim, {
    kind: 'food-piece', pos: at,
    init: {
      c: CULL_PIECE.c, p: CULL_PIECE.p, bulk: CULL_PIECE.bulk, massMg: CULL_PIECE.bulk * REF_CARRY_MG, foodKind: 'prey',
      carrierIds: ant && ant.carry.kind === 'none' ? [ant.id] : [],
    },
  });
  if (ant && ant.carry.kind === 'none') ant.carry = { kind: 'item', id: it.id };
  sim.emit({ type: 'aphid-culled', fromHerd: herdId, antId });
  return it.id;
}

/** Mowing over an area: herds on plants there drop to A x 0.2 and their K_eff recovers from x 0.3 over 3 gd. */
export function mowHerdsInArea(sim: Sim, center: Vec3, radiusMm: number): number {
  const until = sim.state.tick + Math.round(MOW_RECOVERY_GD * TICKS_PER_DAY);
  let n = 0;
  for (const pl of sim.stores.plants.list) {
    const p = pl.alive ? plantPos(sim, pl) : null;
    if (!p || Math.hypot(p.x - center.x, p.z - center.z) > radiusMm) continue;
    pl.mownUntilTick = until;
    for (const id of pl.herdIds) {
      const h = sim.stores.herds.get(id);
      if (!h) continue;
      h.a *= MOW_A_MULT;
      h.mownUntilTick = until;
      n++;
    }
  }
  return n;
}

/** A host plant destroyed (removed object, trampled): its herds are gone (herd-collapsed, herd-lost). */
export function destroyHost(sim: Sim, plantId: number, cause: string): void {
  const pl = sim.stores.plants.get(plantId);
  if (!pl) return;
  for (const id of [...pl.herdIds]) {
    const h = sim.stores.herds.get(id);
    if (h) dropHerd(sim, h, cause);
  }
  sim.stores.plants.markDead(plantId);
}

/** Any rain empties the honeydew films (GDD 05 §1.2 honeydew-film). */
export function rainOnFilms(sim: Sim): void {
  for (const h of sim.stores.herds.list) {
    const f = h.alive ? sim.stores.sources.get(h.filmSourceId) : undefined;
    if (f && f.units > 0) setAmount(f, 0);
  }
}
