// The real effect of the `tend-aphid` primitive (GDD 01 §7.3, GDD 05 §1.4 APHID_DROPLET): when a stroke aimed at a
// herd's source completes, the herd releases one droplet of 0.15 load into the ant's crop, if its pool holds that
// much. The primitive's shell (src/sim/ants/actions/defs/combat.ts) is another task's file and leaves the droplet
// to this module, so it is applied from the primitive's `action-completed` event, for AI and possessed ants alike.
// The listener is installed by the per-tick plants system (derived, never persisted; a loaded game installs it on
// its first tick, before any event of that tick is flushed).

import type { Sim, TargetRef } from '@/sim/types';
import { APHID_DROPLET, LIQUID_EMPTY_EPS } from '@/sim/balance/ecology';
import { cropRoom } from '../sources/crop';
import { discoverSource } from '../sources/discovery';
import { recordHarvest } from '../sources/ledger';
import { herdOfSource } from './links';
import { noteYield } from './yield';

const listening = new WeakSet<Sim>();

export function installDropletListener(sim: Sim): void {
  if (listening.has(sim)) return;
  listening.add(sim);
  sim.events.on('action-completed', (e) => {
    if (e.action === 'tend-aphid' && e.target) releaseDroplet(sim, e.antId, e.target);
  });
}

/**
 * One droplet from the herd behind the target source into the ant's crop: 0.15 load (or the crop's room), none
 * when the pool holds less than a droplet. Returns the loads released.
 */
export function releaseDroplet(sim: Sim, antId: number, target: TargetRef): number {
  if (target.kind !== 'source') return 0;
  const ant = sim.stores.ants.get(antId);
  const src = sim.stores.sources.get(target.id);
  const h = herdOfSource(sim, target.id);
  if (!ant || !src || !h || h.pool + LIQUID_EMPTY_EPS < APHID_DROPLET) return 0;
  const perLoad = src.c + src.p;
  const v = Math.min(APHID_DROPLET, h.pool, perLoad > 0 ? cropRoom(ant) / perLoad : 0);
  if (v <= LIQUID_EMPTY_EPS) return 0;
  h.pool = Math.max(0, h.pool - v);
  ant.cropC += v * src.c;
  ant.cropP += v * src.p;
  discoverSource(sim, ant.colony, src.id, ant.id);
  recordHarvest(sim, ant.colony, src.id, v * src.c, v * src.p);
  noteYield(sim, ant.colony, v * src.c);
  return v;
}
