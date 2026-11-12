// Which nest a free dig bite belongs to (GDD 03 §4.1 breach detection, §13.2 "the first successful bite creates
// the nest record with origin = bite point", §14.1 free-dug rooms). Plan diggers and ants already inside their
// nest keep that nest; a bite from the surface goes to the colony nest whose cavity or footprint it is in, else
// re-anchors a nest record that has no cavity yet (the founding queen's record sits at her start point until
// she digs), else starts a new nest record for the colony. The owner is held in the nest runtime while the bite's
// brush runs, so a hole the bite opens becomes an entrance of that nest even before nest-nav links it to a cavity.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { nestTemplate } from '@/sim/balance/nest';
import { createNest } from '@/sim/entities';
import { nestOfCavityPoint } from './entrances';
import { antSlot } from './plans/frontier';
import { markNestDirty, nestRuntime } from './runtime';

/** Does the nest record describe any cavity yet (entrance, chamber, live plan)? */
export function nestHasCavity(nest: Nest): boolean {
  if (nest.entrances.length > 0 || nest.chambers.length > 0) return true;
  return nest.digPlans.some((p) => p.status !== 'complete' && p.status !== 'cancelled');
}

/** Is p inside the horizontal footprint of the nest (template footprint radius around its origin)? */
function inFootprint(sim: Sim, nest: Nest, p: Vec3): boolean {
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
  const r = nestTemplate(species).footprintR * sim.world.bu;
  return Math.hypot(p.x - nest.origin.x, p.z - nest.origin.z) <= r;
}

/** Moves a cavity-less nest record to the bite point (GDD 03 §13.2). */
function reanchor(sim: Sim, nest: Nest, p: Vec3): void {
  nest.origin = { x: p.x, y: sim.field.height(p.x, p.z), z: p.z };
  if (nest.founding) nest.founding.cavitySeed = { x: p.x, y: p.y, z: p.z };
  nest.substrate = sim.field.materialAt(p);
  markNestDirty(sim, nest.id);
}

/**
 * The nest a bite by `ant` at face point `p` digs for, creating or re-anchoring the record when needed; null for
 * an ant without a colony. Deterministic: colony nests in id order (Store order is insertion order).
 */
export function digNestFor(sim: Sim, ant: Ant, p: Vec3): Nest | null {
  const slot = antSlot(sim, ant);
  if (slot) return slot.nest;
  const inside = sim.stores.nests.get(ant.nestId);
  if (inside && inside.alive && inside.colony === ant.colony) return inside;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return null;
  const own = col.nestIds.map((id) => sim.stores.nests.get(id)).filter((n): n is Nest => !!n && n.alive);
  // a cavity of the colony right at the bite (the ant stands in an entrance or at a pit it dug before)
  const cav = nestOfCavityPoint(sim, p);
  if (cav && cav.colony === ant.colony) return cav;
  const near = own.filter((n) => nestHasCavity(n) && inFootprint(sim, n, p));
  if (near.length > 0) {
    near.sort((a, b) => Math.hypot(p.x - a.origin.x, p.z - a.origin.z) - Math.hypot(p.x - b.origin.x, p.z - b.origin.z) || a.id - b.id);
    return near[0];
  }
  const empty = own.find((n) => !nestHasCavity(n));
  if (empty) { reanchor(sim, empty, p); return empty; }
  const founding = ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) !== 0 && own.length === 0;
  const origin = { x: p.x, y: sim.field.height(p.x, p.z), z: p.z };
  const nest = createNest(sim, {
    colony: col.id, origin, founding, substrate: sim.field.materialAt(p),
    kind: own.length === 0 ? 'main' : 'satellite', parentNestId: own.length === 0 ? -1 : own[0].id,
  });
  if (nest.founding) nest.founding.cavitySeed = { x: p.x, y: p.y, z: p.z };
  markNestDirty(sim, nest.id);
  return nest;
}

/** Runs fn with `nestId` as the owner of holes opened meanwhile (registerOpening's fallback). */
export function withDigOwner<T>(sim: Sim, nestId: number, fn: () => T): T {
  const rt = nestRuntime(sim);
  const prev = rt.digOwner;
  rt.digOwner = nestId;
  try { return fn(); } finally { rt.digOwner = prev; }
}
