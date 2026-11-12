// After the possessed ant died and the camera held on the body (GDD 01 §3.7): the observer follow-orbits the
// corpse (the body becomes a 'corpse' item where the ant fell). Pure lookups; the session wires them in.
import type { Vec3 } from '@/core';
import type { Item, Sim } from '@/sim/types';
import type { ViewSubject } from './viewDirector';

/** A corpse further than this from where the possessed ant was last drawn is not its body (BU). */
export const CORPSE_SEARCH_BU = 3;
/** The prompt shown in the observer after the hold. */
export const AFTER_DEATH_PROMPT = 'Tab: take another ant';

/** The corpse lying nearest to `at` within CORPSE_SEARCH_BU, or undefined. */
export function findCorpse(sim: Sim, at: Vec3): Item | undefined {
  const r2 = (CORPSE_SEARCH_BU * sim.world.bu) ** 2;
  let best: Item | undefined;
  let bestD2 = r2;
  for (const it of sim.state.items) {
    if (!it.alive || it.kind !== 'corpse') continue;
    const d2 = (it.pos.x - at.x) ** 2 + (it.pos.y - at.y) ** 2 + (it.pos.z - at.z) ** 2;
    if (d2 <= bestD2) { best = it; bestD2 = d2; }
  }
  return best;
}

/** Camera subject for a lying item (world up, fixed heading). */
export function itemSubject(sim: Sim, it: Item, out: ViewSubject): ViewSubject {
  out.pos.x = it.pos.x; out.pos.y = it.pos.y; out.pos.z = it.pos.z;
  out.up.x = 0; out.up.y = 1; out.up.z = 0;
  out.fwd.x = 1; out.fwd.y = 0; out.fwd.z = 0;
  out.lengthBu = Math.max(0.5, it.lengthMm / sim.world.bu);
  out.underground = sim.field.substrate(out.pos) < 0;
  out.airborne = false;
  return out;
}
