// Nest-site states of a wood-nesting colony (GDD 07 §6.2.5): a satellite is `isolated` once it has had no walkable
// path to the parent for satelliteIsolatedGd, flagged "orphan satellite" after satelliteOrphanGd isolated (it keeps
// living), back to `active` when the path returns; a satellite whose wood crumbles (decay class 4) is `abandoned`
// (its brood is carried to the parent, returns.ts). The parent's crumbling wood is handled by the queen-relocation
// proposal (satellites.ts).

import type { Colony, Nest, NestSite, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { CRUMBLING_DECAY } from '@/sim/balance/species-carpenter';
import { TICKS_PER_DAY } from '@/sim/time';
import type { WoodParams } from './params';
import { parentSite, satelliteSites, setSiteState } from './sites';
import { woodOf } from './woodState';

const path: Vec3[] = [];

/**
 * Is there a walkable route between the two nests now: an open entrance on each and a surface path between the
 * entrances on the coarse navigation grid (a moved object, a flooded patch or a wall without a gap cuts it).
 */
export function nestsLinked(sim: Sim, a: Nest, b: Nest): boolean {
  const ea = a.entrances.find((e) => e.status === 'open');
  const eb = b.entrances.find((e) => e.status === 'open');
  if (!ea || !eb) return false;
  return sim.navGrid.findPath(ea.pos, eb.pos, path);
}

function crumbling(sim: Sim, s: NestSite): boolean {
  const w = woodOf(sim, s.primId);
  return (w?.decay ?? s.decay) >= CRUMBLING_DECAY || s.decay >= CRUMBLING_DECAY;
}

/** Hourly: isolation, the orphan flag and crumbling-wood abandonment of the colony's satellites. */
export function siteStates(sim: Sim, col: Colony, p: WoodParams): void {
  const parentRec = parentSite(col);
  const parent = parentRec ? sim.stores.nests.get(parentRec.nestId) : undefined;
  for (const s of satelliteSites(col)) {
    if (crumbling(sim, s)) { setSiteState(sim, s, 'abandoned'); continue; }
    const nest = sim.stores.nests.get(s.nestId);
    if (!nest || !parent) continue;
    // `founding` -> `active` once its first chamber is registered (§6.2.5)
    if (s.state === 'founding' && nest.chambers.length > 0) setSiteState(sim, s, 'active');
    if (nestsLinked(sim, parent, nest)) {
      s.isolatedSinceTick = -1;
      s.orphan = false;
      if (s.state === 'isolated') setSiteState(sim, s, 'active');
      continue;
    }
    if ((s.isolatedSinceTick ?? -1) < 0) s.isolatedSinceTick = sim.state.tick;
    const cut = (sim.state.tick - (s.isolatedSinceTick ?? sim.state.tick)) / TICKS_PER_DAY;
    if (s.state === 'active' && cut >= p.satelliteIsolatedGd) setSiteState(sim, s, 'isolated');
    if (s.state === 'isolated' && cut >= p.satelliteOrphanGd && !s.orphan) {
      s.orphan = true;
      sim.emit({ type: 'satellite-state', siteId: s.id, state: 'orphan' }); // a flag on `isolated`, for the journal
    }
  }
}
