// Debug commands of the herds (GDD 05 App. B cheat.setHerd, GDD 07 App. B spawnHerd / freezeGrowth).
//   cheat.setHerd {herdId, values: {A?, E?, pool?, tend?, frozen?, hostQuality?, K?}}  (frozen: 1 / 0)
//   cheat.spawnHerd {plantId, aphids, k}   k <= 0 = by host class; the herd takes the plant's first free site
//   cheat.freezeGrowth {herdId}

import type { CommandHandlerMap, Sim } from '@/sim/types';
import { foundHerd, freeSite } from './hosts';
import { ensureLinks } from './links';

function reject(sim: Sim, commandType: string, reason: string): void {
  sim.emit({ type: 'command-rejected', commandType, reason });
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const plantCommandHandlers: Partial<CommandHandlerMap> = {
  'cheat.setHerd': (sim, c) => {
    const h = sim.stores.herds.get(c.herdId);
    if (!h) { reject(sim, c.type, 'no herd'); return; }
    const v = c.values ?? {};
    if (num(v.A)) { h.a = Math.max(0, v.A); h.peakA = Math.max(h.peakA ?? 0, h.a); }
    if (num(v.E)) h.e = Math.max(0, Math.round(v.E));
    if (num(v.pool)) h.pool = Math.max(0, v.pool);
    if (num(v.tend)) h.tend = Math.min(1, Math.max(0, v.tend));
    if (num(v.hostQuality)) h.hostQuality = Math.min(1, Math.max(0, v.hostQuality));
    if (num(v.K)) h.kMax = v.K;
    if (num(v.frozen)) h.frozen = v.frozen !== 0;
  },
  'cheat.spawnHerd': (sim, c) => {
    const pl = sim.stores.plants.get(c.plantId);
    if (!pl) { reject(sim, c.type, 'no plant'); return; }
    if (!num(c.aphids)) { reject(sim, c.type, 'aphids must be a finite number'); return; }
    const seg = freeSite(sim, pl);
    if (seg < 0) { reject(sim, c.type, 'no free herd site'); return; }
    const h = foundHerd(sim, pl, seg, Math.max(0, c.aphids));
    if (num(c.k) && c.k > 0) h.kMax = c.k;
    ensureLinks(sim, h);
  },
  'cheat.freezeGrowth': (sim, c) => {
    const h = sim.stores.herds.get(c.herdId);
    if (h) h.frozen = true;
  },
};
